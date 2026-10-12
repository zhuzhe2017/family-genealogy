/**
 * 家谱树「树状图」几何布局模块（纯函数）
 * 从 pages/family-tree-detail 抽出：不依赖页面实例，所有入参/出参均为显式值，
 * 调用方负责把结果写回自身状态。便于单测与复用。
 */

// 节点绘制常量
const NODE_W = 100;    // 节点卡片宽度（更紧凑）
const NODE_H = 80;     // 节点卡片高度（基础高度，不含配偶行）
const LEVEL_H = 180;   // 代际垂直间距
const NODE_GAP_X = 16; // 节点水平间距（更紧凑）
const PADDING = 16;    // 画布内边距

/**
 * 递归计算每个节点的 x,y 坐标（子树依次排列 + 父节点居中，HTML 方案同款算法）
 * 说明：旧实现用 currentX+shift 防重叠，在「满叉树/大族」下会导致宽度指数级膨胀；
 * 本实现改为每个节点接收子树起始坐标，叶子顺序排列、父节点居中到子树范围中心，
 * 宽度始终 ≈ 最底层可见节点数 × 卡片间距，任意规模均紧凑。
 * @param {Array} rootNodes 根节点列表
 * @param {Array} renderNodes 当前可见（过滤后）的节点列表
 * @returns {Object} layoutMap: { [nodeId]: { x, y, width, height, node } }
 */
function calcTreeLayout(rootNodes, renderNodes) {
  const layoutMap = {};
  const visibleSet = new Set(renderNodes.map(n => n.id));
  let cursorX = PADDING; // 多个根节点子树依次排列的起始坐标

  // 获取节点实际高度（含多配偶行）
  const getNodeHeight = (node) => {
    const spouseList = (node.spouseList || []).filter(s => s.name);
    return NODE_H + (spouseList.length > 0 ? spouseList.length * 14 : 0);
  };

  const traverse = (node, startX) => {
    if (!node) return { left: startX, right: startX };
    const visibleChildren = node.children.filter(c => visibleSet.has(c.id));
    const nodeWidth = NODE_W;
    const nodeHeight = getNodeHeight(node);
    const level = node.generation - 1;
    const y = PADDING + level * LEVEL_H;

    let left;
    let right;
    if (visibleChildren.length === 0) {
      // 叶子：顺序排列
      left = startX;
      right = startX + nodeWidth;
      layoutMap[node.id] = { x: left, y, width: nodeWidth, height: nodeHeight, node };
      return { left, right };
    }

    // 子树依次排列，记录每棵子树的范围
    let childX = startX;
    const bounds = [];
    visibleChildren.forEach((child) => {
      const b = traverse(child, childX);
      bounds.push(b);
      childX = b.right + NODE_GAP_X;
    });

    left = bounds[0].left;
    right = bounds[bounds.length - 1].right;
    // 父节点居中到子树范围中心；若父节点比子树更宽导致左越界，则回推对齐子树左侧
    const nodeX = Math.max(startX, (left + right) / 2 - nodeWidth / 2);
    layoutMap[node.id] = { x: nodeX, y, width: nodeWidth, height: nodeHeight, node };
    return { left: Math.min(left, nodeX), right: Math.max(right, nodeX + nodeWidth) };
  };

  rootNodes.forEach((root) => {
    const b = traverse(root, cursorX);
    cursorX = b.right + NODE_GAP_X;
  });

  return layoutMap;
}

/**
 * 构建空间索引：按代分层，代内按 x 升序排序
 * @returns {Object} { [generation]: layout[] }
 */
function buildGenSpatialIndex(renderNodes, layoutMap) {
  const index = {};
  (renderNodes || []).forEach(n => {
    const l = layoutMap[n.id];
    if (!l) return;
    const gen = n.generation || 1;
    (index[gen] = index[gen] || []).push(l);
  });
  Object.keys(index).forEach(g => index[g].sort((a, b) => a.x - b.x));
  return index;
}

