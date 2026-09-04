import { query, isMysql, newId } from '../db';
import type { FeedCursor } from '../lib/cursor';

export interface PhotoRow {
  id: string;
  user_id: string;
  caption: string;
  storage_key: string;
  created_at: string;
  full_name: string;
  username: string;
  avatar_key?: string | null;
  reactions: any;
  comments_count?: number | string;
  likes_count?: number | string;
}

export interface PhotoMediaRow {
  id: string;
  photo_id: string;
  type: 'image' | 'video';
  storage_key: string;
  thumbnail_key?: string | null;
  order_index: number;
}

export interface PhotoPreviewRow {
  id: string;
  caption: string;
  full_name: string;
  storage_key: string;
  thumbnail_key: string | null;
  comments_count: number | string;
}

export interface ReactionRow {
  id: string;
  photo_id: string;
  user_id: string;
  emoji: string;
  username: string;
  full_name: string;
}

export async function insertPhoto(
  id: string,
  userId: string,
  caption: string,
  primaryKey: string,
  totalSize: number,
): Promise<void> {
  await query(
    'INSERT INTO photos (id, user_id, caption, storage_key, size) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, caption.trim(), primaryKey, totalSize],
  );
}

export async function insertPhotoMedia(
  id: string,
  photoId: string,
  type: 'image' | 'video',
  key: string,
  orderIndex: number,
  size: number,
  thumbnailKey: string | null = null,
): Promise<void> {
  await query(
    'INSERT INTO photo_media (id, photo_id, type, storage_key, thumbnail_key, order_index, size) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, photoId, type, key, thumbnailKey, orderIndex, size],
  );
}

export async function findPhotoByIdAndUser(
  photoId: string,
  userId: string,
): Promise<{ id: string; storage_key: string } | null> {
  const { rows } = await query<{ id: string; storage_key: string }>(
    'SELECT id, storage_key FROM photos WHERE id = $1 AND user_id = $2',
    [photoId, userId],
  );
  return rows[0] ?? null;
}

export async function getMediaByPhotoId(photoId: string): Promise<PhotoMediaRow[]> {
  const { rows } = await query<PhotoMediaRow>(
    'SELECT id, photo_id, type, storage_key, thumbnail_key, order_index FROM photo_media WHERE photo_id = $1 ORDER BY order_index ASC',
    [photoId],
  );
  return rows;
}

export async function getMediaByPhotoIds(photoIds: string[]): Promise<PhotoMediaRow[]> {
  if (photoIds.length === 0) return [];
  const placeholders = photoIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query<PhotoMediaRow>(
    `SELECT id, photo_id, type, storage_key, thumbnail_key, order_index FROM photo_media WHERE photo_id IN (${placeholders}) ORDER BY order_index ASC`,
    photoIds,
  );
  return rows;
}

export async function deleteMediaByPhotoId(photoId: string): Promise<void> {
  await query('DELETE FROM photo_media WHERE photo_id = $1', [photoId]);
}

export async function deletePhotoByIdAndUser(photoId: string, userId: string): Promise<void> {
  await query('DELETE FROM photos WHERE id = $1 AND user_id = $2', [photoId, userId]);
}

export async function findPhotosByUserId(
  userId: string,
): Promise<{ id: string; storage_key: string }[]> {
  const { rows } = await query<{ id: string; storage_key: string }>(
    'SELECT id, storage_key FROM photos WHERE user_id = $1',
    [userId],
  );
  return rows;
}

export async function deleteReactionsByUserId(userId: string): Promise<number> {
  const { rows } = await query<{ photo_id: string }>(
    'SELECT photo_id FROM reactions WHERE user_id = $1',
    [userId],
  );
  if (rows.length === 0) return 0;
  await query('DELETE FROM reactions WHERE user_id = $1', [userId]);
  const photoIds = [...new Set(rows.map((r) => r.photo_id))];
  for (const photoId of photoIds) {
    await query(
      `UPDATE photos SET likes_count = (
         SELECT COUNT(*) FROM reactions WHERE photo_id = $1
       ) WHERE id = $1`,
      [photoId],
    );
  }
  return rows.length;
}

