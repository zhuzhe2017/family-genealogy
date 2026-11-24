/**
 * 亲属关系推算工具
 *
 * 功能：
 *  1. 从本家族成员中选择两位（A 和 B）
 *  2. 调后端 POST /ai/:familyId/relation → 返回 AI 推算结果
 *  3. 展示自然语言关系 + 详细解释 + 共同祖先链
 */
const api = require('../../utils/api.js');

Page({
  data: {
    familyId: null,
    members: [],          // 本家族成员列表 [{ id, name, generation, father_name, mother_name }]
    memberA: null,         // { id, name }
    memberB: null,
    selectTarget: '',      // 'A' | 'B'
    showPicker: false,
    pickerSearch: '',
    filteredMembers: [],

    calculating: false,
    result: null,          // { relation, explanation }
    errorMsg: ''
  },

  onLoad: function (query) {
    const familyId = query.familyId ? Number(query.familyId) : this.getCurrentFamilyId();
    if (!familyId) {
      wx.showToast({ title: '请先绑定家族', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.setData({ familyId });
    this.loadMembers();
  },

  // ============ 加载成员列表 ============
  loadMembers: function () {
    // 调用成员列表 API（复用现有 familyMember 域）
    api.familyMember.getAll(this.data.familyId).then(res => {
      const list = (res.data && res.data.list) || (Array.isArray(res.data) ? res.data : []);
      // 扁平化 member 对象（适配不同 API 响应结构）
      const members = list.map(m => ({
        id: String(m.id || m.member_id || ''),
        name: m.name || m.member_name || m.full_name || '',
        generation: m.generation || m.generation_no || 0
      })).filter(m => m.id && m.name);

      this.setData({ members, filteredMembers: members });
    }).catch(err => {
      wx.showToast({ title: err.msg || '加载成员失败', icon: 'none' });
    });
  },

  // ============ 选人弹窗 ============
  onSelectA: function () {
    this.openPicker('A');
  },
  onSelectB: function () {
    this.openPicker('B');
  },
  openPicker: function (target) {
    if (this.data.members.length === 0) {
      wx.showToast({ title: '请先加载家族成员', icon: 'none' });
      return;
    }
    this.setData({ selectTarget: target, showPicker: true, pickerSearch: '', filteredMembers: this.data.members });
  },
  closePicker: function () {
    this.setData({ showPicker: false });
  },
  onPickerSearch: function (e) {
    const kw = (e.detail.value || '').trim();
    const filtered = kw
      ? this.data.members.filter(m => m.name.includes(kw))
      : this.data.members;
    this.setData({ pickerSearch: kw, filteredMembers: filtered });
  },
  onPickMember: function (e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (this.data.selectTarget === 'A') {
      this.setData({ memberA: { id, name } });
    } else {
      this.setData({ memberB: { id, name } });
    }
    this.setData({ showPicker: false, result: null });
  },
  swapMembers: function () {
    this.setData({ memberA: this.data.memberB, memberB: this.data.memberA, result: null });
  },
  resetSelection: function () {
    this.setData({ memberA: null, memberB: null, result: null, errorMsg: '' });
  },

  // ============ 调后端推算 ============
  calculate: function () {
    if (!this.data.memberA || !this.data.memberB) {
      wx.showToast({ title: '请选择两位成员', icon: 'none' });
      return;
    }
    if (this.data.memberA.id === this.data.memberB.id) {
      wx.showToast({ title: '请选择不同成员', icon: 'none' });
      return;
    }

    this.setData({ calculating: true, result: null, errorMsg: '' });
    api.aiAssistant.calcRelation(this.data.familyId, {
      memberIdA: this.data.memberA.id,
      memberIdB: this.data.memberB.id
    }).then(res => {
      this.setData({
        calculating: false,
        result: res.data,
        errorMsg: ''
      });
    }).catch(err => {
      this.setData({ calculating: false, result: null });
      const msg = err && err.msg ? err.msg : '推算失败';
      wx.showModal({ title: '推算失败', content: msg, showCancel: false });
    });
  },

  // ============ 工具 ============
  getCurrentFamilyId: function () {
    try { const info = wx.getStorageSync('current_family'); return info ? Number(info.id) : null; }
    catch { return null; }
  }
});
