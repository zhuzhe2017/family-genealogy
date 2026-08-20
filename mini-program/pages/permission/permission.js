const app = getApp();
const { auth } = require('../../utils/api');
const { getToken } = require('../../utils/request');
const { USE_MOCK } = require('../../utils/config');
const { resolveImageUrl } = require('../../utils/format');

Page({
  data: {
    online: false,
    loading: false,
    familyName: '',
    leaderUserId: '',
    canManage: false,
    myUserId: '',
    members: [],
    total: 0
  },

  onShow() {
    this.setData({ online: !!app.globalData.isOnline });
    this.loadRoles();
  },

  /** 加载家族成员角色列表（数据源：user.family_id 绑定 + family_permission 角色记录） */
  loadRoles() {
    if (USE_MOCK || !getToken() || !app.globalData.isOnline) {
      this.setData({ members: [], total: 0, loading: false });
      return;
    }
    this.setData({ loading: true });
    auth.getFamilyRoles()
      .then((d) => {
        const myUserId = (app.globalData.userInfo && app.globalData.userInfo.id) || '';
        this.setData({
          loading: false,
          familyName: d.familyName || '',
          leaderUserId: d.leaderUserId || '',
          canManage: !!d.canManage,
          myUserId,
          members: (d.list || []).map((m) => Object.assign({}, m, { avatarFull: resolveImageUrl(m.avatarUrl) })),
          total: d.total || 0
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  /** 切换成员角色（仅族长可见的按钮触发） */
  toggleRole(e) {
    if (!this.data.canManage) return;
    const userId = e.currentTarget.dataset.userId;
    const role = e.currentTarget.dataset.role;
    if (!userId || role === 'leader') return;
    const nextRole = role === 'admin' ? 'member' : 'admin';
    const actionText = nextRole === 'admin' ? '设为管理员' : '取消管理员';
    const content = nextRole === 'admin'
      ? '管理员可协助族长管理家族事务，与家族基金等模块的管理员身份一致。确定设为管理员吗？'
      : '取消后该成员将恢复为普通成员权限。确定取消吗？';
    wx.showModal({
      title: actionText,
      content,
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        auth.setFamilyRole(userId, nextRole)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已' + actionText, icon: 'success' });
            this.loadRoles();
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  }
});
