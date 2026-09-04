import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getFileUrl } from '../storage';
import type { PublicUser, AuthResult } from '../types';
import { logActivity } from '../lib/activity';
import { getPanelSettings } from '../repositories/panelSettings.repository';
import {
  findUserById,
  findUserByUsername,
  usernameExists,
  createUser,
  userIsBlocked,
  userIsApproved,
  type UserRow,
} from '../repositories/users.repository';
import { JWT_SECRET } from '../lib/secrets';

export type { PublicUser, AuthResult };

export async function formatUser(row: UserRow | null): Promise<PublicUser | null> {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    created_at: row.created_at,
    avatar_url: row.avatar_key ? await getFileUrl(row.avatar_key) : null,
    is_approved: userIsApproved(row),
    is_blocked: userIsBlocked(row),
  };
}

async function generateUsernameBase(fullName: string): Promise<string> {
  return fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '.')
    .slice(0, 30) || 'convidado';
}

export async function generateUniqueUsername(fullName: string): Promise<string> {
  const base = await generateUsernameBase(fullName);
  let username = base;
  let counter = 1;
  while (await usernameExists(username)) {
    username = `${base}${counter}`;
    counter++;
  }
  return username;
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  const row = await findUserById(userId);
  return formatUser(row);
}

export async function register(
  fullName: string,
  password: string,
  preferredUsername?: string,
): Promise<AuthResult> {
  let username: string;

  if (preferredUsername && preferredUsername.length >= 3) {
    const clean = preferredUsername
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, '')
      .replace(/\.{2,}/g, '.')
      .slice(0, 30);

    if (await usernameExists(clean)) {
      const err = Object.assign(new Error('Esse @ já está sendo usado. Escolha outro.'), {
        status: 409,
      });
      throw err;
    }
    username = clean;
  } else {
    username = await generateUniqueUsername(fullName);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { autoApproveUsers } = await getPanelSettings();
  const row = await createUser(fullName, username, passwordHash, autoApproveUsers);
  const user = (await formatUser(row))!;
  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: '30d',
  });
  await logActivity({
    actorId: user.id,
    action: 'register',
    targetType: 'user',
    targetId: user.id,
    meta: { autoApproved: autoApproveUsers },
  });
  return { user, token };
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const row = await findUserByUsername(username);
  if (!row) throw new Error('Usuário ou senha incorretos');

  const valid = await bcrypt.compare(password, row.password_hash!);
  if (!valid) throw new Error('Usuário ou senha incorretos');

  if (userIsBlocked(row)) {
    const err = Object.assign(new Error('Conta bloqueada'), { status: 403, code: 'BLOCKED' });
    throw err;
  }

  if (!userIsApproved(row)) {
    const err = Object.assign(new Error('Conta aguardando liberação'), {
      status: 403,
      code: 'PENDING_APPROVAL',
    });
    throw err;
  }

  const user = (await formatUser(row))!;
  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: '30d',
  });
  await logActivity({
    actorId: user.id,
    action: 'login',
    targetType: 'user',
    targetId: user.id,
  });
  return { user, token };
}
