import { insertActivityLog } from '../repositories/activity.repository';

export async function logActivity(params: {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await insertActivityLog(params);
  } catch (err) {
    console.warn('Falha ao gravar activity_log:', (err as Error).message);
  }
}
