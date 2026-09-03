import type { Request, Response } from 'express';
import { register, login, getUserById } from '../services/auth.service';

export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, password, username: preferredUsername } = req.body as {
      fullName?: string;
      password?: string;
      username?: string;
    };
    if (!fullName?.trim() || !password) {
      res.status(400).json({ error: 'Nome completo e senha são obrigatórios' });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
      return;
    }
    const result = await register(fullName, password, preferredUsername);
    res.status(201).json({
      message: 'Cadastro realizado! Guarde seu nome de usuário.',
      user: result.user,
      token: result.token,
    });
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message });
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      return;
    }
    const result = await login(username, password);
    res.json({ user: result.user, token: result.token });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const user = await getUserById(req.user.userId);
  if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
  res.json(user);
}
