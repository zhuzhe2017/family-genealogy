// 临时脚本：验证迁移结果（一次性使用）
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: 'family_genealogy',
    user: 'root',
    password: '3156zhuzhe'
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

    const [grants] = await conn.query(`SELECT COUNT(*) AS cnt FROM sys_role_menu rm INNER JOIN sys_menu m ON m.id = rm.menu_id WHERE m.route_name = 'system_settings'`);
    console.log('菜单授权数:', grants[0].cnt);
  } catch (err) {
    console.error('验证失败:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
