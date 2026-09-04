import { query, isMysql, newId } from '../db';
import type { CommentCursor } from '../lib/cursor';

export interface CommentRow {
  id: string;
  photo_id: string;
  user_id: string;
  body: string;
  created_at: string;
  full_name: string;
  username: string;
  avatar_key: string | null;
  like_count: number | string;
  dislike_count: number | string;
  my_vote: number | string | null;
}

function commentSelectBase(viewerParam: string) {
  return `
    SELECT c.id, c.photo_id, c.user_id, c.body, c.created_at,
           u.full_name, u.username, u.avatar_key,
           c.likes_count AS like_count,
           c.dislikes_count AS dislike_count,
           (
             SELECT cv.vote FROM comment_votes cv
             WHERE cv.comment_id = c.id AND cv.user_id = ${viewerParam}
             LIMIT 1
           ) AS my_vote
    FROM comments c
    JOIN users u ON u.id = c.user_id
  `;
}

export async function insertComment(params: {
  photoId: string;
  userId: string;
  body: string;
}): Promise<string> {
  const id = newId();
  await query(
    'INSERT INTO comments (id, photo_id, user_id, body) VALUES ($1, $2, $3, $4)',
    [id, params.photoId, params.userId, params.body],
  );
  await query(
    'UPDATE photos SET comments_count = comments_count + 1 WHERE id = $1',
    [params.photoId],
  );
  return id;
}

export async function findCommentById(id: string): Promise<{
  id: string;
  photo_id: string;
  user_id: string;
  body: string;
} | null> {
  const { rows } = await query<{
    id: string;
    photo_id: string;
    user_id: string;
    body: string;
  }>('SELECT id, photo_id, user_id, body FROM comments WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getCommentRowById(params: {
  commentId: string;
  viewerId: string;
}): Promise<CommentRow | null> {
  const { rows } = await query<CommentRow>(
    `${commentSelectBase('$2')} WHERE c.id = $1`,
    [params.commentId, params.viewerId],
  );
  return rows[0] ?? null;
}

export async function deleteCommentByIdAndUser(id: string, userId: string): Promise<string | null> {
  const comment = await findCommentById(id);
  if (!comment || comment.user_id !== userId) return null;

  await query('DELETE FROM comment_votes WHERE comment_id = $1', [id]);
  await query('DELETE FROM comments WHERE id = $1 AND user_id = $2', [id, userId]);
  await query(
    'UPDATE photos SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1',
    [comment.photo_id],
  );
  return comment.photo_id;
}

export async function deleteCommentVotesByUserId(userId: string): Promise<void> {
  await query('DELETE FROM comment_votes WHERE user_id = $1', [userId]);
}

export async function deleteCommentsByUserId(userId: string): Promise<number> {
  const { rows } = await query<{ id: string; photo_id: string }>(
    'SELECT id, photo_id FROM comments WHERE user_id = $1',
    [userId],
  );
  if (rows.length === 0) return 0;

  const commentIds = rows.map((r) => r.id);
  const placeholders = commentIds.map((_, i) => `$${i + 1}`).join(',');
  await query(
    `DELETE FROM comment_votes WHERE comment_id IN (${placeholders})`,
    commentIds,
  );
  await query('DELETE FROM comments WHERE user_id = $1', [userId]);

  const photoIds = [...new Set(rows.map((r) => r.photo_id))];
  for (const photoId of photoIds) {
    await query(
      `UPDATE photos SET comments_count = (
         SELECT COUNT(*) FROM comments WHERE photo_id = $1
       ) WHERE id = $1`,
      [photoId],
    );
  }
  return rows.length;
}

export async function getPhotoCommentsCount(photoId: string): Promise<number> {
  const { rows } = await query<{ comments_count: number | string }>(
    'SELECT comments_count FROM photos WHERE id = $1',
    [photoId],
  );
  return Number(rows[0]?.comments_count ?? 0);
}

