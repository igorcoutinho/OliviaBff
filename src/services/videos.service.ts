import { v4 as uuidv4 } from 'uuid';
import { uploadFile, getFileUrl } from '../storage';
import { insertVideo, findVideosByUser } from '../repositories/videos.repository';

interface UploadedFile {
  originalname?: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface VideoItem {
  id: string;
  message: string;
  url: string;
  size: number;
  created_at: string;
}

export async function createVideo(params: {
  userId: string;
  message: string;
  file: UploadedFile | undefined;
}): Promise<{ id: string; message: string; created_at: string }> {
  const { userId, message, file } = params;
  if (!file) throw Object.assign(new Error('Nenhum vídeo enviado'), { status: 400 });
  if (!file.mimetype.startsWith('video/'))
    throw Object.assign(new Error('Apenas vídeos são permitidos'), { status: 400 });

  const ext = file.originalname?.split('.').pop() || 'mp4';
  const key = `videos/${userId}/${uuidv4()}.${ext}`;
  await uploadFile(key, file.buffer, file.mimetype);
  return insertVideo(userId, message || '', key, file.size);
}

export async function getUserVideos(userId: string): Promise<VideoItem[]> {
  const rows = await findVideosByUser(userId);
  return Promise.all(
    rows.map(async (v) => ({ ...v, url: await getFileUrl(v.storage_key) })),
  );
}
