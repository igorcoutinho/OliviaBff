import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getFileUrl } from '../storage';
import { logActivity } from '../lib/activity';
import { listActivityLogs } from '../repositories/activity.repository';
import {
  findUserById,
  listUsers,
  setUserBlocked,
  setUserPasswordHash,
  countUsers,
  countBlockedUsers,
  userHasPanelAccess,
  userIsBlocked,
  type UserRow,
} from '../repositories/users.repository';

const JWT_SECRET = process.env.JWT_SECRET || 'REDACTED';
const PANEL_ADMIN_USER = (process.env.PANEL_ADMIN_USER || 'admin').toLowerCase().trim();
const PANEL_ADMIN_PASSWORD = process.env.PANEL_ADMIN_PASSWORD || 'REDACTED';
const PANEL_ADMIN_ID = 'panel-admin';

export interface PanelUser {
  id: string;
  full_name: string;
  username: string;
  created_at: string;
  avatar_url: string | null;
  panel_access: boolean;
  is_blocked: boolean;
}

function adminUser(): PanelUser {
  return {
    id: PANEL_ADMIN_ID,
    full_name: 'Administrador',
    username: PANEL_ADMIN_USER,
    created_at: new Date(0).toISOString(),
    avatar_url: null,
    panel_access: true,
    is_blocked: false,
  };
}

async function formatPanelUser(row: UserRow): Promise<PanelUser> {
  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    created_at: row.created_at,
    avatar_url: row.avatar_key ? await getFileUrl(row.avatar_key) : null,
    panel_access: userHasPanelAccess(row),
    is_blocked: userIsBlocked(row),
  };
}

export async function panelLogin(username: string, password: string) {
  const userOk = username.toLowerCase().trim() === PANEL_ADMIN_USER;
  const passOk = password === PANEL_ADMIN_PASSWORD;

  if (!userOk || !passOk) {
    const err = Object.assign(new Error('Usuário ou senha incorretos'), { status: 401 });
    throw err;
  }

  const user = adminUser();
  const token = jwt.sign(
    { userId: user.id, username: user.username, panelAdmin: true },
    JWT_SECRET,
    { expiresIn: '30d' },
  );

  await logActivity({
    actorId: null,
    action: 'panel_login',
    targetType: 'panel',
    targetId: PANEL_ADMIN_ID,
    meta: { username: user.username },
  });

  return { user, token };
}

export async function panelMe(userId: string, isPanelAdmin?: boolean) {
  if (isPanelAdmin || userId === PANEL_ADMIN_ID) {
    return adminUser();
  }
  const err = Object.assign(new Error('Acesso restrito ao admin do painel'), { status: 403 });
  throw err;
}

export async function panelDashboard() {
  const [users, blocked, activity] = await Promise.all([
    countUsers(),
    countBlockedUsers(),
    listActivityLogs({ limit: 20, offset: 0 }),
  ]);
  return {
    users,
    blocked,
    recentActivity: activity.rows.map(mapActivity),
  };
}

export async function panelListUsers(search: string | undefined, page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = Math.max(page - 1, 0) * limit;
  const { rows, total } = await listUsers({ search, limit, offset });
  const users = await Promise.all(rows.map(formatPanelUser));
  return { users, total, page, pageSize: limit };
}

export async function panelGetUser(userId: string) {
  const row = await findUserById(userId);
  if (!row) {
    const err = Object.assign(new Error('Usuário não encontrado'), { status: 404 });
    throw err;
  }
  return formatPanelUser(row);
}

export async function panelSetBlocked(
  actorId: string,
  userId: string,
  blocked: boolean,
) {
  const row = await findUserById(userId);
  if (!row) {
    const err = Object.assign(new Error('Usuário não encontrado'), { status: 404 });
    throw err;
  }
  if (actorId === userId && blocked) {
    const err = Object.assign(new Error('Você não pode bloquear a si mesmo'), { status: 400 });
    throw err;
  }
  await setUserBlocked(userId, blocked);
  await logActivity({
    actorId,
    action: blocked ? 'user_block' : 'user_unblock',
    targetType: 'user',
    targetId: userId,
  });
  return panelGetUser(userId);
}

export async function panelResetPassword(
  actorId: string,
  userId: string,
  newPassword: string,
) {
  if (!newPassword || newPassword.length < 4) {
    const err = Object.assign(new Error('Senha deve ter pelo menos 4 caracteres'), {
      status: 400,
    });
    throw err;
  }
  const row = await findUserById(userId);
  if (!row) {
    const err = Object.assign(new Error('Usuário não encontrado'), { status: 404 });
    throw err;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await setUserPasswordHash(userId, hash);
  await logActivity({
    actorId,
    action: 'password_reset',
    targetType: 'user',
    targetId: userId,
  });
  return { ok: true };
}

function mapActivity(row: {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta_json: string | null;
  created_at: string;
  actor_name?: string | null;
  actor_username?: string | null;
}) {
  let meta: unknown = null;
  if (row.meta_json) {
    try {
      meta = JSON.parse(row.meta_json);
    } catch {
      meta = row.meta_json;
    }
  }
  return {
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    meta,
    createdAt: row.created_at,
    actor: row.actor_id
      ? {
          id: row.actor_id,
          full_name: row.actor_name ?? null,
          username: row.actor_username ?? null,
        }
      : null,
  };
}

export async function panelListActivity(params: {
  actorId?: string;
  page: number;
  pageSize: number;
}) {
  const limit = Math.min(Math.max(params.pageSize, 1), 100);
  const offset = Math.max(params.page - 1, 0) * limit;
  const { rows, total } = await listActivityLogs({
    actorId: params.actorId,
    limit,
    offset,
  });
  return {
    items: rows.map(mapActivity),
    total,
    page: params.page,
    pageSize: limit,
  };
}
