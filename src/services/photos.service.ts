import { v4 as uuidv4 } from 'uuid';
import { newId } from '../db';
import { uploadFile, getFileUrl, deleteFile } from '../storage';
import { optimizeImage } from '../lib/optimizeImage';
import { optimizeVideo } from '../lib/optimizeVideo';
import type { UploadedFile, MediaItem, FeedItem, FeedPage, ReactionEntry, CommentPreview } from '../types';
import {
  insertPhoto,
  insertPhotoMedia,
  findPhotoByIdAndUser,
  getMediaByPhotoId,
  getMediaByPhotoIds,
  deleteMediaByPhotoId,
  deletePhotoByIdAndUser,
  getFeedRows,
  photoExists,
  upsertReaction as repoUpsertReaction,
  deleteReaction as repoDeleteReaction,
  type PhotoRow,
  type PhotoMediaRow,
} from '../repositories/photos.repository';
import {
  getPhotoOwnerId,
  upsertNotification,
} from '../repositories/notifications.repository';
import { getTopCommentsForPhotos } from '../repositories/comments.repository';
import { decodeFeedCursor, encodeFeedCursor } from '../lib/cursor';
import { logActivity } from '../lib/activity';

export type { MediaItem, FeedItem, FeedPage };

const ALLOWED_REACTIONS = ['❤️', '🥰', '😍', '😂', '😊', '👏', '👀', '🎉', '✨', '🌸', '🧚', '🫶'];
const REVIEW_USER_IDS = new Set(['1b70a665-8cc7-444a-9d2b-0583fff7b2af']);

