import { query, newId } from '../db';

export interface VideoRow {
  id: string;
  user_id?: string;
  message: string;
  storage_key: string;
  size: number;
  created_at: string;
}

export async function insertVideo(
  userId: string,
  message: string,
  key: string,
  size: number,
): Promise<VideoRow> {
  const id = newId();
  await query(
    'INSERT INTO videos (id, user_id, message, storage_key, size) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, message.trim(), key, size],
  );
  const { rows } = await query<VideoRow>(
    'SELECT id, message, created_at FROM videos WHERE id = $1',
    [id],
  );
  return rows[0]!;
}

export async function findVideosByUser(userId: string): Promise<VideoRow[]> {
  const { rows } = await query<VideoRow>(
    'SELECT id, message, storage_key, size, created_at FROM videos WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return rows;
}

export async function deleteVideosByUserId(userId: string): Promise<number> {
  const videos = await findVideosByUser(userId);
  if (videos.length === 0) return 0;
  await query('DELETE FROM videos WHERE user_id = $1', [userId]);
  return videos.length;
}
