const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no PostgreSQL:', err);
});

module.exports = { pool };
