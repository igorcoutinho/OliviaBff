import { query, newId } from '../db';

export interface ErrorLogRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  username: string | null;
  action: string;
  error_message: string;
  error_stack: string | null;
  meta_json: string | null;
  created_at: string;
}

export async function insertErrorLog(params: {
  userId?: string | null;
  userName?: string | null;
  username?: string | null;
  action: string;
  errorMessage: string;
  errorStack?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  await query(
    `INSERT INTO error_logs
      (id, user_id, user_name, username, action, error_message, error_stack, meta_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      newId(),
      params.userId ?? null,
      params.userName ?? null,
      params.username ?? null,
      params.action,
      params.errorMessage.slice(0, 4000),
      params.errorStack ? params.errorStack.slice(0, 8000) : null,
      params.meta ? JSON.stringify(params.meta) : null,
    ],
  );
}

export async function listErrorLogs(params: {
  userId?: string;
  action?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: ErrorLogRow[]; total: number }> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.userId) {
    values.push(params.userId);
    clauses.push(`user_id = $${values.length}`);
  }
  if (params.action) {
    values.push(params.action);
    clauses.push(`action = $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { rows: countRows } = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM error_logs ${where}`,
    values,
  );

  values.push(params.limit);
  const limitIdx = values.length;
  values.push(params.offset);
  const offsetIdx = values.length;

  const { rows } = await query<ErrorLogRow>(
    `SELECT id, user_id, user_name, username, action, error_message, error_stack, meta_json, created_at
     FROM error_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  return { rows, total: Number(countRows[0]?.total ?? 0) };
}
