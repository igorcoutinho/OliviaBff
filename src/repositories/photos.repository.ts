import { query, isMysql, newId } from '../db';

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
}

export interface PhotoMediaRow {
  id: string;
  photo_id: string;
  type: 'image' | 'video';
  storage_key: string;
  order_index: number;
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
): Promise<void> {
  await query(
    'INSERT INTO photo_media (id, photo_id, type, storage_key, order_index, size) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, photoId, type, key, orderIndex, size],
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
    'SELECT id, photo_id, type, storage_key, order_index FROM photo_media WHERE photo_id = $1 ORDER BY order_index ASC',
    [photoId],
  );
  return rows;
}

export async function getMediaByPhotoIds(photoIds: string[]): Promise<PhotoMediaRow[]> {
  if (photoIds.length === 0) return [];
  const placeholders = isMysql
    ? photoIds.map(() => '?').join(',')
    : photoIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query<PhotoMediaRow>(
    `SELECT id, photo_id, type, storage_key, order_index FROM photo_media WHERE photo_id IN (${placeholders}) ORDER BY order_index ASC`,
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

export async function getFeedRows(cursor: string | undefined, limit: number): Promise<PhotoRow[]> {
  const feedSql = isMysql
    ? `
    SELECT p.id, p.user_id, p.caption, p.storage_key, p.created_at,
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
    ${cursor ? 'WHERE p.created_at < ?' : ''}
    ORDER BY p.created_at DESC
    LIMIT ?
  `
    : `
    SELECT p.id, p.user_id, p.caption, p.storage_key, p.created_at,
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
    ${cursor ? 'WHERE p.created_at < $1' : ''}
    GROUP BY p.id, u.full_name, u.username, u.avatar_key
    ORDER BY p.created_at DESC
    LIMIT ${cursor ? '$2' : '$1'}
  `;

  const params = cursor ? [cursor, limit] : [limit];
  const { rows } = await query<PhotoRow>(feedSql, params);
  return rows;
}

export async function photoExists(photoId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>('SELECT id FROM photos WHERE id = $1', [photoId]);
  return rows.length > 0;
}

export async function upsertReaction(
  photoId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  if (isMysql) {
    await query(
      `INSERT INTO reactions (id, photo_id, user_id, emoji) VALUES ($1, $2, $3, $4) ON DUPLICATE KEY UPDATE emoji = VALUES(emoji)`,
      [newId(), photoId, userId, emoji],
    );
  } else {
    await query(
      `INSERT INTO reactions (id, photo_id, user_id, emoji) VALUES ($1, $2, $3, $4) ON CONFLICT (photo_id, user_id) DO UPDATE SET emoji = $4`,
      [newId(), photoId, userId, emoji],
    );
  }
}

export async function deleteReaction(photoId: string, userId: string): Promise<void> {
  await query('DELETE FROM reactions WHERE photo_id = $1 AND user_id = $2', [photoId, userId]);
}
