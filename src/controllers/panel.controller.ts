import type { Request, Response } from 'express';
import {
  panelLogin,
  panelMe,
  panelDashboard,
  panelListUsers,
  panelGetUser,
  panelSetBlocked,
  panelResetPassword,
  panelListActivity,
} from '../services/panel.service';

function handleError(res: Response, err: any): void {
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
}

export async function postLogin(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      return;
    }
    const result = await panelLogin(String(username), String(password));
    res.json(result);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const user = await panelMe(req.user.userId, req.user.panelAdmin);
    res.json({ user });
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getDashboard(_req: Request, res: Response): Promise<void> {
  try {
    const data = await panelDashboard();
    res.json(data);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);
    const search = req.query.search ? String(req.query.search) : undefined;
    const data = await panelListUsers(search, page, pageSize);
    res.json(data);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await panelGetUser(String(req.params.id));
    res.json({ user });
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function patchUserBlock(req: Request, res: Response): Promise<void> {
  try {
    const blocked = Boolean(req.body?.blocked);
    const user = await panelSetBlocked(req.user.userId, String(req.params.id), blocked);
    res.json({ user });
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function postUserResetPassword(req: Request, res: Response): Promise<void> {
  try {
    const newPassword = String(req.body?.password || '');
    const result = await panelResetPassword(
      req.user.userId,
      String(req.params.id),
      newPassword,
    );
    res.json(result);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getActivity(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 30);
    const actorId = req.query.userId ? String(req.query.userId) : undefined;
    const data = await panelListActivity({ actorId, page, pageSize });
    res.json(data);
  } catch (err: any) {
    handleError(res, err);
  }
}
