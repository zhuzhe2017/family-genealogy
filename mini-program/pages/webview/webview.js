/** 外部H5插件容器:通过 url 参数加载第三方页面
 * 安全限制：仅允许 https:// 且域名在白名单内的 URL，防止钓鱼/恶意页面
 */
// 允许的域名白名单（按需添加）
const ALLOWED_DOMAINS = [
  'deejee.net',
  'your-domain.com'
];

function isAllowedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  // 仅允许 HTTPS
  if (!url.startsWith('https://')) return false;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    // 检查是否在白名单内
    return ALLOWED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch (e) {
    return false;
  }
}

Page({
  data: {
    url: ''
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || '');
    if (!isAllowedUrl(url)) {
      wx.showToast({ title: '不支持的链接', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ url: url });
    if (options.title) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(options.title) });
    }
  }
});
