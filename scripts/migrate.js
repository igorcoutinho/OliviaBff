require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'init.mysql.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const url = process.env.DATABASE_URL;
  const mysqlUrl = url?.startsWith('mysql') ? url : null;
  const config = mysqlUrl
    ? mysqlUrl
    : {
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'olivia',
        password: process.env.MYSQL_PASSWORD || 'olivia123',
        database: process.env.MYSQL_DATABASE || 'festa_olivia',
        multipleStatements: true,
      };

  if (!mysqlUrl && !process.env.MYSQL_PASSWORD && !config.password) {
    console.error('Defina MYSQL_PASSWORD ou DATABASE_URL (mysql://...) para rodar o migrate.');
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
