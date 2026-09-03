const ADMIN_KEY = process.env.ADMIN_KEY || 'olivia-admin-secreto';

function checkAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

module.exports = { checkAdmin };
