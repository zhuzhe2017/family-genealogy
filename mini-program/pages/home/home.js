const app = getApp();
const { content, banner, fund } = require('../../utils/api');
const { normalizeDynamic, normalizeEvent, resolveImageUrl } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

/** 慈善榜单缓存有效期（毫秒） */
const CHARITY_RANK_TTL = 5 * 60 * 1000;

Page({
  data: {
    currentFamily: {},
    quickActions: [
      { id: 1, name: '宗亲聚会', icon: '🎉', bgColor: '#E8F5E9', url: '/pages/gathering/index' },
      { id: 2, name: '家族基金', icon: '💰', bgColor: '#E3F2FD', url: '/pages/fund/index' },
      { id: 3, name: '家族资料', icon: '📚', bgColor: '#FFF3E0', url: '/pages/family-docs/family-docs' },
      { id: 4, name: '事件时间', icon: '📅', bgColor: '#F3E5F5', url: '/pages/timeline/timeline' },
      { id: 5, name: '相册影像', icon: '📷', bgColor: '#E0F2F1', url: '/pages/album/album' },
      { id: 6, name: '祭祀祈福', icon: '🙏', bgColor: '#FBE9E7', url: '/pages/worship/worship' },
      { id: 7, name: '家族动态', icon: '💬', bgColor: '#E8EAF6', url: '/pages/dynamic/dynamic' },
      { id: 8, name: '应用中心', icon: '🧩', bgColor: '#E0F7FA', url: '/pages/app-center/app-center' },
      { id: 9, name: '亲缘查询', icon: '🔍', bgColor: '#FFF8E1', url: '/pages/kinship/kinship' }
    ],
    // 家族动态:真实数据 + 状态机,不再静默回退假数据
    recentDynamics: [],
    loadingDynamics: true,  // 首屏加载中
    needLogin: false,       // 未登录:引导登录
    dynamicsFailed: false,  // 请求失败:错误占位
    dynamicsEmpty: false,   // 已登录但无动态
    // 最近活动:仅开发模式有模拟数据,真实模式无数据源时显示空态
    recentActivities: [],
    // 慈善榜单:从家族基金成功存入流水聚合,带缓存/加载/失败状态
    charityRank: [],
    loadingCharity: false,  // 加载中
    charityFailed: false,   // 加载失败
    charityEmpty: false,    // 暂无捐赠数据
    isMock: false,           // 开发模式模拟数据角标
    // 家族字辈
    generationList: [],      // 扁平字辈数组 [{ name, generation }](弹窗跳转用)
    generationGroups: [],    // 按代分组 [{ generation, chars: [字...], firstChar, hasMore, expanded }]
    generationClamped: false,// 字辈是否被四行截断
    generationModalVisible: false, // 弹窗是否渲染(控制节点存在)
    generationModalShow: false,    // 弹窗是否展示(控制过渡动画)
    // 广告轮播
    banners: [],             // 轮播广告列表
    bannerInterval: 3000,    // 自动切换间隔(ms),由后端 sys_config 下发
    bannerCurrent: 0         // 当前轮播索引
  },

  onLoad() {
    this.setData({
      currentFamily: app.globalData.currentFamily || {}
    });
    this.refreshGeneration();
    this.loadDynamics();
    this.loadBanners();
  },

  onShow() {
    this.setData({
      currentFamily: app.globalData.currentFamily || {}
    });
    this.refreshGeneration();
    // 每次可见时刷新,获取最新登录态与动态(有数据时不再闪加载态)
    this.loadDynamics();
    // 仅在家族或登录态变化时重新加载广告,避免重复请求导致闪烁
    const currentFamilyId = (app.globalData.currentFamily || {}).id;
    const lastFamilyId = this._lastBannerFamilyId;
    const tokenChanged = this._lastBannerToken !== getToken();
    if (currentFamilyId !== lastFamilyId || tokenChanged || this.data.banners.length === 0) {
      this._lastBannerFamilyId = currentFamilyId;
      this._lastBannerToken = getToken();
      this.loadBanners();
    }
  },

  /**
   * 加载家族动态
   * - USE_MOCK(开发模式): 展示模拟数据并标注角标
   * - 未登录: 引导登录,不展示假数据
   * - 请求失败: 清空列表并显示错误占位
   */
  loadDynamics() {
    const familyId = (app.globalData.currentFamily || {}).id;

    // 开发模式:展示模拟数据并标注
    if (USE_MOCK) {
      this.setData({
        recentDynamics: this.getMockDynamics(),
        recentActivities: this.getMockActivities(),
        charityRank: this.getMockCharityRank(),
        isMock: true,
        loadingDynamics: false,
        needLogin: false,
        dynamicsFailed: false,
        dynamicsEmpty: false,
        loadingCharity: false,
        charityFailed: false,
        charityEmpty: false
      });
      return;
    }

    // 未登录:引导登录,不展示假数据
    if (!getToken()) {
      this.setData({
        recentDynamics: [],
        recentActivities: [],
        charityRank: [],
        needLogin: true,
        loadingDynamics: false,
        dynamicsFailed: false,
        dynamicsEmpty: false,
        isMock: false,
        loadingCharity: false,
        charityFailed: false,
        charityEmpty: false
      });
      return;
    }

    // 未选择家族
    if (!familyId) {
      this.setData({
        recentDynamics: [],
        recentActivities: [],
        charityRank: [],
        needLogin: false,
        loadingDynamics: false,
        dynamicsFailed: false,
        dynamicsEmpty: true,
        isMock: false,
        loadingCharity: false,
        charityFailed: false,
        charityEmpty: true
      });
      return;
    }

    // 已有内容时刷新不闪加载态
    this.setData({
      loadingDynamics: this.data.recentDynamics.length === 0,
      needLogin: false,
      dynamicsFailed: false,
      isMock: false
    });
    content.getList('dynamic', { familyId, page: 1, pageSize: 3 })
      .then((res) => {
        const list = (res.list || []).map(normalizeDynamic);
        // 图片超过 3 张时按每屏 3 张分页,供首页 swiper 滑动浏览
        list.forEach((item) => {
          const imgs = item.images || [];
          const pages = [];
          for (let i = 0; i < imgs.length; i += 3) {
            pages.push({ key: 'p' + i, images: imgs.slice(i, i + 3) });
          }
          item.imagePages = pages;
          item.imageCurrent = 0;
        });
        this.setData({ recentDynamics: list, loadingDynamics: false, dynamicsEmpty: list.length === 0 });
      })
      .catch((err) => {
        console.error('动态加载失败', err);
        // 失败不再静默保留假数据,清空并提示
        this.setData({ recentDynamics: [], loadingDynamics: false, dynamicsFailed: true, dynamicsEmpty: false });
      });

    // 并行加载最近活动(家族事件)
    this.loadActivities(familyId);

    // 并行加载慈善榜单(家族基金成功存入流水聚合)
    this.loadCharityRank();
  },

  /**
   * 加载最近活动(家族事件):真实模式从 family_event 取最近 3 条,
   * 加载失败/无数据时清空显示空态,不展示假数据
   */
  loadActivities(familyId) {
    content.getList('event', { familyId, page: 1, pageSize: 3 })
      .then((res) => {
        const list = (res.list || []).map((row) => {
          const e = normalizeEvent(row);
          // 统一为卡片展示格式:day 显示日期(0=不详),month 显示年份+月份
          return {
            id: e.id,
            day: e.day ? String(e.day).padStart(2, '0') : '?',
            month: (e.year || '') + (e.month ? e.month + '月' : '年'),
            title: e.title,
            desc: e.description || '',
            typeName: e.typeName || ''
          };
        });
        this.setData({ recentActivities: list });
      })
      .catch((err) => {
        console.error('最近活动加载失败', err);
        this.setData({ recentActivities: [] });
      });
  },

  /**
   * 加载慈善榜单:从家族基金成功存入流水聚合 Top10
   * - 本地缓存(5分钟)优先渲染,避免每次进入首页都请求,随后后台刷新
   * - 请求失败时保留缓存旧数据;无缓存则显示失败态可重试
   */
  loadCharityRank() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!familyId) return;
    const cacheKey = 'charity_rank_cache_' + familyId;

    // 缓存未过期则先渲染,避免加载闪烁
    let cached = null;
    try {
      cached = wx.getStorageSync(cacheKey);
    } catch (e) { /* 缓存读取失败忽略 */ }
    const cacheValid = cached && cached.time && (Date.now() - cached.time) < CHARITY_RANK_TTL;
    if (cacheValid && cached.list) {
      this.setData({
        charityRank: cached.list,
        loadingCharity: false,
        charityEmpty: cached.list.length === 0,
        charityFailed: false
      });
    } else {
      this.setData({
        loadingCharity: this.data.charityRank.length === 0,
        charityFailed: false
      });
    }

    fund.rank(familyId, { limit: 10 })
      .then((res) => {
        const list = (res.list || []).map((item) => ({
          rank: item.rank,
          name: item.donorName,
          amount: item.totalAmount,
          project: item.project,
          time: item.lastTime ? String(item.lastTime).slice(0, 10) : ''
        }));
        this.setData({
          charityRank: list,
          loadingCharity: false,
          charityEmpty: list.length === 0,
          charityFailed: false
        });
        // 刷新缓存
        try { wx.setStorageSync(cacheKey, { time: Date.now(), list }); } catch (e) { /* 缓存写入失败忽略 */ }
      })
      .catch((err) => {
        console.error('慈善榜单加载失败', err);
        // 已有内容(缓存或上次数据)时保留,避免闪错;否则显示失败态
        this.setData({ loadingCharity: false, charityFailed: this.data.charityRank.length === 0 });
      });
  },

  /** 首页动态 swiper 翻页:记录当前页用于页码指示器 */
  onImageSwiperChange(e) {
    const id = e.currentTarget.dataset.id;
    const current = e.detail.current;
    const list = this.data.recentDynamics.map(item => {
      if (String(item.id) === String(id)) {
        item.imageCurrent = current;
      }
      return item;
    });
    this.setData({ recentDynamics: list });
  },

  /** 点击动态图片:预览大图(阻止冒泡,避免触发卡片跳转详情) */
  previewDynamicImage(e) {
    const srcs = e.currentTarget.dataset.srcs || [];
    const current = e.currentTarget.dataset.current;
    if (!srcs.length) return;
    wx.previewImage({ current, urls: srcs });
  },

  /** 点击动态卡片:跳转动态详情页 */
  goDynamicDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/dynamic-detail/dynamic-detail?id=' + id
    });
  },

  /** 点击活动卡片:跳转事件详情 */
  goEventDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/event-detail/event-detail?id=' + id
    });
  },

  /** 查看更多活动:跳转事件时间页 */
  goTimeline() {
    wx.navigateTo({
      url: '/pages/timeline/timeline'
    });
  },

  /**
   * 加载广告轮播:有登录且有家族 → 家族+全局广告;未登录/无家族 → 仅全局广告
   * - 数字 id 校验:mock 回退数据 id 为 'fam001' 等字符串,后端 Number() 解析为 0 会报"缺少家族ID",
   *   因此请求前统一转数字并确认是有效正整数
   */
  loadBanners() {
    const familyId = Number((app.globalData.currentFamily || {}).id);
    const requestPromise = (getToken() && familyId > 0)
      ? banner.getList(familyId)
      : banner.getGlobal();
    requestPromise
      .then((res) => {
        const list = (res.list || []).map((item) => ({
          id: item.id,
          title: item.title || '',
          imageUrl: resolveImageUrl(item.imageUrl || ''), // 相对 /uploads/xxx → 完整域名，小程序 image 不支持相对路径
          linkType: item.linkType || 'none',
          linkUrl: item.linkUrl || ''
        }));
        this.setData({
          banners: list,
          bannerInterval: (res.interval && res.interval >= 1000) ? res.interval : 3000
        });
      })
      .catch((err) => {
        console.error('广告轮播加载失败', err);
        this.setData({ banners: [] });
      });
  },

  /** 点击轮播广告:page-小程序页面跳转,url-外部链接用 web-view 容器打开, none-无操作 */
  onBannerTap(e) {
    // 若用户正在滑动则不触发点击,避免误跳转
    if (this._bannerSwiping) return;
    const { type, url, id } = e.currentTarget.dataset;
    if (!type || type === 'none' || !url) return;
    // 点击上报(运营统计),失败静默不影响跳转
    if (id) {
      banner.recordClick(id).catch(() => {});
    }
    if (type === 'page') {
      const tabBarPages = ['/pages/home/home', '/pages/family-tree/family-tree', '/pages/dynamic/dynamic', '/pages/profile/profile'];
      const baseUrl = String(url).split('?')[0];
      if (baseUrl === '/pages/dynamic/dynamic') {
        // 显式进入动态列表:置位标记,避免"族成员" tab 劫持
        app.globalData.dynamicFromHome = true;
      }
      if (tabBarPages.includes(baseUrl)) {
        wx.switchTab({ url: baseUrl });
      } else {
        wx.navigateTo({ url });
      }
    } else if (type === 'url') {
      wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent(url) });
    }
  },

  /** 广告图片加载失败：移除或标记该条目，避免空白占位 */
  onBannerError(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const banners = this.data.banners.map(item => {
      if (String(item.id) === String(id)) {
        return Object.assign({}, item, { imageError: true });
      }
      return item;
    }).filter(item => !item.imageError);
    this.setData({ banners, bannerCurrent: Math.min(this.data.bannerCurrent, banners.length - 1) });
  },

  /** 轮播切换:同步自定义指示器索引,并短暂标记滑动中以避免误触 */
  onBannerChange(e) {
    this._bannerSwiping = true;
    this.setData({ bannerCurrent: e.detail.current });
    clearTimeout(this._bannerSwipeTimer);
    this._bannerSwipeTimer = setTimeout(() => {
      this._bannerSwiping = false;
    }, 300);
  },

  /** 未登录状态下点击"立即登录":静默登录成功后刷新 */
  doLogin() {
    app.login();
    wx.showLoading({ title: '登录中...' });
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (getToken() || tries >= 10) {
        clearInterval(timer);
        wx.hideLoading();
        if (getToken()) {
          this.loadDynamics();
        } else {
          wx.showToast({ title: '登录失败,请重试', icon: 'none' });
        }
      }
    }, 500);
  },

  /**
   * 解析字辈数据:优先用 generationSequence 按代分组。
   * 兼容两种结构:
   *   1) 对象 {代:[字1,字2]}(旧结构)
   *   2) 数组 [项1,项2,...](generation_table 形态):每项即一代,
   *      同代多字辈写在同一项内。
   * 代内取值规则:数组原样用;字符串按分隔符拆分,无分隔符时按单字拆分
   * (字辈均为单字,长度>1 即视为同代多字,如 "文武贤良臣" -> ["文","武","贤","良","臣"])。
   * 同代多字辈时首页只展示首字并带"+"角标,点击横向展开;
   * 无 sequence 时回退用 generationNames 扁平串按序号分组。最后测量是否超四行。
   */
  refreshGeneration() {
    const family = this.data.currentFamily || {};
    const seqRaw = family.generationSequence;
    let groups = [];

    // 代内字符串 -> 单字数组:先按分隔符(空格/逗号/顿号/分号)拆分;
    // 无分隔符且长度>1 时按单字拆分(字辈均为单字,连续汉字即同代多字)
    const toChars = (v) => {
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      const s = String(v == null ? '' : v).trim();
      if (!s) return [];
      if (/[\s,，、;；]+/.test(s)) {
        return s.split(/[\s,，、;；]+/).map(x => x.trim()).filter(Boolean);
      }
      // 无分隔符:长度 1 返回自身,长度 >1 按单字拆分
      if (s.length === 1) return [s];
      return s.split('');
    };

    if (seqRaw) {
      // 解析 {代:[字1,字2]} 或 [项1,项2,...] 结构
      let obj = seqRaw;
      if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch (e) { obj = null; }
      }
      // 对象形态:{代:[字...]},键为代序号
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        groups = Object.keys(obj)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => {
            const chars = toChars(obj[k]);
            return {
              generation: Number(k),
              chars: chars,
              firstChar: chars[0] || '',
              hasMore: chars.length > 1,
              expanded: false
            };
          })
          .filter(g => g.firstChar);
      } else if (Array.isArray(obj)) {
        // 数组形态:每项即一代,同代多字辈写在同一项内
        groups = obj
          .map((item, index) => {
            const chars = toChars(item);
            return {
              generation: index + 1,
              chars: chars,
              firstChar: chars[0] || '',
              hasMore: chars.length > 1,
              expanded: false
            };
          })
          .filter(g => g.firstChar);
      }
    }

    // 回退:generationNames 扁平串,按序号分组(每代单字)
    if (!groups.length) {
      const names = (family.generationNames || '').trim();
      if (!names) {
        this.setData({ generationList: [], generationGroups: [], generationClamped: false });
        return;
      }
      const arr = names.split(/[、,，\s]+/).filter(Boolean);
      groups = arr.map((name, index) => ({
        generation: index + 1,
        chars: [name],
        firstChar: name,
        hasMore: false,
        expanded: false
      }));
    }

    // 弹窗按代分组渲染:同代多字辈的格子包一层容器加底色,体现归属同一代
    // 结构:[{ generation, isGroup, chars: [{ name }] }]
    const generationList = groups.map(g => ({
      generation: g.generation,
      isGroup: g.chars.length > 1,
      chars: g.chars.map(c => ({ name: c }))
    }));

    this.setData({ generationGroups: groups, generationList: generationList });
    this.measureGenerationClamp();
  },
  /** 测量字辈区是否超过两行 */
  measureGenerationClamp() {
    wx.createSelectorQuery()
      .select('.generation-clamp')
      .boundingClientRect((rect) => {
        if (!rect) return;
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const maxHeight = 108 * (win.windowWidth || 375) / 750;
        this.setData({ generationClamped: rect.height > maxHeight + 1 });
      })
      .exec();
  },

  /** 点击某代的 "+" 角标:横向展开/收起该代全部字辈 */
  toggleGenerationExpand(e) {
    const generation = Number(e.currentTarget.dataset.generation);
    const groups = this.data.generationGroups.map(g => {
      if (g.generation === generation) {
        return Object.assign({}, g, { expanded: !g.expanded });
      }
      return g;
    });
    this.setData({ generationGroups: groups });
    // 展开/收起后重新测量高度
    setTimeout(() => this.measureGenerationClamp(), 60);
  },

  /** 打开字辈诗弹窗(带过渡动画) */
  openGenerationModal() {
    this.setData({ generationModalVisible: true });
    // 等待节点渲染后再触发展示态,确保过渡动画生效
    setTimeout(() => {
      this.setData({ generationModalShow: true });
    }, 30);
  },

  /** 关闭字辈诗弹窗(先播收起动画再移除节点) */
  closeGenerationModal() {
    this.setData({ generationModalShow: false });
    clearTimeout(this._generationModalTimer);
    this._generationModalTimer = setTimeout(() => {
      this.setData({ generationModalVisible: false });
    }, 280);
  },

  /** 点击具体字辈:关闭弹窗并跳转该字辈家族成员列表
   *  参数传递:优先取点击元素自身的 data-name(最可靠),generation 取 data-generation
   *  familyId 实时从 globalData 取(避免 data 快照过期);字符串/数字 id 均合法 */
  goGenerationMembers(e) {
    const dataset = e.currentTarget.dataset || {};
    // dataset.generation 经小程序传递后为字符串,Number 转回数字
    const generation = parseInt(dataset.generation, 10);
    // 优先用点击元素携带的字辈名,其次回退到分组列表查找该代首字
    let name = (dataset.name || '').trim();
    if (!name) {
      const group = (this.data.generationList || []).find(g => g.generation === generation) || {};
      const first = (group.chars || [])[0] || {};
      name = (first.name || '').trim();
    }
    // familyId 实时取 globalData,兼容数字 id 与字符串 id(如 mock 'fam001')
    const family = app.globalData.currentFamily || this.data.currentFamily || {};
    const familyId = family.id;

    // 参数校验:代数/家族ID 缺失直接报错
    if (!generation || generation < 1 || !Number.isInteger(generation)) {
      console.error('[goGenerationMembers] 代数无效', dataset);
      wx.showToast({ title: '字辈代数信息缺失', icon: 'none' });
      return;
    }
    if (familyId === undefined || familyId === null || familyId === '') {
      console.error('[goGenerationMembers] 家族ID缺失', family);
      wx.showToast({ title: '请先选择家族', icon: 'none' });
      return;
    }

    // 弹窗打开时先关闭,避免返回时弹窗仍展示
    if (this.data.generationModalVisible) {
      this.closeGenerationModal();
    }
    // encodeURIComponent 保证中文/特殊字辈名与字符串家族id跨页传递不丢乱码
    const url = '/pages/member-list/member-list?familyId=' + encodeURIComponent(String(familyId))
      + '&generation=' + generation
      + '&generationName=' + encodeURIComponent(name);
    console.log('[goGenerationMembers] 跳转:', url);
    wx.navigateTo({
      url: url,
      fail: (err) => {
        console.error('[goGenerationMembers] 跳转失败', err, 'url=', url);
        wx.showToast({ title: '页面跳转失败,请重试', icon: 'none' });
      }
    });
  },

  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    // tabBar 页面必须用 switchTab 跳转,其余用 navigateTo
    const tabBarPages = ['/pages/home/home', '/pages/family-tree/family-tree', '/pages/dynamic/dynamic', '/pages/profile/profile'];
    const baseUrl = String(url).split('?')[0];
    if (baseUrl === '/pages/dynamic/dynamic') {
      // 显式进入动态列表(金刚区/查看更多):置位标记,避免"族成员" tab 劫持
      app.globalData.dynamicFromHome = true;
    }
    if (tabBarPages.includes(baseUrl)) {
      wx.switchTab({ url: baseUrl });
    } else {
      wx.navigateTo({ url });
    }
  },

  /** 开发模式模拟动态 */
  getMockDynamics() {
    return [
      {
        id: 1,
        userName: '朱三',
        time: '2小时前',
        content: '今天整理了家族的老照片，发现了很多珍贵的历史资料，分享给大家看看。',
        images: ['', '', '']
      },
      {
        id: 2,
        userName: '朱四',
        time: '5小时前',
        content: '清明节家族祭祖活动圆满结束，感谢各位族人的参与！',
        images: []
      },
      {
        id: 3,
        userName: '朱五',
        time: '昨天',
        content: '新添了家族成员信息，欢迎小明加入我们的大家庭！',
        images: []
      }
    ];
  },

  /** 开发模式模拟最近活动 */
  getMockActivities() {
    return [
      { id: 1, day: '15', month: '4月', title: '清明祭祖大典', desc: '全体族人参与，祭祀先祖' },
      { id: 2, day: '01', month: '5月', title: '家族理事会会议', desc: '讨论家族发展事宜' },
      { id: 3, day: '18', month: '6月', title: '端午家族聚会', desc: '包粽子、叙亲情' }
    ];
  },

  /** 开发模式模拟慈善榜单 */
  getMockCharityRank() {
    return [
      { rank: 1, name: '朱国强', amount: 88800, project: '修缮祖祠', time: '2025-03-18' },
      { rank: 2, name: '朱文远', amount: 50000, project: '家族助学基金', time: '2025-05-02' },
      { rank: 3, name: '朱丽华', amount: 30000, project: '清明祭祖大典', time: '2025-02-14' },
      { rank: 4, name: '朱明德', amount: 12000, project: '族老慰问金', time: '2025-06-01' },
      { rank: 5, name: '朱晓峰', amount: 8000, project: '宗亲聚会', time: '2025-07-22' }
    ];
  }
});
