/**
 * 混合方案 Demo：Canvas 2D 绘制家谱树节点 + DOM 覆盖层气泡提示
 *
 * 核心思路（与 family-tree-detail 同层渲染原理一致）：
 * - 树形结构、连线、节点卡片全部由 Canvas 2D 绘制，缩放/平移不经过 setData，性能与现有家谱树一致；
 * - 点击节点后，在画布上方的 DOM 覆盖层（WXML view）渲染气泡提示：
 *   文字自动换行、气泡样式与入场动画全部由 CSS 控制，与画布绘制完全解耦；
 * - 气泡定位 = 节点世界坐标 -> 屏幕坐标（与绘制共用同一套 getViewTransform 变换，保证对齐）；
 * - 拖动/缩放时隐藏气泡避免错位，松手后点击重新吸附 —— 这是混合方案中 DOM 层与画布同步的最小成本做法。
 *
 * 运行要求：Canvas 2D（type="2d"）需基础库 >= 2.9.0，本项目为 3.17.0，无兼容问题。
 */

const PADDING = 40;        // 画布内容边距
const NODE_W = 120;        // 节点卡片宽
const NODE_H = 76;         // 节点卡片高
const LEVEL_H = 120;       // 代际垂直间距
const LEVEL_GAP = 24;      // 同级节点水平间距
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.8;
const BUBBLE_W = 220;      // 气泡宽度（用于视口边缘夹取）
const BUBBLE_H = 96;       // 气泡估算高度（用于上方空间不足时翻转到下方）
const CANVAS_BG = '#F5EFE3';

const GENDERS = {
  male: { fill: '#FFFFFF', stroke: '#C8B39A', avatarBg: '#8B1A1A', label: '男' },
  female: { fill: '#FFF0F3', stroke: '#E695A5', avatarBg: '#C25A6E', label: '女' }
};

/** 本地模拟家谱数据（无后端依赖）：3 代 9 人，含一个长名字成员演示 DOM 自动换行 */
const MOCK_MEMBERS = [
  { id: 1, name: '王德福', gender: 'male', birthYear: 1928, isAlive: false, spouseName: '李桂香' },
  { id: 2, name: '王建国', gender: 'male', birthYear: 1955, isAlive: true, fatherId: 1, spouseName: '张秀英' },
  { id: 3, name: '王建军', gender: 'male', birthYear: 1960, isAlive: true, fatherId: 1, spouseName: '刘芳' },
  { id: 4, name: '王秀兰', gender: 'female', birthYear: 1958, isAlive: true, fatherId: 1 },
  { id: 5, name: '王海涛', gender: 'male', birthYear: 1982, isAlive: true, fatherId: 2, spouseName: '赵敏' },
  { id: 6, name: '王海燕·伊丽莎白·玛丽', gender: 'female', birthYear: 1986, isAlive: true, fatherId: 2 },
  { id: 7, name: '王海峰', gender: 'male', birthYear: 1990, isAlive: true, fatherId: 3 },
  { id: 8, name: '王雨桐', gender: 'female', birthYear: 2012, isAlive: true, fatherId: 5 },
  { id: 9, name: '王子墨', gender: 'male', birthYear: 2016, isAlive: true, fatherId: 7 }
];

