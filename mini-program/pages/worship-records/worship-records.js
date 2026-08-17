const { worship } = require('../../utils/api');
const { getToken } = require('../../utils/request');

const PAGE_SIZE = 20;

/** 各祭祀类型的默认展示文案（记录无内容时兜底） */
const TYPE_LABELS = {
  incense: '为祖先上香祈福',
  pray: '为家族祈福',
  offer: '献上祭品',
  wish: '许下心愿'
};

Page({
  data: {
    familyId: null,
    records: [],
    page: 1,
    hasMore: true,
    loading: false,
    needLogin: false,   // 未登录:引导登录
    loadFailed: false   // 请求失败:显示重试
  },

  onLoad(options) {
    this.setData({ familyId: Number(options.familyId) || null });
  },

  onShow() {
    if (!getToken()) {
      this.setData({ needLogin: true, loadFailed: false });
      return;
    }
    this.setData({ needLogin: false, loadFailed: false, records: [], page: 1, hasMore: true });
    this.loadPage(true);
  },

  /** 上拉触底加载更多 */
  onReachBottom() {
    this.loadPage(false);
  },

  /** 加载一页记录；reset=true 时重载第一页 */
  loadPage(reset) {
    const { familyId, page, hasMore, loading } = this.data;
    if (!familyId || loading || (!reset && !hasMore)) return;

    this.setData({ loading: true });
    worship.getRecordPage(familyId, { page: page, pageSize: PAGE_SIZE })
      .then((res) => {
        const list = ((res && res.list) || []).map((r) => this.toItem(r));
        this.setData({
          records: reset ? list : this.data.records.concat(list),
          page: reset ? 2 : page + 1,
          hasMore: !!(res && res.hasMore),
          loading: false,
          loadFailed: false
        });
      })
      .catch((err) => {
        console.error('祈福记录加载失败', err);
        this.setData({ loading: false });
        if (this.data.records.length === 0) {
          this.setData({ loadFailed: true });
        }
      });
  },

  /** 后端记录条目 → 页面对象 */
  toItem(r) {
    return {
      id: r.id,
      userName: r.userName || '族人',
      time: this.relativeTime(r.createTime),
      content: r.content || TYPE_LABELS[r.type] || '参与祭祀祈福',
      type: r.type
    };
  },

  /** 后端时间字符串 → 相对时间（iOS 需将空格替换为 T 才能解析） */
  relativeTime(time) {
    if (!time) return '';
    const date = new Date(String(time).replace(' ', 'T'));
    if (isNaN(date.getTime())) return String(time).substring(0, 10);
    const diff = Date.now() - date.getTime();
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + '天前';
    return String(time).substring(0, 10);
  },

  retry() {
    this.setData({ records: [], page: 1, hasMore: true });
    this.loadPage(true);
  },

  /** 未登录引导 */
  guideLogin() {
    wx.showModal({
      title: '未登录',
      content: '登录后可查看家族祈福记录',
      confirmText: '去登录',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/login/login' });
        }
      }
    });
  }
});
