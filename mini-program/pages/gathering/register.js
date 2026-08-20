const app = getApp();
const { gathering } = require('../../utils/api');

const DIET_OPTIONS = [
  { value: 'normal', label: '无要求' },
  { value: 'vegetarian', label: '素食' },
  { value: 'halal', label: '清真' },
  { value: 'custom', label: '其他' }
];

Page({
  data: {
    familyId: 0,
    id: 0,
    title: '',
    loading: false,
    // 场次选择（详情页传入，可为空数组=不选场次）
    sessions: [],
    sessionIndex: 0,
    // 表单
    form: {
      name: '',
      phone: '',
      dietType: 'normal',
      dietNote: '',
      specialNeed: '',
      guestCount: 0
    },
    dietOptions: DIET_OPTIONS,
    // 报名成功回执
    receipt: null
  },

  onLoad(options) {
    const family = app.globalData.currentFamily || {};
    let sessions = [];
    if (options.sessions) {
      try {
        sessions = JSON.parse(decodeURIComponent(options.sessions));
      } catch (e) {
        sessions = [];
      }
    }
    this.setData({
      familyId: Number(family.id) || 0,
      id: Number(options.id) || 0,
      title: options.title ? decodeURIComponent(options.title) : '',
      sessions: sessions || []
    });
  },

  // ============ 表单输入 ============
  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  onSessionChange(e) {
    this.setData({ sessionIndex: Number(e.detail.value) || 0 });
  },

  onDietChange(e) {
    this.setData({ 'form.dietType': e.detail.value });
  },

  onGuestChange(e) {
    let v = Number(e.detail.value);
    if (isNaN(v) || v < 0) v = 0;
    if (v > 10) v = 10;
    this.setData({ 'form.guestCount': v });
  },

  // ============ 提交 ============
  submit() {
    const { form, sessions, sessionIndex, id, familyId } = this.data;
    const name = String(form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写参会人姓名', icon: 'none' });
      return;
    }
    const phone = String(form.phone || '').trim();
    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (sessions.length && sessionIndex >= sessions.length) {
      wx.showToast({ title: '请选择参与场次', icon: 'none' });
      return;
    }
    const selected = sessions.length ? sessions[sessionIndex] : null;
    const payload = {
      sessionId: selected ? selected.id : undefined,
      name,
      phone,
      dietType: form.dietType,
      dietNote: String(form.dietNote || '').trim(),
      specialNeed: String(form.specialNeed || '').trim(),
      guestCount: Number(form.guestCount) || 0
    };

    this.setData({ loading: true });
    gathering.register(familyId, id, payload)
      .then((res) => {
        this.setData({ loading: false, receipt: res });
        wx.showToast({ title: '报名成功', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '报名失败', icon: 'none' });
      });
  },

  // 回执页：查看我的签到码
  goCheckin() {
    wx.navigateTo({ url: '/pages/gathering/checkin?id=' + this.data.id });
  },

  // 回执页：返回详情
  backDetail() {
    wx.navigateBack();
  }
});
