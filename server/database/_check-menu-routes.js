// 临时脚本：复刻后端 buildElegantRoutes，对照前端 imports.ts 的 view 映射，找出无法匹配的路由
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

// 解析前端 imports.ts 的 view key（elegant-router 生成的 view 映射）
function parseViews(importsFile) {
  const content = fs.readFileSync(importsFile, 'utf8');
  const views = {};
  const re = /"((?:[a-zA-Z0-9_]-?)+)":\s*\(\)\s*=>\s*import\(["']@\/views\/([^"']+)["']\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    views[m[1]] = m[2];
  }
  return views;
}

function buildElegantRoutes(rows, parentId) {
  return rows
    .filter(r => Number(r.parent_id) === parentId)
    .map(r => {
      const routeName = r.route_name || String(r.id);
      const route = {
        id: String(r.id),
        name: routeName,
        path: r.path || '',
        component: r.type === 'directory' ? (r.component || 'layout.base') : (r.type === 'menu' ? (r.component || `view.${routeName}`) : ''),
        type: r.type,
        title: r.name,
        sort: r.sort_order
      };
      const childRoutes = buildElegantRoutes(rows, Number(r.id));
      if (childRoutes.length) route.children = childRoutes;
      return route;
    });
}

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
  const [rows] = await c.query(
    "SELECT `id`, `parent_id`, `name`, `type`, `path`, `component`, `route_name`, `sort_order`, `status` FROM `sys_menu` WHERE `status` = 1 AND `type` != 'button' ORDER BY `sort_order` ASC, `id` ASC"
  );
  await c.end();

  const views = parseViews(path.resolve(__dirname, '..', '..', 'web-admin', 'src', 'router', 'elegant', 'imports.ts'));

  const routes = buildElegantRoutes(rows, 0);
  const problems = [];

  const walk = (list, depth) => {
    list.forEach(r => {
      const indent = '  '.repeat(depth);
      let flag = 'OK';
      const issues = [];
      // 1. 非一级路由名带下划线（前端按 '_' 判定层级）
      const hasChild = !!r.children && r.children.length;
      if (!hasChild && depth > 0 && !r.name.includes('_')) {
        issues.push('名称无下划线且非顶层 → 会被当作一级独立路由，component 转换可能失败被丢弃');
        flag = 'X';
      }
      // 2. view 组件是否存在于前端 imports
      if (r.component && r.component.startsWith('view.')) {
        const viewKey = r.component.replace('view.', '').split('$').pop();
        if (!views[viewKey]) {
          issues.push(`view 组件 '${viewKey}' 不在前端 imports.ts 中`);
          flag = 'X';
        }
      }
      // 3. directory 但 component 非 layout
      if (r.type === 'directory' && r.component && !r.component.startsWith('layout.')) {
        issues.push('目录 component 不是 layout.*');
        flag = '?';
      }
      console.log(`${indent}- [${flag}] ${r.title} (name=${r.name}, path=${r.path || '(空)'}, comp=${r.component || '(空)'}${issues.length ? ' ⚠ ' + issues.join('; ') : ''}`);
      if (r.children) walk(r.children, depth + 1);
    });
  };
  walk(routes, 0);
  console.log('\n==== 汇总 ====');
  console.log('views 总数:', Object.keys(views).length);
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
