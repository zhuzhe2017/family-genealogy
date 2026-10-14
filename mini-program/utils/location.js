/**
 * 腾讯位置服务插件封装（app.json plugins 已注册 chooseLocation / route-plan）
 * - 地图选点：openLocationPicker 打开插件页，返回后须在页面 onShow 调用 readPickedLocation 取结果
 * - 路线规划：openRoutePlan 需传入终点经纬度，已开启驾车导航（navigation=1）
 */
const { LBS_KEY, LBS_REFERER } = require('./config');

/** 打开「地图选点」插件页；options.category 为可选 POI 分类关键词（最多 3 个，英文逗号分隔） */
function openLocationPicker(options) {
  const opts = options || {};
  const params = [
    'key=' + encodeURIComponent(LBS_KEY),
    'referer=' + encodeURIComponent(LBS_REFERER)
  ];
  if (opts.location) params.push('location=' + encodeURIComponent(JSON.stringify(opts.location)));
  if (opts.category) params.push('category=' + encodeURIComponent(opts.category));
  wx.navigateTo({ url: 'plugin://chooseLocation/index?' + params.join('&') });
}

/**
 * 读取地图选点结果并清空插件缓存（仅在页面 onShow 中调用）
 * @returns {{name:string,address:string,latitude:number,longitude:number}|null} 未选点返回 null
 */
function readPickedLocation() {
  const chooseLocation = requirePlugin('chooseLocation');
  const location = chooseLocation.getLocation();
  if (location) chooseLocation.setLocation(null);
  return location || null;
}

/** 打开「路线规划」插件页（endPoint 必传 name/latitude/longitude）；navigation=1 开启驾车导航，插件页可直接一键调起导航 */
function openRoutePlan(endPoint, mode) {
  const params = [
    'key=' + encodeURIComponent(LBS_KEY),
    'referer=' + encodeURIComponent(LBS_REFERER),
    'endPoint=' + encodeURIComponent(JSON.stringify(endPoint)),
    'navigation=1'
  ];
  if (mode) params.push('mode=' + mode);
  wx.navigateTo({ url: 'plugin://route-plan/index?' + params.join('&') });
}

module.exports = { openLocationPicker, readPickedLocation, openRoutePlan };
