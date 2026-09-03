require('dotenv').config();
console.log('Iniciando backend...');

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { query, isMysql, ensureSchemaPatches, newId } = require('./db');
const storage = () => require('./storage');
const { register, login, authMiddleware, getUserById } = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'olivia-admin-secreto';

const maxVideoSize = (parseInt(process.env.MAX_VIDEO_SIZE_MB, 10) || 100) * 1024 * 1024;
const maxPhotoSize = (parseInt(process.env.MAX_PHOTO_SIZE_MB, 10) || 20) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(maxVideoSize, maxPhotoSize) },
});

const ALLOWED_REACTIONS = ['❤️', '🥰', '😍', '👏', '🎉', '✨', '🌸', '🧚'];

app.use(cors());
app.use(express.json());

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

app.use(requireAppSignature);

function checkAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

function parseReactions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Jardim Encantado da Olivia 🌸' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, password } = req.body;
    if (!fullName?.trim() || !password) {
      return res.status(400).json({ error: 'Nome completo e senha são obrigatórios' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
    }
    const result = await register(fullName, password);
    res.status(201).json({
      message: 'Cadastro realizado! Guarde seu nome de usuário.',
      user: result.user,
      token: result.token,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    const result = await login(username, password);
    res.json({ user: result.user, token: result.token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = await getUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(user);
});

app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { rows } = await query(
      isMysql
        ? `SELECT
            (SELECT COUNT(*) FROM photos WHERE user_id = $1) AS photos,
            (SELECT COUNT(*) FROM videos WHERE user_id = $1) AS videos`
        : `SELECT
            (SELECT COUNT(*)::int FROM photos WHERE user_id = $1) AS photos,
            (SELECT COUNT(*)::int FROM videos WHERE user_id = $1) AS videos`,
      [req.user.userId]
    );

    res.json({
      user,
      stats: {
        photos: Number(rows[0].photos),
        videos: Number(rows[0].videos),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Apenas imagens são permitidas' });
    }

    const ext = req.file.originalname?.split('.').pop() || 'jpg';
    const key = `avatars/${req.user.userId}/${uuidv4()}.${ext}`;
    await storage().uploadFile(key, req.file.buffer, req.file.mimetype);

    await query('UPDATE users SET avatar_key = $1 WHERE id = $2', [key, req.user.userId]);

    const user = await getUserById(req.user.userId);
    res.json({ message: 'Foto de perfil atualizada! 🌸', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/profile/avatar', authMiddleware, async (req, res) => {
  try {
    await query('UPDATE users SET avatar_key = NULL WHERE id = $1', [req.user.userId]);
    const user = await getUserById(req.user.userId);
    res.json({ message: 'Foto de perfil removida', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/videos', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum vídeo enviado' });
    if (!req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'Apenas vídeos são permitidos' });
    }

    const ext = req.file.originalname?.split('.').pop() || 'mp4';
    const key = `videos/${req.user.userId}/${uuidv4()}.${ext}`;
    await storage().uploadFile(key, req.file.buffer, req.file.mimetype);

    const message = (req.body.message || '').trim();
    const id = newId();
    await query(
      'INSERT INTO videos (id, user_id, message, storage_key, size) VALUES ($1, $2, $3, $4, $5)',
      [id, req.user.userId, message, key, req.file.size]
    );
    const { rows } = await query(
      'SELECT id, message, created_at FROM videos WHERE id = $1',
      [id]
    );

    res.status(201).json({
      message: 'Vídeo guardado com carinho! Será entregue à Olivia quando ela fizer 10 anos 💕',
      video: rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/videos/mine', authMiddleware, async (req, res) => {
  const { rows } = await query(
    'SELECT id, message, storage_key, size, created_at FROM videos WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.userId]
  );

  const videos = await Promise.all(rows.map(async (v) => ({
    ...v,
    url: await storage().getFileUrl(v.storage_key),
  })));

  res.json(videos);
});

app.post('/api/photos', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Apenas imagens são permitidas' });
    }

    const ext = req.file.originalname?.split('.').pop() || 'jpg';
    const key = `photos/${uuidv4()}.${ext}`;
    await storage().uploadFile(key, req.file.buffer, req.file.mimetype);

    const caption = (req.body.caption || '').trim();
    const id = newId();
    await query(
      'INSERT INTO photos (id, user_id, caption, storage_key, size) VALUES ($1, $2, $3, $4, $5)',
      [id, req.user.userId, caption, key, req.file.size]
    );
    const { rows } = await query(
      'SELECT id, caption, storage_key, created_at FROM photos WHERE id = $1',
      [id]
    );

    res.status(201).json({
      message: 'Foto compartilhada no jardim da festa! 🌸',
      photo: rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/photos/feed', authMiddleware, async (req, res) => {
  if (String(req.user.username || '').toLowerCase() === 'teste.conta') {
    return res.json([]);
  }

  const feedSql = isMysql
    ? `
    SELECT p.id, p.caption, p.storage_key, p.created_at,
           u.full_name, u.username,
           COALESCE((
             SELECT JSON_ARRAYAGG(
               JSON_OBJECT(
                 'emoji', r.emoji,
                 'username', ru.username,
                 'full_name', ru.full_name,
                 'user_id', r.user_id
               )
             )
             FROM reactions r
             JOIN users ru ON ru.id = r.user_id
             WHERE r.photo_id = p.id
           ), JSON_ARRAY()) AS reactions
    FROM photos p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
  `
    : `
    SELECT p.id, p.caption, p.storage_key, p.created_at,
           u.full_name, u.username,
           COALESCE(
             json_agg(
               json_build_object('emoji', r.emoji, 'username', ru.username, 'full_name', ru.full_name, 'user_id', r.user_id)
             ) FILTER (WHERE r.id IS NOT NULL), '[]'
           ) AS reactions
    FROM photos p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN reactions r ON r.photo_id = p.id
    LEFT JOIN users ru ON ru.id = r.user_id
    GROUP BY p.id, u.full_name, u.username
    ORDER BY p.created_at DESC
  `;

  const { rows } = await query(feedSql);

  const feed = await Promise.all(rows.map(async (p) => {
    const reactions = parseReactions(p.reactions);
    return {
      id: p.id,
      caption: p.caption,
      created_at: p.created_at,
      author: { full_name: p.full_name, username: p.username },
      url: await storage().getFileUrl(p.storage_key),
      reactions,
      myReaction: reactions.find((r) => r.user_id === req.user.userId)?.emoji || null,
    };
  }));

  res.json(feed);
});

app.post('/api/photos/:id/react', authMiddleware, async (req, res) => {
  const { emoji } = req.body;
  if (!ALLOWED_REACTIONS.includes(emoji)) {
    return res.status(400).json({ error: 'Reação não permitida' });
  }

  const photoCheck = await query('SELECT id FROM photos WHERE id = $1', [req.params.id]);
  if (photoCheck.rows.length === 0) return res.status(404).json({ error: 'Foto não encontrada' });

  if (isMysql) {
    await query(
      `INSERT INTO reactions (id, photo_id, user_id, emoji)
       VALUES ($1, $2, $3, $4)
       ON DUPLICATE KEY UPDATE emoji = VALUES(emoji)`,
      [newId(), req.params.id, req.user.userId, emoji]
    );
  } else {
    await query(
      `INSERT INTO reactions (id, photo_id, user_id, emoji)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (photo_id, user_id) DO UPDATE SET emoji = $4`,
      [newId(), req.params.id, req.user.userId, emoji]
    );
  }

  res.json({ success: true });
});

app.delete('/api/photos/:id/react', authMiddleware, async (req, res) => {
  await query(
    'DELETE FROM reactions WHERE photo_id = $1 AND user_id = $2',
    [req.params.id, req.user.userId]
  );
  res.json({ success: true });
});

app.get('/api/admin/summary', checkAdmin, async (_req, res) => {
  const [users, videos, photos] = await Promise.all([
    query('SELECT COUNT(*) AS count FROM users'),
    query('SELECT COUNT(*) AS count FROM videos'),
    query('SELECT COUNT(*) AS count FROM photos'),
  ]);
  res.json({
    users: parseInt(users.rows[0].count, 10),
    videos: parseInt(videos.rows[0].count, 10),
    photos: parseInt(photos.rows[0].count, 10),
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande' });
  }
  res.status(400).json({ error: err.message || 'Erro interno' });
});

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 Jardim Encantado da Olivia — http://0.0.0.0:${PORT}`);
  });

  try {
    await ensureSchemaPatches();
    await storage().ensureBucket();
  } catch (err) {
    console.warn(`⚠️  Inicialização parcial: ${err.message}`);
  }
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
