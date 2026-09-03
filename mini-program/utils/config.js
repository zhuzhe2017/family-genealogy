/**
 * 小程序全局配置
 * - API_BASE_URL: 后端 API 基础地址,开发环境指向本地 NestJS 服务
 * - USE_MOCK: 是否在接口请求失败时回退到 mock 数据(开发期 true,生产期建议 false)
 *   注意:USE_MOCK=false 时页面走真实后端 API,需先登录获取 token 且当前家族已选择
 * - TIMEOUT: 请求超时时间(ms)
 */
module.exports = {
//API_BASE_URL: 'https://jiapuadmin.deejee.net/api',
 API_BASE_URL: 'http://localhost:3000/api',
  USE_MOCK: false,
  TIMEOUT: 10000
};
