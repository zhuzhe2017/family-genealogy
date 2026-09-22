const { kinship } = require('../../utils/api');

Page({
  data: {
    familyId: null,
    // 成员A
    searchA: '',
    candidatesA: [],
    selectedA: null,
    showCandidatesA: false,
    searchEmptyA: false,
    searchingA: false,
    // 成员B
    searchB: '',
    candidatesB: [],
    selectedB: null,
    showCandidatesB: false,
    searchEmptyB: false,
    searchingB: false,
    // 查询状态
    loading: false,
    result: null,
    errorMsg: '',
    // 帮助弹窗
    showHelp: false
  },

  onLoad() {
    // 防抖定时器
    this._debounceTimerA = null;
    this._debounceTimerB = null;
    this._lastFamilyId = null;
  },

  onShow() {
    // 每次进入页面刷新全局当前家族（与其他页面约定一致）
    this.loadFamilyId();
  },

  onUnload() {
    // 清理定时器
    if (this._debounceTimerA) clearTimeout(this._debounceTimerA);
    if (this._debounceTimerB) clearTimeout(this._debounceTimerB);
  },

  /** 获取全局当前家族ID，切换家族后重置查询状态 */
  loadFamilyId() {
    const family = (getApp().globalData || {}).currentFamily || {};
    const familyId = family.id ? Number(family.id) : null;
    if (familyId === this._lastFamilyId) return;
    this._lastFamilyId = familyId;
    this.setData({
      familyId,
      searchA: '', candidatesA: [], selectedA: null, showCandidatesA: false, searchEmptyA: false, searchingA: false,
      searchB: '', candidatesB: [], selectedB: null, showCandidatesB: false, searchEmptyB: false, searchingB: false,
      result: null,
      errorMsg: familyId ? '' : '您还未加入家族，请先加入家族后再使用亲缘查询'
    });
  },

  /** 搜索成员A（300ms 防抖，至少输入 2 个字） */
  onSearchA(e) {
    const name = (e.detail.value || '').trim();
    this.setData({ searchA: name, selectedA: null, showCandidatesA: false, searchEmptyA: false });

    if (this._debounceTimerA) clearTimeout(this._debounceTimerA);
    if (name.length < 2) {
      this.setData({ searchingA: false, candidatesA: [] });
      return;
    }
    if (!this.data.familyId) return;

    this.setData({ searchingA: true });
    this._debounceTimerA = setTimeout(() => {
      this._doSearchA(name);
    }, 300);
  },

  /** 实际执行搜索A */
  async _doSearchA(name) {
    try {
      const list = await kinship.searchMembers(this.data.familyId, name);
      // 响应回来时输入已变化则丢弃，避免旧结果覆盖新结果
      if (this.data.searchA !== name) return;
      this.setData({ candidatesA: list || [], showCandidatesA: true, searchEmptyA: !(list && list.length), searchingA: false });
    } catch (err) {
      if (this.data.searchA !== name) return;
      this.setData({ searchingA: false });
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' });
    }
  },

  /** 选择成员A */
  onSelectA(e) {
    if (this._debounceTimerA) clearTimeout(this._debounceTimerA);
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedA: item,
      searchA: item.name,
      showCandidatesA: false,
      searchEmptyA: false,
      searchingA: false
    });
  },

  /** 仅清除成员A输入 */
  onClearA() {
    if (this._debounceTimerA) clearTimeout(this._debounceTimerA);
    this.setData({ searchA: '', candidatesA: [], selectedA: null, showCandidatesA: false, searchEmptyA: false, searchingA: false });
  },

  /** 搜索成员B（300ms 防抖，至少输入 2 个字） */
  onSearchB(e) {
    const name = (e.detail.value || '').trim();
    this.setData({ searchB: name, selectedB: null, showCandidatesB: false, searchEmptyB: false });

    if (this._debounceTimerB) clearTimeout(this._debounceTimerB);
    if (name.length < 2) {
      this.setData({ searchingB: false, candidatesB: [] });
      return;
    }
    if (!this.data.familyId) return;

    this.setData({ searchingB: true });
    this._debounceTimerB = setTimeout(() => {
      this._doSearchB(name);
    }, 300);
  },

  /** 实际执行搜索B */
  async _doSearchB(name) {
    try {
      const list = await kinship.searchMembers(this.data.familyId, name);
      if (this.data.searchB !== name) return;
      this.setData({ candidatesB: list || [], showCandidatesB: true, searchEmptyB: !(list && list.length), searchingB: false });
    } catch (err) {
      if (this.data.searchB !== name) return;
      this.setData({ searchingB: false });
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' });
    }
  },

  /** 选择成员B */
  onSelectB(e) {
    if (this._debounceTimerB) clearTimeout(this._debounceTimerB);
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedB: item,
      searchB: item.name,
      showCandidatesB: false,
      searchEmptyB: false,
      searchingB: false
    });
  },

  /** 仅清除成员B输入 */
  onClearB() {
    if (this._debounceTimerB) clearTimeout(this._debounceTimerB);
    this.setData({ searchB: '', candidatesB: [], selectedB: null, showCandidatesB: false, searchEmptyB: false, searchingB: false });
  },

  /** 执行共同祖先查询 */
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
      // 分叉树：共同祖先为根，向下分两路分别到成员A、成员B
      let treeView = null;
      if (res.path) {
        const revA = [...res.path.pathToA].reverse(); // 共同祖先 → A
        const revB = [...res.path.pathToB].reverse(); // 共同祖先 → B
        treeView = {
          root: revA[0],
          branchA: revA.slice(1),
          branchB: revB.slice(1),
          depthA: revA.length - 1,
          depthB: revB.length - 1
        };
      }
      this.setData({ result: { ...res, commonAncestor: res.commonAncestor ? { ...res.commonAncestor, avatarChar: res.commonAncestor.name.slice(0, 1) } : null, treeView }, loading: false });
    } catch (err) {
      this.setData({
        loading: false,
        errorMsg: err.message || '查询失败，请稍后重试'
      });
    }
  },

  /** 重置 */
  onReset() {
    if (this._debounceTimerA) clearTimeout(this._debounceTimerA);
    if (this._debounceTimerB) clearTimeout(this._debounceTimerB);
    this.setData({
      searchA: '',
      candidatesA: [],
      selectedA: null,
      showCandidatesA: false,
      searchEmptyA: false,
      searchingA: false,
      searchB: '',
      candidatesB: [],
      selectedB: null,
      showCandidatesB: false,
      searchEmptyB: false,
      searchingB: false,
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
