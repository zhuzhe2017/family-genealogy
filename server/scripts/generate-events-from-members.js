/**
 * 从家族成员自动生成出生/逝世事件（幂等：按 成员+类型 去重）
 * 用法: DB_PASSWORD=xxx node scripts/generate-events-from-members.js
 * 数据来源: family_members_{familyId} 分表 的 birth_date / death_date
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const connConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_DATABASE || 'family_genealogy',
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || ''
};

let created = 0;
let skipped = 0;

/** 生成 32 位 hex 事件ID */
function eventId() {
  return crypto.randomBytes(16).toString('hex');
}

/** '1880-03-15' / '1880-3' 等 → {year,month,day}，容错解析 */
function splitDate(dateStr) {
  const parts = String(dateStr || '').split(/[-/.年月日]/).map(s => Number(s)).filter(n => Number.isFinite(n));
  return { year: parts[0] || 0, month: parts[1] || 0, day: parts[2] || 0 };
}

/** 检查该成员是否已存在同类型事件 */
async function hasEvent(conn, memberId, type) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM family_event_member em
     JOIN family_event e ON e.id = em.event_id
     WHERE em.member_id = ? AND e.type = ? AND e.status = 1`,
    [memberId, type]
  );
  return rows[0].c > 0;
}

/** 生成单个事件（事务内 主表 + 关联成员 落库） */
async function ensureEvent(conn, familyId, member, type, typeName, dateStr) {
  if (!dateStr) return;
  if (await hasEvent(conn, member.id, type)) {
    skipped++;
    return;
  }
  const { year, month, day } = splitDate(dateStr);
  if (!year) {
    skipped++;
    return;
  }
  const id = eventId();
  const title = `${member.name}${typeName}`;
  await conn.beginTransaction();
  try {
    await conn.query(
      `INSERT INTO family_event (id, family_id, year, month, day, title, description, type, type_name, audit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, familyId, year, month, day, title, null, type, typeName]
    );
    await conn.query(
      `INSERT INTO family_event_member (event_id, member_id, member_name, member_gender, relation)
       VALUES (?, ?, ?, ?, ?)`,
      [id, member.id, member.name, member.gender || '', '本人']
    );
    await conn.commit();
    created++;
    console.log(`  + [${typeName}] ${title} (${year}-${month || '?'}-${day || '?'})`);
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}

async function main() {
  const conn = await mysql.createConnection(connConfig);
  try {
    const [families] = await conn.query('SELECT id, name FROM family WHERE status = 1');
    console.log(`共 ${families.length} 个启用家族`);
    for (const f of families) {
      const table = `family_members_${f.id}`;
      const [tables] = await conn.query(
        `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
      );
      if (!tables[0].c) {
        console.log(`[家族 ${f.id} ${f.name}] 无成员表,跳过`);
        continue;
      }
      const [members] = await conn.query(
        `SELECT id, name, gender, birth_date, death_date, status FROM \`${table}\``
      );
      console.log(`[家族 ${f.id} ${f.name}] 成员 ${members.length} 人`);
      for (const m of members) {
        if (m.status !== 1) continue;
        await ensureEvent(conn, f.id, m, 'birth', '出生', m.birth_date);
        await ensureEvent(conn, f.id, m, 'death', '逝世', m.death_date);
      }
    }
    console.log(`完成: 新增 ${created} 条, 跳过(已存在) ${skipped} 条`);
  } finally {
    await conn.end();
  }
}

main().catch(e => { console.error('执行失败:', e); process.exit(1); });