Page({
  data: {
    tooltip: {
      show: false,
      x: 0,
      y: 0,
      below: false,          // true 时气泡翻转到节点下方
      name: '',
      firstChar: '',
      genderText: '',
      birthText: '',
      statusText: '',
      spouseText: ''
    }
  },

  // 画布实例字段（不进入 data，避免 setData 开销）
  canvasReady: false,
  _canvasInitPending: false,
  canvasCtx: null,
  canvasNode: null,
  canvasDpr: 1,
  canvasWidth: 0,
  canvasHeight: 0,

  nodes: [],                 // 全部节点（含 children/parentId/generation 结构信息）
  layoutMap: {},             // id -> { x, y, width, node }
  root: null,
  selectedId: null,          // 当前选中节点（画布高亮 + 气泡）

  pan: { x: 0, y: 0, startX: 0, startY: 0, touching: false },
  zoom: 1,
  initialScale: 1,
  tapInfo: null,             // 点击判定：记录 touchstart 位置，拖动后置空
  pinchStartDist: 0,
  pinchStartZoom: 1,
  _renderScheduled: false,

  onLoad() {
    this.buildTree();
    this.calcLayout();
  },

  onReady() {
    this.initCanvas();
  },

  /** 初始化 canvas 2d 上下文（与 family-tree-detail 一致，幂等） */
  initCanvas() {
    if (this.canvasReady || this._canvasInitPending) return;
    this._canvasInitPending = true;
    wx.createSelectorQuery()
      .select('#hybridTreeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        this._canvasInitPending = false;
        if (!res || !res[0] || !res[0].node) {
          console.warn('[demo] canvas 节点未找到，重试');
          this._initRetry = (this._initRetry || 0) + 1;
          if (this._initRetry <= 5) setTimeout(() => this.initCanvas(), 200);
          return;
        }
        this._initRetry = 0;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getSystemInfoSync() || {}).pixelRatio || 1;
        this.canvasNode = canvas;
        this.canvasCtx = ctx;
        this.canvasDpr = dpr;
        this.canvasWidth = res[0].width;
        this.canvasHeight = res[0].height;
        canvas.width = this.canvasWidth * dpr;
        canvas.height = this.canvasHeight * dpr;
        ctx.scale(dpr, dpr);
        this.canvasReady = true;
        this.render();
      });
  },

  /** 由 MOCK_MEMBERS 构建节点树：父引用、children、generation */
  buildTree() {
    const map = {};
    MOCK_MEMBERS.forEach((m) => {
      map[m.id] = Object.assign({}, m, { children: [] });
    });
    const roots = [];
    MOCK_MEMBERS.forEach((m) => {
      const node = map[m.id];
      const parent = map[m.fatherId];
      if (parent) {
        node.parentId = m.fatherId;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const assignGen = (n, g) => {
      n.generation = g;
      n.children.forEach((c) => assignGen(c, g + 1));
    };
    roots.forEach((r) => assignGen(r, 1));
    this.nodes = Object.values(map);
    this.root = roots[0];
  },

  /** 树形布局：自底向上计算子树宽度，自顶向下按子树中心排列节点 */
  calcLayout() {
    const widthOf = (node) => {
      if (!node.children.length) {
        node._subW = NODE_W;
        return node._subW;
      }
      let w = 0;
      node.children.forEach((c) => { w += widthOf(c) + LEVEL_GAP; });
      w -= LEVEL_GAP;
      node._subW = Math.max(w, NODE_W);
      return node._subW;
    };
    widthOf(this.root);

    // 每个节点以自己的子树中心为锚点：父节点按子节点中心等宽距排列，自身卡片对齐到子树中心
    const place = (node, centerX) => {
      node.y = (node.generation - 1) * LEVEL_H;
      node.x = centerX - NODE_W / 2;
      const kids = node.children;
      if (!kids.length) return;
      let childTotal = 0;
      kids.forEach((k) => { childTotal += k._subW + LEVEL_GAP; });
      childTotal -= LEVEL_GAP;
      let cur = centerX - childTotal / 2;
      kids.forEach((k) => {
        place(k, cur + k._subW / 2);
        cur += k._subW + LEVEL_GAP;
      });
    };
    place(this.root, this.root._subW / 2);

    // 归一化：整体平移到画布坐标系（留边距）
    let minX = Infinity;
    let minY = Infinity;
    this.nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
    });
    this.nodes.forEach((n) => {
      n.x += PADDING - minX;
      n.y += PADDING - minY;
    });

    this.layoutMap = {};
    this.nodes.forEach((n) => {
      this.layoutMap[n.id] = { x: n.x, y: n.y, width: NODE_W, node: n };
    });
  },

  getBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    this.nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    });
    return { width: maxX - minX || NODE_W, height: maxY - minY || NODE_H };
  },

  /** 统一视图变换（绘制、命中、气泡定位共用同一套，保证三者对齐） */
  getViewTransform() {
    const bounds = this.getBounds();
    const contentW = bounds.width + PADDING * 2;
    const contentH = bounds.height + PADDING * 2;
    const fitX = this.canvasWidth / contentW;
    const fitY = this.canvasHeight / contentH;
    let fit;
    if (contentW > this.canvasWidth && contentH > this.canvasHeight) fit = Math.min(fitX, fitY);
    else if (contentW > this.canvasWidth) fit = fitX;
    else fit = Math.max(fitX, fitY);
    this.initialScale = Math.max(0.5, Math.min(1.4, fit));
    const scale = this.initialScale * this.zoom;
    const offsetX = (this.canvasWidth - contentW * scale) / 2 + this.pan.x;
    const offsetY = (this.canvasHeight - contentH * scale) / 2 + this.pan.y;
    return { scale, offsetX, offsetY };
  },

  /** rAF 调度渲染（画布重绘不经过 setData） */
  requestRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    const doRender = () => {
      this._renderScheduled = false;
      this.render();
    };
    if (this.canvasNode && typeof this.canvasNode.requestAnimationFrame === 'function') {
      this.canvasNode.requestAnimationFrame(doRender);
    } else {
      setTimeout(doRender, 16);
    }
  },

  render() {
    const ctx = this.canvasCtx;
    if (!ctx || !this.nodes.length) return;
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    const { scale, offsetX, offsetY } = this.getViewTransform();
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // 1. 连线（父节点底部 -> 子节点顶部）
    this.nodes.forEach((node) => {
      if (!node.parentId) return;
      const pl = this.layoutMap[node.parentId];
      const cl = this.layoutMap[node.id];
      if (pl && cl) this.drawConnection(ctx, pl, cl);
    });

    // 2. 节点卡片
    this.nodes.forEach((node) => {
      this.drawNode(ctx, this.layoutMap[node.id]);
    });

    ctx.restore();
  },

  drawConnection(ctx, pl, cl) {
    const px = pl.x + pl.width / 2;
    const py = pl.y + NODE_H;
    const cx = cl.x + cl.width / 2;
    const cy = cl.y;
    const midY = py + (cy - py) / 2;
    ctx.beginPath();
    ctx.strokeStyle = '#C9A87C';
    ctx.lineWidth = 1.5;
    ctx.moveTo(px, py);
    ctx.lineTo(px, midY);
    ctx.lineTo(cx, midY);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  },

  drawNode(ctx, l) {
    if (!l) return;
    const node = l.node;
    const g = GENDERS[node.gender] || GENDERS.male;
    const isDead = node.isAlive === false;
    const isSel = this.selectedId === node.id;
    const x = l.x;
    const y = l.y;

    // 卡片底色（选中节点带红色光晕，与 DOM 气泡联动提示）
    this.roundRect(ctx, x, y, NODE_W, NODE_H, 10);
    ctx.save();
    if (isSel) {
      ctx.shadowColor = 'rgba(139, 26, 26, 0.45)';
      ctx.shadowBlur = 14;
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
    }
    ctx.fillStyle = isDead ? '#EFEFEC' : g.fill;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = isSel ? '#8B1A1A' : (isDead ? '#BDBDB6' : g.stroke);
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.stroke();

    // 头像圆 + 首字
    const ax = x + 24;
    const ay = y + NODE_H / 2;
    const r = 16;
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.fillStyle = isDead ? '#C9C9C4' : g.avatarBg;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((node.name || '?').charAt(0), ax, ay + 1);

    // 姓名（按可用宽度截断，避免溢出卡片 —— 画布侧无自动换行，这正是 DOM 气泡的优势点）
    ctx.fillStyle = isDead ? '#9A9A94' : '#4A3F35';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.ellipsize(ctx, node.name, NODE_W - ax - 16), ax + 12, ay);

    // 生年小字
    ctx.font = '10px sans-serif';
    ctx.fillStyle = isDead ? '#B0B0AA' : '#8A7A66';
    ctx.fillText(node.birthYear ? String(node.birthYear) : '未知', ax + 12, ay + 16);

    // 选中描边
    if (isSel) {
      ctx.strokeStyle = '#8B1A1A';
      ctx.lineWidth = 2;
      this.roundRect(ctx, x + 3, y + 3, NODE_W - 6, NODE_H - 6, 8);
      ctx.stroke();
    }
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  },

  /** 点击命中检测：与渲染共用同一套坐标变换，保证命中位置与绘制位置一致 */
  hitTest(x, y) {
    const { scale, offsetX, offsetY } = this.getViewTransform();
    const worldX = (x - offsetX) / scale;
    const worldY = (y - offsetY) / scale;
    let hit = null;
    this.nodes.forEach((node) => {
      const l = this.layoutMap[node.id];
      if (!l) return;
      if (worldX >= l.x && worldX <= l.x + l.width && worldY >= l.y && worldY <= l.y + NODE_H) {
        hit = node;
      }
    });
    return hit;
  },

  onTouchStart(e) {
    const touches = e.touches;
    if (touches.length === 2) {
      this.tapInfo = null;
      this.pinchStartDist = this.touchDist(touches);
      this.pinchStartZoom = this.zoom;
      return;
    }
    const t = touches[0];
    this.tapInfo = { x: t.clientX, y: t.clientY };
    this.pan.startX = t.clientX - this.pan.x;
    this.pan.startY = t.clientY - this.pan.y;
    this.pan.touching = true;
  },

  onTouchMove(e) {
    const touches = e.touches;
    if (touches.length === 2 && this.pinchStartDist > 0) {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.pinchStartZoom * (this.touchDist(touches) / this.pinchStartDist)));
      if (Math.abs(next - this.zoom) > 0.001) {
        this.zoom = next;
        // 缩放期间隐藏气泡：画布内容变化，DOM 气泡继续显示会错位
        if (this.data.tooltip.show) this.setData({ 'tooltip.show': false });
        this.requestRender();
      }
      return;
    }
    if (!this.pan.touching || touches.length !== 1) return;
    const t = touches[0];
    // 位移超过阈值判定为拖动：置空 tapInfo（防止松手误判为点击），并隐藏气泡
    if (this.tapInfo && (Math.abs(t.clientX - this.tapInfo.x) > 10 || Math.abs(t.clientY - this.tapInfo.y) > 10)) {
      this.tapInfo = null;
      if (this.data.tooltip.show) this.setData({ 'tooltip.show': false });
    }
    this.pan.x = t.clientX - this.pan.startX;
    this.pan.y = t.clientY - this.pan.startY;
    this.requestRender();
  },

  onTouchEnd() {
    this.pan.touching = false;
    this.pinchStartDist = 0;
    this.pinchStartZoom = 1;
  },

  onCanvasTap(e) {
    if (!this.tapInfo) return;
    const node = this.hitTest(e.detail.x, e.detail.y);
    if (node) {
      // 画布侧：选中高亮重绘；DOM 侧：显示气泡 —— 混合方案的两层联动
      this.selectedId = node.id;
      this.requestRender();
      this.showTooltip(node);
    } else {
      if (this.selectedId !== null) {
        this.selectedId = null;
        this.requestRender();
      }
      this.setData({ 'tooltip.show': false });
    }
  },

  /** 计算气泡屏幕坐标：节点世界坐标经 getViewTransform 转换，并夹取到画布可视范围 */
  showTooltip(node) {
    const { scale, offsetX, offsetY } = this.getViewTransform();
    const l = this.layoutMap[node.id];
    if (!l) return;
    const sx = offsetX + l.x * scale;
    const sy = offsetY + l.y * scale;
    const cx = sx + (l.width * scale) / 2;

    // 默认气泡在节点上方（底部贴节点顶部上方 8px，箭头指向节点顶边）；
    // 上方空间不足时翻转到节点下方
    let below = false;
    let y = sy;
    if (y < BUBBLE_H + 8) {
      const belowY = sy + NODE_H * scale + 8;
      if (belowY + BUBBLE_H + 8 <= this.canvasHeight) {
        below = true;
        y = belowY;
      }
    }
    // 水平夹取，避免气泡超出画布左右边缘
    const half = BUBBLE_W / 2;
    let x = cx;
    if (x < half + 8) x = half + 8;
    if (x > this.canvasWidth - half - 8) x = this.canvasWidth - half - 8;

    this.setData({
      tooltip: {
        show: true,
        x,
        y,
        below,
        name: node.name,
        firstChar: (node.name || '?').charAt(0),
        genderText: (GENDERS[node.gender] || {}).label || '未知',
        birthText: node.birthYear ? String(node.birthYear) : '未知',
        statusText: '',
        spouseText: node.spouseName || '未记录'
      }
    });
  },

  /** 点击气泡本身：关闭气泡（气泡在画布上方，会拦截该区域的点击） */
  hideTooltip() {
    this.setData({ 'tooltip.show': false });
  },

  /** 气泡内禁止滚动透传（占位处理） */
  noop() {},

  touchDist(touches) {
    return Math.sqrt(Math.pow(touches[0].clientX - touches[1].clientX, 2) + Math.pow(touches[0].clientY - touches[1].clientY, 2));
  }
});
