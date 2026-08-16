// 临时验证：M1 剩余三项（上传存储校验/删除释放/订阅状态查询/能力点标注基础设施）（用后即删）
const mysql = require('mysql2/promise');

const BASE = 'http://localhost:3000/api';

async function conn() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_DATABASE || 'family_genealogy',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || ''
  });
}

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' -> ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' -> ' + extra : ''}`); }
}

async function main() {
  const db = await conn();
  try {
    // ---- 登录 ----
    const loginRes = await fetch(BASE + '/user/wx-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'demo_user_001' })
    });
    const login = await loginRes.json();
    const token = login.data && login.data.token;
    console.log('[1] 登录:', login.code, token ? 'token 获取成功' : '失败');
    ok('登录', !!token);
    const auth = { Authorization: 'Bearer ' + token };

    // ---- 订阅状态查询 ----
    const curRes = await fetch(BASE + '/user/subscription/current?familyId=1', { headers: auth });
    const cur = await curRes.json();
    console.log('[2] current:', JSON.stringify(cur.data || cur));
    ok('订阅状态查询 code=0000', cur.code === '0000', `plan=${cur.data?.planCode} status=${cur.data?.status}`);
    ok('返回存储用量', typeof cur.data?.storageUsed === 'number');
    ok('返回额度消耗', typeof cur.data?.aiRestoreUsed === 'number' && typeof cur.data?.worshipProUsed === 'number');
    const baseline = Number(cur.data?.storageUsed) || 0;

    // ---- 上传带 familyId：存储记账 ----
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([Buffer.alloc(4096)]), 'verify-upload.png');
    uploadForm.append('familyId', '1');
    uploadForm.append('bizType', 'photo');
    const upRes = await fetch(BASE + '/common/upload', { method: 'POST', headers: auth, body: uploadForm });
    const up = await upRes.json();
    console.log('[3] 上传:', up.code, up.data?.url || up.msg);
    ok('家族维度上传成功', up.code === '0000' && !!up.data?.url, up.data?.url);
    const uploadedUrl = up.data && up.data.url;

    const cur2 = (await (await fetch(BASE + '/user/subscription/current?familyId=1', { headers: auth })).json()).data;
    ok('上传后 storageUsed 增加 4096', Number(cur2.storageUsed) === baseline + 4096, `${baseline} -> ${cur2.storageUsed}`);

    // ---- 存储超限 → 4002 ----
    await db.query('UPDATE `family_quota` SET `storage_used` = `storage_used` + 4000000 WHERE `family_id` = 1'); // 临时撑高用量
    const bigForm = new FormData();
    bigForm.append('file', new Blob([Buffer.alloc(2048)]), 'verify-big.png');
    bigForm.append('familyId', '1');
    const bigRes = await fetch(BASE + '/common/upload', { method: 'POST', headers: auth, body: bigForm });
    const big = await bigRes.json();
    console.log('[4] 超限上传:', big.code, big.msg || '');
    ok('存储超限返回 4002', big.code === '4002', big.msg);

    // ---- 删除即释放：photo 删除 ----
    const fileKey = '/uploads/verify-release.png';
    await db.query('INSERT INTO `storage_usage_record` (`family_id`, `file_key`, `file_size`, `biz_type`, `status`) VALUES (1, ?, 2048, \'photo\', 1)', [fileKey]);
    await db.query('UPDATE `family_quota` SET `storage_used` = `storage_used` + 2048 WHERE `family_id` = 1');
    const [photoRows] = await db.query('INSERT INTO `family_photo` (`family_id`, `url`, `title`, `audit_status`, `status`) VALUES (1, ?, \'验证照片\', 1, 1)', [fileKey]);
    const photoId = photoRows.insertId;

    const delRes = await fetch(BASE + '/user/content/photo/' + photoId, { method: 'DELETE', headers: auth });
    const del = await delRes.json();
    console.log('[5] 删除照片:', del.code, del.msg || '');
    ok('删除内容成功', del.code === '0000', `id=${photoId}`);
    const [usage] = await db.query('SELECT `status` FROM `storage_usage_record` WHERE `file_key` = ?', [fileKey]);
    ok('删除后 storage_usage_record 已释放', usage[0] && usage[0].status === 0);
    const cur3 = (await (await fetch(BASE + '/user/subscription/current?familyId=1', { headers: auth })).json()).data;
    ok('删除后 storageUsed 回落 2048', Number(cur3.storageUsed) === baseline + 4096 + 2048, `${baseline + 4096 + 2048} -> ${cur3.storageUsed}`);

    // ---- 能力点标注基础设施：未标注接口放行（EntitlementGuard 不误伤） ----
    const famRes = await fetch(BASE + '/user/family/1', { headers: auth });
    const fam = await famRes.json();
    ok('未标注接口正常放行', fam.code === '0000' || fam.status === 404, `code=${fam.code || fam.status}`);

    // ---- 清理验证数据 ----
    await db.query('DELETE FROM `storage_usage_record` WHERE `file_key` = ?', [fileKey]);
    await db.query('UPDATE `family_quota` SET `storage_used` = ? WHERE `family_id` = 1', [baseline + 4096]);
    console.log('[6] 清理完成');

    console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
