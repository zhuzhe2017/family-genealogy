const app = getApp();
const { content } = require('../../utils/api');
const { normalizeDynamic } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    dynamics: [],
    loading: true,     // 首屏加载中
    needLogin: false,  // 未登录:显示登录引导,不展示假数据
    loadFailed: false, // 请求失败:清空列表并显示错误占位
    showEmpty: false,  // 已登录但该家族暂无动态
    isMock: false      // 开发模式模拟数据(列表顶部显示角标)
  },

  onLoad() {
    this.loadDynamics();
  },

  /** tabBar 页:每次可见时刷新(家族可能已切换、登录状态可能已变化) */
  onShow() {
    // 显式进入动态列表(首页金刚区/查看更多):不做"族成员" tab 劫持
    if (app.globalData.dynamicFromHome) {
      app.globalData.dynamicFromHome = false;
      this.loadDynamics({ silent: true });
      return;
    }
    // "族成员" tab:已加入家族直达成员列表;未加入/未登录引导进入家族选择页
    if (this.shouldAutoEnterMember()) {
      const skip = app.globalData.skipMemberNav;
      app.globalData.skipMemberNav = false;
      if (skip) {
        // 从成员列表页返回:本次停留在本页,允许继续浏览
        this.loadDynamics({ silent: true });
        return;
      }
      wx.navigateTo({ url: '/pages/member-list/member-list' });
      return;
    }
    // 未加入任何家族:切换到家谱树 tab 的家族选择界面
    wx.switchTab({ url: '/pages/family-tree/family-tree' });
  },

  /** 已加入家族(用户资料带 familyId)时返回 true,此时点击"族成员" tab 无需再选家族 */
  shouldAutoEnterMember() {
    return !!(app.globalData.userInfo && app.globalData.userInfo.familyId);
  },

  /**
   * 加载家族动态
   * - USE_MOCK(开发模式): 展示模拟数据并标注角标
   * - 未登录: 显示登录引导,不展示假数据
   * - 请求失败: 清空列表并显示"加载失败"占位
   * - silent: 已有数据时静默刷新,避免切换 tab 闪加载态
   */
  loadDynamics(opts) {
    const { silent = false } = opts || {};
    const familyId = (app.globalData.currentFamily || {}).id;

    // 开发模式:展示模拟数据并标注
    if (USE_MOCK) {
      this.setData({
        dynamics: this.mockDynamics(),
        isMock: true,
        loading: false,
        needLogin: false,
        loadFailed: false,
        showEmpty: false
      });
      return;
    }

    // 未登录:引导登录,不展示假数据
    if (!getToken()) {
      this.setData({ dynamics: [], needLogin: true, loading: false, loadFailed: false, showEmpty: false, isMock: false });
      return;
    }

    // 未选择家族
    if (!familyId) {
      this.setData({ dynamics: [], showEmpty: true, loading: false, needLogin: false, loadFailed: false, isMock: false });
      return;
    }

    // 已有数据时静默刷新,避免闪加载态
    if (!silent || this.data.dynamics.length === 0) {
      this.setData({ loading: true, needLogin: false, loadFailed: false, isMock: false });
    } else {
      this.setData({ needLogin: false, loadFailed: false, isMock: false });
    }
    content.getList('dynamic', { familyId, page: 1, pageSize: 20 })
      .then((res) => {
        const list = (res.list || []).map(normalizeDynamic);
        this.setData({ dynamics: list, loading: false, showEmpty: list.length === 0 });
      })
      .catch((err) => {
        console.error('动态加载失败', err);
        // 失败不再静默保留假数据,清空并提示
        this.setData({ dynamics: [], loading: false, loadFailed: true, showEmpty: false });
      });
  },

  /** 未登录状态下点击"立即登录":静默登录成功后刷新动态 */
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

  publishDynamic() {
    if (!USE_MOCK && !getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/publish-dynamic/publish-dynamic'
    });
  },

  /** 点赞/取消点赞:未登录不假成功,优先走后端 API */
  likeDynamic(e) {
    if (!USE_MOCK && !getToken()) {
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

    if (!USE_MOCK && getToken()) {
      content.toggleLike(id)
        .then((res) => doToggle(res.isLiked, res.likeCount))
        .catch((err) => {
          console.error('点赞失败,使用本地切换', err);
          const dyn = this.data.dynamics.find(d => String(d.id) === String(id));
          if (dyn) doToggle(!dyn.isLiked, dyn.likeCount + (dyn.isLiked ? -1 : 1));
        });
    } else {
      const dyn = this.data.dynamics.find(d => String(d.id) === String(id));
      if (dyn) doToggle(!dyn.isLiked, dyn.likeCount + (dyn.isLiked ? -1 : 1));
    }
  },

  /** 点击评论:展开评论(仅预览最新 2 条,全部评论跳详情页查看) */
  commentDynamic(e) {
    const id = e.currentTarget.dataset.id;
    const dynamics = this.data.dynamics.map((d, index) => {
      if (String(d.id) === String(id)) {
        const show = !d.showComments;
        if (show && !d.commentsLoaded && !USE_MOCK && getToken()) {
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
    if (!USE_MOCK && !getToken()) {
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
    if (!USE_MOCK && getToken()) {
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
    } else {
      wx.showToast({ title: '评论成功', icon: 'success' });
    }
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
  },

  /** 开发模式模拟数据 */
  mockDynamics() {
    return [
      {
        id: 1,
        userName: '朱三',
        gender: 'male',
        time: '2小时前',
        content: '今天整理了家族的老照片，发现了很多珍贵的历史资料，分享给大家看看。这些照片记录了家族近百年的发展历程，非常珍贵。',
        images: ['', '', '', ''],
        likeCount: 28,
        commentCount: 5,
        isLiked: false,
        comments: [
          { id: 1, userName: '朱四', content: '太珍贵了！' },
          { id: 2, userName: '朱五', content: '感谢分享，这些都是宝贵的历史资料。' }
        ]
      },
      {
        id: 2,
        userName: '朱四',
        gender: 'female',
        time: '5小时前',
        content: '清明节家族祭祖活动圆满结束，感谢各位族人的参与！这次共有50多位族人从各地赶来参加，场面非常感人。',
        images: [''],
        likeCount: 45,
        commentCount: 12,
        isLiked: true,
        comments: [
          { id: 3, userName: '朱三', content: '明年一定参加！' },
          { id: 4, userName: '朱六', content: '辛苦了组织者！' }
        ]
      },
      {
        id: 3,
        userName: '朱五',
        gender: 'male',
        time: '昨天',
        content: '新添了家族成员信息，欢迎小明加入我们的大家庭！希望家族越来越兴旺。',
        images: [],
        likeCount: 18,
        commentCount: 3,
        isLiked: false,
        comments: [
          { id: 5, userName: '朱三', content: '欢迎新成员！' }
        ]
      }
    ];
  }
});
