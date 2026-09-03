const crypto = require('crypto');

const APP_SECRET = process.env.APP_SECRET;
const SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;

function requireAppSignature(req, res, next) {
  if (req.path === '/api/health') return next();

  if (!APP_SECRET) {
    return res.status(503).json({ error: 'API não configurada' });
  }

  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  if (typeof timestamp !== 'string' || typeof signature !== 'string') {
    return res.status(401).json({ error: 'Assinatura ausente' });
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_AGE_MS) {
    return res.status(401).json({ error: 'Assinatura expirada' });
  }

  const payload = `${timestamp}.${req.method.toUpperCase()}.${req.path}`;
  const expected = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');

  if (!/^[0-9a-f]+$/i.test(signature) || signature.length !== expected.length) {
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  const received = Buffer.from(signature, 'hex');
  const valid = Buffer.from(expected, 'hex');

  if (!crypto.timingSafeEqual(received, valid)) {
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  next();
}

module.exports = { requireAppSignature };
