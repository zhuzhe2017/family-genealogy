/**
 * 自定义导航栏组件
 * - 内部统一计算 statusBarHeight / navBarTotal，页面无需再各自处理
 * - 返回行为通过 back 事件交给页面处理(页面可能有额外副作用)，组件自身不做跳转
 * - 粘性定位由使用方通过宿主节点 class 控制(组件内部不做 position)，避免组件包裹导致 sticky 失效
 */
Component({
  properties: {
    // 导航标题
    title: { type: String, value: '' },
    // 是否显示左上角返回箭头(默认显示;tabBar 页面等无需返回时置 false)
    showBack: { type: Boolean, value: true }
  },

  data: {
    statusBarHeight: 20,
    navBarTotal: 64
  },

  lifetimes: {
    attached() {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const statusBarHeight = (win && win.statusBarHeight) || 20;
      const navBarTotal = statusBarHeight + 44;
      this._navBarTotal = navBarTotal;
      this.setData({ statusBarHeight, navBarTotal });
    },
    ready() {
      // 渲染完成后透出导航栏总高（含状态栏），供页面按需计算剩余可视高度。
      // 放在 ready 而非 attached：确保父页面已完成 bind:ready 绑定，事件不丢失。
      this.triggerEvent('ready', { navBarTotal: this._navBarTotal || this.data.navBarTotal });
    }
  },

  methods: {
    onBack() {
      this.triggerEvent('back');
    }
  }
});