function parseReactions(raw: unknown): ReactionEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean) as ReactionEntry[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed.filter(Boolean) as ReactionEntry[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function createPost(params: {
  userId: string;
  caption: string;
  photoFiles: UploadedFile[];
  videoFile: UploadedFile | null;
}): Promise<string> {
  const { userId, caption, photoFiles, videoFile } = params;

  if (photoFiles.length === 0)
    throw Object.assign(new Error('Nenhuma foto enviada'), { status: 400 });
  if (photoFiles.length > 10)
    throw Object.assign(new Error('Máximo de 10 fotos por post'), { status: 400 });

  for (const f of photoFiles) {
    if (!f.mimetype.startsWith('image/'))
      throw Object.assign(new Error('Apenas imagens são permitidas no campo photos'), { status: 400 });
  }
  if (videoFile && !videoFile.mimetype.startsWith('video/'))
    throw Object.assign(new Error('Apenas vídeos são permitidos no campo video'), { status: 400 });

  const uploadedMedia: {
    type: 'image' | 'video';
    key: string;
    thumbnailKey: string | null;
    size: number;
    order: number;
  }[] = [];

  for (let i = 0; i < photoFiles.length; i++) {
    const f = photoFiles[i]!;
    const optimized = await optimizeImage(f.buffer, 'photo');
    const key = `photos/${uuidv4()}.jpg`;
    await uploadFile(key, optimized.buffer, optimized.contentType);

    const thumb = await optimizeImage(f.buffer, 'thumb');
    const thumbnailKey = `photos/thumbs/${uuidv4()}.jpg`;
    await uploadFile(thumbnailKey, thumb.buffer, thumb.contentType);

    uploadedMedia.push({
      type: 'image',
      key,
      thumbnailKey,
      size: optimized.size,
      order: i,
    });
  }

  if (videoFile) {
    const optimized = await optimizeVideo(videoFile.buffer);
    const key = `photos/video-${uuidv4()}.mp4`;
    await uploadFile(key, optimized.buffer, optimized.contentType);
    uploadedMedia.push({
      type: 'video',
      key,
      thumbnailKey: null,
      size: optimized.size,
      order: photoFiles.length,
    });
  }

  const id = newId();
  const primaryKey = uploadedMedia[0]!.key;
  const totalSize = uploadedMedia.reduce((s, m) => s + m.size, 0);

  await insertPhoto(id, userId, caption, primaryKey, totalSize);
  for (const m of uploadedMedia) {
    await insertPhotoMedia(newId(), id, m.type, m.key, m.order, m.size, m.thumbnailKey);
  }
  await logActivity({
    actorId: userId,
    action: 'photo_post',
    targetType: 'photo',
    targetId: id,
    meta: {
      caption: caption?.slice(0, 120) || '',
      images: photoFiles.length,
      hasVideo: Boolean(videoFile),
    },
  });
  return id;
}

export async function getFeedPage(params: {
  userId: string;
  cursor?: string;
  limit?: number | string;
}): Promise<FeedPage> {
  const { userId, cursor, limit } = params;

  if (REVIEW_USER_IDS.has(String(userId || '').toLowerCase())) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const safeLimit = Math.min(parseInt(String(limit ?? 20)), 50);
  const decoded = decodeFeedCursor(cursor);
  const rows = await getFeedRows(decoded, safeLimit + 1);

  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;

  const mediaMap = await buildMediaMap(pageRows.map((p) => p.id));
  const avatarUrlMap = await buildAvatarUrlMap(pageRows);
  const photoIds = pageRows.map((p) => p.id);
  const topComments = await getTopCommentsForPhotos({ photoIds, viewerId: userId });

  const topAvatarKeys = Object.values(topComments)
    .filter(Boolean)
    .map((c) => ({ user_id: c!.user_id, avatar_key: c!.avatar_key }));
  const topAvatarUrlMap: Record<string, string> = {};
  await Promise.all(
    topAvatarKeys
      .filter((e, i, arr) => e.avatar_key && arr.findIndex((x) => x.user_id === e.user_id) === i)
      .map(async ({ user_id, avatar_key }) => {
        topAvatarUrlMap[user_id] = await getFileUrl(avatar_key!, 86400);
      }),
  );

  const items = await Promise.all(
    pageRows.map((p) =>
      buildFeedItem(p, userId, mediaMap, avatarUrlMap, topComments, topAvatarUrlMap),
    ),
  );

  const last = pageRows[pageRows.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeFeedCursor({
            createdAt: String(last.created_at),
            id: last.id,
          })
        : null,
    hasMore,
  };
}

async function buildMediaMap(photoIds: string[]): Promise<Record<string, PhotoMediaRow[]>> {
  const rows = await getMediaByPhotoIds(photoIds);
  const map: Record<string, PhotoMediaRow[]> = {};
  for (const m of rows) {
    if (!map[m.photo_id]) map[m.photo_id] = [];
    map[m.photo_id]!.push(m);
  }
  return map;
}

async function buildAvatarUrlMap(rows: PhotoRow[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const unique = rows
    .filter((p) => p.avatar_key)
    .reduce<{ user_id: string; avatar_key: string }[]>((acc, p) => {
      if (!acc.find((e) => e.user_id === p.user_id))
        acc.push({ user_id: p.user_id, avatar_key: p.avatar_key! });
      return acc;
    }, []);
  await Promise.all(
    unique.map(async ({ user_id, avatar_key }) => {
      map[user_id] = await getFileUrl(avatar_key, 86400);
    }),
  );
  return map;
}

async function buildFeedItem(
  p: PhotoRow,
  requestingUserId: string,
  mediaMap: Record<string, PhotoMediaRow[]>,
  avatarUrlMap: Record<string, string>,
  topComments: Record<string, import('../repositories/comments.repository').CommentRow | null>,
  topAvatarUrlMap: Record<string, string>,
): Promise<FeedItem> {
  const reactions = parseReactions(p.reactions);
  const rawMedia = mediaMap[p.id] ?? [];

  const media: MediaItem[] =
    rawMedia.length > 0
      ? await Promise.all(
          rawMedia.map(async (m) => ({ type: m.type, url: await getFileUrl(m.storage_key, 86400) })),
        )
      : [{ type: 'image', url: await getFileUrl(p.storage_key, 86400) }];

  const top = topComments[p.id];
  let topComment: CommentPreview | null = null;
  if (top) {
    const likeCount = Number(top.like_count ?? 0);
    const rawVote = top.my_vote == null ? null : Number(top.my_vote);
    topComment = {
      id: top.id,
      body: top.body,
      likeCount,
      myVote: rawVote === 1 || rawVote === -1 ? (rawVote as 1 | -1) : null,
      author: {
        id: top.user_id,
        full_name: top.full_name,
        username: top.username,
        avatar_url: topAvatarUrlMap[top.user_id] ?? null,
      },
    };
  }

  return {
    id: p.id,
    caption: p.caption,
    created_at: p.created_at,
    author: {
      id: p.user_id,
      full_name: p.full_name,
      username: p.username,
      avatar_url: avatarUrlMap[p.user_id] ?? null,
    },
    isMine: p.user_id === requestingUserId,
    url: media[0]?.url ?? '',
    media,
    reactions,
    myReaction: reactions.find((r) => r.user_id === requestingUserId)?.emoji ?? null,
    commentsCount: Number(p.comments_count ?? 0),
    likesCount: Number(p.likes_count ?? reactions.length),
    topComment,
  };
}

export async function deletePost(params: { postId: string; userId: string }): Promise<void> {
  const { postId, userId } = params;
  const photo = await findPhotoByIdAndUser(postId, userId);
  if (!photo)
    throw Object.assign(new Error('Foto não encontrada ou você não pode excluí-la'), { status: 404 });

  const mediaRows = await getMediaByPhotoId(postId);
  await deleteMediaByPhotoId(postId);
  await deletePhotoByIdAndUser(postId, userId);

  const keysToDelete =
    mediaRows.length > 0
      ? mediaRows.flatMap((m) => [m.storage_key, m.thumbnail_key].filter(Boolean) as string[])
      : [photo.storage_key];
  for (const key of keysToDelete) {
    try {
      await deleteFile(key);
    } catch (err: any) {
      console.warn(`⚠️  Falhou ao remover ${key} do storage: ${err.message}`);
    }
  }
  await logActivity({
    actorId: userId,
    action: 'photo_delete',
    targetType: 'photo',
    targetId: postId,
  });
}

export async function upsertReaction(params: {
  photoId: string;
  userId: string;
  emoji: string;
}): Promise<void> {
  const { photoId, userId, emoji } = params;
  if (!ALLOWED_REACTIONS.includes(emoji))
    throw Object.assign(new Error('Reação não permitida'), { status: 400 });
  if (!(await photoExists(photoId)))
    throw Object.assign(new Error('Foto não encontrada'), { status: 404 });
  await repoUpsertReaction(photoId, userId, emoji);

  await logActivity({
    actorId: userId,
    action: 'reaction',
    targetType: 'photo',
    targetId: photoId,
    meta: { emoji },
  });

  const ownerId = await getPhotoOwnerId(photoId);
  if (!ownerId || ownerId === userId) return;

  try {
    await upsertNotification({
      recipientId: ownerId,
      actorId: userId,
      photoId,
      type: 'reaction',
      emoji,
    });
  } catch (err: any) {
    console.error(`⚠️  Falha ao criar notificação de reação (${photoId}):`, err?.message || err);
  }
}

export async function deleteReaction(params: { photoId: string; userId: string }): Promise<void> {
  await repoDeleteReaction(params.photoId, params.userId);
}

export async function notifyPhotoSaved(params: {
  photoId: string;
  userId: string;
}): Promise<void> {
  const { photoId, userId } = params;
  if (!(await photoExists(photoId)))
    throw Object.assign(new Error('Foto não encontrada'), { status: 404 });

  const ownerId = await getPhotoOwnerId(photoId);
  if (!ownerId || ownerId === userId) return;

  try {
    await upsertNotification({
      recipientId: ownerId,
      actorId: userId,
      photoId,
      type: 'save',
    });
  } catch (err: any) {
    console.error(`⚠️  Falha ao criar notificação de save (${photoId}):`, err?.message || err);
  }
}
