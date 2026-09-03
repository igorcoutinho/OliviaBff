const { v4: uuidv4 } = require('uuid');

function detectDialect() {
  const explicit = (process.env.DB_DIALECT || '').toLowerCase();
  if (explicit === 'mysql' || explicit === 'postgres') return explicit;
  const url = process.env.DATABASE_URL || '';
  if (url.startsWith('mysql')) return 'mysql';
  return 'postgres';
}

const dialect = detectDialect();
let pool;

if (dialect === 'mysql') {
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
  pool.on('error', (err) => {
    console.error('Erro inesperado no PostgreSQL:', err);
  });
}

function toMysql(sql, params = []) {
  const mysqlParams = [];
  const mysqlSql = sql.replace(/\$(\d+)/g, (_, n) => {
    mysqlParams.push(params[Number(n) - 1]);
    return '?';
  });
  return { sql: mysqlSql, params: mysqlParams };
}

async function query(sql, params = []) {
  if (dialect === 'mysql') {
    const converted = toMysql(sql, params);
    const [rows, fields] = await pool.query(converted.sql, converted.params);
    if (Array.isArray(rows)) {
      return { rows, fields, affectedRows: rows.affectedRows };
    }
    return { rows: [], result: rows, affectedRows: rows.affectedRows, insertId: rows.insertId };
  }
  return pool.query(sql, params);
}

async function ensureSchemaPatches() {
  if (dialect === 'mysql') {
    const [cols] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'avatar_key'`
    );
    if (Number(cols[0].c) === 0) {
      await pool.query('ALTER TABLE users ADD COLUMN avatar_key VARCHAR(500) NULL');
    }
    return;
  }
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(500)');
}

function newId() {
  return uuidv4();
}

module.exports = {
  pool,
  query,
  dialect,
  isMysql: dialect === 'mysql',
  ensureSchemaPatches,
  newId,
};
