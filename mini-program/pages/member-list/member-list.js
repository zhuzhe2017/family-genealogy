const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
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
    familyId: '',          // URL 传入的家族ID,优先于 globalData,避免切换家族后串数据
    // 自定义导航栏适配（状态栏高度 + 导航栏高度）
    statusBarHeight: 20,
    navBarTotal: 64
  },

  onLoad(options) {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = (win && win.statusBarHeight) || 20;
    this.setData({ statusBarHeight, navBarTotal: statusBarHeight + 44 });

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

  /** 返回时置位标记,避免"族成员" tab 入口页再次自动跳转造成循环。
   *  仅物理返回/返回手势(navigateBack 回入口页)需要防循环;
   *  主动回首页(switchTab,不经过入口页)不置位,避免标记残留导致下次点 tab 停在动态页 */
  onUnload() {
    if (this._homeExit) return;
    app.globalData.skipMemberNav = true;
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

    if (!USE_MOCK && getToken() && familyId) {
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
      // mock：本地分页，模拟服务端行为
      const all = this.getMockMembers();
      const filtered = all.filter(m => {
      const hitName = !kw || (m.name || '').includes(kw);
      const hitGender = !gender || m.gender === gender;
      const hitGen = !this.data.generation || m.generation === this.data.generation;
      return hitName && hitGender && hitGen;
    });
      const start = (page - 1) * PAGE_SIZE;
      const pageList = filtered.slice(start, start + PAGE_SIZE);
      done({
        list: pageList,
        total: filtered.length,
        page,
        pageSize: PAGE_SIZE,
        totalMembers: filtered.length,
        maleCount: filtered.filter(m => m.gender === 'male').length,
        femaleCount: filtered.filter(m => m.gender === 'female').length,
        hasMore: start + pageList.length < filtered.length
      });
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

  getMockMembers() {
    return [
      { id: '1', name: '朱太公', gender: 'male', generation: 1, generationName: '文', birthYear: '1880', spouseInfo: { name: '朱太婆' } },
      { id: '2', name: '朱大', gender: 'male', generation: 2, generationName: '德', birthYear: '1910', spouseInfo: { name: '李氏' } },
      { id: '3', name: '朱二', gender: 'male', generation: 2, generationName: '德', birthYear: '1912', spouseInfo: { name: '王氏' } },
      { id: '4', name: '朱三', gender: 'male', generation: 2, generationName: '德', birthYear: '1915', spouseInfo: { name: '陈氏' } },
      { id: '5', name: '朱强', gender: 'male', generation: 3, generationName: '永', birthYear: '1940', spouseInfo: { name: '刘氏' } },
      { id: '6', name: '朱明', gender: 'male', generation: 3, generationName: '永', birthYear: '1942', spouseInfo: { name: '赵氏' } },
      { id: '7', name: '朱华', gender: 'male', generation: 3, generationName: '永', birthYear: '1945', spouseInfo: { name: '孙氏' } },
      { id: '8', name: '朱丽', gender: 'female', generation: 3, generationName: '永', birthYear: '1948', spouseInfo: { name: '周先生' } },
      { id: '9', name: '朱芳', gender: 'female', generation: 3, generationName: '永', birthYear: '1950', spouseInfo: { name: '吴先生' } },
      { id: '10', name: '朱伟', gender: 'male', generation: 4, generationName: '世', birthYear: '1970', spouseInfo: { name: '郑氏' } },
      { id: '11', name: '朱敏', gender: 'female', generation: 4, generationName: '世', birthYear: '1972', spouseInfo: { name: '王先生' } },
      { id: '12', name: '朱军', gender: 'male', generation: 4, generationName: '世', birthYear: '1975' },
      { id: '13', name: '朱燕', gender: 'female', generation: 4, generationName: '世', birthYear: '1978', spouseInfo: { name: '李先生' } },
      { id: '14', name: '朱鹏', gender: 'male', generation: 4, generationName: '世', birthYear: '1980', spouseInfo: { name: '周氏' } },
      { id: '15', name: '朱浩', gender: 'male', generation: 5, generationName: '兴', birthYear: '2000' },
      { id: '16', name: '朱悦', gender: 'female', generation: 5, generationName: '兴', birthYear: '2005' },
      { id: '17', name: '朱晨', gender: 'male', generation: 5, generationName: '兴', birthYear: '2010' },
      { id: '18', name: '朱雪', gender: 'female', generation: 5, generationName: '兴', birthYear: '2012' }
    ];
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
  },

  /** 导航栏左上角返回：直接回首页（覆盖默认返回上一页）。
   *  标记 _homeExit,onUnload 时不再置位防循环标记(回首页不经过"族成员"入口页,无需防循环) */
  goHome() {
    this._homeExit = true;
    wx.switchTab({ url: '/pages/home/home' });
  }
});
