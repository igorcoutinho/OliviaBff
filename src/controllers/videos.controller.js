const { query, isMysql, newId } = require('../db');
const storage = () => require('../storage');
const { v4: uuidv4 } = require('uuid');

async function uploadVideo(req, res) {
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
}

async function getMyVideos(req, res) {
  try {
    const { rows } = await query(
      'SELECT id, message, storage_key, size, created_at FROM videos WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    const videos = await Promise.all(
      rows.map(async (v) => ({
        ...v,
        url: await storage().getFileUrl(v.storage_key),
      }))
    );

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { uploadVideo, getMyVideos };
