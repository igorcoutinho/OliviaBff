const { query, isMysql } = require('../db');
const { getUserById } = require('../services/auth.service');
const storage = () => require('../storage');
const { v4: uuidv4 } = require('uuid');

async function getProfile(req, res) {
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
}

async function uploadAvatar(req, res) {
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
}

async function removeAvatar(req, res) {
  try {
    await query('UPDATE users SET avatar_key = NULL WHERE id = $1', [req.user.userId]);
    const user = await getUserById(req.user.userId);
    res.json({ message: 'Foto de perfil removida', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getProfile, uploadAvatar, removeAvatar };
