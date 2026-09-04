function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const JWT_SECRET = requiredEnv('JWT_SECRET');

export const PANEL_ADMIN_USER = (
  process.env.PANEL_ADMIN_USER || 'admin'
).toLowerCase().trim();

export const PANEL_ADMIN_PASSWORD = requiredEnv('PANEL_ADMIN_PASSWORD');
