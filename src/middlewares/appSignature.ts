import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const APP_SECRET = process.env.APP_SECRET;
const SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;

export function requireAppSignature(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health') { next(); return; }

  if (!APP_SECRET) {
    res.status(503).json({ error: 'API não configurada' });
    return;
  }

  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  if (typeof timestamp !== 'string' || typeof signature !== 'string') {
    res.status(401).json({ error: 'Assinatura ausente' });
    return;
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_AGE_MS) {
    res.status(401).json({ error: 'Assinatura expirada' });
    return;
  }

  const payload = `${timestamp}.${req.method.toUpperCase()}.${req.path}`;
  const expected = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');

  if (!/^[0-9a-f]+$/i.test(signature) || signature.length !== expected.length) {
    res.status(401).json({ error: 'Assinatura inválida' });
    return;
  }

  const received = Buffer.from(signature, 'hex');
  const valid = Buffer.from(expected, 'hex');
  if (!crypto.timingSafeEqual(received, valid)) {
    res.status(401).json({ error: 'Assinatura inválida' });
    return;
  }

  next();
}
