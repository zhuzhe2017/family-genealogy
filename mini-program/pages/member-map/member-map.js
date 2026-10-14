const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { getToken } = require('../../utils/request');
const { LBS_KEY } = require('../../utils/config');

/**
 * 位置导航页
 * - 地图展示所有已录入经纬度坐标的家族成员（坐标为安葬地点，GCJ-02，与 map 组件坐标系一致）
 * - 标记点按成员状态区分：在世 / 已故 / 高亮（查询命中或当前导航目标）
 * - 支持标准地图 / 卫星地图无缝切换，切换时保留中心点、缩放级别与全部标记点
 * - 支持按查询键配置的维度进行**服务端检索**（覆盖全部成员，不受本地缓存与分页上限限制）；
 *   命中结果即时在地图上高亮并同步刷新侧边成员列表，命中 1 条直接展示详情、≥2 条以列表展示
 * - 检索结果中未录入位置坐标的成员会给出明确提示（无法在地图定位或规划路线）
 * - 首次加载最多拉取前 1000 位成员，侧边栏展示完整成员列表（按需增量渲染）
 * - 点击标记点或列表项：以当前定位为起点、选中成员为终点规划驾车路线，页内绘制折线并展示分步指引
 * - 提供「打开地图App导航」一键跳转外部地图完成导航
 * - 边界处理：定位权限拒绝、经纬度异常、成员加载失败、分页部分失败、路线服务不可用
 */

/** 标记点图标：按成员状态区分 */
const MARKER_ICONS = {
  alive: '/images/marker-alive.png',
  deceased: '/images/marker-deceased.png',
  selected: '/images/marker-selected.png'
};

/** 腾讯位置服务「驾车路线规划」WebService（与地图选点/路线规划插件共用同一 key） */
const DIRECTION_URL = 'https://apis.map.qq.com/ws/direction/v1/driving/';

/** 折线抽稀上限：点数过多时等间隔采样，避免大数据量 setData 造成卡顿 */
const MAX_POLYLINE_POINTS = 300;

const MARKER_WIDTH = 36;
const MARKER_HEIGHT = 48;

/** 初始加载上限：首次进入最多拉取前 1000 位成员 */
const MEMBER_FETCH_LIMIT = 1000;
/** 后端 getPaged 对 pageSize 的上限为 100，故按 100 逐页拉取 */
const FETCH_PAGE_SIZE = 100;
/** 侧边列表首屏渲染条数与每次追加条数（避免一次性渲染上千条造成卡顿） */
const LIST_RENDER_STEP = 60;
/** 视为「宽屏」（PC / 平板）的窗口宽度阈值，用于左右分栏布局 */
const WIDE_MIN_WIDTH = 720;
/**
 * 查询键配置：可检索字段维度白名单
 * 当前仅开放「姓名（模糊）」，对应后端 keyword 参数（`name` LIKE）；
 * 扩展新维度时在此追加一条，并确认后端已支持对应参数
 */
const SEARCH_KEYS = [
  { key: 'name', label: '姓名', param: 'keyword', mode: 'fuzzy' }
];
/** 默认查询维度 */
const DEFAULT_SEARCH_KEY = 'name';
/** 触发检索的最小关键字长度 */
const SEARCH_MIN_LENGTH = 2;
/** 单次检索最多拉取条数，避免超大结果集拖慢渲染 */
const SEARCH_FETCH_LIMIT = 500;
/** 查询输入防抖时长：降低高频请求次数 */
const SEARCH_DEBOUNCE = 120;
/** 气泡数量上限：标记点较多时省略气泡，优先保证地图渲染流畅 */
const CALLOUT_LIMIT = 150;
/** include-points 采样上限，避免超大数组 setData 造成卡顿 */
const FIT_POINT_LIMIT = 200;

