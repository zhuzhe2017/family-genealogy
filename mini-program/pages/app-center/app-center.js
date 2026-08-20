/** 应用中心:全部应用来自后端 app_plugin 表(动态),管理员可在后台增删/启停 */
const { plugin } = require('../../utils/api');
const { resolveImageUrl } = require('../../utils/format');
const TAB_BAR_PAGES = ['/pages/home/home', '/pages/family-tree/family-tree', '/pages/dynamic/dynamic', '/pages/profile/profile'];

Page({
  data: {
    apps: [],
    loading: true
  },

  onShow() {
    this.loadApps();
  },

  /** 加载启用中的应用;失败静默清空并显示空态,不阻塞页面 */
  loadApps() {
    plugin
      .getList()
      .then((res) => {
        this.setData({
          apps: (res.list || []).map((item) => {
            const icon = item.icon || '';
            const iconImage = /^(https?:\/\/|\/uploads\/)/.test(icon);
            return {
              id: item.id,
              code: item.code,
              name: item.name,
              icon: iconImage ? resolveImageUrl(icon) : (icon || '🧩'),
              description: item.description || '',
              entryType: item.entryType || 'page',
              entryValue: item.entryValue || '',
              iconImage
            };
          }),
          loading: false
        });
      })
      .catch((err) => {
        console.error('应用加载失败', err);
        this.setData({ apps: [], loading: false });
      });
  },

  /** 应用跳转:page → 原生页面(switchTab/navigateTo);url → web-view 容器 */
  openApp(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.entryValue) return;
    if (item.entryType === 'url') {
      wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent(item.entryValue) });
      return;
    }
    if (TAB_BAR_PAGES.indexOf(item.entryValue) >= 0) {
      wx.switchTab({ url: item.entryValue });
    } else {
      wx.navigateTo({ url: item.entryValue });
    }
  }
});