export async function listCommentsForPhoto(params: {
  photoId: string;
  viewerId: string;
  cursor?: CommentCursor | null;
  limit: number;
}): Promise<CommentRow[]> {
  const values: unknown[] = [params.photoId, params.viewerId];
  let cursorWhere = '';

  if (params.cursor) {
    values.push(params.cursor.likesCount, params.cursor.createdAt, params.cursor.id);
    cursorWhere = `
      AND (
        c.likes_count < $3
        OR (c.likes_count = $3 AND c.created_at < $4)
        OR (c.likes_count = $3 AND c.created_at = $4 AND c.id < $5)
      )
    `;
  }

  values.push(params.limit);
  const limitParam = `$${values.length}`;

  const { rows } = await query<CommentRow>(
    `${commentSelectBase('$2')}
     WHERE c.photo_id = $1
     ${cursorWhere}
     ORDER BY c.likes_count DESC, c.created_at DESC, c.id DESC
     LIMIT ${limitParam}`,
    values,
  );
  return rows;
}

export async function getTopCommentsForPhotos(params: {
  photoIds: string[];
  viewerId: string;
}): Promise<Record<string, CommentRow | null>> {
  const result: Record<string, CommentRow | null> = {};
  for (const id of params.photoIds) result[id] = null;
  if (params.photoIds.length === 0) return result;

  const placeholders = params.photoIds.map((_, i) => `$${i + 2}`).join(', ');
  const sql = `
    SELECT * FROM (
      SELECT c.id, c.photo_id, c.user_id, c.body, c.created_at,
             u.full_name, u.username, u.avatar_key,
             c.likes_count AS like_count,
             c.dislikes_count AS dislike_count,
             (
               SELECT cv.vote FROM comment_votes cv
               WHERE cv.comment_id = c.id AND cv.user_id = $1
               LIMIT 1
             ) AS my_vote,
             ROW_NUMBER() OVER (
               PARTITION BY c.photo_id
               ORDER BY c.likes_count DESC, c.created_at DESC, c.id DESC
             ) AS rn
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.photo_id IN (${placeholders})
    ) ranked
    WHERE ranked.rn = 1
  `;

  const { rows } = await query<CommentRow & { rn?: number }>(sql, [
    params.viewerId,
    ...params.photoIds,
  ]);
  for (const row of rows) {
    result[row.photo_id] = row;
  }
  return result;
}

async function adjustCommentVoteCounts(
  commentId: string,
  deltaLikes: number,
  deltaDislikes: number,
): Promise<void> {
  if (deltaLikes === 0 && deltaDislikes === 0) return;
  await query(
    `UPDATE comments
     SET likes_count = GREATEST(likes_count + $2, 0),
         dislikes_count = GREATEST(dislikes_count + $3, 0)
     WHERE id = $1`,
    [commentId, deltaLikes, deltaDislikes],
  );
}

export async function upsertCommentVote(params: {
  commentId: string;
  userId: string;
  vote: 1 | -1;
}): Promise<'set' | 'cleared'> {
  const { commentId, userId, vote } = params;
  const { rows } = await query<{ vote: number }>(
    'SELECT vote FROM comment_votes WHERE comment_id = $1 AND user_id = $2',
    [commentId, userId],
  );
  const existing = rows[0] ? Number(rows[0].vote) : null;

  if (existing === vote) {
    await query(
      'DELETE FROM comment_votes WHERE comment_id = $1 AND user_id = $2',
      [commentId, userId],
    );
    await adjustCommentVoteCounts(
      commentId,
      vote === 1 ? -1 : 0,
      vote === -1 ? -1 : 0,
    );
    return 'cleared';
  }

  let deltaLikes = 0;
  let deltaDislikes = 0;
  if (existing === 1) deltaLikes -= 1;
  if (existing === -1) deltaDislikes -= 1;
  if (vote === 1) deltaLikes += 1;
  if (vote === -1) deltaDislikes += 1;

  if (isMysql) {
    await query(
      `INSERT INTO comment_votes (id, comment_id, user_id, vote, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE vote = VALUES(vote)`,
      [newId(), commentId, userId, vote],
    );
  } else {
    await query(
      `INSERT INTO comment_votes (id, comment_id, user_id, vote, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (comment_id, user_id) DO UPDATE SET vote = EXCLUDED.vote`,
      [newId(), commentId, userId, vote],
    );
  }

  await adjustCommentVoteCounts(commentId, deltaLikes, deltaDislikes);
  return 'set';
}
