/**
 * 检查数据库表是否存在，并执行缺失的 DDL
 * 用法：npx ts-node scripts/check-tables.ts
 */
import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载 .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'family_genealogy',
    multipleStatements: true
  });

  console.log('✅ 数据库连接成功');

  // 检查关键表是否存在
  const tables = ['generation_table', 'family', 'family_member', 'surname'];
  for (const table of tables) {
    const [rows] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [process.env.DB_DATABASE, table]
    ) as any;
    console.log(rows.length > 0 ? `  ✅ ${table}` : `  ❌ ${table} - 缺失`);
  }

  // 检查 family 表是否有 generation_table_id 列
  const [cols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'family' AND COLUMN_NAME = 'generation_table_id'`,
    [process.env.DB_DATABASE]
  ) as any;
  console.log(cols.length > 0 ? '  ✅ family.generation_table_id' : '  ❌ family.generation_table_id - 缺失');

  // 如果 generation_table 缺失，执行建表
  if (tables.some(t => !t.includes('generation_table'))) {
    console.log('\n📦 generation_table 不存在，执行建表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`generation_table\` (
        \`id\`                   VARCHAR(32)   NOT NULL COMMENT '字辈表ID（32位hex）',
        \`surname\`              VARCHAR(20)   NOT NULL COMMENT '姓氏',
        \`founder\`              VARCHAR(60)   NOT NULL COMMENT '始祖/支系名',
        \`generation_sequence\`  JSON          NOT NULL COMMENT '字辈序列JSON',
        \`common_regions\`       JSON          NOT NULL COMMENT '常见区域JSON数组',
        \`create_by\`            VARCHAR(50)   DEFAULT '' COMMENT '创建人',
        \`status\`               TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
        \`create_time\`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`update_time\`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_surname_founder\` (\`surname\`, \`founder\`),
        INDEX \`idx_surname\` (\`surname\`),
        INDEX \`idx_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字辈表'
    `);
    console.log('✅ generation_table 创建成功');
  }

  // 检查并补充缺失的权限
  console.log('\n📦 检查 family-member 相关权限...');
  const perms = [
    ['家族成员查询', 'system:family-member:list'],
    ['家族成员新增', 'system:family-member:create'],
    ['家族成员编辑', 'system:family-member:update'],
    ['家族成员删除', 'system:family-member:delete'],
    ['家族成员导入', 'system:family-member:import']
  ];
  for (const [name, code] of perms) {
    await connection.query(
      `INSERT IGNORE INTO sys_permission (name, code, status) VALUES (?, ?, 1)`,
      [name, code]
    );
    console.log(`  ✅ ${name} (${code})`);
  }

  // 将新权限授予超级管理员
  console.log('\n📦 授权超级管理员...');
  await connection.query(`
    INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
    SELECT r.id, p.id FROM sys_role r, sys_permission p
    WHERE r.code = 'super' AND p.code LIKE 'system:family-member:%'
  `);
  console.log('✅ 授权完成');

  await connection.end();
  console.log('\n🎉 所有检查完成');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
