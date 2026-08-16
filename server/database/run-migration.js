// 临时脚本：执行 database 目录下的 SQL 迁移文件（一次性使用）
// 支持 DELIMITER 指令（存储过程/函数定义），按语句逐条执行；
// 每条语句以单语句模式发送（不开启 multiStatements），避免过程体内分号被误切分
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 将 SQL 文件按 DELIMITER 指令切分为语句列表，并去掉尾部定界符（; 或 // 等）
function splitSqlStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let current = '';
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (/^DELIMITER\s+/i.test(trimmed)) {
      if (current.trim()) statements.push(current);
      current = '';
      delimiter = trimmed.split(/\s+/)[1];
      continue;
    }
    current += line + '\n';
    if (trimmed.endsWith(delimiter)) {
      statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current);
  return statements
    .map(s => s.replace(/\s*[;/]+\s*$/, '').trim())
    .filter(Boolean);
}

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
    password: process.env.DB_PASSWORD || ''
  });

  try {
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    console.log('迁移执行成功: ' + file);
  } catch (err) {
    console.error('迁移执行失败:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
