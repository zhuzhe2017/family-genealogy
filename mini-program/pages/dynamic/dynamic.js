const app = getApp();
const { content } = require('../../utils/api');
const { normalizeDynamic } = require('../../utils/format');
const { getToken } = require('../../utils/request');

Page({
  data: {
    dynamics: [],
    loading: true,     // 首屏加载中
    needLogin: false,  // 未登录:显示登录引导
    loadFailed: false, // 请求失败:清空列表并显示错误占位
    showEmpty: false   // 已登录但该家族暂无动态
  },

  onLoad() {
    this._entered = false;
    this.loadDynamics();
  },

  /** tabBar 页:每次可见时刷新(家族可能已切换、登录状态可能已变化) */
  onShow() {
    // 首次进入由 onLoad 负责加载,避免重复请求
    if (!this._entered) {
      this._entered = true;
      return;
    }
    this.loadDynamics({ silent: true });
  },

  /** 页面卸载时清理登录轮询定时器,防止卸载后回调触发 setData */
  onUnload() {
    if (this._loginTimer) {
      clearInterval(this._loginTimer);
      this._loginTimer = null;
    }
  },

  /**
   * 加载家族动态
   * - 未登录: 显示登录引导
   * - 请求失败: 清空列表并显示"加载失败"占位
   * - silent: 已有数据时静默刷新,避免切换 tab 闪加载态
   */
  loadDynamics(opts) {
    const { silent = false } = opts || {};
    const familyId = (app.globalData.currentFamily || {}).id;

    // 未登录:引导登录
    if (!getToken()) {
      this.setData({ dynamics: [], needLogin: true, loading: false, loadFailed: false, showEmpty: false });
      return;
    }

    // 未选择家族
    if (!familyId) {
      this.setData({ dynamics: [], showEmpty: true, loading: false, needLogin: false, loadFailed: false });
      return;
    }

    // 已有数据时静默刷新,避免闪加载态
    if (!silent || this.data.dynamics.length === 0) {
      this.setData({ loading: true, needLogin: false, loadFailed: false });
    } else {
      this.setData({ needLogin: false, loadFailed: false });
    }
    content.getList('dynamic', { familyId, page: 1, pageSize: 20 })
      .then((res) => {
        const list = (res.list || []).map(normalizeDynamic);
        this.setData({ dynamics: list, loading: false, showEmpty: list.length === 0 });
      })
      .catch((err) => {
        console.error('动态加载失败', err);
        // 失败时清空列表并提示
        this.setData({ dynamics: [], loading: false, loadFailed: true, showEmpty: false });
      });
  },

  /** 未登录状态下点击"立即登录":静默登录成功后刷新动态 */
  doLogin() {
    app.login();
    wx.showLoading({ title: '登录中...' });
    // 先清理上一次可能仍在轮询的定时器,避免重复计时
    if (this._loginTimer) {
      clearInterval(this._loginTimer);
      this._loginTimer = null;
    }
    let tries = 0;
    this._loginTimer = setInterval(() => {
      tries++;
      if (getToken() || tries >= 10) {
        clearInterval(this._loginTimer);
        this._loginTimer = null;
        wx.hideLoading();
        if (getToken()) {
          this.loadDynamics();
        } else {
          wx.showToast({ title: '登录失败,请重试', icon: 'none' });
        }
      }
    }, 500);
  },

  publishDynamic() {
    if (!getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/publish-dynamic/publish-dynamic'
    });
  },

  /** 点赞/取消点赞:未登录不假成功,优先走后端 API */
  likeDynamic(e) {
    if (!getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const doToggle = (isLiked, likeCount) => {
      const dynamics = this.data.dynamics.map(d => {
        if (String(d.id) === String(id)) {
          return { ...d, isLiked, likeCount };
        }
        return d;
      });
      this.setData({ dynamics });
    };

    content.toggleLike(id)
      .then((res) => doToggle(res.isLiked, res.likeCount))
      .catch((err) => {
        console.error('点赞失败,使用本地切换', err);
        const dyn = this.data.dynamics.find(d => String(d.id) === String(id));
        if (dyn) doToggle(!dyn.isLiked, dyn.likeCount + (dyn.isLiked ? -1 : 1));
      });
  },

  /** 点击评论:展开评论(仅预览最新 2 条,全部评论跳详情页查看) */
  commentDynamic(e) {
    const id = e.currentTarget.dataset.id;
    const dynamics = this.data.dynamics.map((d, index) => {
      if (String(d.id) === String(id)) {
        const show = !d.showComments;
        if (show && !d.commentsLoaded && getToken()) {
          content.getComments(id, { page: 1, pageSize: 2 })
            .then((res) => {
              this.setData({ [`dynamics[${index}].comments`]: (res && res.list) || [] });
            })
            .catch((err) => {
              console.error('评论加载失败', err);
            });
        }
        return { ...d, showComments: show, commentsLoaded: show || d.commentsLoaded };
      }
      return d;
    });
    this.setData({ dynamics });
  },

  /** 点击"查看全部评论":跳转详情页查看完整分页评论 */
  viewAllComments(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/dynamic-detail/dynamic-detail?id=' + id });
  },

  /** 评论输入 */
  onCommentInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`dynamics[${index}].commentDraft`]: e.detail.value });
  },

  /** 提交评论:未登录不假成功 */
  submitComment(e) {
    if (!getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;
    const contentText = (this.data.dynamics[index] && this.data.dynamics[index].commentDraft || '').trim();
    if (!contentText) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '发布中' });
    content.createComment(id, { content: contentText })
      .then(() => {
        wx.hideLoading();
        this.setData({ [`dynamics[${index}].commentDraft`]: '' });
        wx.showToast({ title: '评论成功', icon: 'success' });
        // 刷新评论预览(最新 2 条)与总数
        return content.getComments(id, { page: 1, pageSize: 2 });
      })
      .then((res) => {
        const list = (res && res.list) || [];
        const dynamics = this.data.dynamics.map(d => {
          if (String(d.id) === String(id)) {
            return { ...d, comments: list, commentsLoaded: true, commentCount: (res && res.total) || 0 };
          }
          return d;
        });
        this.setData({ dynamics });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '评论失败', icon: 'none' });
      });
  },

  /** 点击卡片进入动态详情 */
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/dynamic-detail/dynamic-detail?id=' + id });
  },

  /** 分享按钮(open-type=share):记录卡片 id 供分享使用,并阻止冒泡到卡片跳转 */
  onShareTap(e) {
    this._shareId = e.currentTarget.dataset.id;
  },

  /** 评论输入等内部区域的空操作,阻止事件冒泡触发卡片跳转 */
  noop() {},

  /** 好友分享:按分享的卡片生成专属分享卡片,直达动态详情 */
  onShareAppMessage(e) {
    const id = (e.target && e.target.dataset && e.target.dataset.id) || this._shareId;
    const dyn = this.data.dynamics.find(d => String(d.id) === String(id));
    if (dyn) {
      return {
        title: (dyn.userName ? dyn.userName + ':' : '') + (dyn.content || '').slice(0, 30),
        path: '/pages/dynamic-detail/dynamic-detail?id=' + dyn.id,
        imageUrl: (dyn.images && dyn.images[0]) || ''
      };
    }
    return { title: '家族动态', path: '/pages/dynamic/dynamic' };
  },

  /** 朋友圈分享(无事件参数,分享列表页) */
  onShareTimeline() {
    const dyn = this.data.dynamics[0];
    return {
      title: dyn ? (dyn.userName ? dyn.userName + ':' : '') + (dyn.content || '').slice(0, 30) : '家族动态',
      query: dyn ? 'id=' + dyn.id : '',
      imageUrl: (dyn && dyn.images && dyn.images[0]) || ''
    };
  },

  showMore(e) {
    wx.showActionSheet({
      itemList: ['收藏', '举报', '不感兴趣'],
      success: (res) => {
        // 处理操作
      }
    });
  }
});
