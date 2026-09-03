import type { Request, Response, NextFunction } from 'express';

const ADMIN_KEY = process.env.ADMIN_KEY || 'olivia-admin-secreto';

export function checkAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  next();
}
