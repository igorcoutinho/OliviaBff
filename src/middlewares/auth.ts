import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import {
  findUserById,
  userIsApproved,
  userIsBlocked,
} from '../repositories/users.repository';
import { JWT_SECRET } from '../lib/secrets';

export interface JwtPayload {
  userId: string;
  username: string;
  panelAdmin?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}

function isAuthMeRequest(req: Request): boolean {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return req.method === 'GET' && path === '/api/auth/me';
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  void (async () => {
    try {
      const token = header.slice(7);
      req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;

      if (req.user.panelAdmin) {
        next();
        return;
      }

      const row = await findUserById(req.user.userId);
      if (!row) {
        res.status(401).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (userIsBlocked(row)) {
        res.status(403).json({ error: 'Conta bloqueada', code: 'BLOCKED' });
        return;
      }

      if (!userIsApproved(row) && !isAuthMeRequest(req)) {
        res.status(403).json({
          error: 'Conta aguardando liberação',
          code: 'PENDING_APPROVAL',
        });
        return;
      }

      next();
    } catch {
      res.status(401).json({ error: 'Token inválido ou expirado' });
    }
  })();
}
