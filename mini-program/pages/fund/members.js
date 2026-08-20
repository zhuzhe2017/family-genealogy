const app = getApp();
const { fund, familyMember } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

const PERM_OPTIONS = [
  { key: 'deposit', label: '存入', desc: '向基金存入资金' },
  { key: 'withdraw', label: '取出', desc: '从基金取出资金' },
  { key: 'transfer', label: '转账', desc: '向其他成员转账' },
  { key: 'view_all', label: '查看全部明细', desc: '查看所有成员交易记录' },
  { key: 'approve', label: '审批大额取出', desc: '审批待审批的取出申请' },
  { key: 'manage_member', label: '成员权限管理', desc: '添加/移除成员、分配权限' },
  { key: 'manage_rule', label: '基金规则设置', desc: '修改基金信息与限额' },
  { key: 'dissolve', label: '解散基金', desc: '解散家族基金' }
];

const ROLES = [
  { value: 'admin', label: '管理员' },
  { value: 'member', label: '普通成员' }
];

Page({
  data: {
    familyId: 0,
    members: [],
    loading: true,
    canManage: false,
    isLeader: false,
    showAdd: false,
    candidates: [],
    showEdit: false,
    editing: null,
    editRoleIndex: 0,
    editPerms: [],
    permOptions: PERM_OPTIONS,
    roles: ROLES
  },

  onLoad(options) {
    this.setData({ familyId: Number(options.familyId) || 0 });
  },

  onShow() {
    this.load();
  },

  load() {
    const familyId = this.data.familyId;
    if (!familyId || (!USE_MOCK && !getToken())) {
      this.setData({ loading: false });
      return;
    }
    Promise.all([fund.getMembers(familyId), fund.getInfo(familyId).catch(() => null)])
      .then(([res, info]) => {
        const canManage = !!(info && (info.permissions || []).includes('manage_member'));
        const members = (res.list || []).map((m) =>
          Object.assign({}, m, {
            permLabels: (m.permissions || []).map((p) => {
              const found = PERM_OPTIONS.find((o) => o.key === p);
              return found ? found.label : p;
            })
          })
        );
        this.setData({
          members,
          loading: false,
          canManage,
          isLeader: !!(info && info.isLeader)
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  /** 打开添加成员面板 */
  openAdd() {
    const familyId = this.data.familyId;
    if (!this.data.canManage) return;
    familyMember.getAll(familyId, {})
      .then((list) => {
        const inFund = (this.data.members || []).map((m) => String(m.memberId));
        const candidates = (list || [])
          .map((m) => ({ memberId: String(m.id), name: m.name || '未命名' }))
          .filter((m) => !inFund.includes(m.memberId));
        this.setData({ candidates, showAdd: true });
        if (candidates.length === 0) {
          wx.showToast({ title: '没有可添加的成员（需已绑定账号）', icon: 'none' });
          this.setData({ showAdd: false });
        }
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '成员加载失败', icon: 'none' });
      });
  },

  closeAdd() {
    this.setData({ showAdd: false });
  },

  noop() {},

  addCandidate(e) {
    const memberId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '添加中' });
    fund.addMember(this.data.familyId, { memberId })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已添加', icon: 'success' });
        this.setData({ showAdd: false });
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
      });
  },

  /** 打开成员编辑面板 */
  openEdit(e) {
    if (!this.data.canManage) return;
    const userId = e.currentTarget.dataset.userid;
    const member = (this.data.members || []).find((m) => String(m.userId) === String(userId));
    if (!member || member.role === 'leader') return;
    const roleIndex = Math.max(0, ROLES.findIndex((r) => r.value === member.role));
    this.setData({
      editing: member,
      showEdit: true,
      editRoleIndex: roleIndex,
      editPerms: member.permissions || []
    });
  },

  closeEdit() {
    this.setData({ showEdit: false, editing: null });
  },

  onRoleChange(e) {
    this.setData({ editRoleIndex: Number(e.detail.value) });
  },

  onPermChange(e) {
    const key = e.currentTarget.dataset.key;
    const checked = e.detail.value;
    const perms = this.data.editPerms.slice();
    if (checked && !perms.includes(key)) {
      perms.push(key);
    } else if (!checked) {
      const i = perms.indexOf(key);
      if (i >= 0) perms.splice(i, 1);
    }
    this.setData({ editPerms: perms });
  },

  saveMember() {
    const { editing, editRoleIndex, editPerms } = this.data;
    if (!editing) return;
    wx.showLoading({ title: '保存中' });
    fund.updateMember(this.data.familyId, editing.userId, {
      role: ROLES[editRoleIndex].value,
      permissions: editPerms
    })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        this.setData({ showEdit: false, editing: null });
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  },

  removeMember() {
    const { editing } = this.data;
    if (!editing) return;
    wx.showModal({
      title: '移除成员',
      content: `确定将「${editing.name}」移出基金吗？`,
      confirmText: '移除',
      confirmColor: '#E64340',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '移除中' });
        fund.removeMember(this.data.familyId, editing.userId)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已移除', icon: 'success' });
            this.setData({ showEdit: false, editing: null });
            this.load();
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' });
          });
      }
    });
  }
});
