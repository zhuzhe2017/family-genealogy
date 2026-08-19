/** 外部H5插件容器:通过 url 参数加载第三方页面 */
Page({
  data: {
    url: ''
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || '');
    this.setData({ url: url });
    if (options.title) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(options.title) });
    }
  }
});
