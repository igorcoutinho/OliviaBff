import { getFileUrl } from '../storage';
import {
  listNotifications,
  countUnread,
  countAll,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '../repositories/notifications.repository';

export interface NotificationItem {
  id: string;
  type: 'reaction' | 'save';
  emoji: string | null;
  message: string;
  created_at: string;
  read: boolean;
  actor: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
  };
  photo: {
    id: string;
    thumbnail_url: string | null;
  };
}

function captionSnippet(caption: string | null | undefined): string {
  const clean = (caption || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const short = clean.length > 36 ? `${clean.slice(0, 36).trim()}…` : clean;
  return ` ${short}`;
}

export function buildNotificationMessage(row: NotificationRow): string {
  const snippet = captionSnippet(row.photo_caption);

  if (row.type === 'save') {
    return `salvou sua foto${snippet ? `:${snippet}` : ''} no álbum.`;
  }

  if (row.emoji) {
    return `reagiu com ${row.emoji} à sua postagem${snippet ? `:${snippet}` : ''}.`;
  }

  return `reagiu à sua postagem${snippet ? `:${snippet}` : ''}.`;
}

export async function getNotificationsPage(params: {
  userId: string;
  unreadOnly?: boolean;
}): Promise<{ items: NotificationItem[]; unreadCount: number; totalCount: number }> {
  const rows = await listNotifications({
    recipientId: params.userId,
    unreadOnly: params.unreadOnly,
  });
  const [unreadCount, totalCount] = await Promise.all([
    countUnread(params.userId),
    countAll(params.userId),
  ]);

  const items = await Promise.all(
    rows.map(async (row) => {
      const thumbKey = row.thumbnail_key || row.fallback_storage_key;
      return {
        id: row.id,
        type: row.type,
        emoji: row.emoji,
        message: buildNotificationMessage(row),
        created_at: row.created_at,
        read: !!row.read_at,
        actor: {
          id: row.actor_id,
          full_name: row.actor_full_name,
          username: row.actor_username,
          avatar_url: row.actor_avatar_key
            ? await getFileUrl(row.actor_avatar_key, 86400)
            : null,
        },
        photo: {
          id: row.photo_id,
          thumbnail_url: thumbKey ? await getFileUrl(thumbKey, 86400) : null,
        },
      } satisfies NotificationItem;
    }),
  );

  return { items, unreadCount, totalCount };
}

export async function getUnreadNotificationsCount(userId: string): Promise<number> {
  return countUnread(userId);
}

export async function readNotification(params: {
  id: string;
  userId: string;
}): Promise<void> {
  await markNotificationRead({ id: params.id, recipientId: params.userId });
}

export async function readAllNotifications(userId: string): Promise<void> {
  await markAllNotificationsRead(userId);
}
