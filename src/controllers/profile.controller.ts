import type { Request, Response } from 'express';
import { getProfileWithStats, updateAvatar, removeAvatar } from '../services/profile.service';

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const data = await getProfileWithStats(req.user.userId);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  try {
    const user = await updateAvatar({ userId: req.user.userId, file: req.file });
    res.json({ message: 'Foto de perfil atualizada 🌸', user });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function removeAvatarHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await removeAvatar(req.user.userId);
    res.json({ message: 'Foto de perfil removida', user });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
