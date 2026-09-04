import { query, newId } from '../db';

export interface ActivityLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta_json: string | null;
  created_at: string;
  actor_name?: string | null;
  actor_username?: string | null;
}

export async function insertActivityLog(params: {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  await query(
    `INSERT INTO activity_logs (id, actor_id, action, target_type, target_id, meta_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      newId(),
      params.actorId ?? null,
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
      params.meta ? JSON.stringify(params.meta) : null,
    ],
  );
}

export async function listActivityLogs(params: {
  actorId?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: ActivityLogRow[]; total: number }> {
  const where = params.actorId ? 'WHERE a.actor_id = $1' : '';
  const countParams = params.actorId ? [params.actorId] : [];
  const { rows: countRows } = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM activity_logs a ${where}`,
    countParams,
  );

  const listParams = params.actorId
    ? [params.actorId, params.limit, params.offset]
    : [params.limit, params.offset];
  const limitIdx = params.actorId ? 2 : 1;
  const offsetIdx = params.actorId ? 3 : 2;

  const { rows } = await query<ActivityLogRow>(
    `SELECT
       a.id, a.actor_id, a.action, a.target_type, a.target_id, a.meta_json, a.created_at,
       u.full_name AS actor_name, u.username AS actor_username
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams,
  );

  return { rows, total: Number(countRows[0]?.total ?? 0) };
}
