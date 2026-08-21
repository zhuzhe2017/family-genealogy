const app = getApp();
const { content } = require('../../utils/api');
const { normalizeDynamic } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    id: '',
    detail: null,
    comments: [],
    commentDraft: '',
    // 评论分页状态
    commentTotal: 0,
    commentPage: 1,
    commentPageSize: 20,
    commentsLoading: false,
    commentsAllLoaded: false,
    loading: true,    // 首屏加载中
    needLogin: false, // 未登录
    loadFailed: false // 加载失败/不存在
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.loadDetail();
  },

  /**
   * 加载动态详情 + 第一页评论
   * - USE_MOCK(开发模式): 展示模拟数据
   * - 未登录: 引导登录
   * - 失败: 显示不存在/下架占位
   */
  loadDetail() {
    const { id } = this.data;
    if (!id) {
      this.setData({ loading: false, loadFailed: true });
      return;
    }

    // 开发模式:展示模拟数据
    if (USE_MOCK) {
      const mock = this.getMockDetail();
      this.setData({ detail: mock.detail, comments: mock.comments, loading: false });
      return;
    }

    // 未登录:引导登录
    if (!getToken()) {
      this.setData({ needLogin: true, loading: false });
      return;
    }

    this.setData({ loading: true, loadFailed: false, needLogin: false });
    Promise.all([
      content.getById('dynamic', id),
      content.getComments(id, { page: 1, pageSize: this.data.commentPageSize })
    ])
      .then(([detail, res]) => {
        const list = (res && res.list) || [];
        this.setData({
          detail: normalizeDynamic(detail),
          comments: list,
          commentTotal: (res && res.total) || 0,
          commentPage: 1,
          commentsAllLoaded: list.length >= ((res && res.total) || 0),
          loading: false
        });
      })
      .catch((err) => {
        console.error('动态详情加载失败', err);
        this.setData({ loading: false, loadFailed: true });
      });
  },

  /** 滚动到底部:加载更多评论 */
  onReachBottom() {
    this.loadMoreComments();
  },

  /** 加载更多评论(分页) */
  loadMoreComments() {
    const { id, commentsLoading, commentsAllLoaded, commentPage, commentPageSize } = this.data;
    if (USE_MOCK || !getToken() || !id || commentsLoading || commentsAllLoaded) {
      return;
    }
    this.setData({ commentsLoading: true });
    content.getComments(id, { page: commentPage + 1, pageSize: commentPageSize })
      .then((res) => {
        const list = (res && res.list) || [];
        this.setData({
          comments: this.data.comments.concat(list),
          commentPage: commentPage + 1,
          commentTotal: (res && res.total) || 0,
          commentsAllLoaded: this.data.comments.length + list.length >= ((res && res.total) || 0),
          commentsLoading: false
        });
      })
      .catch((err) => {
        console.error('评论加载失败', err);
        this.setData({ commentsLoading: false });
      });
  },

  /** 未登录点击"立即登录":静默登录成功后刷新 */
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
          this.loadDetail();
        } else {
          wx.showToast({ title: '登录失败,请重试', icon: 'none' });
        }
      }
    }, 500);
  },

  /** 图片点击查看大图 */
  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    const urls = (this.data.detail && this.data.detail.images) || [];
    wx.previewImage({ current, urls });
  },

  /** 点赞/取消点赞:未登录不假成功 */
  toggleLike() {
    if (!USE_MOCK && !getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const detail = this.data.detail;
    // 开发模式或未登录:本地切换
    if (USE_MOCK || !getToken()) {
      this.setData({
        detail: {
          ...detail,
          isLiked: !detail.isLiked,
          likeCount: detail.likeCount + (detail.isLiked ? -1 : 1)
        }
      });
      return;
    }
    content.toggleLike(detail.id)
      .then((res) => {
        this.setData({ detail: { ...detail, isLiked: res.isLiked, likeCount: res.likeCount } });
      })
      .catch((err) => {
        console.error('点赞失败', err);
        wx.showToast({ title: '操作失败,请重试', icon: 'none' });
      });
  },

  /** 评论输入 */
  onCommentInput(e) {
    this.setData({ commentDraft: e.detail.value });
  },

  /** 提交评论:未登录不假成功 */
  submitComment() {
    if (!USE_MOCK && !getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const text = this.data.commentDraft.trim();
    if (!text) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    const { id } = this.data;
    // 开发模式或未登录:仅提示
    if (USE_MOCK || !getToken()) {
      this.setData({ commentDraft: '' });
      wx.showToast({ title: '评论成功', icon: 'success' });
      return;
    }
    wx.showLoading({ title: '发布中' });
    content.createComment(id, { content: text })
      .then(() => {
        wx.hideLoading();
        this.setData({ commentDraft: '' });
        wx.showToast({ title: '评论成功', icon: 'success' });
        // 刷新第一页评论(最新评论在前,回到页首展示)
        return content.getComments(id, { page: 1, pageSize: this.data.commentPageSize });
      })
      .then((res) => {
        const list = (res && res.list) || [];
        this.setData({
          comments: list,
          commentPage: 1,
          commentTotal: (res && res.total) || 0,
          commentsAllLoaded: list.length >= ((res && res.total) || 0)
        });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '评论失败', icon: 'none' });
      });
  },

  /** 好友分享:卡片直达本条动态详情 */
  onShareAppMessage() {
    const detail = this.data.detail;
    if (detail) {
      return {
        title: (detail.userName ? detail.userName + ':' : '') + (detail.content || '').slice(0, 30),
        path: '/pages/dynamic-detail/dynamic-detail?id=' + detail.id,
        imageUrl: (detail.images && detail.images[0]) || ''
      };
    }
    return { title: '家族动态', path: '/pages/dynamic/dynamic' };
  },

  /** 朋友圈分享 */
  onShareTimeline() {
    const detail = this.data.detail;
    return {
      title: detail ? (detail.userName ? detail.userName + ':' : '') + (detail.content || '').slice(0, 30) : '家族动态',
      query: detail ? 'id=' + detail.id : '',
      imageUrl: (detail && detail.images && detail.images[0]) || ''
    };
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/dynamic/dynamic' }) });
  },

  /** 开发模式模拟数据 */
  getMockDetail() {
    return {
      detail: {
        id: 1,
        userName: '朱三',
        gender: 'male',
        time: '2小时前',
        content: '今天整理了家族的老照片，发现了很多珍贵的历史资料，分享给大家看看。这些照片记录了家族近百年的发展历程，非常珍贵。',
        images: [],
        likeCount: 28,
        commentCount: 2,
        isLiked: false
      },
      comments: [
        { id: 1, userName: '朱四', content: '太珍贵了！' },
        { id: 2, userName: '朱五', content: '感谢分享！' }
      ]
    };
  }
});
