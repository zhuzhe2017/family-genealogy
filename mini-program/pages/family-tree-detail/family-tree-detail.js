const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

// 节点绘制常量
const NODE_W = 120;    // 节点卡片宽度（rpx 单位，实际绘制按 dpr 缩放）
const NODE_H = 76;     // 节点卡片高度
const SPOUSE_W = 80;   // 配偶卡片宽度
const LEVEL_H = 180;   // 代际垂直间距
const NODE_GAP_X = 32; // 节点水平间距
const SUBTREE_GAP = 16;// 子树之间额外间距
const TEXT_H = 14;     // 文字行高
const AVATAR_R = 16;   // 头像半径
const PADDING = 24;    // 画布内边距
const MIN_SCALE = 0.3; // 最小缩放倍率
const MAX_SCALE = 1.5; // 最大缩放倍率（过大容易拖出可视区域找不到树）
// 初始视图尺寸策略：小树放大、普通树保证卡片可读，超大宽树整体缩小
const MAX_INITIAL_SCALE = 1.4; // 初始放大上限（内容过小时放大到可读尺寸）
const MIN_FIT_SCALE = 0.75;    // 初始缩放下限：卡片 ≥ 90px，进入完整细节等级
const CANVAS_BG = '#F0E9DD';   // 画布暖纸背景，与白色卡片拉开对比
const LIST_PAGE_SIZE = 50; // 列表视图每页成员数
// LOD 分级阈值（按卡片在屏幕上的实际宽度 px 判定）
const LOD_BLOCK_THRESHOLD = 40;  // 卡片 < 40px 时仅画色块，跳过全部文字
const LOD_MEDIUM_THRESHOLD = 90; // 卡片 < 90px 时画简版（名字 + 配偶色块）

// 直系图（vertical）常量：圆形头像、角色标注、配偶在侧
const V_AVATAR_R = 34;            // 主成员头像半径（世界坐标），符合中尺寸规格
const V_SPOUSE_AVATAR_R = V_AVATAR_R * 0.8; // 配偶头像半径（主成员的 0.8 倍，视觉略小、主次分明）
const V_LEVEL_H = 160;            // 代际垂直间距
const V_SPOUSE_GAP = 28;          // 夫妇头像间距
const V_PADDING_X = 48;           // 直系图水平内边距
const V_MARGIN_Y = 36;            // 上下边距

// 头像组件常量（canvas 2d 绘制层组件化）
const AVATAR_SIZE = { small: 22, medium: V_AVATAR_R, large: 46 }; // 尺寸规格（半径 px）
const AVATAR_SHAPE = { circle: 'circle', rounded: 'rounded' };    // 形状：圆形 / 圆角方形
const AVATAR_BORDER = '#FFFFFF';                                   // 默认描边色（与纸底对比）
const AVATAR_STATUS_ALIVE = '#4CAF50';                             // 在世状态圆点色
const AVATAR_STATUS_DEAD = '#9E9E9E';                              // 已逝状态圆点色
const AVATAR_TIMEOUT = 10000;                                      // 头像加载超时（ms）

