/* 测试：加载指定页面并输出渲染 HTML 片段
 * 用法: node test-load.js [pages/home/home.js|pages/family-tree/family-tree.js]
 */
const { renderPage } = require('./render');

const relPage = process.argv[2] || 'pages/home/home.js';

(async () => {
  try {
    const { html, style } = await renderPage(relPage);
    console.log('=== 渲染成功, HTML 长度:', html.length, '===');
    console.log(html.replace(/\s+/g, ' ').substring(0, 1500));
    console.log('\n=== style 长度:', style.length, '===');
    console.log(style.substring(0, 400));
  } catch (e) {
    console.error('渲染失败:', e);
    process.exit(1);
  }
})();
