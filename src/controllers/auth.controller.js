const { register, login, getUserById } = require('../services/auth.service');
const { authMiddleware } = require('../middlewares/auth');

async function registerHandler(req, res) {
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
}

async function loginHandler(req, res) {
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
}

async function meHandler(req, res) {
  const user = await getUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(user);
}

module.exports = { registerHandler, loginHandler, meHandler };