export async function getPhotoPreviewRow(photoId: string): Promise<PhotoPreviewRow | null> {
  const { rows } = await query<PhotoPreviewRow>(
    `SELECT p.id, p.caption, u.full_name,
            p.storage_key, p.comments_count,
            (
              SELECT COALESCE(pm.thumbnail_key, pm.storage_key)
              FROM photo_media pm
              WHERE pm.photo_id = p.id AND pm.type = 'image'
              ORDER BY pm.order_index ASC
              LIMIT 1
            ) AS thumbnail_key
     FROM photos p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`,
    [photoId],
  );
  return rows[0] ?? null;
}

export async function getFeedRows(
  cursor: FeedCursor | null,
  limit: number,
): Promise<PhotoRow[]> {
  const values: unknown[] = [];
  let where = '';

  if (cursor?.createdAt) {
    if (cursor.id) {
      values.push(cursor.createdAt, cursor.id);
      where = `WHERE (p.created_at < $1 OR (p.created_at = $1 AND p.id < $2))`;
    } else {
      values.push(cursor.createdAt);
      where = `WHERE p.created_at < $1`;
    }
  }

  values.push(limit);
  const limitParam = `$${values.length}`;

  const feedSql = isMysql
    ? `
    SELECT p.id, p.user_id, p.caption, p.storage_key, p.created_at,
           p.comments_count, p.likes_count,
           u.full_name, u.username, u.avatar_key,
           COALESCE((
             SELECT JSON_ARRAYAGG(
               JSON_OBJECT('emoji', r.emoji, 'username', ru.username, 'full_name', ru.full_name, 'user_id', r.user_id)
             )
             FROM reactions r
             JOIN users ru ON ru.id = r.user_id
             WHERE r.photo_id = p.id
           ), JSON_ARRAY()) AS reactions
    FROM photos p
    JOIN users u ON u.id = p.user_id
    ${where}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limitParam}
  `
    : `
    SELECT p.id, p.user_id, p.caption, p.storage_key, p.created_at,
           p.comments_count, p.likes_count,
           u.full_name, u.username, u.avatar_key,
           COALESCE(
             json_agg(
               json_build_object('emoji', r.emoji, 'username', ru.username, 'full_name', ru.full_name, 'user_id', r.user_id)
             ) FILTER (WHERE r.id IS NOT NULL), '[]'
           ) AS reactions
    FROM photos p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN reactions r ON r.photo_id = p.id
    LEFT JOIN users ru ON ru.id = r.user_id
    ${where}
    GROUP BY p.id, u.full_name, u.username, u.avatar_key
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limitParam}
  `;

  const { rows } = await query<PhotoRow>(feedSql, values);
  return rows;
}

export async function photoExists(photoId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>('SELECT id FROM photos WHERE id = $1', [photoId]);
  return rows.length > 0;
}

export async function findReaction(
  photoId: string,
  userId: string,
): Promise<{ id: string; emoji: string } | null> {
  const { rows } = await query<{ id: string; emoji: string }>(
    'SELECT id, emoji FROM reactions WHERE photo_id = $1 AND user_id = $2',
    [photoId, userId],
  );
  return rows[0] ?? null;
}

export async function upsertReaction(
  photoId: string,
  userId: string,
  emoji: string,
): Promise<'created' | 'updated'> {
  const existing = await findReaction(photoId, userId);
  if (existing) {
    await query(
      'UPDATE reactions SET emoji = $1 WHERE photo_id = $2 AND user_id = $3',
      [emoji, photoId, userId],
    );
    return 'updated';
  }

  await query(
    'INSERT INTO reactions (id, photo_id, user_id, emoji) VALUES ($1, $2, $3, $4)',
    [newId(), photoId, userId, emoji],
  );
  await query(
    'UPDATE photos SET likes_count = likes_count + 1 WHERE id = $1',
    [photoId],
  );
  return 'created';
}

export async function deleteReaction(photoId: string, userId: string): Promise<boolean> {
  const existing = await findReaction(photoId, userId);
  if (!existing) return false;

  await query('DELETE FROM reactions WHERE photo_id = $1 AND user_id = $2', [photoId, userId]);
  await query(
    'UPDATE photos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
    [photoId],
  );
  return true;
}
