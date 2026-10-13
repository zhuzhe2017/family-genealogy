const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { getToken } = require('../../utils/request');

const PAGE_SIZE = 15;

Page({
  data: {
    totalMembers: 0,
    maleCount: 0,
    femaleCount: 0,
    groupedMembers: [],
    // 搜索状态
    keyword: '',          // 输入框内容
    searching: false,     // 是否处于搜索态（点击搜索按钮后置 true）
    showSearchBtn: false, // 输入 >=2 字符时显示搜索按钮
    // 分页状态
    page: 1,
    hasMore: true,
    loading: false,       // 首页/搜索/重置加载
    loadingMore: false,   // 上拉加载
    noMore: false,        // 已加载全部
    loadError: false,     // 加载失败（用于展示重试）
    // 筛选状态
    filter: { gender: '', sort: '' },
    // 按代筛选(从首页字辈点击进入时携带)
    generation: 0,
    generationName: '',
    navTitle: '',          // 当前筛选标题(如 "德字辈成员"),用于顶部标签展示
    familyId: ''           // URL 传入的家族ID,优先于 globalData,避免切换家族后串数据
  },

  onLoad(options) {
    // 解析字辈跳转参数:generation(第几代)、generationName(字辈文字)
    const params = this.parseGenerationParams(options);
    if (params.error) {
      // 参数异常:提示后仍展示全部成员,不中断页面
      wx.showToast({ title: params.error, icon: 'none', duration: 2500 });
    }
    const next = { generation: params.generation, generationName: params.generationName };
    // 解析 URL 传入的 familyId(字辈跳转会携带),优先于 globalData;统一转字符串避免类型不一致
    try {
      next.familyId = String(decodeURIComponent((options && options.familyId) || '') || (app.globalData.currentFamily || {}).id || '');
    } catch (e) {
      next.familyId = String((app.globalData.currentFamily || {}).id || '');
    }
    if (params.generation > 0) {
      next.navTitle = params.generationName
        ? params.generationName + '字辈成员'
        : '第' + params.generation + '代成员';
      wx.setNavigationBarTitle({ title: next.navTitle });
    }
    // 先同步写入参数再加载,避免 fetchPage 读到旧 generation
    this.setData(next, () => {
      // 存在待消费的 tab 筛选参数(首页“字辈→族成员”入口)时交由 onShow 统一加载,避免重复请求
      if (app.globalData.memberListFilter) return;
      this.refresh();
    });
  },

  /**
   * 族成员已是 tabBar 页面,switchTab 无法携带参数:
   * 消费首页“字辈→族成员”入口经 globalData 传入的筛选条件,读取后立即清空避免残留
   */
  onShow() {
    const pending = app.globalData.memberListFilter;
    if (!pending) return;
    app.globalData.memberListFilter = null;
    const generation = Number(pending.generation) || 0;
    const generationName = pending.generationName || '';
    this.setData({
      familyId: pending.familyId ? String(pending.familyId) : String(this.data.familyId || ''),
      generation,
      generationName,
      navTitle: generation > 0
        ? (generationName ? generationName + '字辈成员' : '第' + generation + '代成员')
        : ''
    }, () => {
      this.refresh();
    });
  },

  /** 解析并校验字辈跳转参数,返回 { generation, generationName, error } */
  parseGenerationParams(options) {
    const o = options || {};
    const result = { generation: 0, generationName: '', error: '' };
    const rawGen = o.generation;
    // 未传 generation 视为普通进入(展示全部成员),非错误
    if (rawGen === undefined || rawGen === null || rawGen === '') {
      return result;
    }
    const gen = Number(rawGen);
    if (!Number.isInteger(gen) || gen < 1) {
      result.error = '字辈代数参数无效';
      return result;
    }
    result.generation = gen;
    try {
      result.generationName = decodeURIComponent(o.generationName || '').trim();
    } catch (e) {
      // 解码失败(异常编码),仅提示,仍按代数筛选
      result.generationName = '';
      result.error = '字辈名称解析失败,已按代数筛选';
    }
    return result;
  },

  /** 重置并加载第一页 */
  refresh() {
    this._all = [];
    this.setData({ loading: true, loadError: false, noMore: false, groupedMembers: [] });
    this.fetchPage(1, true);
  },

  /** 拉取一页数据。reset 为 true 表示第一页（清空已加载列表） */
  fetchPage(page, reset) {
    // 优先用 URL 传入的 familyId(字辈跳转会携带),避免切换家族后串数据;为空回退 globalData
    const familyId = String(this.data.familyId || (app.globalData.currentFamily || {}).id || '');
    const kw = this.data.searching ? this.data.keyword.trim() : '';
    const { gender, sort } = this.data.filter;

    const done = (res) => {
      const list = ((res && res.list) || []).map(normalizeMember);
      const pageSize = res && res.pageSize ? Number(res.pageSize) : PAGE_SIZE;
      const total = res ? Number(res.total || 0) : list.length;
      const hasMore = res ? !!res.hasMore : list.length >= pageSize;
      this._all = (reset ? [] : (this._all || [])).concat(list);
      this.setData({
        totalMembers: res ? Number(res.totalMembers ?? total) : total,
        maleCount: res ? Number(res.maleCount || 0) : 0,
        femaleCount: res ? Number(res.femaleCount || 0) : 0,
        page: res ? Number(res.page || 1) : page,
        hasMore,
        noMore: !hasMore && this._all.length > 0,
        loading: false,
        loadingMore: false,
        loadError: false
      });
      this.regroupMembers(this._all);
    };

    this.setData({ loading: reset, loadingMore: !reset });

    if (getToken() && familyId) {
      const params = { page, pageSize: PAGE_SIZE };
      if (kw) params.keyword = kw;
      if (gender) params.gender = gender;
      if (sort) params.sort = sort;
      if (this.data.generation > 0) params.generation = this.data.generation;
      familyMember.getAll(familyId, params)
        .then(done)
        .catch((err) => {
          console.error('成员分页加载失败', err);
          this.setData({ loading: false, loadingMore: false, loadError: true });
          if (!reset) wx.showToast({ title: '加载失败，请重试', icon: 'none' });
        });
    } else {
      // 离线/未登录:无数据源,展示空态
      this.setData({ loading: false, loadingMore: false, loadError: false, hasMore: false, noMore: true });
    }
  },

  /** 上拉加载下一页（防抖：加载中/无更多数据时直接返回） */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.fetchPage((this.data.page || 0) + 1, false);
  },

  /** 搜索输入：仅更新输入内容与搜索按钮显隐，不自动搜索 */
  onSearch(e) {
    const kw = (e.detail.value || '').trim();
    this.setData({ keyword: kw, showSearchBtn: kw.length >= 2 });
  },

  /** 点击搜索按钮执行搜索 */
  doSearch() {
    const kw = this.data.keyword.trim();
    if (kw.length < 2) {
      wx.showToast({ title: '请输入至少2个字符', icon: 'none' });
      return;
    }
    this.setData({ searching: true });
    this.refresh();
  },

  /** 清空搜索词，恢复全部成员列表 */
  clearSearch() {
    this.setData({ keyword: '', showSearchBtn: false, searching: false });
    this.refresh();
  },

  /** 筛选（服务端筛选 + 排序） */
  showFilter() {
    const cur = this.data.filter;
    wx.showActionSheet({
      itemList: ['默认排序', '按姓名排序', '按出生年份排序', '只看男性', '只看女性', '清除筛选'],
      success: (res) => {
        let filter = { gender: '', sort: '' };
        switch (res.tapIndex) {
          case 1: filter = { gender: cur.gender, sort: 'name' }; break;
          case 2: filter = { gender: cur.gender, sort: 'birthYear' }; break;
          case 3: filter = { gender: 'male', sort: cur.sort }; break;
          case 4: filter = { gender: 'female', sort: cur.sort }; break;
          case 5: filter = { gender: '', sort: '' }; break;
          default: return;
        }
        this.setData({ filter });
        this.refresh();
      }
    });
  },

  /** 清除字辈筛选,恢复展示全部成员 */
  clearGenerationFilter() {
    this.setData({
      generation: 0,
      generationName: '',
      navTitle: ''
    });
    wx.setNavigationBarTitle({ title: '家族成员' });
    this.refresh();
  },

  /** 加载失败重试 */
  retryLoad() {
    this.refresh();
  },

  /** 渲染成员统计与按代分组 */
  regroupMembers(members) {
    const grouped = {};
    members.forEach(m => {
      if (!grouped[m.generation]) grouped[m.generation] = [];
      grouped[m.generation].push(m);
    });
    const groupedMembers = Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(gen => ({
      generation: gen,
      members: grouped[gen]
    }));
    this.setData({ groupedMembers });
  },

  viewMember(e) {
    const id = e.currentTarget.dataset.id;
    const familyId = this.data.familyId || (getApp().globalData.currentFamily || {}).id || '';
    wx.navigateTo({
      url: `/pages/member-detail/member-detail?id=${id}&familyId=${familyId}`
    });
  },

  addMember() {
    wx.navigateTo({
      url: '/pages/add-member/add-member'
    });
  }
});
