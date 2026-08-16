/**
 * miniprogram-simulate 预览服务器
 * 用 Node 渲染小程序页面为 HTML，通过浏览器预览。
 * 访问:
 *   http://localhost:9000/            首页(页面导航)
 *   http://localhost:9000/page/home    首页(小程序 pages/home)
 *   http://localhost:9000/page/family-tree  家谱树(小程序 pages/family-tree)
 */
const express = require('express');
const { renderPage } = require('./render');

const app = express();
const PORT = process.env.PORT || 9000;

const PAGES = {
  home: { file: 'pages/home/home.js', title: '首页' },
  'family-tree': { file: 'pages/family-tree/family-tree.js', title: '家谱树' }
};

/** 简单缓存，避免每次刷新都重新渲染(渲染约 1~2s) */
const cache = {};
function getCached(key, ttlMs, loader) {
  const now = Date.now();
  if (cache[key] && now - cache[key].time < ttlMs) return cache[key].value;
  return loader().then((value) => {
    cache[key] = { time: Date.now(), value };
    return value;
  });
}

function wrapPage(title, style, html) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - 小程序预览</title>
${style ? '<style>' + style + '</style>' : ''}
<style>
  /* 小程序自定义标签在浏览器中的默认布局 */
  wx-view { display: block; box-sizing: border-box; }
  wx-text { display: inline; white-space: pre-wrap; }
  wx-image { display: block; }
  body { margin: 0; background: #f5f5f5; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .preview-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; background: rgba(0,0,0,.85); color: #fff; font-size: 13px; }
  .preview-bar a { color: #7cc4ff; text-decoration: none; }
  .preview-body { padding-top: 44px; max-width: 480px; margin: 0 auto; background: #f5f5f5; }
</style>
</head>
<body>
<div class="preview-bar">
  <span>${title}</span>
  <a href="/">返回导航</a>
  <a href="/page/home">首页</a>
  <a href="/page/family-tree">家谱树</a>
</div>
<div class="preview-body">${html}</div>
</body>
</html>`;
}

app.get('/', (req, res) => {
  const links = Object.keys(PAGES)
    .map((name) => `<li><a href="/page/${name}">${PAGES[name].title}</a></li>`)
    .join('');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>小程序预览导航</title>
<style>body{font-family:sans-serif;padding:40px;max-width:480px;margin:0 auto}li{margin:12px 0}a{font-size:18px}</style>
</head><body><h2>小程序页面预览</h2><ul>${links}</ul></body></html>`);
});

app.get('/page/:name', async (req, res) => {
  const page = PAGES[req.params.name];
  if (!page) return res.status(404).send('页面不存在');
  try {
    const { html, style } = await getCached(req.params.name, 15000, () => renderPage(page.file));
    res.send(wrapPage(page.title, style, html));
  } catch (e) {
    console.error('渲染失败:', e);
    res.status(500).send('渲染失败: ' + (e.stack || e.message));
  }
});

app.listen(PORT, () => {
  console.log('预览服务器已启动: http://localhost:' + PORT);
  console.log('  首页:      http://localhost:' + PORT + '/page/home');
  console.log('  家谱树:    http://localhost:' + PORT + '/page/family-tree');
});
