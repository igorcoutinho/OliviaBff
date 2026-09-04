import { query, newId } from '../db';

export interface UserRow {
  id: string;
  full_name: string;
  username: string;
  password_hash?: string;
  avatar_key?: string | null;
  panel_access?: number | boolean;
  is_blocked?: number | boolean;
  created_at: string;
}

export interface UserStats {
  photos: number;
  videos: number;
}

function asFlag(value: number | boolean | string | undefined | null): boolean {
  return value === true || value === 1 || value === '1';
}

export function userHasPanelAccess(row: UserRow): boolean {
  return asFlag(row.panel_access);
}

export function userIsBlocked(row: UserRow): boolean {
  return asFlag(row.is_blocked);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, full_name, username, avatar_key, panel_access, is_blocked, created_at
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, full_name, username, password_hash, avatar_key, panel_access, is_blocked, created_at
     FROM users WHERE username = $1`,
    [username.toLowerCase().trim()],
  );
  return rows[0] ?? null;
}

export async function usernameExists(username: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1',
    [username],
  );
  return rows.length > 0;
}

export async function createUser(
  fullName: string,
  username: string,
  passwordHash: string,
): Promise<UserRow> {
  const id = newId();
  await query(
    'INSERT INTO users (id, full_name, username, password_hash) VALUES ($1, $2, $3, $4)',
    [id, fullName.trim(), username, passwordHash],
  );
  const { rows } = await query<UserRow>(
    `SELECT id, full_name, username, panel_access, is_blocked, created_at
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

export async function setUserAvatarKey(userId: string, key: string | null): Promise<void> {
  await query('UPDATE users SET avatar_key = $1 WHERE id = $2', [key, userId]);
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const { rows } = await query<{ photos: string; videos: string }>(
    `SELECT
      (SELECT COUNT(*) FROM photos WHERE user_id = $1) AS photos,
      (SELECT COUNT(*) FROM videos WHERE user_id = $1) AS videos`,
    [userId],
  );
  return {
    photos: Number(rows[0]?.photos ?? 0),
    videos: Number(rows[0]?.videos ?? 0),
  };
}

export async function listUsers(params: {
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: UserRow[]; total: number }> {
  const search = params.search?.trim();
  const where = search
    ? `WHERE full_name LIKE $1 OR username LIKE $1`
    : '';
  const like = search ? [`%${search.toLowerCase()}%`] : [];

  const countSql = `SELECT COUNT(*) AS total FROM users ${where}`;
  const { rows: countRows } = await query<{ total: string }>(
    countSql,
    like,
  );

  const listParams = search
    ? [...like, params.limit, params.offset]
    : [params.limit, params.offset];
  const limitIdx = search ? 2 : 1;
  const offsetIdx = search ? 3 : 2;

  const { rows } = await query<UserRow>(
    `SELECT id, full_name, username, avatar_key, panel_access, is_blocked, created_at
     FROM users
     ${where}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams,
  );

  return { rows, total: Number(countRows[0]?.total ?? 0) };
}

export async function setUserBlocked(userId: string, blocked: boolean): Promise<void> {
  await query('UPDATE users SET is_blocked = $1 WHERE id = $2', [blocked ? 1 : 0, userId]);
}

export async function setUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function countUsers(): Promise<number> {
  const { rows } = await query<{ total: string }>('SELECT COUNT(*) AS total FROM users');
  return Number(rows[0]?.total ?? 0);
}

export async function countBlockedUsers(): Promise<number> {
  const { rows } = await query<{ total: string }>(
    'SELECT COUNT(*) AS total FROM users WHERE is_blocked = 1',
  );
  return Number(rows[0]?.total ?? 0);
}
