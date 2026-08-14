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

/**
 * 统一请求方法,基于 wx.request 封装 Promise
 * 自动注入 Authorization 头、解析后端标准响应 {code,data,msg}
 * @param {Object} options - { url, method, data, header, timeout }
 * @returns {Promise<any>} resolve(data 字段),reject(Error)
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
          if (res.data && res.data.code === '0000') {
            resolve(res.data.data);
          } else {
            reject(new Error((res.data && res.data.msg) || '请求失败'));
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
