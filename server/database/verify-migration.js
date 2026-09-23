// 验证迁移结果：从环境变量读取数据库凭据，禁止硬编码密码
// 用法：DB_HOST=localhost DB_PORT=3306 DB_USER=root DB_PASSWORD=xxx node verify-migration.js
const mysql = require('mysql2/promise');

function getOrThrow(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`缺少环境变量 ${name}，请通过环境变量提供数据库凭据`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_DATABASE || 'family_genealogy',
    user: getOrThrow('DB_USER'),
    password: getOrThrow('DB_PASSWORD')
  });

  try {
    const [tables] = await conn.query("SHOW TABLES LIKE 'sys%'");
    console.log('sys 表:', tables.map(t => Object.values(t)[0]).join(', '));

    const [configs] = await conn.query('SELECT COUNT(*) AS cnt, `group` FROM `sys_config` GROUP BY `group`');
    console.log('sys_config 分组统计:', JSON.stringify(configs));

    const [perms] = await conn.query("SELECT COUNT(*) AS cnt FROM `sys_permission` WHERE `code` LIKE 'system:settings%'");
    console.log('settings 权限数:', perms[0].cnt);

    const [menus] = await conn.query("SELECT `id`, `name`, `route_name`, `permission` FROM `sys_menu` WHERE `route_name` = 'system_settings'");
    console.log('系统设置菜单:', JSON.stringify(menus));
  } catch (err) {
    console.error('验证失败:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
