import { v4 as uuidv4 } from 'uuid';

function detectDialect(): 'mysql' | 'postgres' {
  const explicit = (process.env.DB_DIALECT || '').toLowerCase();
  if (explicit === 'mysql' || explicit === 'postgres') return explicit as 'mysql' | 'postgres';
  const url = process.env.DATABASE_URL || '';
  if (url.startsWith('mysql')) return 'mysql';
  return 'postgres';
}

export const dialect = detectDialect();
export const isMysql = dialect === 'mysql';

let pool: any;

if (isMysql) {
  const mysql = require('mysql2/promise');
  const url = process.env.DATABASE_URL;
  pool = url
    ? mysql.createPool(url)
    : mysql.createPool({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
      });
} else {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err: Error) => {
    console.error('Erro inesperado no PostgreSQL:', err);
  });
}

export { pool };

export interface QueryResult<T = Record<string, any>> {
  rows: T[];
}

function toMysql(sql: string, params: any[] = []): { sql: string; params: any[] } {
  const mysqlParams: any[] = [];
  const mysqlSql = sql.replace(/\$(\d+)/g, (_, n: string) => {
    mysqlParams.push(params[Number(n) - 1]);
    return '?';
  });
  return { sql: mysqlSql, params: mysqlParams };
}

export async function query<T = Record<string, any>>(
  sql: string,
  params: any[] = [],
): Promise<QueryResult<T>> {
  if (isMysql) {
    const converted = toMysql(sql, params);
    const [rows] = await pool.query(converted.sql, converted.params);
    if (Array.isArray(rows)) return { rows: rows as T[] };
    return { rows: [] };
  }
  return pool.query(sql, params) as Promise<QueryResult<T>>;
}

export async function ensureSchemaPatches(): Promise<void> {
  if (isMysql) {
    const [cols] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'avatar_key'`,
    );
    if (Number(cols[0].c) === 0) {
      await pool.query('ALTER TABLE users ADD COLUMN avatar_key VARCHAR(500) NULL');
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photo_media (
        id VARCHAR(36) PRIMARY KEY,
        photo_id VARCHAR(36) NOT NULL,
        type VARCHAR(10) NOT NULL DEFAULT 'image',
        storage_key VARCHAR(500) NOT NULL,
        thumbnail_key VARCHAR(500) NULL,
        order_index INT NOT NULL DEFAULT 0,
        size INT DEFAULT 0,
        INDEX idx_photo_media_photo_id (photo_id)
      )
    `);
    const [thumbCols] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'photo_media'
         AND COLUMN_NAME = 'thumbnail_key'`,
    );
    if (Number(thumbCols[0].c) === 0) {
      await pool.query('ALTER TABLE photo_media ADD COLUMN thumbnail_key VARCHAR(500) NULL');
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        recipient_id VARCHAR(36) NOT NULL,
        actor_id VARCHAR(36) NOT NULL,
        photo_id VARCHAR(36) NOT NULL,
        type VARCHAR(32) NOT NULL,
        emoji VARCHAR(16) NULL,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_notifications_event (recipient_id, actor_id, photo_id, type),
        INDEX idx_notifications_recipient (recipient_id, created_at),
        INDEX idx_notifications_unread (recipient_id, read_at)
      )
    `);
    return;
  }

  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(500)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS photo_media (
      id TEXT PRIMARY KEY,
      photo_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'image',
      storage_key TEXT NOT NULL,
      thumbnail_key TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      size INTEGER DEFAULT 0
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_photo_media_photo_id ON photo_media(photo_id)',
  );
  try {
    await pool.query('ALTER TABLE photo_media ADD COLUMN IF NOT EXISTS thumbnail_key TEXT');
  } catch {
    /* already exists */
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      photo_id TEXT NOT NULL,
      type TEXT NOT NULL,
      emoji TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_event ON notifications(recipient_id, actor_id, photo_id, type)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC)',
  );
}

export function newId(): string {
  return uuidv4();
}
