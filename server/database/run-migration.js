// 临时脚本：执行 database 目录下的 SQL 迁移文件（一次性使用）
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node run-migration.js <sql文件>');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.resolve(__dirname, file), 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_DATABASE || 'family_genealogy',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    await conn.query(sql);
    console.log('迁移执行成功: ' + file);
  } catch (err) {
    console.error('迁移执行失败:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
