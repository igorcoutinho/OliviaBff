import { deleteFile } from '../storage';
import {
  deleteCommentVotesByUserId,
  deleteCommentsByUserId,
} from '../repositories/comments.repository';
import { deleteNotificationsForUser } from '../repositories/notifications.repository';
import {
  deleteMediaByPhotoId,
  deletePhotoByIdAndUser,
  deleteReactionsByUserId,
  findPhotosByUserId,
  getMediaByPhotoId,
} from '../repositories/photos.repository';
import {
  findUserById,
  setUserAvatarKey,
} from '../repositories/users.repository';
import { findVideosByUser, deleteVideosByUserId } from '../repositories/videos.repository';

export type WipeUserContentResult = {
  photos: number;
  videos: number;
  comments: number;
  reactions: number;
};

async function safeDeleteKey(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await deleteFile(key);
  } catch (err: any) {
    console.warn(`⚠️  Falhou ao remover ${key} do storage: ${err.message}`);
  }
}

export async function wipeUserPostedContent(userId: string): Promise<WipeUserContentResult> {
  const user = await findUserById(userId);
  if (!user) {
    throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  }

  const photos = await findPhotosByUserId(userId);
  for (const photo of photos) {
    const mediaRows = await getMediaByPhotoId(photo.id);
    await deleteMediaByPhotoId(photo.id);
    await deletePhotoByIdAndUser(photo.id, userId);

    const keys =
      mediaRows.length > 0
        ? mediaRows.flatMap((m) => [m.storage_key, m.thumbnail_key].filter(Boolean) as string[])
        : [photo.storage_key];
    for (const key of keys) {
      await safeDeleteKey(key);
    }
  }

  const videos = await findVideosByUser(userId);
  for (const video of videos) {
    await safeDeleteKey(video.storage_key);
  }
  await deleteVideosByUserId(userId);

  await deleteCommentVotesByUserId(userId);
  const commentsRemoved = await deleteCommentsByUserId(userId);
  const reactionsRemoved = await deleteReactionsByUserId(userId);
  await deleteNotificationsForUser(userId);

  if (user.avatar_key) {
    await safeDeleteKey(user.avatar_key);
    await setUserAvatarKey(userId, null);
  }

  return {
    photos: photos.length,
    videos: videos.length,
    comments: commentsRemoved,
    reactions: reactionsRemoved,
  };
}
