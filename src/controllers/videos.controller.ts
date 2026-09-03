import type { Request, Response } from 'express';
import { createVideo, getUserVideos } from '../services/videos.service';

export async function uploadVideo(req: Request, res: Response): Promise<void> {
  try {
    const video = await createVideo({
      userId: req.user.userId,
      message: (req.body.message as string) || '',
      file: req.file,
    });
    res.status(201).json({
      message: 'Vídeo guardado com carinho! Será entregue à Olivia quando ela fizer 10 anos 💕',
      video,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function getMyVideos(req: Request, res: Response): Promise<void> {
  try {
    const videos = await getUserVideos(req.user.userId);
    res.json(videos);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