/** 由视口 y 范围反推代际范围（含父代余量，供连线跨代裁剪） */
function genRangeFromViewport(viewTop, viewBottom, extraAbove) {
  let gMin = Math.floor((viewTop - PADDING) / LEVEL_H) + 1;
  let gMax = Math.ceil((viewBottom - PADDING) / LEVEL_H) + 1;
  if (extraAbove) gMin = Math.max(1, gMin - 1);
  return { gMin, gMax };
}

/** 遍历视口内节点（分层 + 代内 x 二分，避免全量扫描） */
function walkVisibleLayout(genIndex, viewTop, viewBottom, viewLeft, viewRight, extraAbove, cb) {
  if (!genIndex) return;
  const { gMin, gMax } = genRangeFromViewport(viewTop, viewBottom, extraAbove);
  for (let g = Math.max(1, gMin); g <= gMax; g++) {
    const arr = genIndex[g];
    if (!arr || !arr.length) continue;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].x + arr[mid].width < viewLeft) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < arr.length; i++) {
      const l = arr[i];
      if (l.x > viewRight) break;
      cb(l.node, l);
    }
  }
}

/**
 * 内容高度超出画布时的垂直定位：适配范围内垂直居中，超出时顶对齐 16px 边距。
 * 变换与缩放锚点反算必须共用同一公式，否则双指缩放时锚点每帧漂移、内容被推出屏幕。
 */
function contentOffsetY(contentH, scale, viewportHeight) {
  return contentH * scale <= viewportHeight
    ? (viewportHeight - contentH * scale) / 2
    : 16;
}

/* ==========================================================================
   直系图（vertical）几何布局：圆形头像、角色标注、配偶在侧（世界坐标 px）
   ========================================================================== */
const V_AVATAR_R = 26;            // 主成员头像半径（世界坐标）
const V_SPOUSE_AVATAR_R = V_AVATAR_R * 0.8; // 配偶头像半径（主成员的 0.8 倍，视觉略小、主次分明）
const V_LEVEL_H = 112;            // 代际垂直间距（紧凑布局）
const V_SPOUSE_GAP = 36;          // 夫妇头像间距（需大于红心宽度 24px + 两侧留白，避免重叠）
const V_PADDING_X = 32;           // 直系图水平内边距
const V_MARGIN_Y = 24;            // 上下边距

// 亲属称谓表（getVerticalRole / getSpouseRole 共用，避免重复维护）
const MALE_ROLES = ['自己', '父亲', '爷爷', '曾祖父', '高祖父', '天祖父', '烈祖父', '太祖父', '远祖父', '鼻祖父'];
const FEMALE_ROLES = ['自己', '母亲', '奶奶', '曾祖母', '高祖母', '天祖母', '烈祖母', '太祖母', '远祖母', '鼻祖母'];

/** 角色语义：最下方是自己，向上依次为父亲/母亲、爷爷/奶奶、曾祖父/曾祖母… */
function getVerticalRole(node, idx, chainLen) {
  const diff = chainLen - 1 - idx;
  const roles = node.gender === 'female' ? FEMALE_ROLES : MALE_ROLES;
  return roles[diff] || `上${diff}代`;
}

/**
 * 配偶角色语义：以主成员角色为基准，按配偶性别给出对应称谓。
 * 注意：role 来自 getVerticalRole —— 女性主成员取 FEMALE_ROLES、男性取 MALE_ROLES，
 * 因此必须先按主成员性别选表定位下标，再从「对方」称谓表取配偶称谓。
 */
function getSpouseRole(role, nodeGender) {
  const isFemale = nodeGender === 'female';
  const ownRoles = isFemale ? FEMALE_ROLES : MALE_ROLES;
  const spouseRoles = isFemale ? MALE_ROLES : FEMALE_ROLES;
  const idx = ownRoles.indexOf(role);
  if (idx === -1) return '配偶';
  // 同辈（自己）的配偶：主成员为女 → 丈夫，为男 → 妻子
  if (idx === 0) return isFemale ? '丈夫' : '妻子';
  return spouseRoles[idx];
}

