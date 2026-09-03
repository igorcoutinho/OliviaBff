const { query, isMysql, newId } = require('../db');
const storage = () => require('../storage');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_REACTIONS = ['❤️', '🥰', '😍', '👏', '🎉', '✨', '🌸', '🧚'];

const REVIEW_USER_IDS = new Set([
  '1b70a665-8cc7-444a-9d2b-0583fff7b2af',
]);

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

async function uploadPhoto(req, res) {
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
}

async function getFeed(req, res) {
  try {
    if (REVIEW_USER_IDS.has(String(req.user.userId || '').toLowerCase())) {
      return res.json([]);
    }

    const feedSql = isMysql
      ? `
      SELECT p.id, p.user_id, p.caption, p.storage_key, p.created_at,
             u.full_name, u.username,
             COALESCE((
               SELECT JSON_ARRAYAGG(
                 JSON_OBJECT('emoji', r.emoji, 'username', ru.username, 'full_name', ru.full_name, 'user_id', r.user_id)
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
      SELECT p.id, p.user_id, p.caption, p.storage_key, p.created_at,
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

    const feed = await Promise.all(
      rows.map(async (p) => {
        const reactions = parseReactions(p.reactions);
        return {
          id: p.id,
          caption: p.caption,
          created_at: p.created_at,
          author: { id: p.user_id, full_name: p.full_name, username: p.username },
          isMine: p.user_id === req.user.userId,
          url: await storage().getFileUrl(p.storage_key),
          reactions,
          myReaction: reactions.find((r) => r.user_id === req.user.userId)?.emoji || null,
        };
      })
    );

    res.json(feed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deletePhoto(req, res) {
  try {
    const { rows } = await query(
      'SELECT id, storage_key FROM photos WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Foto não encontrada ou você não pode excluí-la' });
    }

    const photo = rows[0];
    await query('DELETE FROM photos WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.userId,
    ]);

    try {
      await storage().deleteFile(photo.storage_key);
    } catch (err) {
      console.warn(`⚠️  Foto ${photo.id} removida do banco, mas falhou no storage: ${err.message}`);
    }

    res.json({ message: 'Foto removida do jardim' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function addReaction(req, res) {
  try {
    const { emoji } = req.body;
    if (!ALLOWED_REACTIONS.includes(emoji)) {
      return res.status(400).json({ error: 'Reação não permitida' });
    }

    const photoCheck = await query('SELECT id FROM photos WHERE id = $1', [req.params.id]);
    if (photoCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function removeReaction(req, res) {
  try {
    await query(
      'DELETE FROM reactions WHERE photo_id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { uploadPhoto, getFeed, deletePhoto, addReaction, removeReaction };
