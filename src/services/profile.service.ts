import { v4 as uuidv4 } from 'uuid';
import { uploadFile } from '../storage';
import { getUserById, type PublicUser } from './auth.service';
import { setUserAvatarKey, getUserStats } from '../repositories/users.repository';

interface UploadedFile {
  originalname?: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface ProfileData {
  user: PublicUser;
  stats: { photos: number; videos: number };
}

export async function getProfileWithStats(userId: string): Promise<ProfileData> {
  const user = await getUserById(userId);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  const stats = await getUserStats(userId);
  return { user, stats };
}

export async function updateAvatar(params: {
  userId: string;
  file: UploadedFile | undefined;
}): Promise<PublicUser> {
  const { userId, file } = params;
  if (!file) throw Object.assign(new Error('Nenhuma imagem enviada'), { status: 400 });
  if (!file.mimetype.startsWith('image/'))
    throw Object.assign(new Error('Apenas imagens são permitidas'), { status: 400 });

  const ext = file.originalname?.split('.').pop() || 'jpg';
  const key = `avatars/${userId}/${uuidv4()}.${ext}`;
  await uploadFile(key, file.buffer, file.mimetype);
  await setUserAvatarKey(userId, key);
  return (await getUserById(userId))!;
}

export async function removeAvatar(userId: string): Promise<PublicUser> {
  await setUserAvatarKey(userId, null);
  return (await getUserById(userId))!;
}
