const { query } = require('../db');

async function getSummary(_req, res) {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getSummary };