/**
 * 计算直系图布局：以 vRootId（或当前过滤结果中最合适节点）为中心，
 * 沿父指针向上收集在当前过滤结果中的祖先链。
 * @param {Array} renderNodes 当前可见（过滤后）的节点列表
 * @param {Object} nodeMap id -> node 映射（用于沿 parentId 回溯）
 * @param {*} vRootId 用户指定的中心节点 id
 * @param {string} renderSearch 当前搜索关键词（无 vRootId 时优先取搜索命中）
 * @returns {?{ layoutMap: Object, contentW: number, contentH: number }} 无可见节点时返回 null
 */
function calcVerticalLayout(renderNodes, nodeMap, vRootId, renderSearch) {
  const visibleSet = new Set((renderNodes || []).map(n => n.id));
  if (!visibleSet.size) return null;

  // 默认中心优先级：用户指定（且在当前过滤中）> 搜索命中 > 最年轻叶子 > 最后一个节点
  let center = nodeMap[vRootId];
  if (!center || !visibleSet.has(center.id)) {
    center = null;
  }

  if (!center) {
    const kw = (renderSearch || '').trim();
    if (kw) {
      const matched = renderNodes.find(n => (n.name || '').indexOf(kw) > -1);
      if (matched && visibleSet.has(matched.id)) center = matched;
    }
  }

  if (!center) {
    const leaves = renderNodes.filter(n => !n.children || !n.children.length || !n.children.some(c => visibleSet.has(c.id)));
    center = leaves.length ? leaves[leaves.length - 1] : renderNodes[renderNodes.length - 1];
  }

  if (!center) return null;

  // 向上收集祖先链，仅保留在当前过滤结果中的节点
  const chain = [];
  const collectAncestors = (node) => {
    if (!node || !visibleSet.has(node.id)) return;
    collectAncestors(node.parentId ? nodeMap[node.parentId] : null);
    chain.push(node);
  };
  collectAncestors(center);

  if (!chain.length) return null;

  const layoutMap = {};
  let maxW = 0;

  chain.forEach((node, idx) => {
    const hasSpouse = node.spouseInfo && node.spouseInfo.name;
    // 总宽恒为「主圆直径 + 夫妇间距 + 配偶圆直径」：无配偶时以"失记"占位预留配偶位，
    // 保证各代夫妇中点(midX)一致 → 竖线统一为直线、不再折线
    const coupleW = V_AVATAR_R * 2 + V_SPOUSE_GAP + V_SPOUSE_AVATAR_R * 2;
    maxW = Math.max(maxW, coupleW);
    const x = V_PADDING_X;
    const y = V_MARGIN_Y + idx * V_LEVEL_H;
    layoutMap[node.id] = {
      x,
      y,
      node,
      hasSpouse,
      spouseX: x + V_AVATAR_R * 2 + V_SPOUSE_GAP,
      role: getVerticalRole(node, idx, chain.length)
    };
  });

  // 将链条水平居中（配偶位无论有无配偶恒同步平移，保证各代夫妇中点 midX 一致）
  const contentW = maxW + V_PADDING_X * 2;
  const offsetX = (contentW - maxW) / 2 - V_AVATAR_R;
  Object.values(layoutMap).forEach(l => {
    l.x += offsetX;
    l.spouseX += offsetX;
  });

  return { layoutMap, contentW, contentH: V_MARGIN_Y * 2 + chain.length * V_LEVEL_H };
}

/* ==========================================================================
   尺寸 / 边界 / 手势几何（纯函数）
   ========================================================================== */
// 直系图缩放范围：有效缩放（初始适配 × 双指手势）统一控制在 0.5~1.0
const V_SCALE_MIN = 0.5;  // 直系图缩放下限
const V_SCALE_MAX = 1.0;  // 直系图缩放上限（初始即最大，禁止放大）

