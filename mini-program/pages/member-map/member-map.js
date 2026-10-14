const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { getToken } = require('../../utils/request');
const { LBS_KEY } = require('../../utils/config');

/**
 * 位置导航页
 * - 地图展示所有已录入经纬度坐标的家族成员（坐标为安葬地点，GCJ-02，与 map 组件坐标系一致）
 * - 标记点按成员状态区分：在世 / 已故 / 当前导航目标
 * - 点击标记点：以当前定位为起点、选中成员为终点规划驾车路线，页内绘制折线并展示分步指引
 * - 提供「打开地图App导航」一键跳转外部地图完成导航
 * - 边界处理：定位权限拒绝、经纬度异常、成员加载失败、路线服务不可用
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

Page({
  data: {
    // 页面状态：loading-加载中 needLogin-未登录 noFamily-未选家族 failed-加载失败 empty-无坐标成员 ready-正常
    status: 'loading',
    familyId: '',
    memberTotal: 0,          // 家族成员总数
    availableCount: 0,       // 已录入坐标的成员数
    aliveCount: 0,
    deceasedCount: 0,
    members: [],             // 有坐标的成员（与 markers 下标一一对应）
    markers: [],
    includePoints: [],       // 自适应视野：自动缩放到包含全部标记点
    centerLatitude: 39.90923,
    centerLongitude: 116.397428,
    scale: 11,
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
    this._members = [];
    this.loadMembers();
  },

  onShow() {
    // 未登录态下用户可能刚完成登录（如从登录页返回），登录态就绪后重新加载
    if (this.data.status === 'needLogin' && getToken()) {
      this.loadMembers();
    }
  },

  /** 加载家族成员并筛选出带有效经纬度的成员 */
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

    this.setData({ status: 'loading', familyId: familyId, locationDenied: false });
    familyMember.getAll(familyId)
      .then((rows) => {
        const all = (rows || []).map(normalizeMember);
        // 经纬度异常（缺失/非数字/超范围/零点）的成员直接跳过，不作为标记点
        const list = all
          .filter((m) => this.isValidCoord(m.latitude, m.longitude))
          .map((m) => this.decorate(m));

        this._members = list;
        if (!list.length) {
          this.setData({
            status: 'empty',
            memberTotal: all.length,
            availableCount: 0,
            aliveCount: 0,
            deceasedCount: 0,
            members: [],
            markers: [],
            includePoints: []
          });
          return;
        }

        const aliveCount = list.filter((m) => m.isAlive).length;
        this.setData({
          status: 'ready',
          memberTotal: all.length,
          availableCount: list.length,
          aliveCount: aliveCount,
          deceasedCount: list.length - aliveCount,
          members: list,
          markers: this.buildMarkers(list, ''),
          includePoints: list.map((m) => ({ latitude: m.latitude, longitude: m.longitude })),
          centerLatitude: list[0].latitude,
          centerLongitude: list[0].longitude
        });
        // 进入页面即申请定位（失败不阻塞地图展示，仅在面板提示）
        this.requestLocation(false);
      })
      .catch((err) => {
        console.error('[member-map] 成员位置加载失败', err);
        this.setData({ status: 'failed' });
      });
  },

  /** 经纬度有效性校验：必须是有限数字、在合法范围内、且不能是 (0,0) 空点 */
  isValidCoord(lat, lng) {
    return typeof lat === 'number' && typeof lng === 'number' &&
      isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
      !(lat === 0 && lng === 0);
  },

  /** 成员数据补充展示字段（状态文案、地点文案、标记点气泡文案） */
  decorate(m) {
    const alive = m.isAlive !== false;
    const place = (m.deathPlace || m.birthPlace || '').trim();
    // 气泡只放姓名+状态，避免地图上文字过长遮挡
    const calloutText = m.name + '（' + (alive ? '在世' : '已故') + '）';
    return {
      id: m.id,
      name: m.name || '未命名成员',
      gender: m.gender,
      generation: m.generation,
      generationName: m.generationName || '',
      isAlive: alive,
      statusText: alive ? '在世' : '已故',
      placeLabel: place,
      calloutText: calloutText,
      latitude: m.latitude,
      longitude: m.longitude
    };
  },

  /**
   * 构建地图标记点
   * @param {Array} list 成员列表
   * @param {string} selectedId 当前选中成员 id（选中者换用高亮图标并置顶）
   */
  buildMarkers(list, selectedId) {
    return list.map((m, index) => {
      const selected = String(m.id) === String(selectedId);
      const iconPath = selected
        ? MARKER_ICONS.selected
        : (m.isAlive ? MARKER_ICONS.alive : MARKER_ICONS.deceased);
      return {
        id: index,
        latitude: m.latitude,
        longitude: m.longitude,
        iconPath: iconPath,
        width: MARKER_WIDTH,
        height: MARKER_HEIGHT,
        // 图标底部尖端对准真实坐标
        anchor: { x: 0.5, y: 1 },
        zIndex: selected ? 100 : 1,
        callout: {
          content: m.calloutText,
          color: '#333333',
          fontSize: 12,
          bgColor: '#FFFFFF',
          padding: 6,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#E0E0E0',
          textAlign: 'center',
          display: 'BYCLICK'
        }
      };
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
        // 无选中目标：视野恢复为包含全部成员标记
        this.setData({
          includePoints: this._members.map((m) => ({ latitude: m.latitude, longitude: m.longitude }))
        });
      }
    });
  },

  // ==================== 路线规划 ====================

  /** 点击地图标记点：选中成员并自动触发路径规划 */
  onMarkerTap(e) {
    const index = e.detail.markerId;
    const member = this._members[index];
    if (!member) return;
    this.selectMember(member);
  },

  /** 选中成员（高亮标记 + 展示信息 + 规划路线） */
  selectMember(member) {
    this.setData({
      selectedMember: member,
      markers: this.buildMarkers(this._members, member.id),
      scale: Math.max(this.data.scale, 12)
    });
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

  /** 清除选中与路线，回到全部成员视野 */
  clearRoute() {
    this.setData({
      selectedMember: null,
      routeLoading: false,
      routeFailed: false,
      routeFallback: false,
      routeInfo: null,
      routeSteps: [],
      polyline: [],
      markers: this.buildMarkers(this._members, ''),
      includePoints: this._members.map((m) => ({ latitude: m.latitude, longitude: m.longitude }))
    });
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
  },

  onUnload() {
    if (this._loginTimer) {
      clearInterval(this._loginTimer);
      this._loginTimer = null;
    }
  }
});
