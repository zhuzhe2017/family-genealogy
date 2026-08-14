/**
 * 诊断脚本：检查数据库状态和测试关键 SQL 查询
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
    database: process.env.DB_DATABASE || 'family_genealogy'
  });

  // 1. 检查家族数量
  const [families] = await connection.query('SELECT COUNT(*) AS cnt FROM family') as any;
  console.log(`家族总数: ${families[0].cnt}`);

  // 2. 测试 getAll 查询
  try {
    const [rows] = await connection.query(`
      SELECT f.id, f.name, f.founder, f.member_count, f.status,
             f.generation_table_id, gt.surname AS generation_table_surname
      FROM family f
      LEFT JOIN generation_table gt ON f.generation_table_id = gt.id
      WHERE f.status = 1
      ORDER BY f.name ASC
    `);
    console.log(`getAll 查询正常，返回 ${(rows as any[]).length} 条`);
  } catch (err: any) {
    console.error('getAll 查询失败:', err.message);
  }

  // 3. 检查 family_member 表（非分表）
  const [fmRows] = await connection.query('SELECT COUNT(*) AS cnt FROM family_member') as any;
  console.log(`family_member 基表记录数: ${fmRows[0].cnt}`);

  // 4. 检查是否存在分表 family_members_1
  const [shardCheck] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'family_members_%'",
    [process.env.DB_DATABASE]
  ) as any;
  console.log(`分表数量: ${shardCheck.length}`);
  if (shardCheck.length > 0) {
    shardCheck.forEach((t: any) => console.log(`  - ${t.TABLE_NAME}`));
  }

  // 5. 测试分表查询
  if (shardCheck.length > 0) {
    const tbl = shardCheck[0].TABLE_NAME;
    try {
      const [rows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${tbl}\``) as any;
      console.log(`分表 ${tbl} 记录数: ${rows[0].cnt}`);
    } catch (err: any) {
      console.error(`分表 ${tbl} 查询失败:`, err.message);
    }
  }

  // 6. 测试 family member service 的查询
  const [testRows] = await connection.query(
    'SELECT id, name, gender, generation FROM family_member WHERE status = 1 LIMIT 3'
  ) as any;
  console.log(`family_member 测试查询: ${testRows.length} 条`);
  if (testRows.length > 0) {
    testRows.forEach((r: any) => console.log(`  - ${r.name} (${r.gender}, 第${r.generation}代)`));
  }

  await connection.end();
}

main().catch(err => console.error('错误:', err.message));
