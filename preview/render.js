/**
 * 页面渲染核心：jsdom + miniprogram-simulate 渲染小程序页面为 HTML
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { initWx, ensureToken } = require('./mock-wx');

const MINI_ROOT = path.resolve(__dirname, '..', 'mini-program');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 把 <wxs src="..." module="f" /> 内联为 <wxs module="f">...</wxs>。
 * miniprogram-simulate 的纯 js 编译器（simulate）不支持 wxs src 引用，
 * 但 j-component 支持内联 wxs 模块。
 */
function inlineWxs(wxml, wxmlPath) {
  const reg = /<wxs\s+src=["']([^"']+)["']\s+module=["']([^"']+)["']\s*\/>/g;
  return wxml.replace(reg, (all, src, moduleName) => {
    const absPath = path.resolve(path.dirname(wxmlPath), src);
    const content = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';
    return `<wxs module="${moduleName}">\n${content}\n</wxs>`;
  });
}

/** 修补 miniprogram-simulate 的 readFile，使 wxs 内联生效 */
function patchSimulateReadFile() {
  const simUtils = require('miniprogram-simulate/src/utils.js');
  if (simUtils.__wxsPatched) return;
  const origReadFile = simUtils.readFile;
  simUtils.readFile = function (filePath) {
    const content = origReadFile(filePath);
    if (content && typeof filePath === 'string' && filePath.endsWith('.wxml') && content.indexOf('<wxs') >= 0) {
      return inlineWxs(content, filePath);
    }
    return content;
  };
  simUtils.__wxsPatched = true;
}

/** 从 jsdom document.head 提取 simulate 注入的已编译样式（已加类前缀、rpx→px） */
function extractStyles(dom) {
  const styles = dom.window.document.head.querySelectorAll('style');
  const parts = [];
  styles.forEach((s) => parts.push(s.innerHTML));
  return parts.join('\n');
}

/** 从真实后端拉取家族列表（已登录），返回 normalizeFamily 后的数组 */
async function fetchFamilies() {
  const { storage } = require('./mock-wx');
  const token = storage['token'];
  if (!token) return [];
  const res = await fetch('http://localhost:3000/api/user/family/list?page=1&pageSize=50', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const json = await res.json();
  const list = (json && json.data && json.data.list) || [];
  const { normalizeFamily } = require(path.join(MINI_ROOT, 'utils/format.js'));
  return list.map(normalizeFamily);
}

/** 渲染一个页面，返回 { html, style } */
async function renderPage(relPagePath, waitMs = 900) {
  await ensureToken();

  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'http://localhost:9000/',
    pretendToBeVisual: true
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.getComputedStyle = window.getComputedStyle;
  global.HTMLElement = window.HTMLElement;
  global.Node = window.Node;
  global.fetch = fetch;

  // 清理旧的 simulate 缓存（避免多次加载互相影响）
  delete require.cache[require.resolve('miniprogram-simulate')];
  delete require.cache[require.resolve('miniprogram-simulate/src/utils.js')];

  const simulate = require('miniprogram-simulate');
  patchSimulateReadFile();

  global.wx = initWx();
  const families = await fetchFamilies();
  const appMock = {
    globalData: {
      userInfo: null,
      currentFamily: families[0] || null,
      families,
      systemInfo: {},
      isOnline: true
    },
    login() {},
    onTokenExpired() {},
    showToast() {},
    switchFamily(id) {
      const f = this.globalData.families.find((x) => String(x.id) === String(id));
      if (f) this.globalData.currentFamily = f;
      return f || null;
    }
  };
  global.App = (def) => { Object.assign(appMock, def); };
  global.getApp = () => appMock;

  // miniprogram-simulate 只定义了 Component/Behavior，页面使用 Page 构造器。
  // 将 Page 定义转为 Component 定义：顶层函数挪入 methods。
  global.Page = (def) => {
    const methods = {};
    const componentDef = {};
    Object.keys(def).forEach((key) => {
      if (typeof def[key] === 'function') methods[key] = def[key];
      else componentDef[key] = def[key];
    });
    componentDef.methods = methods;
    global.Component(componentDef);
  };

  const absPath = path.join(MINI_ROOT, relPagePath).replace(/\.js$/, '');
  // simulate 编译器：纯 js 实现，支持内联 wxs；official 编译器依赖微信 wcc 二进制
  const id = simulate.load(absPath, { compiler: 'simulate' });
  const comp = simulate.render(id);

  // 手动触发页面生命周期
  const inst = comp.instance;
  if (inst && typeof inst.onLoad === 'function') inst.onLoad();
  if (inst && typeof inst.onShow === 'function') inst.onShow();

  // 等待异步数据请求完成
  await sleep(waitMs);

  if (typeof comp.attach === 'function') {
    comp.attach(window.document.body);
  } else if (comp.dom) {
    window.document.body.appendChild(comp.dom);
  }
  const html = window.document.body.innerHTML;
  const style = extractStyles(dom);

  try { comp.detach && comp.detach(); } catch (e) { /* ignore */ }
  dom.window.close();

  return { html, style };
}

module.exports = { renderPage, MINI_ROOT };
