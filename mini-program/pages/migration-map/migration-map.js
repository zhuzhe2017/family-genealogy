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

/** marker 图标类型 */
const MARKER_TYPES = {
  ancestor:   { iconPath: '/images/marker-ancestor.png', width: 32, height: 40, calloutColor: '#8B1A1A' },
  birth:      { iconPath: '/images/marker-birth.png',    width: 28, height: 36, calloutColor: '#2d6a4f' },
  death:      { iconPath: '/images/marker-death.png',   width: 28, height: 36, calloutColor: '#5a4a3a' },
  migration:  { iconPath: '/images/marker-migration.png', width: 32, height: 40, calloutColor: '#e07a5f' },
  current:    { iconPath: '/images/marker-current.png', width: 40, height: 50, calloutColor: '#7b2cbf' }
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
    familyTimeline: null           // 家族事件 + 历史事件叠加
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
      // 并行加载 3 个数据源
      const [genRes, migRes, tlRes] = await Promise.all([
        api.timelineMap.getGenerations(this.data.familyId).catch(() => ({ data: [] })),
        api.timelineMap.getMigration(this.data.familyId).catch(() => ({ data: { points: [], routes: [] } })),
        api.timelineMap.getCombinedTimeline(this.data.familyId).catch(() => ({ data: { familyEvents: [], historyEvents: [] } }))
      ]);

      const gens = genRes.data || [];
      const mig = migRes.data || { points: [], routes: [] };
      const tl = tlRes.data || { familyEvents: [], historyEvents: [] };

      this.setData({
        generations: gens,
        generationsList: gens.map(g => g.generation),
        migration: mig,
        historyEvents: tl.historyEvents || [],
        familyTimeline: tl
      });

      // 渲染（首次加载允许移动 center）
      this.render(true);
    } catch (err) {
      wx.showToast({ title: err.msg || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 时间轴点击某个世代 —— 业务只改 currentGen，render 负责渲染 */
  onGenSelect: function (e) {
    const gen = Number(e.currentTarget.dataset.gen);
    const newVal = this.data.currentGen === gen ? null : gen; // 再次点取消
    this.setData({
      currentGen: newVal,
      renderMode: 'manual'  // 用户交互 → 手动模式锁定
    });
    this.render(false); // 手动模式：不移动 center
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

  /** marker 点击 → 显示成员详情 */
  onMarkerTap: function (e) {
    const markerId = e.detail.markerId;
    const mig = this.data.migration;
    if (!mig) return;
    const p = mig.points.find(pt => (pt.lat + ',' + pt.lng + pt.memberName) === markerId);
    if (p) {
      this.setData({ selectedMember: p });
    }
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
    let markers = [];

    if (gens.length > 0) {
      // 按世代过滤
      const targetGens = currentGen !== null
        ? gens.filter(g => g.generation === currentGen)
        : gens;

      markers = targetGens.flatMap(g =>
        g.members.map(m => {
          const type = this.classifyMarkerType(m, mig);
          const tmpl = MARKER_TYPES[type] || MARKER_TYPES.birth;
          return {
            id: m.id || (m.lat + ',' + m.lng + m.name),
            latitude: m.lat,
            longitude: m.lng,
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
          };
        })
      );
    }

    // ========= 2. 构建 polyline（迁徙路线） =========
    let polyline = [];
    if (showMig && mig && mig.routes && mig.routes.length > 0) {
      polyline = mig.routes.map((route, idx) => ({
        points: [
          { latitude: route.from.lat, longitude: route.from.lng },
          { latitude: route.to.lat, longitude: route.to.lng }
        ],
        color: idx === this.data.animStep && this.data.renderMode === 'auto' ? '#7b2cbf' : '#e07a5f',
        width: 3,
        arrowLine: true,
        zIndex: idx + 1
      }));
    }

    // ========= 3. 确定 center（manual 模式保护） =========
    let center = this.data.mapCenter;
    let scale = this.data.scale;
    if (allowMoveCenter && markers.length > 0) {
      // auto 模式：计算所有点的中心
      const lats = markers.map(m => m.latitude);
      const lngs = markers.map(m => m.longitude);
      const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      center = { latitude: avgLat, longitude: avgLng };
      // 根据点分布估算缩放级别
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
    this.setData({
      markers,
      polyline,
      mapCenter: center,
      scale
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
  // 工具
  // ============================================================
  getCurrentFamilyId: function () {
    try { const info = wx.getStorageSync('currentFamily'); return info ? Number(info.id) : null; }
    catch { return null; }
  }
});
