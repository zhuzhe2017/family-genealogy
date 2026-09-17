const { API_BASE_URL, TIMEOUT } = require('./config');

/** 读取本地存储的 token */
function getToken() {
  try {
    return wx.getStorageSync('token') || '';
  } catch (e) {
    return '';
  }
}

/** 保存 token 到本地存储 */
function setToken(token) {
  try {
    wx.setStorageSync('token', token);
  } catch (e) {
    console.error('token 保存失败', e);
  }
}

/** 读取本地存储的 refreshToken */
function getRefreshToken() {
  try {
    return wx.getStorageSync('refreshToken') || '';
  } catch (e) {
    return '';
  }
}

/** 清除 token */
function clearToken() {
  try {
    wx.removeStorageSync('token');
  } catch (e) {
    // ignore
  }
}

/** 权益类业务码判断：后端 EntitlementException 以 HTTP 200 + 4xxx 返回（4000-4005） */
function isEntitlementCode(code) {
  return /^4\d{3}$/.test(String(code || ''));
}

/** 通知全局权益拦截（app.onEntitlementError：付费引导弹窗 + 跳转会员中心） */
function notifyEntitlement(code, msg) {
  const app = getApp();
  if (app && typeof app.onEntitlementError === 'function') {
    app.onEntitlementError(code, msg);
  }
}

/**
 * 单飞刷新 Promise：并发 401 共享同一次刷新，避免重复调 refreshToken
 * 成功：新 token 已写入缓存，resolve(true)
 * 失败：缓存已清，resolve(false)，由调用方触发重新登录
 */
let _refreshPromise = null;

function refreshTokenSingleFlight() {
  if (_refreshPromise) {
    return _refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return Promise.resolve(false);
  }

  _refreshPromise = new Promise((resolve) => {
    wx.request({
      url: API_BASE_URL + '/user/refreshToken',
      method: 'POST',
      data: { refreshToken },
      timeout: TIMEOUT,
      header: { 'Content-Type': 'application/json' },
      success(res) {
        const data = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && data.code === '0000' && data.data && data.data.token) {
          setToken(data.data.token);
          if (data.data.refreshToken) {
            try {
              wx.setStorageSync('refreshToken', data.data.refreshToken);
            } catch (e) {
              console.error('refreshToken 保存失败', e);
            }
          }
          resolve(true);
        } else {
          clearToken();
          resolve(false);
        }
      },
      fail() {
        clearToken();
        resolve(false);
      }
    });
  }).finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
}

/**
 * 触发全局重新登录（token 彻底失效时）
 */
function triggerRelogin() {
  const app = getApp();
  if (app && typeof app.onTokenExpired === 'function') {
    app.onTokenExpired();
  }
}

/**
 * 统一请求方法,基于 wx.request 封装 Promise
 * 自动注入 Authorization 头、解析后端标准响应 {code,data,msg}
 * 401 时自动用 refreshToken 刷新并重试原请求（单飞），刷新失败才触发重新登录
 * @param {Object} options - { url, method, data, header, timeout, skipEntitlementGuide, _retried }
 *   skipEntitlementGuide: true 时跳过权益引导（4xxx 仍 reject 带 code，由业务自行处理）
 *   _retried: 内部标记，禁止外部传入
 * @returns {Promise<any>} resolve(data 字段),reject(Error 带 code/entitlement 属性)
 */
function request(options) {
  const url = options.url.startsWith('http') ? options.url : API_BASE_URL + options.url;
  const token = getToken();

  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: options.timeout || TIMEOUT,
      header: Object.assign(
        { 'Content-Type': 'application/json' },
        options.header || {},
        token ? { Authorization: 'Bearer ' + token } : {}
      ),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const data = res.data || {};
          if (data.code === '0000') {
            resolve(data.data);
          } else if (isEntitlementCode(data.code)) {
            // 权益受限（会员功能未解锁/存储不足/额度用尽/订阅过期等）
            const err = new Error(data.msg || '会员权益受限');
            err.code = data.code;
            err.entitlement = true;
            if (!options.skipEntitlementGuide) {
              notifyEntitlement(data.code, err.message);
            }
            reject(err);
          } else {
            const err = new Error(data.msg || '请求失败');
            err.statusCode = res.statusCode;
            reject(err);
          }
        } else if (res.statusCode === 401) {
          // token 过期/无效：先尝试刷新并重试，刷新失败才重新登录
          if (options._retried) {
            // 已重试过仍 401，说明 refreshToken 也失效，触发重新登录
            clearToken();
            triggerRelogin();
            reject(new Error('登录已过期,请重新登录'));
            return;
          }
          refreshTokenSingleFlight().then((refreshed) => {
            if (refreshed) {
              // 刷新成功，自动重试原请求
              request(Object.assign({}, options, { _retried: true })).then(resolve, reject);
            } else {
              triggerRelogin();
              reject(new Error('登录已过期,请重新登录'));
            }
          });
        } else if (res.statusCode === 429) {
          reject(new Error('请求过于频繁,请稍后再试'));
        } else {
          const err = new Error((res.data && res.data.msg) || 'HTTP ' + res.statusCode);
          err.statusCode = res.statusCode;
          reject(err);
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

/**
 * 统一上传方法，基于 wx.uploadFile 封装 Promise
 * 自动注入 Authorization 头；401 时与 request() 共享单飞刷新并重试
 * @param {Object} options - { url, filePath, name, formData, _retried }
 * @returns {Promise<any>} resolve(data.data),reject(Error)
 */
function upload(options) {
  const url = options.url.startsWith('http') ? options.url : API_BASE_URL + options.url;
  const token = getToken();

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: url,
      filePath: options.filePath,
      name: options.name || 'file',
      header: Object.assign(
        { 'Content-Type': 'multipart/form-data' },
        options.header || {},
        token ? { Authorization: 'Bearer ' + token } : {}
      ),
      formData: options.formData || {},
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let data;
          try {
            data = JSON.parse(res.data);
          } catch (e) {
            reject(new Error('上传响应解析失败'));
            return;
          }
          if (data.code === '0000') {
            resolve(data.data);
          } else {
            reject(new Error(data.msg || '上传失败'));
          }
        } else if (res.statusCode === 401) {
          if (options._retried) {
            clearToken();
            triggerRelogin();
            reject(new Error('登录已过期,请重新登录'));
            return;
          }
          refreshTokenSingleFlight().then((refreshed) => {
            if (refreshed) {
              upload(Object.assign({}, options, { _retried: true })).then(resolve, reject);
            } else {
              triggerRelogin();
              reject(new Error('登录已过期,请重新登录'));
            }
          });
        } else {
          let msg = 'HTTP ' + res.statusCode;
          try {
            const data = JSON.parse(res.data);
            if (data.msg) msg = data.msg;
          } catch (e) { /* ignore */ }
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '上传失败'));
      }
    });
  });
}

module.exports = { request, upload, getToken, setToken, clearToken, getRefreshToken };
