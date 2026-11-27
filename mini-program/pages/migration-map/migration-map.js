/**
 * 家族时空地图（识典古籍对标 · 阶段 6）
 *
 * 核心架构（从经验教训总结）：
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  业务层（只更新语义状态，禁止直接写 center/markers）    │
 *   │    loadGenerations()  loadMigration()  playAnimation()  │
 *   │    stepTimeline()     onGenSelect()                      │
 *   └──────────────────────┬──────────────────────────────────┘
 *                          │ 统一调用 render()
 *   ┌──────────────────────▼──────────────────────────────────┐
 *   │  渲染层（单一入口：render(allowMoveCenter)）             │
 *   │    根据当前模式（auto / manual）统一写 center/markers    │
 *   └─────────────────────────────────────────────────────────┘
 *
 *   模式优先级：manual（用户交互锁定）> auto（自动跟随）
 *   任何异步回调都不得直接写 center，必须通过 render(allowMoveCenter=false)
 */
const api = require('../../utils/api.js');

const app = getApp();
const LBS_KEY = (app.globalData && app.globalData.lbsKey) || '';

/** marker 图标类型（使用项目已有的 3 种 marker 图，按语义复用） */
const MARKER_TYPES = {
  ancestor:   { iconPath: '/images/marker-alive.png',      width: 32, height: 40, calloutColor: '#8B1A1A' },
  birth:      { iconPath: '/images/marker-alive.png',      width: 28, height: 36, calloutColor: '#2d6a4f' },
  death:      { iconPath: '/images/marker-deceased.png',  width: 28, height: 36, calloutColor: '#5a4a3a' },
  migration:  { iconPath: '/images/marker-alive.png',      width: 32, height: 40, calloutColor: '#e07a5f' },
  current:    { iconPath: '/images/marker-selected.png',  width: 40, height: 50, calloutColor: '#7b2cbf' }
};

const DEFAULT_CENTER = { latitude: 34.3, longitude: 108.9 }; // 西安（华夏原点）

