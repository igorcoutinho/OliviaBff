import type { Request, Response } from 'express';
import { register, login, getUserById } from '../services/auth.service';
import { findUserByUsername } from '../repositories/users.repository';
import { logError } from '../lib/errorLog';

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
      message: 'Cadastro realizado! Aguarde a liberação para usar o app.',
      user: result.user,
      token: result.token,
    });
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const username = String((req.body as { username?: string })?.username || '')
    .toLowerCase()
    .trim();
  try {
    const { password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      return;
    }
    const result = await login(username, password);
    res.json({ user: result.user, token: result.token });
  } catch (err: any) {
    let userId: string | null = null;
    let userName: string | null = null;
    try {
      const row = username ? await findUserByUsername(username) : null;
      if (row) {
        userId = row.id;
        userName = row.full_name;
      }
    } catch {
      // ignore lookup failure
    }

    await logError({
      userId,
      userName,
      username: username || null,
      action: 'login',
      error: err,
      meta: {
        path: '/api/auth/login',
        attemptedUsername: username || null,
      },
    });

    res.status(err.status || 401).json({ error: err.message, code: err.code });
  }
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const user = await getUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }
  res.json(user);
}
