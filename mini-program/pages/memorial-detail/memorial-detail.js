const { worship } = require('../../utils/api');
const { getToken } = require('../../utils/request');

/** 各祭祀类型的默认展示文案（记录无内容时兜底） */
const TYPE_LABELS = {
  incense: '为祖先上香祈福',
  pray: '为家族祈福',
  offer: '献上祭品',
  wish: '许下心愿'
};

Page({
  data: {
    id: null,
    familyId: null,
    memorial: null,     // 纪念对象信息
    records: [],        // 家族最近祭祀记录
    loading: true,
    needLogin: false,
    loadFailed: false
  },

  onLoad(options) {
    this.setData({ id: Number(options.id) || null, familyId: Number(options.familyId) || null });
  },

  onShow() {
    this.loadDetail();
  },

  loadDetail() {
    const { id, familyId } = this.data;
    if (!getToken()) {
      this.setData({ loading: false, needLogin: true, loadFailed: false });
      return;
    }
    if (!id || !familyId) {
      this.setData({ loading: false, needLogin: false, loadFailed: true });
      return;
    }

    this.setData({ loading: true, needLogin: false, loadFailed: false });
    worship.getMemorialDetail(familyId, id)
      .then((res) => {
        const m = res.memorial || {};
        this.setData({
          memorial: {
            id: m.id,
            memberName: m.memberName || '先祖',
            avatarUrl: m.avatarUrl || '',
            epitaph: m.epitaph || '',
            life: [m.birthDate, m.deathDate].filter(Boolean).join(' - ') || '生卒不详'
          },
          records: ((res.records) || []).map((r) => this.toItem(r)),
          loading: false
        });
      })
      .catch((err) => {
        console.error('纪念详情加载失败', err);
        this.setData({ loading: false, loadFailed: true });
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
    this.loadDetail();
  },

  /** 未登录引导 */
  guideLogin() {
    wx.showModal({
      title: '未登录',
      content: '登录后可查看纪念详情',
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
