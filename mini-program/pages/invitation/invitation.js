const app = getApp();
const { invitation, family } = require('../../utils/api');
const { getToken } = require('../../utils/request');

const STATUS_TEXT = { 0: '已失效', 1: '待接受', 2: '已接受', 3: '已拒绝', 4: '已过期' };
const ROLE_TEXT = { member: '普通会员', admin: '家族管理员' };
const EXPIRE_OPTIONS = [
  { label: '1天', value: 1 },
  { label: '3天', value: 3 },
  { label: '7天', value: 7 },
  { label: '15天', value: 15 },
  { label: '30天', value: 30 }
];

Page({
  data: {
    userInfo: null,
    familyInfo: {},
    activeTab: 'sent',
    sentList: [],
    receivedList: [],
    sentPage: 1,
    receivedPage: 1,
    pageSize: 20,
    sentTotal: 0,
    receivedTotal: 0,
    sentLoading: false,
    receivedLoading: false,
    sentRefreshing: false,
    receivedRefreshing: false,
    sentHasMore: true,
    receivedHasMore: true,
    // 创建弹层
    showCreateModal: false,
    createRole: 'member',
    createExpireDays: 7,
    createPhone: '',
    createEmail: '',
    createSubmitting: false,
    expireOptions: EXPIRE_OPTIONS,
    roleOptions: [
      { label: '普通会员', value: 'member' },
      { label: '家族管理员', value: 'admin' }
    ],
    roleIndex: 0,
    expireIndex: 2,
    // 分享弹层
    shareInvitation: null,
    showShareModal: false
  },

  onLoad() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || null;
    const familyInfo = app.globalData.currentFamily || {};
    this.setData({ userInfo, familyInfo });
  },

  onShow() {
    if (!getToken()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.refreshAll();
  },

  refreshAll() {
    this.setData({ sentPage: 1, receivedPage: 1, sentList: [], receivedList: [] });
    this.loadSentList();
    this.loadReceivedList();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'sent' && !this.data.sentList.length) this.loadSentList();
    if (tab === 'received' && !this.data.receivedList.length) this.loadReceivedList();
  },

  // ---------- 发出的邀请 ----------
  loadSentList() {
    if (this.data.sentLoading || (!this.data.sentHasMore && this.data.sentPage > 1)) return;
    this.setData({ sentLoading: true });
    invitation.getSentList({ page: this.data.sentPage, pageSize: this.data.pageSize })
      .then((res) => {
        const list = res.list || [];
        const merged = this.data.sentPage === 1 ? list : this.data.sentList.concat(list);
        this.setData({
          sentList: merged,
          sentTotal: res.total || 0,
          sentHasMore: list.length >= this.data.pageSize,
          sentPage: this.data.sentPage + 1
        });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ sentLoading: false, sentRefreshing: false });
      });
  },

  onSentRefresh() {
    this.setData({ sentRefreshing: true, sentPage: 1, sentList: [] });
    this.loadSentList();
  },

  onSentLoadMore() {
    this.loadSentList();
  },

  // ---------- 收到的邀请 ----------
  loadReceivedList() {
    if (this.data.receivedLoading || (!this.data.receivedHasMore && this.data.receivedPage > 1)) return;
    this.setData({ receivedLoading: true });
    invitation.getReceivedList({ page: this.data.receivedPage, pageSize: this.data.pageSize })
      .then((res) => {
        const list = res.list || [];
        const merged = this.data.receivedPage === 1 ? list : this.data.receivedList.concat(list);
        this.setData({
          receivedList: merged,
          receivedTotal: res.total || 0,
          receivedHasMore: list.length >= this.data.pageSize,
          receivedPage: this.data.receivedPage + 1
        });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ receivedLoading: false, receivedRefreshing: false });
      });
  },

  onReceivedRefresh() {
    this.setData({ receivedRefreshing: true, receivedPage: 1, receivedList: [] });
    this.loadReceivedList();
  },

  onReceivedLoadMore() {
    this.loadReceivedList();
  },

  // ---------- 创建邀请 ----------
  openCreateModal() {
    const familyInfo = app.globalData.currentFamily || {};
    if (!familyInfo.id) {
      wx.showToast({ title: '请先加入家族', icon: 'none' });
      return;
    }
    this.setData({
      showCreateModal: true,
      createRole: 'member',
      createExpireDays: 7,
      createPhone: '',
      createEmail: ''
    });
  },

  closeCreateModal() {
    this.setData({ showCreateModal: false });
  },

  noop() {},

  onRoleChange(e) {
    const idx = Number(e.detail.value) || 0;
    const item = this.data.roleOptions[idx];
    this.setData({ createRole: item ? item.value : 'member', roleIndex: idx });
  },

  onExpireChange(e) {
    const idx = Number(e.detail.value) || 0;
    const item = EXPIRE_OPTIONS[idx];
    this.setData({ createExpireDays: item ? item.value : 7, expireIndex: idx });
  },

  onPhoneInput(e) {
    this.setData({ createPhone: e.detail.value });
  },

  onEmailInput(e) {
    this.setData({ createEmail: e.detail.value });
  },

  submitCreate() {
    if (this.data.createSubmitting) return;
    const familyInfo = app.globalData.currentFamily || {};
    const phone = String(this.data.createPhone || '').trim();
    const email = String(this.data.createEmail || '').trim();
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      wx.showToast({ title: '邮箱格式不正确', icon: 'none' });
      return;
    }
    this.setData({ createSubmitting: true });
    invitation.create({
      familyId: familyInfo.id,
      inviteePhone: phone || undefined,
      inviteeEmail: email || undefined,
      role: this.data.createRole,
      expireDays: this.data.createExpireDays,
      channel: 'wechat'
    }).then((item) => {
      wx.showToast({ title: '邀请创建成功', icon: 'success' });
      this.setData({ showCreateModal: false });
      this.openShareModal(item);
      this.setData({ sentPage: 1, sentList: [] });
      this.loadSentList();
    }).catch((err) => {
      wx.showToast({ title: err.message || '创建失败', icon: 'none', duration: 2500 });
    }).finally(() => {
      this.setData({ createSubmitting: false });
    });
  },

  // ---------- 分享 ----------
  openShareModal(item) {
    this.setData({ shareInvitation: item, showShareModal: true });
  },

  closeShareModal() {
    this.setData({ showShareModal: false });
  },

  /** 跳转分享海报页（自定义样式 + 小程序码 + 多渠道分享） */
  goPoster(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.navigateTo({ url: '/pages/share-poster/share-poster?code=' + code });
  },

  copyCode() {
    const code = this.data.shareInvitation?.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    });
  },

  copyLink() {
    const code = this.data.shareInvitation?.inviteCode;
    if (!code) return;
    const link = `pages/invite-accept/invite-accept?code=${code}`;
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: '邀请链接已复制', icon: 'success' })
    });
  },

  onShareAppMessage() {
    const item = this.data.shareInvitation;
    if (!item) return;
    return {
      title: `${this.data.userInfo?.nickname || '家族成员'} 邀请您加入家族`,
      path: `pages/invite-accept/invite-accept?code=${item.inviteCode}`,
      imageUrl: this.data.familyInfo?.logo || ''
    };
  },

  // ---------- 列表操作 ----------
  onShareItem(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || item.status !== 1) return;
    this.openShareModal(item);
  },

  onRevoke(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '撤销邀请',
      content: '撤销后该邀请码将失效，确定撤销吗？',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        invitation.revoke(id).then(() => {
          wx.showToast({ title: '已撤销', icon: 'success' });
          this.setData({ sentPage: 1, sentList: [] });
          this.loadSentList();
        }).catch((err) => {
          wx.showToast({ title: err.message || '撤销失败', icon: 'none' });
        });
      }
    });
  },

  onAccept(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || item.status !== 1) return;
    wx.showModal({
      title: '接受邀请',
      content: `接受后将加入「${item.familyName || '该家族'}」，确定接受吗？`,
      success: (res) => {
        if (!res.confirm) return;
        invitation.process({ inviteCode: item.inviteCode, accept: true }).then(() => {
          wx.showToast({ title: '加入成功', icon: 'success' });
          // 刷新全局家族信息
          this.refreshUserFamily();
          this.setData({ receivedPage: 1, receivedList: [] });
          this.loadReceivedList();
        }).catch((err) => {
          wx.showToast({ title: err.message || '接受失败', icon: 'none', duration: 2500 });
        });
      }
    });
  },

  onReject(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || item.status !== 1) return;
    wx.showModal({
      title: '拒绝邀请',
      content: '确定拒绝该家族邀请吗？',
      success: (res) => {
        if (!res.confirm) return;
        invitation.process({ inviteCode: item.inviteCode, accept: false, remark: '用户拒绝' }).then(() => {
          wx.showToast({ title: '已拒绝', icon: 'success' });
          this.setData({ receivedPage: 1, receivedList: [] });
          this.loadReceivedList();
        }).catch((err) => {
          wx.showToast({ title: err.message || '拒绝失败', icon: 'none' });
        });
      }
    });
  },

  refreshUserFamily() {
    const api = require('../../utils/api').auth;
    api.getMyFamily().then((data) => {
      app.globalData.currentFamily = data.family || {};
      app.globalData.userInfo = Object.assign(app.globalData.userInfo || {}, data.userInfo || {});
      this.setData({ familyInfo: app.globalData.currentFamily, userInfo: app.globalData.userInfo });
    }).catch(() => {});
  },

  formatStatus(status) {
    return STATUS_TEXT[status] || '未知';
  },

  formatRole(role) {
    return ROLE_TEXT[role] || role;
  }
});
