const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'sh-cynosdbmysql-grp-5hlzs65w.sql.tencentcdb.com',
    port: Number(process.env.DB_PORT || 20054),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '3156zhuzhe@deejeE',
    database: process.env.DB_DATABASE || 'family_genealogy'
  });

  try {
    const [result] = await conn.execute(`
      INSERT IGNORE INTO \`family_permission\` (\`family_id\`, \`user_id\`, \`role\`, \`status\`)
      SELECT \`id\`, \`creator_user_id\`, 'creator', 1
      FROM \`family\`
      WHERE \`status\` = 1
        AND \`creator_user_id\` IS NOT NULL
        AND \`creator_user_id\` != ''
    `);
    console.log('补全完成，新增记录数:', result.affectedRows);
  } catch (err) {
    console.error('执行失败:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