/**
 * 计算树状图内容边界（世界坐标）。
 * @param {Object} layoutMap id -> { x, y, width, height }
 * @returns {{ width: number, height: number, minX: number, minY: number }}
 */
function computeBounds(layoutMap) {
  const keys = Object.keys(layoutMap || {});
  // 空布局：回退到单卡片尺寸，避免 maxX - minX 得到 -Infinity
  if (!keys.length) {
    return { width: NODE_W, height: NODE_H, minX: PADDING, minY: PADDING };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  keys.forEach(k => {
    const l = layoutMap[k];
    minX = Math.min(minX, l.x);
    minY = Math.min(minY, l.y);
    maxX = Math.max(maxX, l.x + l.width);
    maxY = Math.max(maxY, l.y + NODE_H);
  });
  return {
    width: maxX - minX || NODE_W,
    height: maxY - minY || NODE_H,
    minX,
    minY
  };
}

/** 树状图内容尺寸（世界坐标范围 + 边距） */
function computeContentSize(bounds) {
  return { contentW: bounds.width + PADDING * 2, contentH: bounds.height + PADDING * 2 };
}

/** 直系图内容尺寸：至少占视口的 60%，避免小树贴边 */
function computeVerticalContentSize(layoutSize, viewportWidth, viewportHeight) {
  const w = Math.max(layoutSize.contentW, viewportWidth * 0.6);
  const h = Math.max(layoutSize.contentH, viewportHeight * 0.6);
  return { contentW: w, contentH: h };
}

/** 直系图基础适配：小树放大、长链完整显示，初始缩放限定 V_SCALE_MIN~V_SCALE_MAX */
function computeVerticalFitScale(contentW, contentH, viewportWidth, viewportHeight) {
  if (!viewportWidth || !viewportHeight) return 1;
  const fitX = viewportWidth / contentW;
  const fitY = viewportHeight / contentH;
  const fit = Math.max(fitX, fitY);
  return Math.min(V_SCALE_MAX, Math.max(fit, V_SCALE_MIN));
}

/** 鹰眼图缩放比例：使内容适应缩略图容器（留 10% 边距） */
function computeMinimapScale(contentW, contentH, minimapW, minimapH) {
  if (!contentW || !contentH) return 0.1;
  const scaleX = minimapW / contentW;
  const scaleY = minimapH / contentH;
  return Math.min(scaleX, scaleY) * 0.9;
}

/** 夫妇红心连接点 x：恒取夫妇连线中点（无配偶时配偶位由占位补齐） */
function coupleMidX(l) {
  return (l.x + V_AVATAR_R * 2 + l.spouseX) / 2;
}

/** 双指间距（防御：触摸点缺失或坐标异常时返回 0，避免除零/NaN 污染缩放状态） */
function touchDist(touches) {
  if (!touches || touches.length < 2) return 0;
  const t0 = touches[0];
  const t1 = touches[1];
  if (!t0 || !t1 || !isFinite(t0.clientX) || !isFinite(t0.clientY) ||
      !isFinite(t1.clientX) || !isFinite(t1.clientY)) return 0;
  return Math.sqrt(Math.pow(t0.clientX - t1.clientX, 2) + Math.pow(t0.clientY - t1.clientY, 2));
}

module.exports = {
  NODE_W,
  NODE_H,
  LEVEL_H,
  NODE_GAP_X,
  PADDING,
  calcTreeLayout,
  buildGenSpatialIndex,
  genRangeFromViewport,
  walkVisibleLayout,
  contentOffsetY,
  V_AVATAR_R,
  V_SPOUSE_AVATAR_R,
  V_LEVEL_H,
  V_SPOUSE_GAP,
  V_PADDING_X,
  V_MARGIN_Y,
  V_SCALE_MIN,
  V_SCALE_MAX,
  calcVerticalLayout,
  getVerticalRole,
  getSpouseRole,
  computeBounds,
  computeContentSize,
  computeVerticalContentSize,
  computeVerticalFitScale,
  computeMinimapScale,
  coupleMidX,
  touchDist
};