import { getFileUrl } from '../storage';
import {
  photoExists,
  getPhotoPreviewRow,
} from '../repositories/photos.repository';
import {
  getPhotoOwnerId,
  insertNotification,
  deleteNotificationsByTarget,
} from '../repositories/notifications.repository';
import {
  insertComment,
  findCommentById,
  getCommentRowById,
  deleteCommentByIdAndUser,
  listCommentsForPhoto,
  getPhotoCommentsCount,
  upsertCommentVote,
  type CommentRow,
} from '../repositories/comments.repository';
import {
  decodeCommentCursor,
  encodeCommentCursor,
} from '../lib/cursor';
import { logActivity } from '../lib/activity';

export interface CommentItem {
  id: string;
  body: string;
  created_at: string;
  likeCount: number;
  dislikeCount: number;
  myVote: 1 | -1 | null;
  isMine: boolean;
  isMostLiked: boolean;
  author: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
  };
}

function mapComment(row: CommentRow, viewerId: string, isMostLiked = false): CommentItem {
  const likeCount = Number(row.like_count ?? 0);
  const dislikeCount = Number(row.dislike_count ?? 0);
  const rawVote = row.my_vote == null ? null : Number(row.my_vote);
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    likeCount,
    dislikeCount,
    myVote: rawVote === 1 || rawVote === -1 ? (rawVote as 1 | -1) : null,
    isMine: row.user_id === viewerId,
    isMostLiked,
    author: {
      id: row.user_id,
      full_name: row.full_name,
      username: row.username,
      avatar_url: null,
    },
  };
}

async function withAvatars(items: CommentItem[], rows: CommentRow[]): Promise<CommentItem[]> {
  const keyByUser = new Map<string, string | null>();
  for (const row of rows) {
    if (!keyByUser.has(row.user_id)) keyByUser.set(row.user_id, row.avatar_key);
  }
  const urlByUser: Record<string, string | null> = {};
  await Promise.all(
    [...keyByUser.entries()].map(async ([userId, key]) => {
      urlByUser[userId] = key ? await getFileUrl(key, 86400) : null;
    }),
  );
  return items.map((item) => ({
    ...item,
    author: {
      ...item.author,
      avatar_url: urlByUser[item.author.id] ?? null,
    },
  }));
}

async function buildPostPreview(photoId: string) {
  const row = await getPhotoPreviewRow(photoId);
  if (!row) throw Object.assign(new Error('Foto não encontrada'), { status: 404 });
  const thumbKey = row.thumbnail_key || row.storage_key;
  return {
    id: row.id,
    caption: row.caption || '',
    authorName: row.full_name,
    thumbnailUrl: thumbKey ? await getFileUrl(thumbKey, 86400) : null,
  };
}

export async function createComment(params: {
  photoId: string;
  userId: string;
  body: string;
}): Promise<CommentItem> {
  const body = params.body.trim();
  if (!body) throw Object.assign(new Error('Comentário vazio'), { status: 400 });
  if (body.length > 1000) {
    throw Object.assign(new Error('Comentário muito longo'), { status: 400 });
  }
  if (!(await photoExists(params.photoId))) {
    throw Object.assign(new Error('Foto não encontrada'), { status: 404 });
  }

  const id = await insertComment({
    photoId: params.photoId,
    userId: params.userId,
    body,
  });

  await logActivity({
    actorId: params.userId,
    action: 'comment_create',
    targetType: 'photo',
    targetId: params.photoId,
    meta: { commentId: id, body: body.slice(0, 160) },
  });

  const ownerId = await getPhotoOwnerId(params.photoId);
  if (ownerId && ownerId !== params.userId) {
    try {
      await insertNotification({
        recipientId: ownerId,
        actorId: params.userId,
        photoId: params.photoId,
        type: 'comment',
        targetId: id,
      });
    } catch (err: any) {
      console.error('⚠️  Falha ao notificar comentário:', err?.message || err);
    }
  }

  const row = await getCommentRowById({ commentId: id, viewerId: params.userId });
  if (!row) throw Object.assign(new Error('Comentário não encontrado'), { status: 500 });
  const [item] = await withAvatars([mapComment(row, params.userId)], [row]);
  return item!;
}

export async function getCommentsPage(params: {
  photoId: string;
  userId: string;
  cursor?: string;
  limit?: number | string;
}): Promise<{
  items: CommentItem[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  post: { id: string; caption: string; authorName: string; thumbnailUrl: string | null };
}> {
  if (!(await photoExists(params.photoId))) {
    throw Object.assign(new Error('Foto não encontrada'), { status: 404 });
  }

  const safeLimit = Math.min(Math.max(parseInt(String(params.limit ?? 20), 10) || 20, 1), 50);
  const decoded = decodeCommentCursor(params.cursor);
  const rows = await listCommentsForPhoto({
    photoId: params.photoId,
    viewerId: params.userId,
    cursor: decoded,
    limit: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
  const totalCount = await getPhotoCommentsCount(params.photoId);
  const isFirstPage = !decoded;
  const topLike = pageRows.length > 0 ? Number(pageRows[0]!.like_count ?? 0) : 0;

  const mapped = pageRows.map((row, index) =>
    mapComment(row, params.userId, isFirstPage && index === 0 && topLike > 0),
  );
  const items = await withAvatars(mapped, pageRows);
  const post = await buildPostPreview(params.photoId);

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCommentCursor({
          likesCount: Number(last.like_count ?? 0),
          createdAt: String(last.created_at),
          id: last.id,
        })
      : null;

  return { items, totalCount, nextCursor, hasMore, post };
}

export async function removeComment(params: {
  commentId: string;
  userId: string;
}): Promise<void> {
  const comment = await findCommentById(params.commentId);
  if (!comment) throw Object.assign(new Error('Comentário não encontrado'), { status: 404 });
  if (comment.user_id !== params.userId) {
    throw Object.assign(new Error('Você só pode apagar seus comentários'), { status: 403 });
  }

  await deleteCommentByIdAndUser(params.commentId, params.userId);
  await logActivity({
    actorId: params.userId,
    action: 'comment_delete',
    targetType: 'comment',
    targetId: params.commentId,
    meta: { photoId: comment.photo_id },
  });
  try {
    await deleteNotificationsByTarget(params.commentId);
  } catch (err: any) {
    console.error('⚠️  Falha ao limpar notificações do comentário:', err?.message || err);
  }
}

export async function voteComment(params: {
  commentId: string;
  userId: string;
  vote: 1 | -1;
}): Promise<{ myVote: 1 | -1 | null }> {
  const comment = await findCommentById(params.commentId);
  if (!comment) throw Object.assign(new Error('Comentário não encontrado'), { status: 404 });

  const result = await upsertCommentVote({
    commentId: params.commentId,
    userId: params.userId,
    vote: params.vote,
  });

  return { myVote: result === 'cleared' ? null : params.vote };
}
