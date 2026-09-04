import { insertErrorLog } from '../repositories/errorLog.repository';

export async function logError(params: {
  userId?: string | null;
  userName?: string | null;
  username?: string | null;
  action: string;
  error: unknown;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const err = params.error as { message?: string; stack?: string; status?: number } | string;
    const message =
      typeof err === 'string'
        ? err
        : err?.message || String(params.error ?? 'Erro desconhecido');
    const stack = typeof err === 'object' && err?.stack ? err.stack : null;

    await insertErrorLog({
      userId: params.userId,
      userName: params.userName,
      username: params.username,
      action: params.action,
      errorMessage: message,
      errorStack: stack,
      meta: {
        ...(params.meta ?? {}),
        ...(typeof err === 'object' && err?.status ? { status: err.status } : {}),
      },
    });
  } catch (writeErr) {
    console.warn('Falha ao gravar error_log:', (writeErr as Error).message);
  }
}
