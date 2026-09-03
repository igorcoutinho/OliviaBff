import { query } from '../db';

export interface DashboardCounts {
  users: number;
  videos: number;
  photos: number;
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const [users, videos, photos] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*) AS count FROM users'),
    query<{ count: string }>('SELECT COUNT(*) AS count FROM videos'),
    query<{ count: string }>('SELECT COUNT(*) AS count FROM photos'),
  ]);
  return {
    users: parseInt(users.rows[0]?.count ?? '0', 10),
    videos: parseInt(videos.rows[0]?.count ?? '0', 10),
    photos: parseInt(photos.rows[0]?.count ?? '0', 10),
  };
}
