import type { Request, Response } from 'express';
import {
  createPost,
  getFeedPage,
  deletePost,
  upsertReaction,
  deleteReaction,
  notifyPhotoSaved,
} from '../services/photos.service';
import { findUserById } from '../repositories/users.repository';
import { logError } from '../lib/errorLog';

function fileMeta(files?: { photos?: Express.Multer.File[]; video?: Express.Multer.File[] }) {
  const photos = files?.photos ?? [];
  const video = files?.video?.[0];
  return {
    photoCount: photos.length,
    photos: photos.map((f) => ({
      name: f.originalname,
      mime: f.mimetype,
      size: f.size,
    })),
    video: video
      ? { name: video.originalname, mime: video.mimetype, size: video.size }
      : null,
  };
}

export async function uploadPhoto(req: Request, res: Response): Promise<void> {
  const files = req.files as
    | { photos?: Express.Multer.File[]; video?: Express.Multer.File[] }
    | undefined;
  try {
    await createPost({
      userId: req.user.userId,
      caption: (req.body.caption as string) || '',
      photoFiles: files?.photos ?? [],
      videoFile: files?.video?.[0] ?? null,
    });
    res.status(201).json({ message: 'Foto compartilhada no jardim da festa! 🌸' });
  } catch (err: any) {
    let userName: string | null = null;
    let username: string | null = null;
    try {
      const row = await findUserById(req.user.userId);
      if (row) {
        userName = row.full_name;
        username = row.username;
      }
    } catch {
      // ignore
    }

    await logError({
      userId: req.user.userId,
      userName,
      username,
      action: 'photo_post',
      error: err,
      meta: {
        path: '/api/photos',
        caption: String(req.body?.caption || '').slice(0, 120),
        files: fileMeta(files),
      },
    });

    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function getFeed(req: Request, res: Response): Promise<void> {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit as string | undefined;
    const page = await getFeedPage({ userId: req.user.userId, cursor, limit });
    res.json(page);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function deletePhoto(req: Request, res: Response): Promise<void> {
  try {
    await deletePost({ postId: req.params['id'] as string, userId: req.user.userId });
    res.json({ message: 'Foto removida' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function addReaction(req: Request, res: Response): Promise<void> {
  try {
    await upsertReaction({
      photoId: req.params['id'] as string,
      userId: req.user.userId,
      emoji: req.body.emoji,
    });
    res.json({ message: 'Reação registrada 🌸' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function removeReaction(req: Request, res: Response): Promise<void> {
  try {
    await deleteReaction({ photoId: req.params['id'] as string, userId: req.user.userId });
    res.json({ message: 'Reação removida' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function notifySave(req: Request, res: Response): Promise<void> {
  try {
    await notifyPhotoSaved({ photoId: req.params['id'] as string, userId: req.user.userId });
    res.json({ message: 'Notificação de salvamento registrada' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
