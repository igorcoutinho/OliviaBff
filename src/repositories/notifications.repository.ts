import { query, isMysql, newId } from '../db';

export type NotificationType = 'reaction' | 'save';

export interface NotificationRow {
  id: string;
  recipient_id: string;
  actor_id: string;
  photo_id: string;
  type: NotificationType;
  emoji: string | null;
  read_at: string | null;
  created_at: string;
  actor_full_name: string;
  actor_username: string;
  actor_avatar_key: string | null;
  photo_caption: string | null;
  thumbnail_key: string | null;
  fallback_storage_key: string | null;
}

export async function upsertNotification(params: {
  recipientId: string;
  actorId: string;
  photoId: string;
  type: NotificationType;
  emoji?: string | null;
}): Promise<void> {
  const { recipientId, actorId, photoId, type, emoji = null } = params;
  if (recipientId === actorId) return;

  if (isMysql) {
    await query(
      `INSERT IGNORE INTO notifications (id, recipient_id, actor_id, photo_id, type, emoji, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, CURRENT_TIMESTAMP)`,
      [newId(), recipientId, actorId, photoId, type, emoji],
    );
    return;
  }

  await query(
    `INSERT INTO notifications (id, recipient_id, actor_id, photo_id, type, emoji, read_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW())
     ON CONFLICT (recipient_id, actor_id, photo_id, type) DO NOTHING`,
    [newId(), recipientId, actorId, photoId, type, emoji],
  );
}

export async function listNotifications(params: {
  recipientId: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<NotificationRow[]> {
  const { recipientId, unreadOnly = false, limit = 50 } = params;
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const { rows } = await query<NotificationRow>(
    `SELECT n.id, n.recipient_id, n.actor_id, n.photo_id, n.type, n.emoji, n.read_at, n.created_at,
            a.full_name AS actor_full_name, a.username AS actor_username, a.avatar_key AS actor_avatar_key,
            p.caption AS photo_caption, p.storage_key AS fallback_storage_key,
            (
              SELECT COALESCE(pm.thumbnail_key, pm.storage_key)
              FROM photo_media pm
              WHERE pm.photo_id = n.photo_id AND pm.type = 'image'
              ORDER BY pm.order_index ASC
              LIMIT 1
            ) AS thumbnail_key
     FROM notifications n
     JOIN users a ON a.id = n.actor_id
     JOIN photos p ON p.id = n.photo_id
     WHERE n.recipient_id = $1
       ${unreadOnly ? 'AND n.read_at IS NULL' : ''}
     ORDER BY n.created_at DESC
     LIMIT ${safeLimit}`,
    [recipientId],
  );
  return rows;
}

export async function countAll(recipientId: string): Promise<number> {
  const { rows } = await query<{ c: number | string }>(
    'SELECT COUNT(*) AS c FROM notifications WHERE recipient_id = $1',
    [recipientId],
  );
  return Number(rows[0]?.c ?? 0);
}

export async function countUnread(recipientId: string): Promise<number> {
  const { rows } = await query<{ c: number | string }>(
    'SELECT COUNT(*) AS c FROM notifications WHERE recipient_id = $1 AND read_at IS NULL',
    [recipientId],
  );
  return Number(rows[0]?.c ?? 0);
}

export async function markNotificationRead(params: {
  id: string;
  recipientId: string;
}): Promise<boolean> {
  const { id, recipientId } = params;
  if (isMysql) {
    const result = await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL',
      [id, recipientId],
    );
    return true;
  }
  await query(
    'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL',
    [id, recipientId],
  );
  return true;
}

export async function markAllNotificationsRead(recipientId: string): Promise<void> {
  if (isMysql) {
    await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_id = $1 AND read_at IS NULL',
      [recipientId],
    );
    return;
  }
  await query(
    'UPDATE notifications SET read_at = NOW() WHERE recipient_id = $1 AND read_at IS NULL',
    [recipientId],
  );
}

export async function getPhotoOwnerId(photoId: string): Promise<string | null> {
  const { rows } = await query<{ user_id: string }>(
    'SELECT user_id FROM photos WHERE id = $1',
    [photoId],
  );
  return rows[0]?.user_id ?? null;
}
