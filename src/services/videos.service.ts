import { v4 as uuidv4 } from 'uuid';
import { uploadFile, getFileUrl } from '../storage';
import { optimizeVideo } from '../lib/optimizeVideo';
import type { UploadedFile, VideoItem } from '../types';
import { insertVideo, findVideosByUser } from '../repositories/videos.repository';

export type { VideoItem };

export async function createVideo(params: {
  userId: string;
  message: string;
  file: UploadedFile | undefined;
}): Promise<{ id: string; message: string; created_at: string }> {
  const { userId, message, file } = params;
  if (!file) throw Object.assign(new Error('Nenhum vídeo enviado'), { status: 400 });
  if (!file.mimetype.startsWith('video/'))
    throw Object.assign(new Error('Apenas vídeos são permitidos'), { status: 400 });

  const optimized = await optimizeVideo(file.buffer);
  const key = `videos/${userId}/${uuidv4()}.mp4`;
  await uploadFile(key, optimized.buffer, optimized.contentType);
  return insertVideo(userId, message || '', key, optimized.size);
}

export async function getUserVideos(userId: string): Promise<VideoItem[]> {
  const rows = await findVideosByUser(userId);
  return Promise.all(
    rows.map(async (v) => ({ ...v, url: await getFileUrl(v.storage_key) })),
  );
}
