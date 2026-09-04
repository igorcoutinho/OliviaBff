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

async function ensureMysqlColumn(
  table: string,
  column: string,
  definition: string,
): Promise<boolean> {
  const [cols] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (Number(cols[0].c) > 0) return false;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

async function ensureMysqlIndex(
  name: string,
  table: string,
  columns: string,
): Promise<void> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, name],
  );
  if (Number(rows[0].c) > 0) return;
  await pool.query(`CREATE INDEX ${name} ON ${table} ${columns}`);
}

async function backfillMysqlCounters(): Promise<void> {
  await pool.query(`
    UPDATE photos p
    SET comments_count = (
      SELECT COUNT(*) FROM comments c WHERE c.photo_id = p.id
    )
  `);
  await pool.query(`
    UPDATE photos p
    SET likes_count = (
      SELECT COUNT(*) FROM reactions r WHERE r.photo_id = p.id
    )
  `);
  await pool.query(`
    UPDATE comments c
    SET likes_count = (
      SELECT COUNT(*) FROM comment_votes v WHERE v.comment_id = c.id AND v.vote = 1
    ),
    dislikes_count = (
      SELECT COUNT(*) FROM comment_votes v WHERE v.comment_id = c.id AND v.vote = -1
    )
  `);
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
        target_id VARCHAR(36) NOT NULL DEFAULT '',
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_notifications_event (recipient_id, actor_id, photo_id, type, target_id),
        INDEX idx_notifications_recipient (recipient_id, created_at),
        INDEX idx_notifications_unread (recipient_id, read_at)
      )
    `);
    const [targetCols] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'notifications'
         AND COLUMN_NAME = 'target_id'`,
    );
    if (Number(targetCols[0].c) === 0) {
      try {
        await pool.query('ALTER TABLE notifications DROP INDEX uq_notifications_event');
      } catch {
        /* index may not exist */
      }
      await pool.query(
        `ALTER TABLE notifications ADD COLUMN target_id VARCHAR(36) NOT NULL DEFAULT ''`,
      );
      await pool.query(
        `ALTER TABLE notifications ADD UNIQUE KEY uq_notifications_event (recipient_id, actor_id, photo_id, type, target_id)`,
      );
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(36) PRIMARY KEY,
        photo_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        body TEXT NOT NULL,
        likes_count INT NOT NULL DEFAULT 0,
        dislikes_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_comments_photo_created (photo_id, created_at, id),
        INDEX idx_comments_photo_likes (photo_id, likes_count, created_at, id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comment_votes (
        id VARCHAR(36) PRIMARY KEY,
        comment_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        vote TINYINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_comment_votes_user (comment_id, user_id),
        INDEX idx_comment_votes_comment_vote (comment_id, vote)
      )
    `);

    const addedPhotoComments = await ensureMysqlColumn(
      'photos',
      'comments_count',
      'INT NOT NULL DEFAULT 0',
    );
    const addedPhotoLikes = await ensureMysqlColumn(
      'photos',
      'likes_count',
      'INT NOT NULL DEFAULT 0',
    );
    const addedCommentLikes = await ensureMysqlColumn(
      'comments',
      'likes_count',
      'INT NOT NULL DEFAULT 0',
    );
    const addedCommentDislikes = await ensureMysqlColumn(
      'comments',
      'dislikes_count',
      'INT NOT NULL DEFAULT 0',
    );

    await ensureMysqlIndex('idx_photos_feed', 'photos', '(created_at, id)');
    await ensureMysqlIndex('idx_reactions_photo_created', 'reactions', '(photo_id, created_at)');
    await ensureMysqlIndex(
      'idx_comments_photo_created',
      'comments',
      '(photo_id, created_at, id)',
    );
    await ensureMysqlIndex(
      'idx_comments_photo_likes',
      'comments',
      '(photo_id, likes_count, created_at, id)',
    );
    await ensureMysqlIndex(
      'idx_comment_votes_comment_vote',
      'comment_votes',
      '(comment_id, vote)',
    );

    if (
      addedPhotoComments ||
      addedPhotoLikes ||
      addedCommentLikes ||
      addedCommentDislikes
    ) {
      await backfillMysqlCounters();
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_versions (
        id VARCHAR(36) PRIMARY KEY,
        version VARCHAR(32) NOT NULL,
        platform VARCHAR(16) NOT NULL DEFAULT 'all',
        status VARCHAR(16) NOT NULL DEFAULT 'inativo',
        title VARCHAR(200) NULL,
        description_ios TEXT NULL,
        description_android TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_app_versions_status_platform (status, platform),
        INDEX idx_app_versions_version (version)
      )
    `);
    await ensureMysqlColumn('app_versions', 'description_ios', 'TEXT NULL');
    await ensureMysqlColumn('app_versions', 'description_android', 'TEXT NULL');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_version_settings (
        id TINYINT PRIMARY KEY,
        contact_name VARCHAR(120) NULL,
        contact_info TEXT NULL,
        store_url_ios VARCHAR(500) NULL,
        store_url_android VARCHAR(500) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      INSERT IGNORE INTO app_version_settings (id, contact_name, contact_info)
      VALUES (
        1,
        'Igor',
        'Se precisar de ajuda para atualizar, entre em contato com o Igor.'
      )
    `);

    await ensureMysqlColumn(
      'users',
      'panel_access',
      'TINYINT(1) NOT NULL DEFAULT 0',
    );
    await ensureMysqlColumn(
      'users',
      'is_blocked',
      'TINYINT(1) NOT NULL DEFAULT 0',
    );
    // DEFAULT 1: contas já existentes ficam liberadas; cadastros novos setam 0 no INSERT
    await ensureMysqlColumn(
      'users',
      'is_approved',
      'TINYINT(1) NOT NULL DEFAULT 1',
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id VARCHAR(36) PRIMARY KEY,
        actor_id VARCHAR(36) NULL,
        action VARCHAR(64) NOT NULL,
        target_type VARCHAR(64) NULL,
        target_id VARCHAR(36) NULL,
        meta_json TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_activity_logs_created (created_at),
        INDEX idx_activity_logs_actor (actor_id, created_at),
        INDEX idx_activity_logs_action (action, created_at)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS panel_settings (
        id TINYINT PRIMARY KEY,
        auto_approve_users TINYINT(1) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      INSERT IGNORE INTO panel_settings (id, auto_approve_users)
      VALUES (1, 0)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NULL,
        user_name VARCHAR(255) NULL,
        username VARCHAR(255) NULL,
        action VARCHAR(64) NOT NULL,
        error_message TEXT NOT NULL,
        error_stack TEXT NULL,
        meta_json TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_error_logs_created (created_at),
        INDEX idx_error_logs_user (user_id, created_at),
        INDEX idx_error_logs_action (action, created_at)
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
      target_id TEXT NOT NULL DEFAULT '',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  try {
    await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_id TEXT NOT NULL DEFAULT \'\'');
  } catch {
    /* already exists */
  }
  await pool.query('DROP INDEX IF EXISTS uq_notifications_event');
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_event ON notifications(recipient_id, actor_id, photo_id, type, target_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC)',
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      photo_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      likes_count INTEGER NOT NULL DEFAULT 0,
      dislikes_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'ALTER TABLE photos ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0',
  );
  await pool.query(
    'ALTER TABLE photos ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0',
  );
  await pool.query(
    'ALTER TABLE comments ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0',
  );
  await pool.query(
    'ALTER TABLE comments ADD COLUMN IF NOT EXISTS dislikes_count INTEGER NOT NULL DEFAULT 0',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_photos_feed ON photos(created_at DESC, id DESC)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_reactions_photo_created ON reactions(photo_id, created_at DESC)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_comments_photo_created ON comments(photo_id, created_at DESC, id DESC)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_comments_photo_likes ON comments(photo_id, likes_count DESC, created_at DESC, id DESC)',
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comment_votes (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vote INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_comment_votes_user ON comment_votes(comment_id, user_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_comment_votes_comment_vote ON comment_votes(comment_id, vote)',
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_versions (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'all',
      status TEXT NOT NULL DEFAULT 'inativo',
      title TEXT,
      description_ios TEXT,
      description_android TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS description_ios TEXT',
  );
  await pool.query(
    'ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS description_android TEXT',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_app_versions_status_platform ON app_versions(status, platform)',
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_version_settings (
      id INTEGER PRIMARY KEY,
      contact_name TEXT,
      contact_info TEXT,
      store_url_ios TEXT,
      store_url_android TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO app_version_settings (id, contact_name, contact_info)
    VALUES (
      1,
      'Igor',
      'Se precisar de ajuda para atualizar, entre em contato com o Igor.'
    )
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS panel_access BOOLEAN NOT NULL DEFAULT FALSE',
  );
  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE',
  );
  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT TRUE',
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      meta_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id, created_at DESC)',
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS panel_settings (
      id SMALLINT PRIMARY KEY,
      auto_approve_users BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO panel_settings (id, auto_approve_users)
    VALUES (1, FALSE)
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      username TEXT,
      action TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_stack TEXT,
      meta_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id, created_at DESC)',
  );
}

export function newId(): string {
  return uuidv4();
}