Page({
  // ============================================================
  // 数据（语义状态：业务函数更新这些，render 统一消费）
  // ============================================================
  data: {
    familyId: null,
    lbsKeyConfigured: !!LBS_KEY,

    // 语义状态（业务层只写这些）
    generations: [],              // GenerationGeo[]
    migration: null,               // { points, routes }
    currentGen: null,              // 当前选中的世代（null = 全部）
    showMigration: true,           // 是否显示迁徙路线 polyline

    // 渲染模式（决定 render() 是否允许移动 center）
    renderMode: 'manual',          // 'auto' = 动画跟随 / 'manual' = 用户锁定

    // 地图渲染产物（只在 render() 中写入）
    mapCenter: DEFAULT_CENTER,
    markers: [],                   // 所有 marker
    polyline: [],                  // 迁徙路线折线
    scale: 4,

    // UI 状态
    loading: true,
    generationsList: [],           // 供时间轴选择 [1,2,3,...]
    animating: false,
    animStep: 0,
    selectedMember: null,          // 点击 marker 后的成员详情
    showingHistory: false,         // 是否叠加历史事件侧栏
    historyEvents: [],
    familyTimeline: null,          // 家族事件 + 历史事件叠加

    // 卷轴沉浸型新增 UI 状态
    activeDrawer: null             // 当前打开的抽屉：null / 'anim' / 'layer' / 'history'
  },

  // 动画定时器
  animTimer: null,

  // ============================================================
  // 生命周期
  // ============================================================
  onLoad: function (query) {
    const familyId = query.familyId ? Number(query.familyId) : this.getCurrentFamilyId();
    if (!familyId) {
      wx.showToast({ title: '请先绑定家族', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.setData({ familyId });
    this.loadAll();
  },

  onUnload: function () {
    this.stopAnimation();
  },

  // ============================================================
  // 业务层：只更新语义状态
  // ============================================================

  async loadAll() {
    this.setData({ loading: true });
    try {
      // request.js 已经把后端 {code, data, msg} 包装拆掉了，直接 resolve(data.data)
      // 所以 genRes 就是后端 generations 接口的 data.data（数组），不需要再取 .data
      const [gens, mig, tl] = await Promise.all([
        api.timelineMap.getGenerations(this.data.familyId).catch(err => {
          console.warn('[timeline-map] getGenerations 失败:', err);
          return [];
        }),
        api.timelineMap.getMigration(this.data.familyId).catch(err => {
          console.warn('[timeline-map] getMigration 失败:', err);
          return { points: [], routes: [] };
        }),
        api.timelineMap.getCombinedTimeline(this.data.familyId).catch(err => {
          console.warn('[timeline-map] getCombinedTimeline 失败:', err);
          return { familyEvents: [], historyEvents: [] };
        })
      ]);

      console.log('[timeline-map] 收到数据:', {
        generationsCount: Array.isArray(gens) ? gens.length : -1,
        migrationPoints: mig && mig.points ? mig.points.length : -1,
        familyId: this.data.familyId,
        sample: Array.isArray(gens) && gens[0] ? gens[0] : null
      });

      if (!Array.isArray(gens) || gens.length === 0) {
        console.warn('[timeline-map] generations 为空！请检查后端是否已部署修复后的字段名。familyId =', this.data.familyId);
      }

      this.setData({
        generations: Array.isArray(gens) ? gens : [],
        generationsList: Array.isArray(gens) ? gens.map(g => g.generation) : [],
        migration: mig || { points: [], routes: [] },
        historyEvents: tl && tl.historyEvents ? tl.historyEvents : [],
        familyTimeline: tl
      });

      // 渲染（首次加载允许移动 center）
      this.render(true);
    } catch (err) {
      console.error('[timeline-map] loadAll 最终异常:', err);
      wx.showToast({ title: err.msg || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 时间轴点击某个世代 —— 业务只改 currentGen，render 负责渲染 */
  onGenSelect: function (e) {
    // 微信 dataset 会把所有值转成字符串，所以 {{null}} 传过来是 "null" 或 undefined
    const raw = e.currentTarget.dataset.gen;
    const gen = (raw === null || raw === undefined || raw === 'null' || raw === '')
      ? null                          // 全貌节点 → 全选
      : Number(raw);                  // 具体世代 → 转数字

    // 如果点的是当前已选中的 → 回到全貌（toggle）
    const newVal = (this.data.currentGen !== null && this.data.currentGen === gen)
      ? null
      : gen;

    this.setData({
      currentGen: newVal,
      renderMode: 'manual'
    });
    // 点全貌 / 点切换世代都允许重新居中
    this.render(true);
  },

  /** 显示/隐藏迁徙路线 */
  toggleMigration: function () {
    this.setData({ showMigration: !this.data.showMigration });
    this.render(false);
  },

  /** 播放迁徙动画 —— 业务只推进 animStep，render 统一渲染 */
  playAnimation: function () {
    if (this.data.animating) { this.stopAnimation(); return; }

    const gens = this.data.generationsList;
    if (gens.length < 2) {
      wx.showToast({ title: '至少需要 2 代位置数据', icon: 'none' });
      return;
    }

    this.setData({ animating: true, animStep: 0, renderMode: 'auto', currentGen: gens[0] });
    this.render(true); // 动画启动 → 允许移动 center

    this.animTimer = setInterval(() => {
      const next = this.data.animStep + 1;
      if (next >= gens.length) {
        this.stopAnimation();
        this.setData({ currentGen: null });
        this.render(false);
        return;
      }
      this.setData({
        animStep: next,
        currentGen: gens[next]
      });
      this.render(true); // auto 模式：每次都允许移动 center
    }, 2000);
  },

  stopAnimation: function () {
    if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; }
    this.setData({ animating: false });
  },

  /** marker 点击 → 从私有映射表查完整成员数据 */
  onMarkerTap: function (e) {
    const markerId = Number(e.detail.markerId);  // ⚠️ 微信返回的 markerId 已经是 number
    console.log('[timeline-map] onMarkerTap markerId:', markerId, '类型:', typeof markerId);

    // 1. 从 render 维护的私有映射表查（完整 member + generation 信息）
    const info = this._markerIndexMap && this._markerIndexMap.get(markerId);
    if (!info) {
      console.warn('[timeline-map] onMarkerTap 找不到 markerId =', markerId);
      return;
    }
    const genMatch = info.member;
    const genInfo = info.gen;

    console.log('[timeline-map] genMatch:', genMatch);
    console.log('[timeline-map] lat 类型:', typeof genMatch.lat, '值:', genMatch.lat);

    // 2. 强制转 Number（后端 MySQL DECIMAL 返回字符串也能兜住）
    const rawLat = genMatch.lat ?? genMatch.latitude ?? null;
    const rawLng = genMatch.lng ?? genMatch.longitude ?? null;
    const memberLat = rawLat !== null && rawLat !== undefined && rawLat !== ''
      ? Number(rawLat) : null;
    const memberLng = rawLng !== null && rawLng !== undefined && rawLng !== ''
      ? Number(rawLng) : null;

    console.log('[timeline-map] 转换后:', { memberLat, memberLng });

    // 3. 找迁徙点类型
    let migPoint = null;
    const mig = this.data.migration;
    if (mig && mig.points && memberLat !== null && memberLng !== null) {
      migPoint = mig.points.find(p =>
        p.memberName === genMatch.name &&
        Math.abs(Number(p.lat) - memberLat) < 0.01 &&
        Math.abs(Number(p.lng) - memberLng) < 0.01
      );
    }

    const member = {
      memberName: genMatch.name,
      name: genMatch.placeName || (migPoint ? migPoint.name : '') || '位置不详',
      lat: memberLat,
      lng: memberLng,
      latitude: memberLat,
      longitude: memberLng,
      generation: genInfo.generation,
      year: genMatch.year || (migPoint ? migPoint.year : null),
      type: migPoint ? migPoint.type : (genInfo.generation === 1 ? 'ancestor' : 'birth'),
      memberId: String(genMatch.id)
    };
    console.log('[timeline-map] selectedMember:', member);
    this.setData({ selectedMember: member });
  },

  closeMemberDetail: function () {
    this.setData({ selectedMember: null });
  },

  toggleHistoryPanel: function () {
    this.setData({ showingHistory: !this.data.showingHistory });
  },

  // ============================================================
  // 渲染层：单一入口 render(allowMoveCenter)
  //
  // 规则：
  //   1. 所有 marker/polyline/center 写入都收敛到这里
  //   2. allowMoveCenter = false 时不得改 center（manual 模式保护）
  //   3. 业务层不直接写 markers/center
  // ============================================================

  render: function (allowMoveCenter) {
    const gens = this.data.generations;
    const mig = this.data.migration;
    const currentGen = this.data.currentGen;
    const showMig = this.data.showMigration;

    // ========= 1. 构建 marker 列表 =========
    // ⚠️ 微信 map 组件 3.16.2 要求 marker.id 必须是 number！
    //    后端 member.id 是 VARCHAR(32)，所以用连续数字索引当 id
    //    同时维护一个私有映射表 _markerIndexMap：markerId(number) → { gen, member }
    let markers = [];
    const markerIndexMap = new Map();   // 私有映射（同步写 data）
    let markerSeq = 0;

    if (gens.length > 0) {
      const targetGens = currentGen !== null
        ? gens.filter(g => g.generation === currentGen)
        : gens;

      for (const g of targetGens) {
        for (const m of g.members) {
          const type = this.classifyMarkerType(m, mig);
          const tmpl = MARKER_TYPES[type] || MARKER_TYPES.birth;
          const markerId = markerSeq++;   // ✅ number！
          markers.push({
            id: markerId,
            latitude: Number(m.lat),
            longitude: Number(m.lng),
            iconPath: tmpl.iconPath,
            width: tmpl.width,
            height: tmpl.height,
            callout: {
              content: `第${g.generation}代·${m.name}`,
              color: '#ffffff',
              bgColor: tmpl.calloutColor,
              padding: 6,
              borderRadius: 6,
              fontSize: 11,
              display: 'BYCLICK'
            }
          });
          markerIndexMap.set(markerId, { gen: g, member: m });
        }
      }
    }

    // ========= 2. 构建 polyline =========
    let polyline = [];
    if (showMig && mig && mig.routes && mig.routes.length > 0) {
      polyline = mig.routes.map((route, idx) => ({
        points: [
          { latitude: Number(route.from.lat), longitude: Number(route.from.lng) },
          { latitude: Number(route.to.lat), longitude: Number(route.to.lng) }
        ],
        color: idx === this.data.animStep && this.data.renderMode === 'auto' ? '#7b2cbf' : '#e07a5f',
        width: 3,
        arrowLine: true,
        zIndex: idx + 1
      }));
    }

    // ========= 3. center =========
    let center = this.data.mapCenter;
    let scale = this.data.scale;
    if (allowMoveCenter && markers.length > 0) {
      const lats = markers.map(m => m.latitude);
      const lngs = markers.map(m => m.longitude);
      const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      center = { latitude: avgLat, longitude: avgLng };
      const latRange = Math.max(...lats) - Math.min(...lats);
      const lngRange = Math.max(...lngs) - Math.min(...lngs);
      const maxRange = Math.max(latRange, lngRange);
      if (maxRange > 20) scale = 3;
      else if (maxRange > 10) scale = 4;
      else if (maxRange > 5) scale = 5;
      else if (maxRange > 1) scale = 6;
      else scale = 7;
    }

    // ========= 4. 统一 setData =========
    // 映射表转成数组存 data（onMarkerTap 需要读）
    const markerMapArr = Array.from(markerIndexMap.entries()).map(([markerId, info]) => ({
      markerId,
      memberId: String(info.member.id),
      generation: info.gen.generation
    }));

    this.setData({
      markers,
      polyline,
      mapCenter: center,
      scale,
      _markerMap: markerMapArr   // 供 onMarkerTap 回查
    });

    // 私有实例变量保留完整映射（onMarkerTap 直接查，不走 data）
    this._markerIndexMap = markerIndexMap;

    console.log('[timeline-map] render 完成:', {
      markersCount: markers.length,
      polylineCount: polyline.length,
      center, scale
    });
  },

  /** 根据 migration 数据分类 marker 类型 */
  classifyMarkerType: function (member, mig) {
    if (!mig || !mig.points) return 'birth';
    const found = mig.points.find(
      p => Math.abs(p.lat - member.lat) < 0.01 &&
           Math.abs(p.lng - member.lng) < 0.01 &&
           p.memberName === member.name
    );
    return found ? found.type : 'birth';
  },

  // ============================================================
  // 卷轴沉浸型：抽屉开关
  // ============================================================
  /** 切换抽屉（点击浮动按钮） */
  toggleDrawer: function (e) {
    const name = e.currentTarget.dataset.drawer;
    this.setData({
      activeDrawer: this.data.activeDrawer === name ? null : name
    });
  },
  /** 关闭抽屉 */
  closeDrawer: function () {
    this.setData({ activeDrawer: null });
  },

  // ============================================================
  // 工具
  // ============================================================
  getCurrentFamilyId: function () {
    try { const info = wx.getStorageSync('current_family'); return info ? Number(info.id) : null; }
    catch { return null; }
  },

  /** 回到全部标记的中心（重置 currentGen + 自动居中） */
  recenterMap: function () {
    this.setData({
      currentGen: null,
      renderMode: 'manual'
    });
    this.render(true); // allowMoveCenter = true：重新计算中心并居中
  },

  /** 重新拉取数据 */
  reloadData: function () {
    wx.showToast({ title: '刷新中...', icon: 'loading' });
    this.loadAll();
  },

  /** 跳转添加成员 */
  goAddMember: function () {
    wx.navigateTo({
      url: '/pages/add-member/add-member?familyId=' + this.data.familyId
    });
  },

  /** 返回上一页 */
  goBack: function () {
    wx.navigateBack({ delta: 1 });
  }
});
