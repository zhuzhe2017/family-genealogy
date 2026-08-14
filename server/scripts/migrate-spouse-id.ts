/**
 * 迁移脚本：删除 spouse_id 列，处理分表中的 spouse_id
 */
import * as mysql from 'mysql2/promise';
import * as path from 'path';
import * as dotenv from 'dotenv';

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

  console.log('✅ 数据库连接成功\n');

  // 1. 查找所有分表
  const [shardTables] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'family_members_%'",
    [process.env.DB_DATABASE]
  ) as any;

  const allTables = ['family_member', ...shardTables.map((t: any) => t.TABLE_NAME)];
  console.log(`找到 ${allTables.length} 个家族成员表:`, allTables.join(', '));

  // 2. 对每个表：检查是否存在 spouse_id 列，有则先迁移数据再删除
  for (const table of allTables) {
    const [cols] = await connection.query(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [process.env.DB_DATABASE, table, 'spouse_id']
    ) as any;

    if (cols.length === 0) {
      console.log(`  ✅ ${table}: spouse_id 列已不存在，跳过`);
      continue;
    }

    console.log(`  🔄 ${table}: 开始迁移...`);

    // 统计有 spouse_id 的数据
    const [cntResult] = await connection.query(
      `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE spouse_id IS NOT NULL AND spouse_id != ''`
    ) as any;
    console.log(`    - 有配偶ID的记录数: ${cntResult[0].cnt}`);

    // 迁移数据：将 spouse_id 转换为 spouse_info 数组元素
    await connection.query(`
      UPDATE \`${table}\` AS m
      LEFT JOIN \`${table}\` AS s ON m.spouse_id = s.id AND s.id != ''
      SET m.spouse_info = CASE
        WHEN m.spouse_info IS NOT NULL AND JSON_TYPE(m.spouse_info) = 'OBJECT' THEN
          JSON_ARRAY(m.spouse_info, JSON_OBJECT('name', IFNULL(s.name, '')))
        WHEN m.spouse_info IS NOT NULL THEN
          JSON_ARRAY_APPEND(m.spouse_info, '$', JSON_OBJECT('name', IFNULL(s.name, '')))
        ELSE
          JSON_ARRAY(JSON_OBJECT('name', IFNULL(s.name, '')))
      END
      WHERE m.spouse_id IS NOT NULL AND m.spouse_id != ''
    `);
    console.log('    - 数据已迁移到 spouse_info 数组');

    // 删除列
    await connection.query(`ALTER TABLE \`${table}\` DROP COLUMN \`spouse_id\``);
    console.log(`    ✅ ${table}: spouse_id 列已删除`);
  }

  // 3. 检查是否还有 spouse_id 残留
  const [residual] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'spouse_id' AND TABLE_NAME LIKE 'family_member%'",
    [process.env.DB_DATABASE]
  ) as any;
  if (residual.length > 0) {
    console.log(`\n⚠️  仍有 ${residual.length} 个表包含 spouse_id:`, residual.map((r: any) => r.TABLE_NAME));
  } else {
    console.log('\n🎉 所有表的 spouse_id 列已全部清理完毕');
  }

  await connection.end();
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