Page({
  data: {
    // 页面状态：loading-加载中 needLogin-未登录 noFamily-未选家族 failed-加载失败 empty-无坐标成员 ready-正常
    status: 'loading',
    familyId: '',
    memberTotal: 0,          // 家族成员总数（后端 total）
    loadedCount: 0,          // 本次已拉取的成员条数
    hasMoreMembers: false,   // 是否还有未拉取的成员
    availableCount: 0,       // 已加载成员中已录入坐标的成员数
    aliveCount: 0,
    deceasedCount: 0,
    emptyHint: '',
    // 布局
    isWide: false,           // PC / 平板：左右分栏；移动端：上下分栏
    // 地图
    satellite: true,         // 是否卫星图（默认卫星地图模式）
    markers: [],
    includePoints: [],
    centerLatitude: 39.90923,
    centerLongitude: 116.397428,
    scale: 11,
    // 查询（服务端检索）
    keyword: '',
    searchActive: false,     // 关键字是否已满最小长度并完成检索
    searching: false,        // 检索请求进行中
    matchedCount: 0,         // 命中条数
    detailMember: null,      // 命中 1 条时直接展示的成员详情
    noCoordCount: 0,         // 命中结果中未录入位置坐标的成员数
    listSummary: '',
    listMembers: [],         // 侧边列表当前渲染的成员（增量渲染窗口）
    listHasMore: false,
    selectedId: '',
    // 我的定位
    myLocation: null,
    locationDenied: false,
    locating: false,
    // 路线
    selectedMember: null,
    routeLoading: false,
    routeFailed: false,
    routeFallback: false,    // 路线服务不可用，退化为直线参考
    routeInfo: null,
    routeSteps: [],
    polyline: []
  },

  onLoad() {
    this._baseMembers = [];        // 初始加载的成员（≤1000，仅有坐标者），用于默认标记点与列表
    this._markerMembers = [];      // 当前 markers 数据源：markers[i] ↔ this._markerMembers[i]
    this._results = [];            // 最近一次服务端检索结果（可能包含无坐标成员）
    this._display = [];            // 侧边列表数据源（默认成员列表或查询命中列表）
    this._highlighted = new Set(); // 当前已高亮的成员 id 集合，用于增量修改标记点样式
    this._highlightIds = null;     // 查询命中的成员 id 集合
    this._searchSeq = 0;           // 检索请求序号，用于丢弃过期响应
    this.initLayout();
    if (typeof wx.onWindowResize === 'function') {
      this._onResize = (res) => this.handleWindowResize(res);
      wx.onWindowResize(this._onResize);
    }
    this.loadMembers();
  },

  onShow() {
    // 未登录态下用户可能刚完成登录（如从登录页返回），登录态就绪后重新加载
    if (this.data.status === 'needLogin' && getToken()) {
      this.loadMembers();
    }
  },

  onUnload() {
    if (this._loginTimer) {
      clearInterval(this._loginTimer);
      this._loginTimer = null;
    }
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    if (this._onResize && typeof wx.offWindowResize === 'function') {
      wx.offWindowResize(this._onResize);
      this._onResize = null;
    }
  },

  // ==================== 布局适配（PC / 移动端） ====================

  /** 依据窗口宽度决定分栏方向：宽屏左右分栏，窄屏上下分栏 */
  initLayout() {
    let width = 0;
    try {
      if (typeof wx.getWindowInfo === 'function') width = wx.getWindowInfo().windowWidth || 0;
      else width = wx.getSystemInfoSync().windowWidth || 0;
    } catch (e) {
      width = 0;
    }
    this.setData({ isWide: width >= WIDE_MIN_WIDTH });
  },

  /** PC 端窗口尺寸变化时重新计算分栏方向 */
  handleWindowResize(res) {
    const size = (res && res.size) || res || {};
    const width = size.windowWidth || 0;
    if (width) this.setData({ isWide: width >= WIDE_MIN_WIDTH });
  },

  // ==================== 成员加载 ====================

  /** 加载家族成员（最多前 1000 位，按 100 分页并发拉取）并筛选出带有效经纬度的成员 */
  loadMembers() {
    const family = (app.globalData.currentFamily || {});
    const familyId = family.id;

    if (!getToken()) {
      this.setData({ status: 'needLogin' });
      return;
    }
    if (!familyId) {
      this.setData({ status: 'noFamily' });
      return;
    }

    this.setData({
      status: 'loading',
      familyId: familyId,
      locationDenied: false,
      keyword: '',
      searchActive: false,
      searching: false,
      matchedCount: 0,
      detailMember: null,
      noCoordCount: 0,
      selectedId: '',
      selectedMember: null
    });
    this._highlightIds = null;
    this._highlighted = new Set();
    this._results = [];

    this.fetchMembers(familyId, { limit: MEMBER_FETCH_LIMIT })
      .then((result) => {
        const rows = result.list || [];
        const all = rows.map(normalizeMember);
        // 初始加载仅保留有有效坐标的成员作为标记点
        const list = all
          .filter((m) => this.isValidCoord(m.latitude, m.longitude))
          .map((m) => this.decorate(m));

        this._baseMembers = list;
        this._markerMembers = list;
        this._display = list.slice();
        const aliveCount = list.filter((m) => m.isAlive).length;
        const hasMoreMembers = rows.length < result.total;
        const meta = {
          memberTotal: result.total,
          loadedCount: rows.length,
          hasMoreMembers: hasMoreMembers,
          availableCount: list.length,
          aliveCount: aliveCount,
          deceasedCount: list.length - aliveCount,
          // 首次加载的统计文案直接内联计算，避免读取尚未写入 data 的 hasMoreMembers
          listSummary: '已加载 ' + list.length + ' 位' +
            (hasMoreMembers ? '（共 ' + result.total + ' 位）' : '')
        };

        if (!list.length) {
          meta.emptyHint = '家族共 ' + result.total + ' 位成员，' +
            (rows.length < result.total ? '已加载的前 ' + rows.length + ' 位' : '') +
            '均未录入位置坐标，可在成员详情中补充安葬地点';
          this.setData(Object.assign({
            status: 'empty',
            markers: [],
            includePoints: [],
            listMembers: [],
            listHasMore: false
          }, meta));
          return;
        }

        // 一次性构建标记点，随后仅对变化的高亮项做增量 setData
        this.setData(Object.assign({
          status: 'ready',
          markers: this.buildMarkers(list),
          includePoints: this.buildFitPoints(list),
          centerLatitude: list[0].latitude,
          centerLongitude: list[0].longitude,
          listMembers: list.slice(0, LIST_RENDER_STEP),
          listHasMore: list.length > LIST_RENDER_STEP
        }, meta));
        // 进入页面即申请定位（失败不阻塞地图展示，仅在面板提示）
        this.requestLocation(false);
      })
      .catch((err) => {
        console.error('[member-map] 成员位置加载失败', err);
        this.setData({ status: 'failed' });
      });
  },

  /**
   * 分页拉取成员：先取第 1 页拿到总数，再并发补齐后续页
   * @param {number} familyId 家族ID
   * @param {{ keyword?: string, limit?: number }} options
   *        keyword：服务端姓名模糊检索关键字（不传则为全量加载）；limit：本次最多拉取条数
   * 单页失败不影响整体：该页按空数组处理，保证页面可用
   */
  fetchMembers(familyId, options) {
    const opts = options || {};
    const limit = opts.limit || MEMBER_FETCH_LIMIT;
    const baseParams = { pageSize: FETCH_PAGE_SIZE };
    if (opts.keyword) baseParams.keyword = opts.keyword;

    return familyMember.getAll(familyId, Object.assign({ page: 1 }, baseParams))
      .then((first) => {
        const firstList = this.extractList(first);
        const total = this.extractTotal(first, firstList.length);
        const pageCount = Math.min(
          Math.ceil(limit / FETCH_PAGE_SIZE),
          Math.ceil(total / FETCH_PAGE_SIZE)
        );
        if (pageCount <= 1 || firstList.length < FETCH_PAGE_SIZE) {
          return { list: firstList, total: total };
        }
        const tasks = [];
        for (let p = 2; p <= pageCount; p++) {
          tasks.push(
            familyMember.getAll(familyId, Object.assign({ page: p }, baseParams))
              .then((res) => this.extractList(res))
              .catch(() => [])
          );
        }
        return Promise.all(tasks).then((rest) => {
          let list = firstList.slice();
          rest.forEach((part) => { list = list.concat(part); });
          return { list: list.slice(0, limit), total: total };
        });
      });
  },

  /** 兼容分页对象与纯数组两种返回结构 */
  extractList(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.list)) return res.list;
    return [];
  },

  extractTotal(res, fallback) {
    const total = res && res.total != null ? Number(res.total) : NaN;
    return isFinite(total) ? total : fallback;
  },

  /** 经纬度有效性校验：必须是有限数字、在合法范围内、且不能是 (0,0) 空点 */
  isValidCoord(lat, lng) {
    return typeof lat === 'number' && typeof lng === 'number' &&
      isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
      !(lat === 0 && lng === 0);
  },

  /** 成员数据补充展示字段（状态/性别文案、地点、详情字段、坐标有效性） */
  decorate(m) {
    const alive = m.isAlive !== false;
    const place = (m.deathPlace || m.birthPlace || '').trim();
    const hasCoord = this.isValidCoord(m.latitude, m.longitude);
    return {
      id: m.id,
      name: m.name || '未命名成员',
      gender: m.gender,
      genderText: m.gender === 'female' ? '女' : '男',
      generation: m.generation,
      generationName: m.generationName || '',
      isAlive: alive,
      statusText: alive ? '在世' : '已故',
      birthDate: m.birthDate || '',
      deathDate: m.deathDate || '',
      birthPlace: m.birthPlace || '',
      deathPlace: m.deathPlace || '',
      bio: m.bio || '',
      avatar: m.avatar || '',
      placeLabel: place,
      hasCoord: hasCoord,
      // 无有效坐标时置空，避免下游误用异常经纬度
      latitude: hasCoord ? m.latitude : null,
      longitude: hasCoord ? m.longitude : null
    };
  },

  /** 默认（非检索态）列表统计文案 */
  buildInitialSummary() {
    const loaded = (this._baseMembers || []).length;
    const suffix = this.data.hasMoreMembers ? '（共 ' + this.data.memberTotal + ' 位）' : '';
    return '已加载 ' + loaded + ' 位' + suffix;
  },

  // ==================== 标记点 ====================

  /**
   * 构建地图标记点（全量构建，仅页面初始化 / 检索结果变化时调用）
   * @param {Array} list 成员列表（需均含有效坐标）
   * @param {boolean} highlightAll 是否将全部标记点渲染为「命中高亮」样式（检索态使用）
   * @param {string} [highlightId] 需要高亮的成员id；显式传空串表示不高亮任何标记
   */
  buildMarkers(list, highlightAll, highlightId) {
    const withCallout = list.length <= CALLOUT_LIMIT;
    const selId = highlightId === undefined ? this.data.selectedId : highlightId;
    return list.map((m, index) => {
      const highlighted = !!highlightAll || String(m.id) === String(selId);
      const marker = {
        id: index,
        latitude: m.latitude,
        longitude: m.longitude,
        iconPath: highlighted
          ? MARKER_ICONS.selected
          : (m.isAlive ? MARKER_ICONS.alive : MARKER_ICONS.deceased),
        width: MARKER_WIDTH,
        height: MARKER_HEIGHT,
        // 图标底部尖端对准真实坐标
        anchor: { x: 0.5, y: 1 },
        zIndex: highlighted ? 100 : 1
      };
      if (withCallout) {
        marker.callout = {
          content: m.name + '（' + m.statusText + '）',
          color: '#333333',
          fontSize: 12,
          bgColor: '#FFFFFF',
          padding: 6,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#E0E0E0',
          textAlign: 'center',
          display: 'BYCLICK'
        };
      }
      return marker;
    });
  },

  /**
   * 增量同步标记点高亮：只对状态发生变化的标记点下发 setData，
   * 避免在千级标记点下整数组重传造成的卡顿
   * @param {Set|null} hits 查询命中的成员 id 集合
   * @param {string} selectedId 当前导航目标成员 id
   */
  syncMarkerHighlight(hits, selectedId) {
    const desired = new Set();
    if (hits) hits.forEach((id) => desired.add(id));
    if (selectedId) desired.add(String(selectedId));

    const patch = {};
    (this._markerMembers || []).forEach((m, i) => {
      const idStr = String(m.id);
      const before = this._highlighted.has(idStr);
      const after = desired.has(idStr);
      if (before === after) return;
      patch['markers[' + i + '].iconPath'] = after
        ? MARKER_ICONS.selected
        : (m.isAlive ? MARKER_ICONS.alive : MARKER_ICONS.deceased);
      patch['markers[' + i + '].zIndex'] = after ? 100 : 1;
    });
    this._highlighted = desired;
    if (Object.keys(patch).length) this.setData(patch);
  },

  /** 生成自适应视野坐标点（自动剔除无有效坐标成员；超量时等间隔采样，保证首尾点不丢失） */
  buildFitPoints(list, limit) {
    const max = limit || FIT_POINT_LIMIT;
    const points = (list || [])
      .filter((m) => this.isValidCoord(m.latitude, m.longitude))
      .map((m) => ({ latitude: m.latitude, longitude: m.longitude }));
    if (points.length <= max) return points;
    const step = Math.ceil(points.length / max);
    const sampled = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
    const last = points[points.length - 1];
    const tail = sampled[sampled.length - 1];
    if (tail && (tail.latitude !== last.latitude || tail.longitude !== last.longitude)) sampled.push(last);
    return sampled;
  },

  // ==================== 地图底图切换 ====================

  /**
   * 标准地图 / 卫星地图切换
   * 切换前同步锁定当前中心点与缩放级别，并清空自适应视野；
   * map 组件在 enable-satellite 变化时会丢弃已渲染的标记点，
   * 故切换时先清空 markers 再于下一帧回填，强制组件重新渲染全部标记点
   */
  toggleSatellite() {
    const next = !this.data.satellite;
    // 视野锁定：优先取 regionchange 记录的最新值，未记录（如页面刚进入即切换）时回退到 data
    const center = (this._viewCenter && this._viewCenter.latitude != null)
      ? this._viewCenter
      : { latitude: this.data.centerLatitude, longitude: this.data.centerLongitude };
    const scale = this._viewScale || this.data.scale;
    // 保留当前 markers（含高亮后的 iconPath 与 zIndex），用于回填
    const markers = this.data.markers;

    this.setData({
      satellite: next,
      centerLatitude: center.latitude,
      centerLongitude: center.longitude,
      scale: scale,
      // 清空自适应视野，避免底图切换后地图被重新适配
      includePoints: [],
      markers: []
    });

    const restore = () => {
      this.setData({ markers: markers });
    };
    if (typeof wx.nextTick === 'function') wx.nextTick(restore);
    else setTimeout(restore, 50);

    wx.showToast({ title: next ? '卫星图' : '标准图', icon: 'none', duration: 800 });
  },

  /** 记录当前视野（regionchange end 阶段），供底图切换时锁定视野使用 */
  onRegionChange(e) {
    if (!e || e.type !== 'end') return;
    const d = e.detail || {};
    if (d.centerLocation) {
      this._viewCenter = { latitude: d.centerLocation.latitude, longitude: d.centerLocation.longitude };
    }
    if (d.scale) this._viewScale = Math.round(d.scale);
  },

  onMarkerTap(e) {
    const index = e.detail.markerId;
    const member = (this._markerMembers || [])[index];
    if (!member) return;
    this.selectMember(member);
  },

  /** 侧边列表点击成员：与点击地图标记点等效 */
  onMemberTap(e) {
    const id = String(e.currentTarget.dataset.id);
    const member = (this._display || []).filter((m) => String(m.id) === id)[0] ||
      (this._markerMembers || []).filter((m) => String(m.id) === id)[0];
    if (!member) return;
    this.selectMember(member);
  },

  // ==================== 成员查询 ====================

  /** 输入即时检索：防抖后执行服务端检索 */
  onSearchInput(e) {
    const keyword = (e.detail.value || '').trim();
    this.setData({ keyword: keyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this._searchTimer = null;
      this.applySearch(keyword);
    }, SEARCH_DEBOUNCE);
  },

  /** 键盘搜索键：跳过防抖立即检索 */
  onSearchConfirm(e) {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    this.applySearch((e.detail.value || '').trim());
  },

  /** 清空关键字：恢复完整成员列表 */
  clearKeyword() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    this.setData({ keyword: '' });
    this.applySearch('');
  },

  /** 按「查询键配置」把关键字映射为后端检索参数；未登记的维度回退默认维度 */
  buildSearchParams(keyword, searchKey) {
    const conf = SEARCH_KEYS.filter((item) => item.key === (searchKey || DEFAULT_SEARCH_KEY))[0];
    const params = {};
    if (conf && conf.mode === 'fuzzy' && keyword) params[conf.param] = keyword;
    return params;
  },

  /**
   * 执行成员检索（服务端）：
   * - 关键字需满 SEARCH_MIN_LENGTH 个字符才触发，不足则回到默认成员列表
   * - 通过 buildSearchParams 按「查询键配置」映射后端参数，覆盖全部家族成员（不受本地缓存与分页上限限制）
   * - 命中结果重建地图标记点、同步侧边列表，并对无坐标成员给出提示
   */
  applySearch(keyword) {
    if (this.data.status !== 'ready') return;
    const raw = keyword || '';
    const kw = raw.trim();

    // 不足最小长度：不发起检索，恢复默认成员列表与标记点
    if (kw.length < SEARCH_MIN_LENGTH) {
      this.resetSearch(raw);
      return;
    }

    const startedAt = Date.now();
    const seq = ++this._searchSeq;
    this.setData({ keyword: raw, searching: true });

    this.fetchMembers(this.data.familyId, {
      keyword: this.buildSearchParams(kw).keyword,
      limit: SEARCH_FETCH_LIMIT
    })
      .then((result) => {
        if (seq !== this._searchSeq) return;   // 丢弃过期响应（用户已继续输入）
        const matched = (result.list || [])
          .map(normalizeMember)
          .map((m) => this.decorate(m));
        this.applySearchResult(raw, matched);
        console.log('[member-map] 查询耗时 ' + (Date.now() - startedAt) +
          'ms，命中 ' + matched.length + ' 位');
      })
      .catch((err) => {
        if (seq !== this._searchSeq) return;
        console.error('[member-map] 成员检索失败', err);
        this.setData({ searching: false });
        wx.showToast({ title: '查询失败，请重试', icon: 'none' });
      });
  },

  /**
   * 检索命中结果落地：
   * - 重建地图标记点（仅有坐标命中者，且全部渲染为命中高亮）
   * - 命中 0 条 → 空态；命中 1 条 → 直接展示详情；命中 ≥2 条 → 列表展示全部匹配项
   * - 统计并提示未录入位置坐标的成员数
   */
  applySearchResult(rawKeyword, matched) {
    const coordHits = matched.filter((m) => m.hasCoord);
    const noCoordCount = matched.length - coordHits.length;
    const single = matched.length === 1 ? matched[0] : null;

    this._results = matched;
    this._display = matched;
    this._highlightIds = new Set(matched.map((m) => String(m.id)));
    this._markerMembers = coordHits;

    this.setData({
      keyword: rawKeyword || '',
      searchActive: true,
      searching: false,
      matchedCount: matched.length,
      noCoordCount: noCoordCount,
      detailMember: single,
      listSummary: '命中 ' + matched.length + ' 位',
      // 命中 1 条时直接展示详情，不渲染列表
      listMembers: single ? [] : matched.slice(0, LIST_RENDER_STEP),
      listHasMore: !single && matched.length > LIST_RENDER_STEP,
      markers: this.buildMarkers(coordHits, true),
      // 仅有坐标命中时才调整视野，避免无坐标结果把地图拉回默认位置
      includePoints: coordHits.length ? this.buildFitPoints(coordHits) : [],
      // 检索属于浏览行为：结束当前路线展示，让侧边栏回到结果
      selectedMember: null,
      selectedId: '',
      routeLoading: false,
      routeFailed: false,
      routeFallback: false,
      routeInfo: null,
      routeSteps: [],
      polyline: []
    });

    if (!matched.length) wx.showToast({ title: '未找到匹配的成员', icon: 'none' });
  },

  /** 关键字不足最小长度或已清空：恢复默认成员列表与标记点 */
  resetSearch(rawKeyword) {
    this._searchSeq++;                      // 使在途检索响应失效
    const wasSearching = this.data.searchActive || this.data.searching;

    this._results = [];
    this._highlightIds = null;
    this._display = (this._baseMembers || []).slice();
    this._markerMembers = (this._baseMembers || []).slice();

    // 已处于默认态：仅同步输入框关键字，避免重复重建上千标记点
    if (!wasSearching) {
      this.setData({ keyword: rawKeyword || '' });
      return;
    }

    this.setData({
      keyword: rawKeyword || '',
      searchActive: false,
      searching: false,
      matchedCount: 0,
      detailMember: null,
      noCoordCount: 0,
      listSummary: this.buildInitialSummary(),
      listMembers: this._display.slice(0, LIST_RENDER_STEP),
      listHasMore: this._display.length > LIST_RENDER_STEP,
      markers: this.buildMarkers(this._markerMembers, false, ''),
      includePoints: this.buildFitPoints(this._display),
      // 恢复默认列表时结束当前路线展示
      selectedMember: null,
      selectedId: '',
      routeLoading: false,
      routeFailed: false,
      routeFallback: false,
      routeInfo: null,
      routeSteps: [],
      polyline: []
    });
  },

  /** 单命中详情卡：点击「规划导航路线」按钮，复用既有选中并规划流程 */
  onDetailNavigate() {
    const member = this.data.detailMember;
    if (!member) return;
    if (!member.hasCoord) {
      wx.showToast({ title: '该成员无定位坐标，无法导航', icon: 'none' });
      return;
    }
    this.selectMember(member);
  },

  /** 侧边列表滚动到底：追加渲染下一批成员（增量渲染，避免一次性渲染上千条） */
  onListReachBottom() {
    if (this.data.selectedMember || this.data.detailMember) return;
    const shown = this.data.listMembers.length;
    const total = (this._display || []).length;
    if (shown >= total) return;
    const next = Math.min(shown + LIST_RENDER_STEP, total);
    this.setData({
      listMembers: this._display.slice(0, next),
      listHasMore: next < total
    });
  },

  // ==================== 定位 ====================

  /**
   * 申请定位（页面进入与点击「定位」按钮时调用）；返回是否成功
   * 并发调用共享同一次请求，避免页面加载中定位未完成时误判为失败
   */
  requestLocation(guideDenied) {
    if (this._locationPromise) return this._locationPromise;
    // 页面进入时的自动定位不弹窗打断，仅在用户主动操作（点击标记/定位按钮）时引导去设置
    const guide = guideDenied !== false;
    this.setData({ locating: true });
    this._locationPromise = new Promise((resolve) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.setData({
            locating: false,
            locationDenied: false,
            myLocation: { latitude: res.latitude, longitude: res.longitude }
          });
          resolve(true);
        },
        fail: (err) => {
          const msg = (err && err.errMsg) || '';
          const denied = /auth|deny|denied|permission|authorize/i.test(msg);
          console.warn('[member-map] 定位失败', msg);
          this.setData({ locating: false, locationDenied: true });
          resolve(false);
          // 权限类失败给出可操作的引导；系统定位未开启等其它失败仅提示
          if (denied && guide) this.handleLocationDenied();
          else if (!denied) wx.showToast({ title: '定位失败,请检查系统定位是否开启', icon: 'none' });
        }
      });
    }).then((ok) => {
      this._locationPromise = null;
      return ok;
    });
    return this._locationPromise;
  },

  /** 定位权限被拒绝：引导用户到设置页开启，开启后自动恢复规划 */
  handleLocationDenied() {
    wx.showModal({
      title: '需要定位权限',
      content: '开启定位后，才能以你的当前位置为起点规划导航路线。',
      confirmText: '去设置',
      cancelText: '暂不',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        wx.openSetting({
          success: (setRes) => {
            const allowed = !!(setRes.authSetting && setRes.authSetting['scope.userLocation']);
            if (!allowed) return;
            this.requestLocation().then((ok) => {
              if (!ok) return;
              // 恢复后若已有选中成员，直接重新规划路线
              const member = this.data.selectedMember;
              if (member) this.doPlanRoute(member);
            });
          }
        });
      }
    });
  },

  /** 面板「去设置」：直接打开设置页，授权成功后自动恢复规划 */
  openLocationSetting() {
    wx.openSetting({
      success: (setRes) => {
        const allowed = !!(setRes.authSetting && setRes.authSetting['scope.userLocation']);
        if (!allowed) return;
        const member = this.data.selectedMember;
        if (member) this.doPlanRoute(member);
        else this.requestLocation();
      }
    });
  },

  /** 工具栏「定位」按钮：重新定位并按场景刷新视野/路线 */
  relocate() {
    this.requestLocation().then((ok) => {
      if (!ok) return;
      const member = this.data.selectedMember;
      if (member) {
        this.doPlanRoute(member);
      } else {
        // 无选中目标：视野恢复为当前列表（全部成员或查询命中成员）
        this.setData({
          includePoints: this.buildFitPoints(this._display && this._display.length ? this._display : this._baseMembers)
        });
      }
    });
  },

  // ==================== 路线规划 ====================

  /** 选中成员（高亮标记 + 展示信息 + 规划路线） */
  selectMember(member) {
    // 未录入有效坐标的成员：仅提示，不进入导航流程
    if (member.hasCoord === false) {
      wx.showToast({ title: '该成员未录入位置坐标，无法定位导航', icon: 'none' });
      return;
    }
    this.setData({
      selectedMember: member,
      selectedId: member.id,
      scale: Math.max(this.data.scale, 12)
    });
    this.syncMarkerHighlight(this._highlightIds, member.id);
    this.planRoute(member);
  },

  /** 规划路线：先确保有起点定位，再请求路线服务 */
  planRoute(member) {
    if (!this.isValidCoord(member.latitude, member.longitude)) {
      wx.showToast({ title: '该成员坐标异常,无法规划路线', icon: 'none' });
      return;
    }
    if (this.data.myLocation) {
      this.doPlanRoute(member);
      return;
    }
    this.setData({ routeLoading: true, routeFailed: false, routeFallback: false, routeInfo: null, routeSteps: [], polyline: [] });
    this.requestLocation().then((ok) => {
      if (ok) this.doPlanRoute(member);
      else this.setData({ routeLoading: false, routeFailed: true });
    });
  },

  /** 调用腾讯位置服务驾车路线规划，成功后绘制折线与分步指引 */
  doPlanRoute(member) {
    const from = this.data.myLocation;
    if (!from) {
      this.setData({ routeLoading: false, routeFailed: true });
      return;
    }
    this.setData({ routeLoading: true, routeFailed: false, routeFallback: false });
    wx.request({
      url: DIRECTION_URL,
      data: {
        from: from.latitude + ',' + from.longitude,
        to: member.latitude + ',' + member.longitude,
        key: LBS_KEY,
        output: 'json'
      },
      timeout: 10000,
      success: (res) => {
        const result = (res.data && res.data.result) || null;
        const route = result && result.routes && result.routes[0];
        if (!route || !route.polyline || !route.polyline.length) {
          this.applyStraightFallback(member);
          return;
        }
        const points = this.samplePoints(this.decodePolyline(route.polyline));
        const steps = (route.steps || []).map((s, i) => ({
          index: i + 1,
          instruction: s.instruction || '继续前行',
          distance: this.formatDistance(s.distance)
        }));
        this.setData({
          polyline: [{
            points: points,
            color: '#1A73E8CC',
            width: 6,
            arrowLine: true,
            borderColor: '#FFFFFFAA',
            borderWidth: 2
          }],
          routeInfo: {
            distanceText: this.formatDistance(route.distance) || '—',
            // 腾讯 WebService 的 duration 单位为分钟
            durationText: this.formatDuration(route.duration)
          },
          routeSteps: steps,
          routeLoading: false,
          routeFailed: false,
          routeFallback: false,
          includePoints: [
            { latitude: from.latitude, longitude: from.longitude },
            { latitude: member.latitude, longitude: member.longitude }
          ]
        });
      },
      fail: (err) => {
        console.error('[member-map] 路线规划失败', err);
        // 网络/服务异常：退化为直线参考，不阻塞其它操作
        this.applyStraightFallback(member);
      }
    });
  },

  /** 路线服务不可用时的降级：直线连接起终点并给出直线距离 */
  applyStraightFallback(member) {
    const from = this.data.myLocation;
    if (!from) {
      this.setData({ routeLoading: false, routeFailed: true });
      return;
    }
    const meters = this.straightDistance(from, member);
    this.setData({
      polyline: [{
        points: [
          { latitude: from.latitude, longitude: from.longitude },
          { latitude: member.latitude, longitude: member.longitude }
        ],
        color: '#F5A623CC',
        width: 5,
        dottedLine: true,
        borderColor: '#FFFFFFAA',
        borderWidth: 2
      }],
      routeInfo: { distanceText: this.formatDistance(meters) || '—', durationText: '' },
      routeSteps: [],
      routeLoading: false,
      routeFailed: false,
      routeFallback: true,
      includePoints: [
        { latitude: from.latitude, longitude: from.longitude },
        { latitude: member.latitude, longitude: member.longitude }
      ]
    });
  },

  /** 腾讯折线压缩坐标解码：[lat0,lng0,dlat1,dlng1,...] → 经纬度数组 */
  decodePolyline(polyline) {
    const coors = polyline.slice();
    const factor = 1000000;
    for (let i = 2; i < coors.length; i++) {
      coors[i] = Number(coors[i - 2]) + Number(coors[i]) / factor;
    }
    const points = [];
    for (let i = 0; i < coors.length; i += 2) {
      if (coors[i + 1] === undefined) break;
      points.push({ latitude: Number(coors[i]), longitude: Number(coors[i + 1]) });
    }
    return points;
  },

  /** 折线抽稀：超过上限时等间隔采样，并对坐标做 6 位取整减小 setData 体积 */
  samplePoints(points) {
    const step = points.length > MAX_POLYLINE_POINTS ? Math.ceil(points.length / MAX_POLYLINE_POINTS) : 1;
    const result = [];
    for (let i = 0; i < points.length; i += step) {
      const p = points[i];
      result.push({
        latitude: Number(p.latitude.toFixed(6)),
        longitude: Number(p.longitude.toFixed(6))
      });
    }
    // 保证终点不丢失
    const last = points[points.length - 1];
    const tail = result[result.length - 1];
    if (tail && (tail.latitude !== last.latitude || tail.longitude !== last.longitude)) {
      result.push({ latitude: Number(last.latitude.toFixed(6)), longitude: Number(last.longitude.toFixed(6)) });
    }
    return result;
  },

  /** 两点间直线距离（米，Haversine） */
  straightDistance(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = rad(b.latitude - a.latitude);
    const dLng = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  },

  formatDistance(meters) {
    const m = Number(meters);
    if (!isFinite(m) || m <= 0) return '';
    if (m < 1000) return Math.round(m) + '米';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0) + '公里';
  },

  formatDuration(minutes) {
    const t = Number(minutes);
    if (!isFinite(t) || t <= 0) return '';
    if (t < 60) return Math.round(t) + '分钟';
    const h = Math.floor(t / 60);
    const rest = Math.round(t % 60);
    return h + '小时' + (rest ? rest + '分钟' : '');
  },

  /** 路线规划失败后重试 */
  retryRoute() {
    const member = this.data.selectedMember;
    if (!member) return;
    this.planRoute(member);
  },

  /** 打开地图App导航：跳转外部地图应用完成导航（微信内置地图页可唤起高德/百度/腾讯地图） */
  openExternalMap() {
    const member = this.data.selectedMember;
    if (!member) return;
    if (!this.isValidCoord(member.latitude, member.longitude)) {
      wx.showToast({ title: '该成员坐标异常,无法导航', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: member.latitude,
      longitude: member.longitude,
      name: member.name + '（' + member.statusText + '）',
      address: member.placeLabel || '家族成员位置',
      scale: 16,
      fail: (err) => {
        console.warn('[member-map] 打开地图失败', err);
        wx.showToast({ title: '打开地图失败,请重试', icon: 'none' });
      }
    });
  },

  /** 关闭导航详情，回到成员列表（保留当前查询结果） */
  clearRoute() {
    this.setData({
      selectedMember: null,
      selectedId: '',
      routeLoading: false,
      routeFailed: false,
      routeFallback: false,
      routeInfo: null,
      routeSteps: [],
      polyline: [],
      includePoints: this.buildFitPoints(this._display && this._display.length ? this._display : this._baseMembers)
    });
    this.syncMarkerHighlight(this._highlightIds, '');
  },

  /** 未登录：触发静默登录并轮询登录结果 */
  doLogin() {
    app.login();
    wx.showLoading({ title: '登录中...' });
    if (this._loginTimer) clearInterval(this._loginTimer);
    let tries = 0;
    this._loginTimer = setInterval(() => {
      tries++;
      if (getToken() || tries >= 10) {
        clearInterval(this._loginTimer);
        this._loginTimer = null;
        wx.hideLoading();
        if (getToken()) this.loadMembers();
        else wx.showToast({ title: '登录失败,请重试', icon: 'none' });
      }
    }, 500);
  }
});
