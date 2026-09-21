const { kinship, auth } = require('../../utils/api');

Page({
  data: {
    familyId: null,
    // 成员A
    searchA: '',
    candidatesA: [],
    selectedA: null,
    showCandidatesA: false,
    // 成员B
    searchB: '',
    candidatesB: [],
    selectedB: null,
    showCandidatesB: false,
    // 查询状态
    loading: false,
    result: null,
    errorMsg: '',
    // 帮助弹窗
    showHelp: false
  },

  onLoad() {
    this.loadFamilyId();
  },

  /** 获取当前用户家族ID */
  async loadFamilyId() {
    try {
      const data = await auth.getMyFamily();
      if (data && data.familyId) {
        this.setData({ familyId: Number(data.familyId) });
      } else {
        this.setData({ errorMsg: '您还未加入家族，请先加入家族后再使用亲缘查询' });
      }
    } catch (e) {
      this.setData({ errorMsg: '获取家族信息失败，请稍后重试' });
    }
  },

  /** 搜索成员A */
  async onSearchA(e) {
    const name = (e.detail.value || '').trim();
    this.setData({ searchA: name, selectedA: null, showCandidatesA: false });
    if (!name || name.length < 1) return;
    if (!this.data.familyId) return;

    try {
      const list = await kinship.searchMembers(this.data.familyId, name);
      this.setData({ candidatesA: list || [], showCandidatesA: true });
    } catch (err) {
      wx.showToast({ title: '搜索失败', icon: 'none' });
    }
  },

  /** 选择成员A */
  onSelectA(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedA: item,
      searchA: item.name,
      showCandidatesA: false
    });
  },

  /** 搜索成员B */
  async onSearchB(e) {
    const name = (e.detail.value || '').trim();
    this.setData({ searchB: name, selectedB: null, showCandidatesB: false });
    if (!name || name.length < 1) return;
    if (!this.data.familyId) return;

    try {
      const list = await kinship.searchMembers(this.data.familyId, name);
      this.setData({ candidatesB: list || [], showCandidatesB: true });
    } catch (err) {
      wx.showToast({ title: '搜索失败', icon: 'none' });
    }
  },

  /** 选择成员B */
  onSelectB(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedB: item,
      searchB: item.name,
      showCandidatesB: false
    });
  },

  /** 选择成员B */
  async onQuery() {
    const { familyId, selectedA, selectedB } = this.data;
    if (!familyId) {
      wx.showToast({ title: '请先加入家族', icon: 'none' });
      return;
    }
    if (!selectedA || !selectedB) {
      wx.showToast({ title: '请选择两位成员', icon: 'none' });
      return;
    }
    if (selectedA.id === selectedB.id) {
      wx.showToast({ title: '不能选择同一位成员', icon: 'none' });
      return;
    }

    this.setData({ loading: true, result: null, errorMsg: '' });

    try {
      const res = await kinship.findCommonAncestor(familyId, selectedA.id, selectedB.id);
      this.setData({ result: res, loading: false });
    } catch (err) {
      this.setData({
        loading: false,
        errorMsg: err.message || '查询失败，请稍后重试'
      });
    }
  },

  /** 重置 */
  onReset() {
    this.setData({
      searchA: '',
      candidatesA: [],
      selectedA: null,
      showCandidatesA: false,
      searchB: '',
      candidatesB: [],
      selectedB: null,
      showCandidatesB: false,
      result: null,
      errorMsg: ''
    });
  },

  /** 切换帮助 */
  onToggleHelp() {
    this.setData({ showHelp: !this.data.showHelp });
  },

  /** 分享 */
  onShareAppMessage() {
    return {
      title: '亲缘查询 - 查找共同祖先',
      path: '/pages/kinship/kinship'
    };
  }
});
