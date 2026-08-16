/**
 * wx API mock 环境：转发真实后端，模拟登录 token
 */
const API_BASE = 'http://localhost:3000/api';
const storage = {};

function getStorageSync(key) {
  return storage[key] !== undefined ? storage[key] : '';
}
function setStorageSync(key, val) {
  storage[key] = val;
}
function removeStorageSync(key) {
  delete storage[key];
}

/** 转发 wx.request 到真实后端 */
function request(options) {
  let url = options.url.startsWith('http') ? options.url : API_BASE + options.url;
  const method = (options.method || 'GET').toUpperCase();
  // GET 请求参数走 query string（与 wx.request 行为一致）
  if ((method === 'GET' || method === 'DELETE') && options.data) {
    const qs = Object.keys(options.data)
      .filter((k) => options.data[k] !== undefined && options.data[k] !== null && options.data[k] !== '')
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(options.data[k]))
      .join('&');
    if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    options.header || {},
    getStorageSync('token') ? { Authorization: 'Bearer ' + getStorageSync('token') } : {}
  );
  fetch(url, {
    method,
    headers,
    body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(options.data || {}) : undefined
  })
    .then(async (res) => {
      const data = await res.json();
      if (options.success) options.success({ statusCode: res.status, data });
    })
    .catch((err) => {
      if (options.fail) options.fail({ errMsg: String(err && err.message || err) });
    });
}

let tokenPromise = null;
/** 确保已登录：用开发模式 code 换取真实 token */
function ensureToken() {
  if (getStorageSync('token')) return Promise.resolve();
  if (!tokenPromise) {
    tokenPromise = fetch(API_BASE + '/user/wx-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'demo_user_001' })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.code === '0000' && data.data && data.data.token) {
          setStorageSync('token', data.data.token);
        }
      })
      .catch(() => {});
  }
  return tokenPromise;
}

/** 构建 mock wx 全局对象 */
function initWx() {
  return {
    getStorageSync,
    setStorageSync,
    removeStorageSync,
    request,
    showToast: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    showModal: (o = {}) => { o.success && o.success({ confirm: true, cancel: false }); },
    switchTab: () => {},
    navigateTo: () => {},
    navigateBack: () => {},
    redirectTo: () => {},
    reLaunch: () => {},
    login: (o = {}) => { o.success && o.success({ code: 'demo_code_' + Date.now() }); },
    getDeviceInfo: () => ({ brand: 'preview', model: 'simulate', system: 'preview' }),
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
    getAppBaseInfo: () => ({ SDKVersion: '3.17.0' }),
    getSystemSetting: () => ({}),
    getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, screenWidth: 375, screenHeight: 667 }),
    previewImage: () => {},
    setNavigationBarTitle: () => {},
    setNavigationBarColor: () => {},
    pageScrollTo: () => {},
    stopPullDownRefresh: () => {},
    startPullDownRefresh: () => {},
    canvasToTempFilePath: () => {},
    createSelectorQuery: () => ({
      select: () => ({ boundingClientRect: (cb) => { cb && cb({}); return {}; } }),
      selectAll: () => ({ boundingClientRect: (cb) => { cb && cb([]); return {}; } }),
      in: () => this
    }),
    getMenuButtonBoundingClientRect: () => ({ top: 0, height: 30 })
  };
}

module.exports = { initWx, ensureToken, storage };
