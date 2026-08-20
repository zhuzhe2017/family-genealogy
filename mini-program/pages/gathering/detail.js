const app = getApp();
const { gathering } = require('../../utils/api');

const STATUS_LABELS = { 0: '草稿', 1: '筹备中', 2: '进行中', 3: '已结束', 4: '已归档' };
const DIET_LABELS = { normal: '无要求', vegetarian: '素食', halal: '清真', custom: '其他' };

Page({
  data: {
    familyId: 0,
    id: 0,
    detail: null,
    loading: true,
    // 组织者状态操作按钮
    statusAction: null,
    // 我的报名展示
    myReg: null,
    // 归档资料
    archives: []
  },

  onLoad(options) {
    const family = app.globalData.currentFamily || {};
    this.setData({ familyId: Number(family.id) || 0, id: Number(options.id) || 0 });
  },

  onShow() {
    this.loadDetail();
  },

  loadDetail() {
    if (!this.data.id) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    gathering.getDetail(this.data.familyId, this.data.id)
      .then((data) => {
        const detail = this.decorateDetail(data);
        this.setData({
          detail,
          loading: false,
          statusAction: this.nextAction(data.status),
          myReg: data.myRegistration ? Object.assign({}, data.myRegistration, {
            dietLabel: DIET_LABELS[data.myRegistration.dietType] || data.myRegistration.dietType
          }) : null,
          archives: (data.archives || []).map((a) => Object.assign({}, a, {
            fileUrl: require('../../utils/format').resolveImageUrl(a.fileUrl)
          }))
        });
      })
      .catch((err) => {
        console.error('聚会详情加载失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  /** 详情字段格式化：时间为本地可读格式 */
  decorateDetail(d) {
    if (!d) return null;
    return Object.assign({}, d, {
      startTime: this.fmtTime(d.startTime),
      endTime: this.fmtTime(d.endTime),
      signupDeadline: this.fmtTime(d.signupDeadline),
      sessions: (d.sessions || []).map((s) => Object.assign({}, s, {
        startTime: this.fmtTime(s.startTime),
        endTime: this.fmtTime(s.endTime)
      }))
    });
  },

  /** 当前状态对应的下一步操作（组织者） */
  nextAction(status) {
    const map = {
      0: { label: '发布聚会', to: 1, type: 'publish' },
      1: { label: '开始聚会', to: 2, type: 'start' },
      2: { label: '结束聚会', to: 3, type: 'finish' },
      3: { label: '归档聚会', to: 4, type: 'archive' }
    };
    const action = map[status];
    return action ? Object.assign({}, action, { statusLabel: STATUS_LABELS[status] || '未知' }) : null;
  },

  fmtTime(t) {
    if (!t) return '';
    return String(t).replace('T', ' ').substring(0, 16);
  },

  // ============ 成员操作 ============
  goRegister() {
    const d = this.data.detail;
    if (!d) return;
    wx.navigateTo({ url: `/pages/gathering/register?id=${d.id}&sessions=${encodeURIComponent(JSON.stringify(d.sessions || []))}` });
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/gathering/checkin?id=' + this.data.id });
  },

  cancelRegister() {
    const reg = this.data.myReg;
    if (!reg) return;
    wx.showModal({
      title: '取消报名',
      content: '确定取消本次聚会报名吗？',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        gathering.cancelRegistration(reg.id)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已取消报名', icon: 'success' });
            this.loadDetail();
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' });
          });
      }
    });
  },

  // ============ 组织者操作 ============
  goEdit() {
    wx.navigateTo({ url: '/pages/gathering/edit?id=' + this.data.id });
  },

  goManage() {
    wx.navigateTo({ url: '/pages/gathering/checkin?id=' + this.data.id + '&org=1' });
  },

  runStatusAction() {
    const action = this.data.statusAction;
    const d = this.data.detail;
    if (!action || !d) return;
    wx.showModal({
      title: action.label,
      content: `确认将聚会「${d.title}」${action.label}吗？`,
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        gathering.updateStatus(this.data.familyId, d.id, action.to)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '操作成功', icon: 'success' });
            this.loadDetail();
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  deleteGathering() {
    const d = this.data.detail;
    if (!d) return;
    wx.showModal({
      title: '删除聚会',
      content: '删除后不可恢复（含报名、场次、归档资料），确认删除？',
      confirmColor: '#E64340',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中' });
        gathering.remove(this.data.familyId, d.id)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 800);
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          });
      }
    });
  },

  previewArchive(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  }
});
