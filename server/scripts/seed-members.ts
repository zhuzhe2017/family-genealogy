/**
 * 插入测试成员数据到家族分表
 */
import * as mysql from 'mysql2/promise';
import * as crypto from 'crypto';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const genId = () => crypto.randomBytes(16).toString('hex');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'family_genealogy'
  });

  // 查找存在的分表
  const [tables] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'family_members_%'",
    [process.env.DB_DATABASE]
  ) as any;
  
  if (tables.length === 0) {
    console.log('❌ 没有找到家族分表，请先创建家族');
    await connection.end();
    return;
  }

  const table = tables[0].TABLE_NAME;
  console.log(`向 ${table} 插入测试数据...`);

  // 生成测试数据
  const gen1Id = genId();
  const gen2Id1 = genId();
  const gen2Id2 = genId();
  const gen3Id = genId();
  const gen4Id = genId();

  const members = [
    [gen1Id,    2, '张伯言', 'male',   1, '伯', '1880-03-15', '浙江绍兴', 0, '1955-07-20', '浙江绍兴', 120.5800000, 30.0300000, '一世祖',       '',       '', JSON.stringify([{name:'王氏',birthDate:'1882',isAlive:0,deathDate:'1940',deathPlace:'浙江绍兴'}]), 1, 1],
    [gen2Id1,   2, '张仲德', 'male',   2, '仲', '1905-09-10', '浙江绍兴', 0, '1978-12-03', '浙江绍兴', null, null, '二世长子',     gen1Id,   '', null, 1, 1],
    [gen2Id2,   2, '张叔和', 'male',   2, '叔', '1908-05-20', '浙江绍兴', 0, '1985-02-14', '浙江杭州', null, null, '二世次子',     gen1Id,   '', null, 2, 1],
    [gen3Id,    2, '张文远', 'male',   3, '文', '1935-06-01', '浙江绍兴', 1, '',           '',         null, null, '三世长孙',     gen2Id1,  '', null, 1, 1],
    [gen4Id,    2, '张建国', 'male',   4, '建', '1965-04-10', '浙江杭州', 1, '',           '',         null, null, '工程师',       gen3Id,   '', JSON.stringify([{name:'李氏',birthDate:'1967',isAlive:1},{name:'周氏',birthDate:'1970',isAlive:0,deathDate:'2005'}]), 1, 1],
  ];

  for (const m of members) {
    await connection.query(
      `INSERT INTO \`${table}\` 
       (id, family_id, name, gender, generation, generation_name, birth_date, birth_place, 
        is_alive, death_date, death_place, longitude, latitude, bio, father_id, mother_id, 
        spouse_info, sort_order, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m
    );
  }

  console.log(`✅ 成功插入 ${members.length} 条测试数据`);
  
  // 验证
  const [count] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``) as any;
  console.log(`表中记录数: ${count[0].cnt}`);

  await connection.end();
}

main().catch(err => console.error('❌ 错误:', err.message));
