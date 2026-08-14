const app = getApp();
const { content } = require('../../utils/api');
const { normalizeDynamic, normalizeEvent } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    currentFamily: {},
    quickActions: [
      { id: 1, name: '家族树', icon: '🌳', bgColor: '#E8F5E9', url: '/pages/family-tree-detail/family-tree-detail' },
      { id: 2, name: '家族成员', icon: '👥', bgColor: '#E3F2FD', url: '/pages/member-list/member-list' },
      { id: 3, name: '家族资料', icon: '📚', bgColor: '#FFF3E0', url: '/pages/family-docs/family-docs' },
      { id: 4, name: '事件时间', icon: '📅', bgColor: '#F3E5F5', url: '/pages/timeline/timeline' },
      { id: 5, name: '相册影像', icon: '📷', bgColor: '#E0F2F1', url: '/pages/album/album' },
      { id: 6, name: '祭祀祈福', icon: '🙏', bgColor: '#FBE9E7', url: '/pages/worship/worship' },
      { id: 7, name: '家族动态', icon: '💬', bgColor: '#E8EAF6', url: '/pages/dynamic/dynamic' },
      { id: 8, name: '个人中心', icon: '👤', bgColor: '#F1F8E9', url: '/pages/profile/profile' }
    ],
    // 家族动态:真实数据 + 状态机,不再静默回退假数据
    recentDynamics: [],
    loadingDynamics: true,  // 首屏加载中
    needLogin: false,       // 未登录:引导登录
    dynamicsFailed: false,  // 请求失败:错误占位
    dynamicsEmpty: false,   // 已登录但无动态
    // 最近活动/家族名人:仅开发模式有模拟数据,真实模式无数据源时显示空态
    recentActivities: [],
    famousMembers: [],
    isMock: false           // 开发模式模拟数据角标
  },

  onLoad() {
    this.setData({
      currentFamily: app.globalData.currentFamily || {}
    });
    this.loadDynamics();
  },

  onShow() {
    this.setData({
      currentFamily: app.globalData.currentFamily || {}
    });
    // 每次可见时刷新,获取最新登录态与动态(有数据时不再闪加载态)
    this.loadDynamics();
  },

  /**
   * 加载家族动态
   * - USE_MOCK(开发模式): 展示模拟数据并标注角标
   * - 未登录: 引导登录,不展示假数据
   * - 请求失败: 清空列表并显示错误占位
   */
  loadDynamics() {
    const familyId = (app.globalData.currentFamily || {}).id;

    // 开发模式:展示模拟数据并标注
    if (USE_MOCK) {
      this.setData({
        recentDynamics: this.getMockDynamics(),
        recentActivities: this.getMockActivities(),
        famousMembers: this.getMockFamous(),
        isMock: true,
        loadingDynamics: false,
        needLogin: false,
        dynamicsFailed: false,
        dynamicsEmpty: false
      });
      return;
    }

    // 未登录:引导登录,不展示假数据
    if (!getToken()) {
      this.setData({
        recentDynamics: [],
        recentActivities: [],
        famousMembers: [],
        needLogin: true,
        loadingDynamics: false,
        dynamicsFailed: false,
        dynamicsEmpty: false,
        isMock: false
      });
      return;
    }

    // 未选择家族
    if (!familyId) {
      this.setData({
        recentDynamics: [],
        recentActivities: [],
        famousMembers: [],
        needLogin: false,
        loadingDynamics: false,
        dynamicsFailed: false,
        dynamicsEmpty: true,
        isMock: false
      });
      return;
    }

    // 已有内容时刷新不闪加载态
    this.setData({
      loadingDynamics: this.data.recentDynamics.length === 0,
      needLogin: false,
      dynamicsFailed: false,
      isMock: false
    });
    content.getList('dynamic', { familyId, page: 1, pageSize: 3 })
      .then((res) => {
        const list = (res.list || []).map(normalizeDynamic);
        // 图片超过 3 张时按每屏 3 张分页,供首页 swiper 滑动浏览
        list.forEach((item) => {
          const imgs = item.images || [];
          const pages = [];
          for (let i = 0; i < imgs.length; i += 3) {
            pages.push({ key: 'p' + i, images: imgs.slice(i, i + 3) });
          }
          item.imagePages = pages;
          item.imageCurrent = 0;
        });
        this.setData({ recentDynamics: list, loadingDynamics: false, dynamicsEmpty: list.length === 0 });
      })
      .catch((err) => {
        console.error('动态加载失败', err);
        // 失败不再静默保留假数据,清空并提示
        this.setData({ recentDynamics: [], loadingDynamics: false, dynamicsFailed: true, dynamicsEmpty: false });
      });

    // 并行加载最近活动(家族事件)
    this.loadActivities(familyId);
  },

  /**
   * 加载最近活动(家族事件):真实模式从 family_event 取最近 3 条,
   * 加载失败/无数据时清空显示空态,不展示假数据
   */
  loadActivities(familyId) {
    content.getList('event', { familyId, page: 1, pageSize: 3 })
      .then((res) => {
        const list = (res.list || []).map((row) => {
          const e = normalizeEvent(row);
          // 统一为卡片展示格式:day 显示日期(0=不详),month 显示年份+月份
          return {
            id: e.id,
            day: e.day ? String(e.day).padStart(2, '0') : '?',
            month: (e.year || '') + (e.month ? e.month + '月' : '年'),
            title: e.title,
            desc: e.description || '',
            typeName: e.typeName || ''
          };
        });
        this.setData({ recentActivities: list });
      })
      .catch((err) => {
        console.error('最近活动加载失败', err);
        this.setData({ recentActivities: [] });
      });
  },

  /** 首页动态 swiper 翻页:记录当前页用于页码指示器 */
  onImageSwiperChange(e) {
    const id = e.currentTarget.dataset.id;
    const current = e.detail.current;
    const list = this.data.recentDynamics.map(item => {
      if (String(item.id) === String(id)) {
        item.imageCurrent = current;
      }
      return item;
    });
    this.setData({ recentDynamics: list });
  },

  /** 点击动态图片:预览大图(阻止冒泡,避免触发卡片跳转详情) */
  previewDynamicImage(e) {
    const srcs = e.currentTarget.dataset.srcs || [];
    const current = e.currentTarget.dataset.current;
    if (!srcs.length) return;
    wx.previewImage({ current, urls: srcs });
  },

  /** 点击动态卡片:跳转动态详情页 */
  goDynamicDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/dynamic-detail/dynamic-detail?id=' + id
    });
  },

  /** 点击活动卡片:跳转事件详情 */
  goEventDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/event-detail/event-detail?id=' + id
    });
  },

  /** 查看更多活动:跳转事件时间页 */
  goTimeline() {
    wx.navigateTo({
      url: '/pages/timeline/timeline'
    });
  },

  /** 未登录状态下点击"立即登录":静默登录成功后刷新 */
  doLogin() {
    app.login();
    wx.showLoading({ title: '登录中...' });
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (getToken() || tries >= 10) {
        clearInterval(timer);
        wx.hideLoading();
        if (getToken()) {
          this.loadDynamics();
        } else {
          wx.showToast({ title: '登录失败,请重试', icon: 'none' });
        }
      }
    }, 500);
  },

  switchFamily() {
    // family-tree 是 tabBar 页面,必须用 switchTab 跳转
    wx.switchTab({
      url: '/pages/family-tree/family-tree'
    });
  },

  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    // tabBar 页面必须用 switchTab 跳转,其余用 navigateTo
    const tabBarPages = ['/pages/home/home', '/pages/family-tree/family-tree', '/pages/dynamic/dynamic', '/pages/profile/profile'];
    if (tabBarPages.includes(url)) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  /** 开发模式模拟动态 */
  getMockDynamics() {
    return [
      {
        id: 1,
        userName: '张三',
        time: '2小时前',
        content: '今天整理了家族的老照片，发现了很多珍贵的历史资料，分享给大家看看。',
        images: ['', '', '']
      },
      {
        id: 2,
        userName: '李四',
        time: '5小时前',
        content: '清明节家族祭祖活动圆满结束，感谢各位族人的参与！',
        images: []
      },
      {
        id: 3,
        userName: '王五',
        time: '昨天',
        content: '新添了家族成员信息，欢迎小明加入我们的大家庭！',
        images: []
      }
    ];
  },

  /** 开发模式模拟最近活动 */
  getMockActivities() {
    return [
      { id: 1, day: '15', month: '4月', title: '清明祭祖大典', desc: '全体族人参与，祭祀先祖' },
      { id: 2, day: '01', month: '5月', title: '家族理事会会议', desc: '讨论家族发展事宜' },
      { id: 3, day: '18', month: '6月', title: '端午家族聚会', desc: '包粽子、叙亲情' }
    ];
  },

  /** 开发模式模拟家族名人 */
  getMockFamous() {
    return [
      { id: 1, name: '张太公', title: '家族始祖' },
      { id: 2, name: '张文远', title: '清朝进士' },
      { id: 3, name: '张明德', title: '民国教育家' },
      { id: 4, name: '张国强', title: '现代企业家' },
      { id: 5, name: '张丽华', title: '著名学者' }
    ];
  }
});
