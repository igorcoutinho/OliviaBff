require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');
const { ensureBucket, uploadFile, getFileUrl } = require('./storage');
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

function checkAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Jardim Encantado da Olivia 🌸' });
});

// ── Auth ──

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

// ── Vídeos (privados — só o dono vê) ──

app.post('/api/videos', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum vídeo enviado' });
    if (!req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'Apenas vídeos são permitidos' });
    }

    const ext = req.file.originalname?.split('.').pop() || 'mp4';
    const key = `videos/${req.user.userId}/${uuidv4()}.${ext}`;
    await uploadFile(key, req.file.buffer, req.file.mimetype);

    const message = (req.body.message || '').trim();
    const { rows } = await pool.query(
      'INSERT INTO videos (user_id, message, storage_key, size) VALUES ($1, $2, $3, $4) RETURNING id, message, created_at',
      [req.user.userId, message, key, req.file.size]
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
  const { rows } = await pool.query(
    'SELECT id, message, storage_key, size, created_at FROM videos WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.userId]
  );

  const videos = await Promise.all(rows.map(async (v) => ({
    ...v,
    url: await getFileUrl(v.storage_key),
  })));

  res.json(videos);
});

// ── Fotos (feed público entre convidados) ──

app.post('/api/photos', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Apenas imagens são permitidas' });
    }

    const ext = req.file.originalname?.split('.').pop() || 'jpg';
    const key = `photos/${uuidv4()}.${ext}`;
    await uploadFile(key, req.file.buffer, req.file.mimetype);

    const caption = (req.body.caption || '').trim();
    const { rows } = await pool.query(
      `INSERT INTO photos (user_id, caption, storage_key, size)
       VALUES ($1, $2, $3, $4)
       RETURNING id, caption, storage_key, created_at`,
      [req.user.userId, caption, key, req.file.size]
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
  const { rows } = await pool.query(`
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
  `);

  const feed = await Promise.all(rows.map(async (p) => ({
    id: p.id,
    caption: p.caption,
    created_at: p.created_at,
    author: { full_name: p.full_name, username: p.username },
    url: await getFileUrl(p.storage_key),
    reactions: p.reactions,
    myReaction: p.reactions.find((r) => r.user_id === req.user.userId)?.emoji || null,
  })));

  res.json(feed);
});

app.post('/api/photos/:id/react', authMiddleware, async (req, res) => {
  const { emoji } = req.body;
  if (!ALLOWED_REACTIONS.includes(emoji)) {
    return res.status(400).json({ error: 'Reação não permitida' });
  }

  const photoCheck = await pool.query('SELECT id FROM photos WHERE id = $1', [req.params.id]);
  if (photoCheck.rows.length === 0) return res.status(404).json({ error: 'Foto não encontrada' });

  await pool.query(
    `INSERT INTO reactions (photo_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (photo_id, user_id) DO UPDATE SET emoji = $3`,
    [req.params.id, req.user.userId, emoji]
  );

  res.json({ success: true });
});

app.delete('/api/photos/:id/react', authMiddleware, async (req, res) => {
  await pool.query(
    'DELETE FROM reactions WHERE photo_id = $1 AND user_id = $2',
    [req.params.id, req.user.userId]
  );
  res.json({ success: true });
});

// ── Admin ──

app.get('/api/admin/summary', checkAdmin, async (_req, res) => {
  const [users, videos, photos] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM users'),
    pool.query('SELECT COUNT(*) FROM videos'),
    pool.query('SELECT COUNT(*) FROM photos'),
  ]);
  res.json({
    users: parseInt(users.rows[0].count),
    videos: parseInt(videos.rows[0].count),
    photos: parseInt(photos.rows[0].count),
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande' });
  }
  res.status(400).json({ error: err.message || 'Erro interno' });
});

async function start() {
  await ensureBucket();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 Jardim Encantado da Olivia — http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
