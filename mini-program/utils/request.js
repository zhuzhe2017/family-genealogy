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
 * 统一请求方法,基于 wx.request 封装 Promise
 * 自动注入 Authorization 头、解析后端标准响应 {code,data,msg}
 * @param {Object} options - { url, method, data, header, timeout, skipEntitlementGuide }
 *   skipEntitlementGuide: true 时跳过权益引导（4xxx 仍 reject 带 code，由业务自行处理）
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
            reject(new Error(data.msg || '请求失败'));
          }
        } else if (res.statusCode === 401) {
          clearToken();
          // 触发全局重新登录(带防抖),避免多个并发请求重复刷新
          const app = getApp();
          if (app && typeof app.onTokenExpired === 'function') {
            app.onTokenExpired();
          }
          reject(new Error('登录已过期,请重新登录'));
        } else if (res.statusCode === 429) {
          reject(new Error('请求过于频繁,请稍后再试'));
        } else {
          reject(new Error((res.data && res.data.msg) || 'HTTP ' + res.statusCode));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

module.exports = { request, getToken, setToken, clearToken };