Page({
  data: {
    viewMode: 'tree',
    selectedGen: 'all',
    showModal: false,
    selectedNode: {},
    selectedCollapsed: false,
    modalAnimation: {},
    memberList: [],
    listHasMore: false,
    showSearchBar: false,
    searchKeyword: '',
    canvasScale: 1,
    canvasStyle: ''
  },

  // 画布状态（不放入 data，避免频繁 setData 重绘）
  canvasCtx: null,
  canvasDpr: 1,
  canvasWidth: 0,
  canvasHeight: 0,
  allNodes: [],       // 全部成员（含父子关系）
  rootNodes: [],      // 顶层根节点
  layoutMap: {},      // id -> {x,y,level,node}
  renderNodes: [],    // 当前要渲染的节点列表
  vLayoutMap: {},     // 直系图布局 id -> {x,y,node,spouseX,role}
  vRootId: '',        // 直系图展示的中心人物 id
  renderGen: 'all',
  pan: { x: 0, y: 0, startX: 0, startY: 0, touching: false },
  zoom: 1,          // 用户缩放倍率（双指缩放/重置调整）
  vPan: { x: 0, y: 0, startX: 0, startY: 0, touching: false }, // 直系图平移
  vZoom: 1,         // 直系图缩放
  vTapInfo: null,            // 直系图点击判定
  vPinchStartDist: 0,        // 直系图双指缩放起始距离
  vPinchStartZoom: 1,        // 直系图双指缩放起始倍率
  initialScale: 1,  // 基础适配缩放（随布局自动重算）
  vInitialScale: 1, // 直系图基础适配缩放
  canvasReady: false,       // canvas 是否已初始化完成
  _canvasInitPending: false, // 初始化进行中标记，防止重复初始化
  pinchStartDist: 0,        // 双指缩放起始距离
  pinchStartZoom: 1,        // 双指缩放起始倍率
  tapInfo: null,            // 点击判定：记录 touchstart 位置，拖动后置空
  listPage: 1,              // 列表视图当前页
  _filteredList: [],        // 过滤后的完整列表（分页数据源）
  renderSearch: '',         // 当前搜索关键字（不放入 data，避免输入抖动触发 setData）
  collapsedIds: new Set(),  // 已折叠（隐藏其后代）的节点 id 集合
  nodeMap: {},              // id -> node 快速索引
  avatarCache: {},          // 头像图片缓存 url -> { img, loaded, failed }，避免重复加载

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = (win && win.statusBarHeight) || 20;
    this.setData({ statusBarHeight, navBarTotal: statusBarHeight + 44 });
    this.loadTreeData();
  },

  /** 返回时置位标记,避免家谱树列表页再次自动跳转造成循环。
   *  仅物理返回/返回手势(navigateBack 回列表页)需要防循环;
   *  主动回首页(switchTab,不经过列表页)不置位,避免标记残留导致下次点"家谱树" tab 停在家族列表 */
  onUnload() {
    if (this._homeExit) return;
    app.globalData.skipAutoEnter = true;
  },

  /** 导航栏左上角返回：直接回首页（覆盖默认返回上一页）。
   *  标记 _homeExit,onUnload 时不再置位防循环标记(回首页不经过家谱树列表页,无需防循环) */
  goHome() {
    this._homeExit = true;
    wx.switchTab({ url: '/pages/home/home' });
  },

  onShow() {
    // 首次进入不重复加载；从添加/编辑成员等页面返回时刷新树与列表
    if (this._loaded) {
      this.loadTreeData();
    }
    this._loaded = true;
  },

  onReady() {
    this.initCanvas();
  },

  /** 初始化 canvas 2d 上下文（幂等：初始化中或已完成时重复调用会被忽略） */
  initCanvas() {
    if (this.canvasReady || this._canvasInitPending) return;
    this._canvasInitPending = true;
    const query = wx.createSelectorQuery();
    const canvasId = this.data.viewMode === 'vertical' ? '#verticalTreeCanvas' : '#familyTreeCanvas';
    query.select(canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        this._canvasInitPending = false;
        if (!res || !res[0] || !res[0].node) {
          console.warn('canvas 节点未找到，尝试重试');
          this._initRetry = (this._initRetry || 0) + 1;
          if (this._initRetry <= 5) {
            setTimeout(() => this.initCanvas(), 200);
          }
          return;
        }
        this._initRetry = 0;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const sysInfo = wx.getSystemInfoSync();
        const dpr = sysInfo.pixelRatio || 1;
        this.canvasCtx = ctx;
        this.canvasNode = canvas;
        this.canvasDpr = dpr;
        this.canvasWidth = res[0].width;
        this.canvasHeight = res[0].height;
        canvas.width = this.canvasWidth * dpr;
        canvas.height = this.canvasHeight * dpr;
        ctx.scale(dpr, dpr);
        this.canvasReady = true;
        this.setData({
          canvasStyle: `width:${this.canvasWidth}px;height:${this.canvasHeight}px`
        }, () => {
          if (this.data.viewMode === 'vertical') {
            this.renderVerticalTree();
          } else {
            this.renderTree();
          }
        });
      });
  },

  /** 加载家族树:优先走后端 API,失败回退 mock */
  loadTreeData() {
    const familyId = (app.globalData.currentFamily || {}).id;
    const doMock = () => {
      console.log('loadTreeData: 使用 mock 数据');
      this.generateTreeData();
    };
    if (!USE_MOCK && getToken() && familyId) {
      familyMember.getAll(familyId)
        .then((res) => {
          console.log('loadTreeData: API 返回', res);
          this.buildTree((res || []).map(normalizeMember));
        })
        .catch((err) => {
          console.error('家族树加载失败,使用 mock', err);
          doMock();
        });
    } else {
      doMock();
    }
  },

  /** 根据成员数据构建树结构并计算布局 */
  buildTree(members) {
    // 1. 建立 id 映射，并统一字段
    const nodeMap = {};
    members.forEach(m => {
      nodeMap[m.id] = {
        ...m,
        children: [],
        hasChildren: false,
        childrenCount: 0,
        relation: this.getRelation(m.generation),
        title: m.title || ''
      };
    });

    // 2. 一次遍历建立父子关系，并回填父指针
    const rootIds = new Set();
    Object.keys(nodeMap).forEach(id => rootIds.add(id));
    const allNodeList = [];
    Object.keys(nodeMap).forEach(id => allNodeList.push(nodeMap[id]));
    allNodeList.forEach(node => {
      const father = nodeMap[node.fatherId];
      const mother = nodeMap[node.motherId];
      if (father) {
        father.children.push(node);
        father.hasChildren = true;
        rootIds.delete(node.id);
        node.parentId = father.id;
      } else if (mother) {
        mother.children.push(node);
        mother.hasChildren = true;
        rootIds.delete(node.id);
        node.parentId = mother.id;
      }
    });

    // 3. 统计后代总数（递归累加）；直接子女数由 children.length 得出，两者分开记录
    const countDescendants = (node) => {
      let count = node.children.length;
      node.children.forEach(c => { count += countDescendants(c); });
      node.descendantCount = count;
      return count;
    };

    const roots = Array.from(rootIds).map(id => nodeMap[id]).sort((a, b) => a.sortOrder - b.sortOrder || a.birthYear - b.birthYear);
    roots.forEach(countDescendants);

    // 4. 收集全部节点：直接子女数单独赋值，避免"子女"与"后代"语义混淆
    const nodeValues = [];
    Object.keys(nodeMap).forEach(id => nodeValues.push(nodeMap[id]));
    nodeValues.forEach(n => { n.childrenCount = n.children.length; });

    this.allNodes = nodeValues;
    this.rootNodes = roots;
    this.nodeMap = nodeMap;
    // 树与列表统一由 applyFilter 驱动（含代数过滤与列表分页）
    this.applyFilter();
    // canvas 可能尚未初始化，重新尝试渲染
    if (!this.canvasCtx) {
      this.initCanvas();
    }
  },

  /** 生成 mock 数据，统一走 buildTree 入口 */
  generateTreeData() {
    const rows = [
      { id: '1', name: '张太公', gender: 'male', generation: 1, generation_name: '文', birth_date: '1880-01-01', father_id: '', mother_id: '', spouse_info: JSON.stringify([{ name: '张太婆', birthDate: '1882年5月12日', bio: '张太婆，贤良淑德，相夫教子。', deathDate: '1960年11月8日', deathPlace: '山东省济南市张氏祖坟', longitude: '117.000923', latitude: '36.675807' }]) },
      { id: '2', name: '张大', gender: 'male', generation: 2, generation_name: '德', birth_date: '1910-01-01', father_id: '1', mother_id: '', spouse_info: JSON.stringify([{ name: '李氏', birthDate: '1911年' }]) },
      { id: '3', name: '张二', gender: 'male', generation: 2, generation_name: '德', birth_date: '1912-01-01', father_id: '1', mother_id: '', spouse_info: JSON.stringify([{ name: '王氏', birthDate: '1913年' }]) },
      { id: '4', name: '张三', gender: 'male', generation: 2, generation_name: '德', birth_date: '1915-01-01', father_id: '1', mother_id: '', spouse_info: JSON.stringify([{ name: '陈氏', birthDate: '1916年' }]) },
      { id: '5', name: '张强', gender: 'male', generation: 3, generation_name: '永', birth_date: '1940-01-01', father_id: '2', mother_id: '', spouse_info: JSON.stringify([{ name: '刘氏', birthDate: '1941年' }]) },
      { id: '6', name: '张明', gender: 'male', generation: 3, generation_name: '永', birth_date: '1942-01-01', father_id: '2', mother_id: '', spouse_info: JSON.stringify([{ name: '赵氏', birthDate: '1943年' }]) },
      { id: '7', name: '张华', gender: 'male', generation: 3, generation_name: '永', birth_date: '1945-01-01', father_id: '3', mother_id: '', spouse_info: JSON.stringify([{ name: '孙氏', birthDate: '1946年' }]) },
      { id: '8', name: '张丽', gender: 'female', generation: 3, generation_name: '永', birth_date: '1948-01-01', father_id: '3', mother_id: '', spouse_info: JSON.stringify([{ name: '周先生', birthDate: '1945年' }]) },
      { id: '9', name: '张芳', gender: 'female', generation: 3, generation_name: '永', birth_date: '1950-01-01', father_id: '4', mother_id: '', spouse_info: JSON.stringify([{ name: '吴先生', birthDate: '1948年' }]) },
      { id: '10', name: '张伟', gender: 'male', generation: 4, generation_name: '世', birth_date: '1970-01-01', father_id: '5', mother_id: '', spouse_info: JSON.stringify([{ name: '郑氏', birthDate: '1971年' }]) },
      { id: '11', name: '张敏', gender: 'female', generation: 4, generation_name: '世', birth_date: '1972-01-01', father_id: '5', mother_id: '', spouse_info: JSON.stringify([{ name: '王先生', birthDate: '1970年' }]) },
      { id: '12', name: '张军', gender: 'male', generation: 4, generation_name: '世', birth_date: '1975-01-01', father_id: '6', mother_id: '' },
      { id: '13', name: '张燕', gender: 'female', generation: 4, generation_name: '世', birth_date: '1978-01-01', father_id: '7', mother_id: '', spouse_info: JSON.stringify([{ name: '李先生', birthDate: '1976年' }]) },
      { id: '14', name: '张鹏', gender: 'male', generation: 4, generation_name: '世', birth_date: '1980-01-01', father_id: '8', mother_id: '', spouse_info: JSON.stringify([{ name: '周氏', birthDate: '1981年' }]) },
      { id: '15', name: '张浩', gender: 'male', generation: 5, generation_name: '兴', birth_date: '2000-01-01', father_id: '10', mother_id: '' },
      { id: '16', name: '张悦', gender: 'female', generation: 5, generation_name: '兴', birth_date: '2005-01-01', father_id: '11', mother_id: '' },
      { id: '17', name: '张晨', gender: 'male', generation: 5, generation_name: '兴', birth_date: '2010-01-01', father_id: '11', mother_id: '' },
      { id: '18', name: '张雪', gender: 'female', generation: 5, generation_name: '兴', birth_date: '2012-01-01', father_id: '13', mother_id: '' }
    ];
    this.buildTree(rows.map(normalizeMember));
  },

  /** 按显示代数/搜索关键字过滤，联动列表视图，并重新计算布局 */
  applyFilter() {
    const gen = this.renderGen;
    const kw = (this.renderSearch || '').trim().toLowerCase();
    let nodes = this.allNodes;
    if (gen !== 'all') {
      const maxGen = Number(gen);
      const keep = new Set();
      const collect = (node) => {
        if (node.generation > maxGen) return;
        keep.add(node.id);
        node.children.forEach(collect);
      };
      this.rootNodes.forEach(collect);
      nodes = nodes.filter(n => keep.has(n.id));
    }
    if (kw) {
      // 搜索：保留名字匹配的节点及其祖先链，保证树结构连通
      const matched = new Set();
      nodes.forEach(n => {
        if ((n.name || '').toLowerCase().indexOf(kw) > -1) matched.add(n.id);
      });
      const ancestorKeep = new Set();
      const markAncestors = (node) => {
        node.children.forEach(c => {
          markAncestors(c);
          if (matched.has(c.id) || ancestorKeep.has(c.id)) ancestorKeep.add(node.id);
        });
      };
      this.rootNodes.forEach(markAncestors);
      nodes = nodes.filter(n => matched.has(n.id) || ancestorKeep.has(n.id));
    }
    // 折叠剪枝：隐藏被折叠节点的后代（搜索时忽略折叠，保证命中可见）
    if (!kw && this.collapsedIds.size) {
      const hidden = new Set();
      const markSubtree = (node) => {
        hidden.add(node.id);
        node.children.forEach(markSubtree);
      };
      const prune = (node) => {
        if (this.collapsedIds.has(node.id)) {
          node.children.forEach(markSubtree);
          return;
        }
        node.children.forEach(prune);
      };
      this.rootNodes.forEach(prune);
      nodes = nodes.filter(n => !hidden.has(n.id));
    }
    this.renderNodes = nodes;
    // 列表视图与树状视图共用同一过滤结果，并分页切片
    this._filteredList = nodes.slice().sort((a, b) => a.generation - b.generation || a.sortOrder - b.sortOrder);
    this.listPage = 1;
    this.refreshList();
    // 根据当前视图分别计算布局并渲染
    if (this.data.viewMode === 'vertical') {
      this.calcVerticalLayout();
      this.renderVerticalTree();
    } else {
      this.calcLayout();
      this.renderTree();
    }
  },

  /** 刷新列表视图当前页（分页切片） */
  refreshList() {
    const start = (this.listPage - 1) * LIST_PAGE_SIZE;
    const pageList = this._filteredList.slice(start, start + LIST_PAGE_SIZE);
    this.setData({
      memberList: pageList,
      listHasMore: this._filteredList.length > start + LIST_PAGE_SIZE
    });
  },

  /** 列表加载更多 */
  loadMoreList() {
    this.listPage += 1;
    this.refreshList();
  },

  /** 递归计算每个节点的 x,y 坐标（基于树的后序遍历，保证子树居中） */
  calcLayout() {
    const layoutMap = {};
    let currentX = PADDING;
    const visibleSet = new Set(this.renderNodes.map(n => n.id));

    // 先找出当前渲染树中最大 generation，作为 y 轴基准
    let maxGen = 1;
    this.renderNodes.forEach(n => { if (n.generation > maxGen) maxGen = n.generation; });

    const traverse = (node) => {
      if (!node) return { x: 0, y: 0, width: 0 };
      const visibleChildren = node.children.filter(c => visibleSet.has(c.id));
      const nodeWidth = NODE_W + (node.spouseInfo && node.spouseInfo.name ? SPOUSE_W + NODE_GAP_X : 0);

      if (visibleChildren.length === 0) {
        const x = currentX;
        currentX += nodeWidth + NODE_GAP_X;
        // generation 越小越靠上：generation 1 对应 level 0
        const level = node.generation - 1;
        const y = PADDING + level * LEVEL_H;
        layoutMap[node.id] = { x, y, width: nodeWidth, node };
        return { x, y, width: nodeWidth };
      }

      let firstChildX = Infinity;
      let lastChildX = -Infinity;
      visibleChildren.forEach((child) => {
        const childRes = traverse(child);
        firstChildX = Math.min(firstChildX, childRes.x);
        lastChildX = Math.max(lastChildX, childRes.x + childRes.width);
      });

      const childrenCenter = (firstChildX + lastChildX) / 2;
      let nodeX = childrenCenter - nodeWidth / 2;

      // 如果父节点会覆盖左侧边界，则整体向右推
      if (nodeX < currentX) {
        const shift = currentX - nodeX;
        const shiftNode = (n) => {
          if (layoutMap[n.id]) layoutMap[n.id].x += shift;
          n.children.filter(c => visibleSet.has(c.id)).forEach(shiftNode);
        };
        visibleChildren.forEach(shiftNode);
        nodeX += shift;
        currentX += shift;
      }

      const level = node.generation - 1;
      const y = PADDING + level * LEVEL_H;
      layoutMap[node.id] = { x: nodeX, y, width: nodeWidth, node };
      currentX = Math.max(currentX, nodeX + nodeWidth + NODE_GAP_X);
      return { x: nodeX, y, width: nodeWidth };
    };

    this.rootNodes.forEach(traverse);
    this.layoutMap = layoutMap;
  },

  /** 计算直系图布局：以选中的 vRootId（或当前过滤结果中最合适节点）为中心，
   *  沿父指针向上收集在当前过滤结果中的祖先链 */
  calcVerticalLayout() {
    const visibleSet = new Set((this.renderNodes || []).map(n => n.id));
    if (!visibleSet.size) {
      this.vLayoutMap = {};
      return { contentW: 0, contentH: 0 };
    }

    // 默认中心优先级：用户指定（且在当前过滤中）> 搜索命中 > 最年轻叶子 > 最后一个节点
    let center = this.nodeMap[this.vRootId];
    if (!center || !visibleSet.has(center.id)) {
      center = null;
    }

    if (!center) {
      const kw = (this.renderSearch || '').trim();
      if (kw) {
        const matched = this.renderNodes.find(n => (n.name || '').indexOf(kw) > -1);
        if (matched && visibleSet.has(matched.id)) center = matched;
      }
    }

    if (!center) {
      const leaves = this.renderNodes.filter(n => !n.children || !n.children.length || !n.children.some(c => visibleSet.has(c.id)));
      center = leaves.length ? leaves[leaves.length - 1] : this.renderNodes[this.renderNodes.length - 1];
    }

    if (!center) {
      this.vLayoutMap = {};
      return { contentW: 0, contentH: 0 };
    }

    // 向上收集祖先链，仅保留在当前过滤结果中的节点
    const chain = [];
    const collectAncestors = (node) => {
      if (!node || !visibleSet.has(node.id)) return;
      collectAncestors(node.parentId ? this.nodeMap[node.parentId] : null);
      chain.push(node);
    };
    collectAncestors(center);

    if (!chain.length) {
      this.vLayoutMap = {};
      return { contentW: 0, contentH: 0 };
    }

    const layoutMap = {};
    let maxW = 0;

    chain.forEach((node, idx) => {
      const hasSpouse = node.spouseInfo && node.spouseInfo.name;
      // 总宽 = 主圆直径 + 夫妇间距 + 配偶圆直径（配偶圆左缘 = x + 主直径 + 间距）
      const coupleW = hasSpouse
        ? V_AVATAR_R * 2 + V_SPOUSE_GAP + V_SPOUSE_AVATAR_R * 2
        : V_AVATAR_R * 2;
      maxW = Math.max(maxW, coupleW);
      const x = V_PADDING_X;
      const y = V_MARGIN_Y + idx * V_LEVEL_H;
      layoutMap[node.id] = {
        x,
        y,
        node,
        hasSpouse,
        spouseX: hasSpouse ? x + V_AVATAR_R * 2 + V_SPOUSE_GAP : x,
        role: this.getVerticalRole(node, idx, chain.length)
      };
    });

    // 将链条水平居中
    const contentW = maxW + V_PADDING_X * 2;
    const offsetX = (contentW - maxW) / 2 - V_AVATAR_R;
    Object.values(layoutMap).forEach(l => {
      l.x += offsetX;
      if (l.hasSpouse) l.spouseX += offsetX;
    });

    this.vLayoutMap = layoutMap;
    return { contentW, contentH: V_MARGIN_Y * 2 + chain.length * V_LEVEL_H };
  },

  /** 使用 canvas 2d 绘制整棵树 */
  renderTree() {
    const ctx = this.canvasCtx;
    // 防御：热重载/初始化竞态下 renderNodes 可能尚未就绪，缺失时安全跳过
    const nodes = this.renderNodes || [];
    if (!ctx || !nodes.length) {
      console.log('renderTree skipped, ctx=', !!ctx, 'nodes=', nodes.length);
      return;
    }
    // 清空画布并填充暖纸背景（与导出同色），避免白色卡片与背景混淆
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    // 统一坐标变换：绘制与点击命中共用同一套 scale/offset
    const { scale, offsetX, offsetY } = this.getViewTransform();
    this.drawTreeContent(ctx, offsetX, offsetY, scale);
  },

  /** 使用 canvas 2d 绘制直系图 */
  renderVerticalTree() {
    const ctx = this.canvasCtx;
    const nodes = this.renderNodes || [];
    if (!ctx || !nodes.length) {
      console.log('renderVerticalTree skipped, ctx=', !!ctx, 'nodes=', nodes.length);
      return;
    }
    // 确保切换到直系图时重新计算布局（初始加载可能在树状模式下完成）
    this.calcVerticalLayout();
    const vNodes = Object.values(this.vLayoutMap || {});
    if (!vNodes.length) {
      console.log('renderVerticalTree: 无直系链可绘制');
      return;
    }
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    const { scale, offsetX, offsetY } = this.getVerticalTransform();
    this.drawVerticalContent(ctx, offsetX, offsetY, scale);
  },

  /** 直系图统一坐标变换 */
  getVerticalTransform() {
    const { contentW, contentH } = this.getVerticalContentSize();
    this.vInitialScale = this.computeVerticalFitScale(contentW, contentH);
    const scale = this.vInitialScale * this.vZoom;
    const offsetX = (this.canvasWidth - contentW * scale) / 2 + this.vPan.x;
    const offsetY = contentH * scale <= this.canvasHeight
      ? (this.canvasHeight - contentH * scale) / 2 + this.vPan.y
      : 16 + this.vPan.y;
    return { scale, offsetX, offsetY };
  },

  /** 直系图尺寸 */
  getVerticalContentSize() {
    const layoutSize = this.calcVerticalLayout();
    const w = Math.max(layoutSize.contentW, this.canvasWidth * 0.6);
    const h = Math.max(layoutSize.contentH, this.canvasHeight * 0.6);
    return { contentW: w, contentH: h };
  },

  /** 直系图基础适配：小树放大、长链完整显示 */
  computeVerticalFitScale(contentW, contentH) {
    if (!this.canvasWidth || !this.canvasHeight) return 1;
    const fitX = this.canvasWidth / contentW;
    const fitY = this.canvasHeight / contentH;
    let fit = Math.max(fitX, fitY);
    // 头像直径 68px，初始至少 1.0 保证角色和配偶清晰可读
    return Math.max(MIN_SCALE, Math.min(MAX_INITIAL_SCALE, Math.max(fit, 1.0)));
  },

  /** 绘制直系图内容：头像、连线、角色、配偶 */
  drawVerticalContent(ctx, offsetX, offsetY, scale) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    const vNodes = Object.values(this.vLayoutMap || {});
    if (!vNodes.length) { ctx.restore(); return; }

    // 1. 绘制垂直连接线
    for (let i = 0; i < vNodes.length - 1; i++) {
      const cur = vNodes[i];
      const next = vNodes[i + 1];
      const x1 = cur.x + V_AVATAR_R;
      const y1 = cur.y + V_AVATAR_R * 2;
      const x2 = next.x + V_AVATAR_R;
      const y2 = next.y;
      ctx.beginPath();
      ctx.strokeStyle = '#E8B4A8';
      ctx.lineWidth = 2;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y1 + (y2 - y1) / 2);
      ctx.lineTo(x2, y1 + (y2 - y1) / 2);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // 2. 绘制每对夫妇与角色标注
    vNodes.forEach((l) => {
      this.drawVerticalNode(ctx, l);
      if (l.hasSpouse) this.drawVerticalSpouse(ctx, l);
    });

    ctx.restore();
  },

  /** 角色语义：最下方是自己，向上依次为父亲/母亲、爷爷/奶奶、曾祖父/曾祖母… */
  getVerticalRole(node, idx, chainLen) {
    const diff = chainLen - 1 - idx;
    const maleRoles = ['自己', '父亲', '爷爷', '曾祖父', '高祖父', '天祖父', '烈祖父', '太祖父', '远祖父', '鼻祖父'];
    const femaleRoles = ['自己', '母亲', '奶奶', '曾祖母', '高祖母', '天祖母', '烈祖母', '太祖母', '远祖母', '鼻祖母'];
    const roles = node.gender === 'female' ? femaleRoles : maleRoles;
    return roles[diff] || `上${diff}代`;
  },

  /** 绘制直系图节点：头像、姓名、角色 */
  drawVerticalNode(ctx, l) {
    const node = l.node;
    const cx = l.x + V_AVATAR_R;
    const cy = l.y + V_AVATAR_R;
    this.drawMemberAvatar(ctx, {
      cx,
      cy,
      radius: V_AVATAR_R,
      name: node.name,
      avatar: node.avatar,
      color: node.gender === 'female' ? '#D98BA6' : '#6A8BAE',
      alive: node.isAlive !== false
    });
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.ellipsizeByWidth(ctx, node.name, V_AVATAR_R * 2.4), cx, l.y + V_AVATAR_R * 2 + 8);
    ctx.fillStyle = '#8B7D6B';
    ctx.font = '12px sans-serif';
    ctx.fillText(l.role, cx, l.y + V_AVATAR_R * 2 + 26);
  },

  /** 绘制配偶头像与姓名（在主角右侧，头像为主成员 0.8 倍） */
  drawVerticalSpouse(ctx, l) {
    const spouse = l.node.spouseInfo;
    const cx = l.spouseX + V_SPOUSE_AVATAR_R;
    const cy = l.y + V_SPOUSE_AVATAR_R;
    const midX = (l.x + V_AVATAR_R * 2 + l.spouseX) / 2;
    // 夫妇连线：中间断开口放置家徽
    ctx.beginPath();
    ctx.strokeStyle = '#E8B4A8';
    ctx.lineWidth = 2;
    ctx.moveTo(l.x + V_AVATAR_R * 2 + 10, cy);
    ctx.lineTo(midX - 14, cy);
    ctx.moveTo(midX + 14, cy);
    ctx.lineTo(l.spouseX - 10, cy);
    ctx.stroke();
    // 家徽：橙色圆心 + 白色心形，参考图风格
    ctx.beginPath();
    ctx.arc(midX, cy, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#E07A5F';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤', midX, cy + 1);

    this.drawMemberAvatar(ctx, {
      cx,
      cy,
      radius: V_SPOUSE_AVATAR_R,
      name: spouse.name,
      color: '#D98BA6',
      alive: true,
      showStatus: false
    });
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.ellipsizeByWidth(ctx, spouse.name, V_SPOUSE_AVATAR_R * 2.4), cx, l.y + V_SPOUSE_AVATAR_R * 2 + 8);
    ctx.fillStyle = '#8B7D6B';
    ctx.font = '12px sans-serif';
    const spouseRole = this.getSpouseRole(l.role, l.node.gender);
    ctx.fillText(spouseRole, cx, l.y + V_SPOUSE_AVATAR_R * 2 + 26);
  },

  /** 配偶角色：与主角角色对应（父亲↔母亲、爷爷↔奶奶等） */
  getSpouseRole(role, nodeGender) {
    const maleRoles = ['自己', '父亲', '爷爷', '曾祖父', '高祖父', '天祖父', '烈祖父', '太祖父', '远祖父', '鼻祖父'];
    const femaleRoles = ['自己', '母亲', '奶奶', '曾祖母', '高祖母', '天祖母', '烈祖母', '太祖母', '远祖母', '鼻祖母'];
    const idx = maleRoles.indexOf(role);
    if (idx === -1) return '配偶';
    if (nodeGender === 'female') {
      return idx === 0 ? '丈夫' : maleRoles[idx];
    }
    return idx === 0 ? '妻子' : femaleRoles[idx];
  },

  /**
   * 头像组件（canvas 2d 绘制层）：
   * - 支持图片头像（异步加载 + 缓存），加载中/失败自动回退首字
   * - 支持尺寸规格（radius）、形状（圆形/圆角方形）、边框、在世/已逝状态圆点
   */
  drawMemberAvatar(ctx, opts) {
    const {
      cx,
      cy,
      radius = V_AVATAR_R,
      name = '',
      avatar = '',
      color = '#6A8BAE',
      shape = AVATAR_SHAPE.circle,
      borderColor = AVATAR_BORDER,
      borderWidth = 3,
      alive = true,
      showStatus = true
    } = opts || {};

    // 1. 底色 + 图片或首字（在裁剪路径内绘制，保证不越界）
    ctx.save();
    this.avatarShapePath(ctx, cx, cy, radius, shape);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    const entry = avatar ? this.getAvatarImage(avatar) : null;
    if (entry && entry.loaded && entry.img) {
      // 图片已加载：cover 模式填充头像区域
      const s = radius * 2;
      ctx.drawImage(entry.img, cx - radius, cy - radius, s, s);
    } else {
      // 首字占位（加载中或加载失败或未配置图片）
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.max(10, Math.round(radius * 0.45))}px KaiTi, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((name || '?').charAt(0), cx, cy + 1);
    }
    ctx.restore();

    // 2. 描边（在裁剪外绘制，使边框完整）
    ctx.save();
    this.avatarShapePath(ctx, cx, cy, radius - borderWidth / 2, shape);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
    ctx.restore();

    // 3. 在世/已逝状态圆点（右下角）
    if (showStatus) {
      const dotR = Math.max(4, radius * 0.22);
      const dotX = cx + radius * 0.66;
      const dotY = cy + radius * 0.66;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = alive ? AVATAR_STATUS_ALIVE : AVATAR_STATUS_DEAD;
      ctx.fill();
      ctx.strokeStyle = AVATAR_BORDER;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },

  /** 头像形状路径：circle 圆形 / rounded 圆角方形（居中于 cx,cy） */
  avatarShapePath(ctx, cx, cy, radius, shape) {
    ctx.beginPath();
    if (shape === AVATAR_SHAPE.rounded) {
      const r = radius * 0.28;
      ctx.moveTo(cx - radius + r, cy - radius);
      ctx.lineTo(cx + radius - r, cy - radius);
      ctx.arcTo(cx + radius, cy - radius, cx + radius, cy - radius + r, r);
      ctx.lineTo(cx + radius, cy + radius - r);
      ctx.arcTo(cx + radius, cy + radius, cx + radius - r, cy + radius, r);
      ctx.lineTo(cx - radius + r, cy + radius);
      ctx.arcTo(cx - radius, cy + radius, cx - radius, cy + radius - r, r);
      ctx.lineTo(cx - radius, cy - radius + r);
      ctx.arcTo(cx - radius, cy - radius, cx - radius + r, cy - radius, r);
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
    }
  },

  /** 获取头像图片（带缓存）：未加载完成返回占位入口，加载完成/失败后触发一次重绘 */
  getAvatarImage(url) {
    if (this.avatarCache[url]) return this.avatarCache[url];
    const entry = { img: null, loaded: false, failed: false };
    this.avatarCache[url] = entry;
    let img = null;
    try {
      img = wx.createImage();
    } catch (e) {
      entry.failed = true;
      return entry;
    }
    img.onload = () => {
      entry.img = img;
      entry.loaded = true;
      this.requestRender();
    };
    img.onerror = () => {
      entry.failed = true;
      this.requestRender();
    };
    img.src = url;
    // 超时保护：长时间未加载成功视为失败，避免一直占位
    entry.timer = setTimeout(() => {
      if (!entry.loaded) {
        entry.failed = true;
        this.requestRender();
      }
    }, AVATAR_TIMEOUT);
    return entry;
  },

  /** 请求一次渲染：合并同一帧内的多次重绘请求（拖动/缩放节流） */
  requestRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    const doRender = () => {
      this._renderScheduled = false;
      if (this.data.viewMode === 'vertical') {
        this.renderVerticalTree();
      } else {
        this.renderTree();
      }
    };
    const canvas = this.canvasNode;
    if (canvas && typeof canvas.requestAnimationFrame === 'function') {
      canvas.requestAnimationFrame(doRender);
    } else {
      setTimeout(doRender, 16);
    }
  },

  /** 在指定坐标系下绘制整棵树（屏幕渲染与离线导出共用，带视口裁剪） */
  drawTreeContent(ctx, offsetX, offsetY, scale, viewW, viewH) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // 视口裁剪：仅绘制进入可视区域的节点与连线（导出时 viewW/H 传完整内容尺寸）
    const vw = viewW || this.canvasWidth;
    const vh = viewH || this.canvasHeight;
    const viewLeft = -offsetX / scale;
    const viewTop = -offsetY / scale;
    const viewRight = (vw - offsetX) / scale;
    const viewBottom = (vh - offsetY) / scale;
    const inView = (l) => l.x + l.width >= viewLeft && l.x <= viewRight && l.y + NODE_H >= viewTop && l.y <= viewBottom;

    const visibleSet = new Set(this.renderNodes.map(n => n.id));

    // 1. 绘制连线（父节点或其任一可见子节点在视口内才绘制）
    this.renderNodes.forEach(node => {
      const layout = this.layoutMap[node.id];
      if (!layout) return;
      const visibleChildren = node.children.filter(c => visibleSet.has(c.id));
      if (visibleChildren.length === 0) return;
      const anyChildInView = visibleChildren.some(c => {
        const cl = this.layoutMap[c.id];
        return cl && inView(cl);
      });
      if (!inView(layout) && !anyChildInView) return;
      this.drawConnection(ctx, layout, visibleChildren);
    });

    // 2. 绘制节点（仅视口内，按缩放比例分级 LOD）
    this.renderNodes.forEach(node => {
      const layout = this.layoutMap[node.id];
      if (layout && inView(layout)) this.drawNode(ctx, layout, scale);
    });

    ctx.restore();
  },

  getBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const layoutKeys = [];
    Object.keys(this.layoutMap).forEach(k => layoutKeys.push(this.layoutMap[k]));
    layoutKeys.forEach(l => {
      const w = l.width;
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + w);
      maxY = Math.max(maxY, l.y + NODE_H);
    });
    return {
      width: maxX - minX || NODE_W,
      height: maxY - minY || NODE_H,
      minX: minX === Infinity ? PADDING : minX,
      minY: minY === Infinity ? PADDING : minY
    };
  },

  /** 内容尺寸（世界坐标范围 + 边距） */
  getContentSize() {
    const bounds = this.getBounds();
    return { contentW: bounds.width + PADDING * 2, contentH: bounds.height + PADDING * 2 };
  },

  /** 基础适配缩放：小树放大到可读尺寸，大树按宽度适配，超大宽树整体缩小 */
  computeFitScale(contentW, contentH) {
    if (!this.canvasWidth || !this.canvasHeight) return 1;
    const fitX = this.canvasWidth / contentW;
    const fitY = this.canvasHeight / contentH;
    let fit;
    if (contentW > this.canvasWidth && contentH > this.canvasHeight) {
      // 双向超屏：整体适配
      fit = Math.min(fitX, fitY);
    } else if (contentW > this.canvasWidth) {
      // 仅宽度超屏：按宽度适配
      fit = fitX;
    } else {
      // 宽度未超屏：按较大比例放大，让内容填满画面
      fit = Math.max(fitX, fitY);
    }
    // 可读性下限：普通宽度树放大到卡片可读（120 * 0.75 = 90px，完整细节等级）；
    // 超过两屏宽的极端大树跳过下限，仍整体缩小到屏幕内
    const overRatio = contentW / this.canvasWidth;
    const readableFloor = overRatio <= 2 ? MIN_FIT_SCALE : MIN_SCALE;
    return Math.max(MIN_SCALE, Math.min(MAX_INITIAL_SCALE, Math.max(fit, readableFloor)));
  },

  /** 统一视图变换（渲染与命中检测共用），保证点击坐标与绘制一致 */
  getViewTransform() {
    const { contentW, contentH } = this.getContentSize();
    this.initialScale = this.computeFitScale(contentW, contentH);
    const scale = this.initialScale * this.zoom;
    const offsetX = (this.canvasWidth - contentW * scale) / 2 + this.pan.x;
    const offsetY = contentH * scale <= this.canvasHeight
      ? (this.canvasHeight - contentH * scale) / 2 + this.pan.y
      : 16 + this.pan.y;
    return { scale, offsetX, offsetY };
  },

  /** 双指间距 */
  touchDist(touches) {
    const t0 = touches[0];
    const t1 = touches[1];
    return Math.sqrt(Math.pow(t0.clientX - t1.clientX, 2) + Math.pow(t0.clientY - t1.clientY, 2));
  },

  /** 绘制父节点到子节点的折线连接 */
  drawConnection(ctx, parentLayout, children) {
    const px = parentLayout.x + parentLayout.width / 2;
    const pyBottom = parentLayout.y + NODE_H;
    const midY = parentLayout.y + NODE_H + LEVEL_H / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#C08A55';
    ctx.lineWidth = 1.5;

    if (children.length === 1) {
      const childL = this.layoutMap[children[0].id];
      const cx = childL.x + childL.width / 2;
      ctx.moveTo(px, pyBottom);
      ctx.lineTo(cx, childL.y);
    } else {
      let minCx = Infinity;
      let maxCx = -Infinity;
      children.forEach(child => {
        const childL = this.layoutMap[child.id];
        const cx = childL.x + childL.width / 2;
        minCx = Math.min(minCx, cx);
        maxCx = Math.max(maxCx, cx);
      });

      ctx.moveTo(px, pyBottom);
      ctx.lineTo(px, midY);
      ctx.lineTo(minCx, midY);
      ctx.lineTo(maxCx, midY);
      ctx.stroke();

      children.forEach(child => {
        const childL = this.layoutMap[child.id];
        const cx = childL.x + childL.width / 2;
        ctx.beginPath();
        ctx.moveTo(cx, midY);
        ctx.lineTo(cx, childL.y);
        ctx.stroke();
      });
      return;
    }
    ctx.stroke();
  },

  /** 绘制单个节点卡片（含配偶），按缩放比例分级 LOD */
  drawNode(ctx, layout, scale) {
    const node = layout.node;
    const x = layout.x;
    const y = layout.y;
    const isFemale = node.gender === 'female';

    // 主节点背景（所有 LOD 都绘制色块，性别色保留；轻阴影增强与背景的区分度）
    this.roundRect(ctx, x, y, NODE_W, NODE_H, 10);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = isFemale ? '#FFF0F3' : '#FFFFFF';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = isFemale ? '#E695A5' : '#D9C5AC';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 卡片在屏幕上的实际宽度决定细节等级
    const cardScreenW = NODE_W * scale;

    // LOD0 极远视图：仅色块（含配偶色块），不绘制任何文字
    if (cardScreenW < LOD_BLOCK_THRESHOLD) {
      this.drawSpouseBlock(ctx, layout);
      return;
    }

    // LOD1 中距视图：只画名字（垂直居中），跳过头像/徽标/标签与配偶细节
    if (cardScreenW < LOD_MEDIUM_THRESHOLD) {
      this.drawName(ctx, node, x, y, NODE_W - 44 - 8, y + NODE_H / 2);
      this.drawSpouseBlock(ctx, layout);
      return;
    }

    // LOD2 近距视图：完整细节
    this.drawAvatar(ctx, x + 24, y + 34, node.name, isFemale ? '#FF6B9D' : '#8B1A1A');

    // 右上角代数徽标：与标签行分离，避免宽度挤占
    const genText = node.generation + '代';
    ctx.font = '9px sans-serif';
    const genW = ctx.measureText(genText).width;
    const badgeX = x + NODE_W - genW - 8;
    this.roundRect(ctx, badgeX - 4, y + 3, genW + 8, 14, 7);
    ctx.fillStyle = 'rgba(139, 26, 26, 0.08)';
    ctx.fill();
    ctx.fillStyle = '#8B1A1A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(genText, badgeX, y + 10);

    // 名字：按徽标左侧可用宽度截断，不超出卡片、不与徽标重叠
    this.drawName(ctx, node, x, y, badgeX - 4 - (x + 44) - 4, y + 22);

    // 标签行：最多 2 个（字辈、已逝），压缩尺寸避免溢出卡片
    const tags = [];
    if (node.generationName) tags.push(node.generationName + '字辈');
    if (node.isAlive === false) tags.push('已逝');
    let tagX = x + 44;
    const tagY = y + 52;
    ctx.font = '9px sans-serif';
    tags.forEach((text) => {
      const isDead = text === '已逝';
      const tagW = ctx.measureText(text).width + 10;
      this.roundRect(ctx, tagX, tagY - 7, tagW, 14, 3);
      // 字辈：暖沙底 + 深褐字；已逝：浅红底 + 深红字，保证标签与卡片/背景均有明显区分
      ctx.fillStyle = isDead ? 'rgba(139, 26, 26, 0.12)' : '#EFE7DA';
      ctx.fill();
      ctx.strokeStyle = isDead ? 'rgba(139, 26, 26, 0.4)' : '#CFC2AE';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isDead ? '#8B1A1A' : '#7A6A56';
      ctx.fillText(text, tagX + 5, tagY);
      tagX += tagW + 5;
    });

    // 配偶卡片：连线 + 卡片色块 + 头像/名字细节
    if (node.spouseInfo && node.spouseInfo.name) {
      const spouseX = x + NODE_W + NODE_GAP_X / 2 - 4;
      this.drawSpouseBlock(ctx, layout);
      const spouseFemale = node.gender !== 'female';
      this.drawAvatar(ctx, spouseX + 20, y + NODE_H / 2, node.spouseInfo.name, spouseFemale ? '#FF6B9D' : '#B22222');
      ctx.fillStyle = '#666666';
      ctx.font = '11px sans-serif';
      ctx.fillText(this.ellipsize(node.spouseInfo.name, 3), spouseX + 42, y + NODE_H / 2);
    }

    // 折叠/展开指示器（仅完整细节等级；有子节点才可折叠）
    if (node.children && node.children.length > 0) {
      const collapsed = this.collapsedIds.has(node.id);
      const pos = this.collapseIndicatorPos(layout);
      if (collapsed) {
        // 折叠态：显示隐藏的后代数量
        const label = '+' + (node.descendantCount || node.children.length);
        ctx.font = '9px sans-serif';
        const pw = ctx.measureText(label).width + 8;
        this.roundRect(ctx, pos.x - pw / 2, pos.y - 6, pw, 12, 6);
        ctx.fillStyle = 'rgba(139, 26, 26, 0.1)';
        ctx.fill();
        ctx.fillStyle = '#8B1A1A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, pos.x, pos.y);
      } else {
        // 展开态：圆形减号
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#F5EFE6';
        ctx.strokeStyle = '#C08A55';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#8B1A1A';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('−', pos.x, pos.y + 0.5);
      }
    }
  },

  /** 绘制名字（按可用宽度截断，默认位于卡片上部） */
  drawName(ctx, node, x, y, maxW, centerY) {
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.ellipsizeByWidth(ctx, node.name, maxW), x + 44, centerY || y + 22);
  },

  /** 绘制配偶连线与配偶卡片色块（不含文字/头像，供各 LOD 共用） */
  drawSpouseBlock(ctx, layout) {
    const node = layout.node;
    if (!node.spouseInfo || !node.spouseInfo.name) return;
    const x = layout.x;
    const y = layout.y;
    const spouseX = x + NODE_W + NODE_GAP_X / 2 - 4;
    // 先画连线再画卡片，避免连线压在卡片圆角上
    ctx.beginPath();
    ctx.moveTo(x + NODE_W, y + NODE_H / 2);
    ctx.lineTo(spouseX, y + NODE_H / 2);
    ctx.strokeStyle = '#C08A55';
    ctx.lineWidth = 1;
    ctx.stroke();

    this.roundRect(ctx, spouseX, y + 8, SPOUSE_W, NODE_H - 16, 8);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#FCF9F4';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#D4C4B2';
    ctx.stroke();
  },

  drawAvatar(ctx, cx, cy, name, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, AVATAR_R, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px KaiTi, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const char = (name || '').charAt(0) || '?';
    ctx.fillText(char, cx, cy + 1);
    ctx.restore();
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  },

  ellipsize(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen - 1) + '…' : text;
  },

  /** 按像素宽度截断文本，超出部分以省略号结尾 */
  ellipsizeByWidth(ctx, text, maxWidth) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result.length > 1 && ctx.measureText(result + '…').width > maxWidth) {
      result = result.substring(0, result.length - 1);
    }
    return result + '…';
  },

  getRelation(generation) {
    const relations = ['', '始祖', '祖辈', '父辈', '同辈', '子辈'];
    return relations[generation] || '族人';
  },

  toggleView() {
    // 当前需求：仅保留树状图与直系图两种视图，取消列表视图切换入口
    const next = this.data.viewMode === 'tree' ? 'vertical' : 'tree';
    this.setData({ viewMode: next }, () => {
      // wx:if 会销毁并重建 canvas 节点，切回树状/直系视图时必须重新获取上下文
      this.canvasCtx = null;
      this.canvasNode = null;
      this.canvasReady = false;
      wx.nextTick(() => this.initCanvas());
    });
  },

  filterGen(e) {
    const gen = e.currentTarget.dataset.gen;
    this.renderGen = gen;
    this.setData({ selectedGen: gen });
    this.applyFilter();
  },

  resetView() {
    if (this.data.viewMode === 'vertical') {
      this.vPan = { x: 0, y: 0, startX: 0, startY: 0, touching: false };
      this.vZoom = 1;
      this.vTapInfo = null;
      this.setData({ canvasScale: 1 });
      this.renderVerticalTree();
    } else {
      this.pan = { x: 0, y: 0, startX: 0, startY: 0, touching: false };
      this.zoom = 1;
      this.tapInfo = null;
      this.setData({ canvasScale: 1 });
      this.renderTree();
    }
  },

  onCanvasTouchStart(e) {
    const touches = e.touches;
    if (touches.length === 2) {
      // 双指：进入缩放模式，记录起始距离与倍率
      this.tapInfo = null;
      this.pan.touching = false;
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

  onCanvasTouchMove(e) {
    const touches = e.touches;
    if (touches.length === 2 && this.pinchStartDist > 0) {
      const dist = this.touchDist(touches);
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.pinchStartZoom * (dist / this.pinchStartDist)));
      if (Math.abs(next - this.zoom) > 0.001) {
        this.applyZoomAt(next, touches);
      }
      return;
    }
    if (!this.pan.touching || touches.length !== 1) return;
    const t = touches[0];
    // 拖动超过阈值后不再视为点击，避免松手误弹详情
    if (this.tapInfo &&
      (Math.abs(t.clientX - this.tapInfo.x) > 10 || Math.abs(t.clientY - this.tapInfo.y) > 10)) {
      this.tapInfo = null;
    }
    this.pan.x = t.clientX - this.pan.startX;
    this.pan.y = t.clientY - this.pan.startY;
    this.requestRender();
  },

  onCanvasTouchEnd() {
    this.pan.touching = false;
    this.pinchStartDist = 0;
    this.pinchStartZoom = 1;
  },

  /** 以双指中点为焦点缩放，保持焦点下的世界坐标不动 */
  applyZoomAt(nextZoom, touches) {
    const { scale, offsetX, offsetY } = this.getViewTransform();
    const t0 = touches[0];
    const t1 = touches[1];
    const mx = (t0.clientX + t1.clientX) / 2;
    const my = (t0.clientY + t1.clientY) / 2;
    const worldX = (mx - offsetX) / scale;
    const worldY = (my - offsetY) / scale;

    this.zoom = nextZoom;
    const ns = this.initialScale * this.zoom;
    const { contentW, contentH } = this.getContentSize();
    const nOffsetX = mx - worldX * ns;
    const nOffsetY = my - worldY * ns;
    this.pan.x = nOffsetX - (this.canvasWidth - contentW * ns) / 2;
    this.pan.y = nOffsetY - (this.canvasHeight - contentH * ns) / 2;
    this.requestRender();
  },

  onCanvasTap(e) {
    // 拖动/缩放后松手不算点击
    if (!this.tapInfo) return;
    const touch = e.detail;
    // 优先检测折叠/展开指示器
    if (this.hitCollapseToggle(touch.x, touch.y)) return;
    const node = this.hitTest(touch.x, touch.y);
    if (node) {
      this.setData({
        showModal: true,
        selectedNode: node,
        selectedCollapsed: this.collapsedIds.has(node.id)
      });
    }
  },

  /** 直系图手势：开始拖动或双指缩放 */
  onVerticalTouchStart(e) {
    const touches = e.touches;
    if (touches.length === 2) {
      this.vTapInfo = null;
      this.vPan.touching = false;
      this.vPinchStartDist = this.touchDist(touches);
      this.vPinchStartZoom = this.vZoom;
      return;
    }
    const t = touches[0];
    this.vTapInfo = { x: t.clientX, y: t.clientY };
    this.vPan.startX = t.clientX - this.vPan.x;
    this.vPan.startY = t.clientY - this.vPan.y;
    this.vPan.touching = true;
  },

  onVerticalTouchMove(e) {
    const touches = e.touches;
    if (touches.length === 2 && this.vPinchStartDist > 0) {
      const dist = this.touchDist(touches);
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.vPinchStartZoom * (dist / this.vPinchStartDist)));
      if (Math.abs(next - this.vZoom) > 0.001) {
        this.applyVerticalZoomAt(next, touches);
      }
      return;
    }
    if (!this.vPan.touching || touches.length !== 1) return;
    const t = touches[0];
    if (this.vTapInfo &&
      (Math.abs(t.clientX - this.vTapInfo.x) > 10 || Math.abs(t.clientY - this.vTapInfo.y) > 10)) {
      this.vTapInfo = null;
    }
    this.vPan.x = t.clientX - this.vPan.startX;
    this.vPan.y = t.clientY - this.vPan.startY;
    this.requestRender();
  },

  onVerticalTouchEnd() {
    this.vPan.touching = false;
    this.vPinchStartDist = 0;
    this.vPinchStartZoom = 1;
  },

  /** 直系图以双指中点为焦点缩放 */
  applyVerticalZoomAt(nextZoom, touches) {
    const { scale, offsetX, offsetY } = this.getVerticalTransform();
    const t0 = touches[0];
    const t1 = touches[1];
    const mx = (t0.clientX + t1.clientX) / 2;
    const my = (t0.clientY + t1.clientY) / 2;
    const worldX = (mx - offsetX) / scale;
    const worldY = (my - offsetY) / scale;

    this.vZoom = nextZoom;
    const ns = this.vInitialScale * this.vZoom;
    const { contentW, contentH } = this.getVerticalContentSize();
    const nOffsetX = mx - worldX * ns;
    const nOffsetY = my - worldY * ns;
    this.vPan.x = nOffsetX - (this.canvasWidth - contentW * ns) / 2;
    this.vPan.y = nOffsetY - (this.canvasHeight - contentH * ns) / 2;
    this.requestRender();
  },

  /** 直系图点击：命中头像（含配偶）后弹出详情 */
  onVerticalTap(e) {
    if (!this.vTapInfo) return;
    const touch = e.detail;
    const node = this.hitVerticalTest(touch.x, touch.y);
    if (node) {
      this.setData({
        showModal: true,
        selectedNode: node,
        selectedCollapsed: this.collapsedIds.has(node.id)
      });
    }
  },

  /** 直系图命中检测：点击主角或配偶头像均返回该成员 */
  hitVerticalTest(x, y) {
    const { scale, offsetX, offsetY } = this.getVerticalTransform();
    const worldX = (x - offsetX) / scale;
    const worldY = (y - offsetY) / scale;
    const vNodes = Object.values(this.vLayoutMap || {});
    let hit = null;
    vNodes.forEach(l => {
      const cx = l.x + V_AVATAR_R;
      const cy = l.y + V_AVATAR_R;
      if (Math.pow(worldX - cx, 2) + Math.pow(worldY - cy, 2) <= Math.pow(V_AVATAR_R + 4, 2)) {
        hit = l.node;
      }
      if (l.hasSpouse) {
        const sx = l.spouseX + V_SPOUSE_AVATAR_R;
        if (Math.pow(worldX - sx, 2) + Math.pow(worldY - cy, 2) <= Math.pow(V_SPOUSE_AVATAR_R + 4, 2)) {
          hit = l.node;
        }
      }
    });
    return hit;
  },

  /** 将当前直系图节点设为中心 */
  setVerticalRoot(node) {
    this.vRootId = node && node.id;
    this.vPan = { x: 0, y: 0, startX: 0, startY: 0, touching: false };
    this.vZoom = 1;
    this.calcVerticalLayout();
    this.renderVerticalTree();
  },

  /** 折叠/展开节点：折叠后隐藏其后代，展开后恢复 */
  toggleCollapse(id) {
    const node = this.nodeMap[id];
    if (!node || !node.children || !node.children.length) return;
    if (this.collapsedIds.has(id)) {
      this.collapsedIds.delete(id);
    } else {
      this.collapsedIds.add(id);
    }
    this.applyFilter();
  },

  /** 弹窗内折叠/展开当前选中分支 */
  toggleSelectedCollapse() {
    const node = this.data.selectedNode;
    if (!node) return;
    this.toggleCollapse(node.id);
    this.setData({ selectedCollapsed: this.collapsedIds.has(node.id) });
  },

  /** 折叠指示器位置（绘制与命中检测共用） */
  collapseIndicatorPos(layout) {
    return { x: layout.x + NODE_W - 12, y: layout.y + NODE_H / 2, r: 10 };
  },

  /** 检测点击是否落在折叠/展开指示器上，命中则切换折叠状态 */
  hitCollapseToggle(x, y) {
    const { scale, offsetX, offsetY } = this.getViewTransform();
    // 指示器只在完整细节等级绘制，低缩放时不参与命中
    if (NODE_W * scale < LOD_MEDIUM_THRESHOLD) return false;
    const worldX = (x - offsetX) / scale;
    const worldY = (y - offsetY) / scale;
    for (const node of this.renderNodes) {
      if (!node.children || !node.children.length) continue;
      const layout = this.layoutMap[node.id];
      if (!layout) continue;
      const pos = this.collapseIndicatorPos(layout);
      const dx = worldX - pos.x;
      const dy = worldY - pos.y;
      if (dx * dx + dy * dy <= pos.r * pos.r) {
        this.toggleCollapse(node.id);
        return true;
      }
    }
    return false;
  },

  hitTest(x, y) {
    // 与渲染共用同一套坐标变换，保证命中位置与绘制位置一致
    const { scale, offsetX, offsetY } = this.getViewTransform();
    const worldX = (x - offsetX) / scale;
    const worldY = (y - offsetY) / scale;

    let hit = null;
    this.renderNodes.forEach(node => {
      const l = this.layoutMap[node.id];
      if (!l) return;
      const w = l.width;
      if (worldX >= l.x && worldX <= l.x + w && worldY >= l.y && worldY <= l.y + NODE_H) {
        hit = node;
      }
    });
    return hit;
  },

  /** 展开/收起搜索栏（收起时清空搜索并恢复完整视图） */
  onSearchToggle() {
    const show = !this.data.showSearchBar;
    this.setData({ showSearchBar: show });
    if (!show) {
      if (this._searchTimer) clearTimeout(this._searchTimer);
      this.renderSearch = '';
      this.setData({ searchKeyword: '' });
      this.applyFilter();
    }
  },

  /** 搜索输入：防抖过滤树与列表 */
  onSearchInput(e) {
    const kw = e.detail.value;
    this.setData({ searchKeyword: kw });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.renderSearch = kw;
      this.applyFilter();
    }, 200);
  },

  /** 清空搜索（保留搜索栏，仅恢复全部结果） */
  clearSearch() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.renderSearch = '';
    this.setData({ searchKeyword: '' });
    this.applyFilter();
  },

  /** 以当前弹窗中的节点为直系图中心，并关闭弹窗 */
  setAsVerticalRoot() {
    const node = this.data.selectedNode;
    if (!node) return;
    this.setVerticalRoot(node);
    this.closeModal();
  },

  showNodeDetail(e) {
    const id = e.currentTarget.dataset.id;
    const node = this.data.memberList.find(m => m.id === id);
    if (node) {
      this.openModal(node);
    }
  },

  openModal(node) {
    const animation = wx.createAnimation({ duration: 250, timingFunction: 'ease' });
    animation.translateY(0).opacity(1).step();
    this.setData({
      showModal: true,
      selectedNode: node,
      selectedCollapsed: this.collapsedIds.has(node.id),
      modalAnimation: animation.export()
    });
  },

  closeModal() {
    const animation = wx.createAnimation({ duration: 200, timingFunction: 'ease' });
    animation.translateY('100%').opacity(0).step();
    this.setData({ modalAnimation: animation.export() });
    setTimeout(() => {
      this.setData({ showModal: false });
    }, 200);
  },

  /** 预览当前选中成员头像大图（无头像时忽略） */
  previewNodeAvatar() {
    const node = this.data.selectedNode;
    if (node && node.avatar) {
      wx.previewImage({ current: node.avatar, urls: [node.avatar] });
    }
  },

  /** 弹窗内头像加载失败：回退为首字显示 */
  onAvatarError() {
    if (this.data.selectedNode && this.data.selectedNode.avatar) {
      this.setData({ 'selectedNode.avatar': '' });
    }
  },

  viewDetail() {
    wx.navigateTo({
      url: `/pages/member-detail/member-detail?id=${this.data.selectedNode.id}`
    });
    this.closeModal();
  },

  editNode() {
    wx.navigateTo({
      url: `/pages/add-member/add-member?id=${this.data.selectedNode.id}&edit=1`
    });
    this.closeModal();
  },

  /** 以当前节点为父辈新增成员：预填代数与父亲 */
  addChild() {
    const node = this.data.selectedNode;
    wx.navigateTo({
      url: `/pages/add-member/add-member?fatherId=${node.id}&generation=${(Number(node.generation) || 0) + 1}`
    });
    this.closeModal();
  },

  addMember() {
    wx.navigateTo({
      url: '/pages/add-member/add-member'
    });
  },

  exportTree() {
    if (!this.canvasCtx || !this.renderNodes.length) {
      wx.showToast({ title: '画布未就绪', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['导出为图片', '分享给好友', '导出为PDF'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.exportImage(false);
        } else if (res.tapIndex === 1) {
          this.exportImage(true);
        } else {
          wx.showToast({ title: 'PDF 导出暂未开放', icon: 'none' });
        }
      }
    });
  },

  /** 导出整棵树为完整大图（离屏画布 1:1 绘制）；share=true 走文件分享，否则保存相册 */
  exportImage(share) {
    if (this.data.viewMode === 'vertical') {
      this.exportVerticalImage(share);
      return;
    }
    const bounds = this.getBounds();
    const contentW = bounds.width + PADDING * 2;
    const contentH = bounds.height + PADDING * 2;
    // 离屏画布按设备像素输出保证清晰，导出倍率最高取 2 避免超大图内存溢出
    const exportDpr = Math.min(this.canvasDpr || 2, 2);

    const doExport = (canvas) => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        success: (res) => this.handleExportedFile(res.tempFilePath, share),
        fail: () => wx.showToast({ title: '导出失败', icon: 'none' })
      });
    };

    // 优先离屏绘制完整树（含屏幕外部分）
    if (typeof wx.createOffscreenCanvas === 'function') {
      try {
        const cw = Math.ceil(contentW * exportDpr);
        const ch = Math.ceil(contentH * exportDpr);
        const offCanvas = wx.createOffscreenCanvas({ type: '2d', width: cw, height: ch });
        const octx = offCanvas.getContext('2d');
        octx.scale(exportDpr, exportDpr);
        octx.fillStyle = CANVAS_BG;
        octx.fillRect(0, 0, contentW, contentH);
        this.drawTreeContent(octx, PADDING - bounds.minX, PADDING - bounds.minY, 1, contentW, contentH);
        doExport(offCanvas);
        return;
      } catch (e) {
        console.warn('离屏导出失败，回退当前视图导出', e);
      }
    }
    // 兜底：导出当前可视区域
    doExport(this.canvasNode);
  },

  /** 导出直系图为完整大图 */
  exportVerticalImage(share) {
    const layoutSize = this.calcVerticalLayout();
    const contentW = layoutSize.contentW;
    const contentH = layoutSize.contentH;
    if (!contentW || !contentH) {
      wx.showToast({ title: '暂无可导出内容', icon: 'none' });
      return;
    }
    const exportDpr = Math.min(this.canvasDpr || 2, 2);
    const doExport = (canvas) => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        success: (res) => this.handleExportedFile(res.tempFilePath, share),
        fail: () => wx.showToast({ title: '导出失败', icon: 'none' })
      });
    };
    if (typeof wx.createOffscreenCanvas === 'function') {
      try {
        const cw = Math.ceil(contentW * exportDpr);
        const ch = Math.ceil(contentH * exportDpr);
        const offCanvas = wx.createOffscreenCanvas({ type: '2d', width: cw, height: ch });
        const octx = offCanvas.getContext('2d');
        octx.scale(exportDpr, exportDpr);
        octx.fillStyle = CANVAS_BG;
        octx.fillRect(0, 0, contentW, contentH);
        this.drawVerticalContent(octx, 0, 0, 1);
        doExport(offCanvas);
        return;
      } catch (e) {
        console.warn('直系图离屏导出失败', e);
      }
    }
    doExport(this.canvasNode);
  },

  handleExportedFile(filePath, share) {
    if (share) {
      wx.shareFileMessage({
        filePath,
        fileName: '家谱树.png',
        success: () => {},
        fail: () => wx.showToast({ title: '分享失败', icon: 'none' })
      });
    } else {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          const msg = (err && err.errMsg) || '';
          if (msg.indexOf('auth') > -1 || msg.indexOf('deny') > -1 || msg.indexOf('cancel') > -1) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启"保存到相册"权限后重试',
              confirmText: '去设置',
              success: (r) => { if (r.confirm) wx.openSetting(); }
            });
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        }
      });
    }
  }
});
