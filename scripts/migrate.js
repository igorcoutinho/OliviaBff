require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'init.mysql.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const url = process.env.DATABASE_URL;
  const config = url
    ? url
    : {
        host: process.env.MYSQL_HOST || 'srv542.hstgr.io',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'u384431467_admin_remember',
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE || 'u384431467_db_remember',
        multipleStatements: true,
      };

  if (!url && !process.env.MYSQL_PASSWORD) {
    console.error('Defina MYSQL_PASSWORD ou DATABASE_URL no .env para rodar o migrate.');
    process.exit(1);
  }

  const connection = typeof config === 'string'
    ? await mysql.createConnection(config)
    : await mysql.createConnection({ ...config, multipleStatements: true });

  try {
    await connection.query(sql);
    console.log('Tabelas criadas/atualizadas com sucesso em', config.database || config);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Falha no migrate:', err.message);
  process.exit(1);
});
