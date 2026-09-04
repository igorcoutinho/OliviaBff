import type { Request, Response } from 'express';
import {
  getNotificationsPage,
  getUnreadNotificationsCount,
  readNotification,
  readAllNotifications,
} from '../services/notifications.service';

export async function listNotifications(req: Request, res: Response): Promise<void> {
  try {
    const unreadOnly = String(req.query.filter || '') === 'unread';
    const page = await getNotificationsPage({
      userId: req.user.userId,
      unreadOnly,
    });
    res.json(page);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  try {
    const count = await getUnreadNotificationsCount(req.user.userId);
    res.json({ count });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    await readNotification({ id: req.params['id'] as string, userId: req.user.userId });
    res.json({ message: 'Notificação marcada como lida' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    await readAllNotifications(req.user.userId);
    res.json({ message: 'Todas as notificações foram marcadas como lidas' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
