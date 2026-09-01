const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'REDACTED';

function generateUsernameBase(fullName) {
  return fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '.')
    .slice(0, 30);
}

async function generateUniqueUsername(fullName) {
  const base = generateUsernameBase(fullName) || 'convidado';
  let username = base;
  let counter = 1;

  while (true) {
    const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (rows.length === 0) return username;
    username = `${base}${counter}`;
    counter++;
  }
}

async function register(fullName, password) {
  const username = await generateUniqueUsername(fullName);
  const passwordHash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    'INSERT INTO users (full_name, username, password_hash) VALUES ($1, $2, $3) RETURNING id, full_name, username, created_at',
    [fullName.trim(), username, passwordHash]
  );

  const user = rows[0];
  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  return { user, token };
}

async function login(username, password) {
  const { rows } = await pool.query(
    'SELECT id, full_name, username, password_hash, created_at FROM users WHERE username = $1',
    [username.toLowerCase().trim()]
  );

  if (rows.length === 0) throw new Error('Usuário ou senha incorretos');

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Usuário ou senha incorretos');

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  return {
    user: { id: user.id, full_name: user.full_name, username: user.username, created_at: user.created_at },
    token,
  };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

async function getUserById(userId) {
  const { rows } = await pool.query(
    'SELECT id, full_name, username, created_at FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

module.exports = { register, login, authMiddleware, getUserById, generateUniqueUsername };
