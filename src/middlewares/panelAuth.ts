import type { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth';

export function panelAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  authMiddleware(req, res, () => {
    if (!req.user.panelAdmin) {
      res.status(403).json({ error: 'Acesso restrito ao admin do painel' });
      return;
    }
    next();
  });
}
