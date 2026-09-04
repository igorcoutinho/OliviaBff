import type { Request, Response } from 'express';
import {
  createComment,
  getCommentsPage,
  removeComment,
  voteComment,
} from '../services/comments.service';

export async function listComments(req: Request, res: Response): Promise<void> {
  try {
    const page = await getCommentsPage({
      photoId: req.params['id'] as string,
      userId: req.user.userId,
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit as string | undefined,
    });
    res.json(page);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function addComment(req: Request, res: Response): Promise<void> {
  try {
    const item = await createComment({
      photoId: req.params['id'] as string,
      userId: req.user.userId,
      body: String(req.body?.body ?? ''),
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  try {
    await removeComment({
      commentId: req.params['commentId'] as string,
      userId: req.user.userId,
    });
    res.json({ message: 'Comentário removido' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

export async function setCommentVote(req: Request, res: Response): Promise<void> {
  try {
    const vote = Number(req.body?.vote);
    if (vote !== 1 && vote !== -1) {
      res.status(400).json({ error: 'Voto inválido' });
      return;
    }
    const result = await voteComment({
      commentId: req.params['commentId'] as string,
      userId: req.user.userId,
      vote: vote as 1 | -1,
    });
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
