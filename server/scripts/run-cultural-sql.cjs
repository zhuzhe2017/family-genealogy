/**
 * 识典古籍对标 v1.1 · SQL 导入脚本
 * 用法：cd server && node scripts/run-cultural-sql.cjs
 * 依赖：mysql2（项目已有）
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const [k, v] = line.trim().split('=');
    if (k && v && !k.startsWith('#')) process.env[k] = v;
  }
}

async function main() {
  await loadEnv();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  console.log(`[连接] ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`);
  console.log();

  const files = [
    { name: 'cultural-content.sql', desc: '识典核心表 + 权限码 + sys_config' },
    { name: 'cultural-seed-data.sql', desc: '公共古籍种子数据 + 字典词条' }
  ];

  for (const f of files) {
    const filePath = path.join(__dirname, '../database', f.name);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 文件不存在: ${filePath}`);
      process.exit(1);
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`[执行] ${f.name} — ${f.desc}`);
    console.log(`  大小: ${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB`);

    try {
      await conn.query(sql);
      console.log(`  ✅ OK`);
    } catch (err) {
      console.error(`  ❌ 错误: ${err.message}`);
      // 继续执行（DDL 用了 IF NOT EXISTS / INSERT IGNORE，大部分错误安全）
    }
  }

  console.log();
  console.log('=== 验证 ===');

  const tables = ['cultural_document', 'cultural_document_page', 'cultural_document_chapter',
    'cultural_dictionary', 'ai_chat_session', 'ai_chat_message', 'tts_audio_cache',
    'ocr_result_cache', 'timeline_map_cache'];

  for (const t of tables) {
    try {
      const [rows] = await conn.query(`SHOW TABLES LIKE '${t}'`);
      if (rows.length > 0) {
        const [cnt] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
        console.log(`  ✅ ${t} — ${cnt[0].c} 行`);
      } else {
        console.log(`  ❌ ${t} — 不存在！`);
      }
    } catch (e) {
      console.log(`  ⚠️  ${t} — 查询失败: ${e.message}`);
    }
  }

  console.log();
  console.log('sys_config (llm_*, tts_*, ocr_*, timeline_*)：');
  const [cfg] = await conn.query(
    "SELECT config_key, LEFT(config_value, 20) AS val, is_system FROM sys_config WHERE config_key REGEXP '^(llm|tts|ocr|timeline)_' ORDER BY config_key"
  );
  for (const c of cfg) {
    const val = c.val ? (c.val.length >= 20 ? c.val + '...' : c.val) : '(空)';
    console.log(`  • ${c.config_key} = ${val}`);
  }
  if (cfg.length === 0) console.log('  (无匹配项)');

  console.log();
  console.log('sys_permission (cultural-*)：');
  const [perms] = await conn.query(
    "SELECT id, name, code, status FROM sys_permission WHERE code LIKE 'system:cultural-%' ORDER BY id"
  );
  for (const p of perms) console.log(`  • [${p.id}] ${p.name} → ${p.code} (status=${p.status})`);

  await conn.end();
  console.log();
  console.log('🎉 完成！');
}

main().catch(e => {
  console.error('💥 执行失败:', e.message);
  process.exit(1);
});
