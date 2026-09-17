/** 工具管理:对应用中心插件工具进行购买、授权及相关管理操作(数据源与应用中心一致,来自 app_plugin) */
const { plugin } = require('../../utils/api');
const { resolveImageUrl } = require('../../utils/format');
const TAB_BAR_PAGES = ['/pages/home/home', '/pages/family-tree/family-tree', '/pages/dynamic/dynamic', '/pages/profile/profile'];

Page({
  data: {
    tools: [],
    loading: true
  },

  onShow() {
    this.loadTools();
  },

  /** 加载启用中的插件工具;失败静默清空并显示空态,不阻塞页面 */
  loadTools() {
    plugin
      .getList()
      .then((res) => {
        this.setData({
          tools: (res.list || []).map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            icon: item.icon || '🧩',
            description: item.description || '',
            entryType: item.entryType || 'page',
            entryValue: item.entryValue || '',
            // 与 app-center 保持一致：图片(上传的 /uploads/ 相对路径或 http 地址)以 image 展示，否则 emoji
            iconImage: /^https?:\/\//.test(item.icon || '') || (item.icon || '').indexOf('/uploads/') === 0,
            iconSrc: resolveImageUrl(item.icon)
          })),
          loading: false
        });
      })
      .catch((err) => {
        console.error('工具列表加载失败', err);
        this.setData({ tools: [], loading: false });
      });
  },

  /** 工具跳转:page → 原生页面(switchTab/navigateTo);url → web-view 容器 */
  openTool(e) {
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
