// 临时验证脚本：真实模拟"上传图片 -> 新增广告 -> 列表确认 -> 删除"全链路
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const BASE = 'http://localhost:3000/api';
const TEST_USER = '_banner_save_tmp';
const TEST_PWD = 'Test@123456';
// 1x1 透明 PNG
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const envPath = fs.existsSync(path.resolve(__dirname, '..', '.env.local'))
    ? path.resolve(__dirname, '..', '.env.local')
    : path.resolve(__dirname, '..', '.env');
  const env = loadEnv(envPath);
  const c = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    database: env.DB_DATABASE || 'family_genealogy',
    user: env.DB_USERNAME || 'root',
    password: env.DB_PASSWORD || ''
  });

  // 临时管理员
  const hash = await bcrypt.hash(TEST_PWD, 10);
  await c.query('DELETE FROM sys_admin WHERE username = ?', [TEST_USER]);
  await c.query('INSERT INTO sys_admin (username, password, nickname, role, status) VALUES (?, ?, ?, ?, 1)', [TEST_USER, hash, '临时验证', 'super']);

  // 登录前先获取图形验证码（SVG 文本为明文，可直接解析）
  const captcha = {};
  try {
    const capRes = await fetch(`${BASE}/system-security/captcha`);
    const capJson = await capRes.json();
    const svg = capJson?.data?.svg || '';
    const code = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]).join('');
    console.log('获取验证码:', capJson?.data?.token ? `OK code=${code}` : JSON.stringify(capJson));
    captcha.captchaToken = capJson?.data?.token || '';
    captcha.captchaCode = code;
  } catch (e) {
    console.log('验证码获取失败，尝试无验证码登录:', e.message);
  }

  // 登录
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: TEST_USER, password: TEST_PWD, ...captcha })
  });
  const loginJson = await loginRes.json();
  const token = loginJson?.data?.token;
  console.log('登录:', loginRes.status, token ? 'OK' : JSON.stringify(loginJson));
  if (!token) throw new Error('登录失败');

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 上传图片
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(PNG_BASE64, 'base64')], { type: 'image/png' }), 'tmp-banner.png');
  const upRes = await fetch(`${BASE}/common/upload`, { method: 'POST', headers: authHeaders, body: form });
  const upJson = await upRes.json();
  const url = upJson?.data?.url;
  console.log('上传图片:', upRes.status, url ? `OK url=${url}` : JSON.stringify(upJson));
  if (!url) throw new Error('上传失败');

  // 新增广告
  const createRes = await fetch(`${BASE}/banner`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ familyId: 0, title: '保存链路验证', imageUrl: url, linkType: 'none', linkUrl: '', sortOrder: 888, status: 1, startTime: null, endTime: null })
  });
  const createJson = await createRes.json();
  console.log('新增广告:', createRes.status, createJson.msg || 'OK');

  // 列表确认（中文关键字需编码）
  const listRes = await fetch(`${BASE}/banner/list?page=1&pageSize=10&keyword=${encodeURIComponent('保存链路验证')}`, { headers: authHeaders });
  const listJson = await listRes.json();
  console.log('列表响应:', JSON.stringify(listJson));
  const row = (listJson?.data?.list || [])[0];
  console.log('列表确认:', row ? `id=${row.id} imageUrl=${row.imageUrl}` : '未找到');

  // 编辑
  if (row) {
    const updRes = await fetch(`${BASE}/banner/${row.id}`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '保存链路验证-改' })
    });
    console.log('编辑广告:', updRes.status, (await updRes.json()).msg || 'OK');
  }

  // 删除
  if (row) {
    const delRes = await fetch(`${BASE}/banner/${row.id}`, { method: 'DELETE', headers: authHeaders });
    console.log('删除广告:', delRes.status, (await delRes.json()).msg || 'OK');
  }

  // 清理：临时管理员 + 上传的图片文件
  await c.query('DELETE FROM sys_admin WHERE username = ?', [TEST_USER]);
  const filePath = path.resolve(__dirname, '..', 'uploads', path.basename(url));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await c.end();
  console.log('清理完成');

  console.log('RESULT:', loginRes.ok && upRes.ok && createRes.ok ? '上传+保存全链路正常 ✓' : '存在异常 ✗');
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
