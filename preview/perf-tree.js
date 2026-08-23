/**
 * 家谱树绘制性能基准（Node 无依赖，自包含）
 *
 * 目的：在 100 / 500 / 1000 / 2000 / 5000 人规模下，量化「优化前」与「优化后」
 * 的布局耗时与每帧渲染/命中遍历成本，为性能测试报告提供数据支撑。
 *
 * 用法：node preview/perf-tree.js
 *
 * 说明：
 * - 此处复刻 family-tree-detail.js 中的核心算法（buildTree / calcLayout / 视口裁剪），
 *   保证与小程序端逻辑一致；不依赖 wx / canvas，仅测纯计算复杂度。
 * - 「优化前」每帧 = 每次平移/缩放都重算 getBounds(O(n)) + 全量遍历 renderNodes 两次；
 *   「优化后」每帧 = 内容尺寸缓存(O(1)) + 空间索引视口裁剪(O(可见节点 + log n))。
 */

'use strict';

// 与 family-tree-detail.js 保持一致的关键常量
const PADDING = 24;
const NODE_W = 120;
const NODE_H = 76;
const LEVEL_H = 180;
const NODE_GAP_X = 32;

/** 生成 N 人合成家谱：单根，每节点 2~4 个子女，代数随深度递增 */
function generateTree(n) {
  const members = [];
  members.push({ id: '1', generation: 1, fatherId: '', motherId: '' });
  const frontier = ['1'];
  let nextId = 2;
  while (members.length < n) {
    const parentId = frontier.shift();
    const parent = members.find((m) => m.id === parentId);
    const childCount = 2 + Math.floor(Math.random() * 3); // 2~4
    for (let i = 0; i < childCount && members.length < n; i++) {
      const id = String(nextId++);
      members.push({ id, generation: parent.generation + 1, fatherId: parentId, motherId: '' });
      frontier.push(id);
    }
  }
  members.forEach((m) => {
    m.sortOrder = Math.floor(Math.random() * 100);
    m.birthYear = 1900 + Math.floor(Math.random() * 120);
  });
  return members;
}

/** 建立父子关系与后代统计（与 buildTree 前半段一致，前后优化共用） */
function buildTree(members) {
  const nodeMap = {};
  members.forEach((m) => {
    nodeMap[m.id] = { ...m, children: [], hasChildren: false, childrenCount: 0 };
  });
  const rootIds = new Set(Object.keys(nodeMap));
  Object.keys(nodeMap).forEach((id) => {
    const node = nodeMap[id];
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
  const countDescendants = (node) => {
    let count = node.children.length;
    node.children.forEach((c) => { count += countDescendants(c); });
    node.descendantCount = count;
    return count;
  };
  const roots = Array.from(rootIds).map((id) => nodeMap[id])
    .sort((a, b) => a.sortOrder - b.sortOrder || a.birthYear - b.birthYear);
  roots.forEach(countDescendants);
  Object.keys(nodeMap).forEach((id) => { nodeMap[id].childrenCount = nodeMap[id].children.length; });
  return { nodeMap, roots };
}

/** 布局（当前生产算法：后序遍历 + 左边界右移修正） */
function calcLayout(nodeMap, roots) {
  const layoutMap = {};
  let currentX = PADDING;
  const visibleSet = new Set(Object.keys(nodeMap));
  const traverse = (node) => {
    if (!node) return { x: 0, y: 0, width: 0 };
    const visibleChildren = node.children.filter((c) => visibleSet.has(c.id));
    const nodeWidth = NODE_W;
    if (visibleChildren.length === 0) {
      const x = currentX;
      currentX += nodeWidth + NODE_GAP_X;
      const y = PADDING + (node.generation - 1) * LEVEL_H;
      layoutMap[node.id] = { x, y, width: nodeWidth, node };
      return { x, y, width: nodeWidth };
    }
    let firstChildX = Infinity;
    let lastChildX = -Infinity;
    visibleChildren.forEach((child) => {
      const r = traverse(child);
      firstChildX = Math.min(firstChildX, r.x);
      lastChildX = Math.max(lastChildX, r.x + r.width);
    });
    const childrenCenter = (firstChildX + lastChildX) / 2;
    let nodeX = childrenCenter - nodeWidth / 2;
    if (nodeX < currentX) {
      const shift = currentX - nodeX;
      const shiftNode = (n) => {
        if (layoutMap[n.id]) layoutMap[n.id].x += shift;
        n.children.filter((c) => visibleSet.has(c.id)).forEach(shiftNode);
      };
      visibleChildren.forEach(shiftNode);
      nodeX += shift;
      currentX += shift;
    }
    const y = PADDING + (node.generation - 1) * LEVEL_H;
    layoutMap[node.id] = { x: nodeX, y, width: nodeWidth, node };
    currentX = Math.max(currentX, nodeX + nodeWidth + NODE_GAP_X);
    return { x: nodeX, y, width: nodeWidth };
  };
  roots.forEach(traverse);
  return layoutMap;
}

/** 空间索引：按代分层，代内按 x 升序（优化后新增） */
function buildSpatialIndex(layoutMap) {
  const index = {};
  Object.keys(layoutMap).forEach((k) => {
    const l = layoutMap[k];
    const g = l.node.generation || 1;
    (index[g] = index[g] || []).push(l);
  });
  Object.keys(index).forEach((g) => index[g].sort((a, b) => a.x - b.x));
  return index;
}

/** 优化前：每帧 getBounds(O(n)) + 两次全量遍历 */
function oldFrameCost(layoutMap) {
  let visits = 0;
  const keys = Object.keys(layoutMap);
  // getBounds 遍历
  keys.forEach(() => { visits++; });
  // 连线遍历
  keys.forEach(() => { visits++; });
  // 节点遍历
  keys.forEach(() => { visits++; });
  return visits;
}

/** 优化后：内容尺寸已缓存(O(1))，仅视口裁剪遍历 */
function newFrameCost(index, viewTop, viewBottom, viewLeft, viewRight) {
  let visits = 0;
  const gMin = Math.floor((viewTop - PADDING) / LEVEL_H) + 1;
  const gMax = Math.ceil((viewBottom - PADDING) / LEVEL_H) + 1;
  for (let g = Math.max(1, gMin); g <= gMax; g++) {
    const arr = index[g];
    if (!arr || !arr.length) continue;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].x + arr[mid].width < viewLeft) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < arr.length; i++) {
      if (arr[i].x > viewRight) break;
      visits++;
    }
  }
  return visits;
}

function now() {
  return Number(process.hrtime.bigint()) / 1e6; // ms
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function bench(label, fn, iterations = 20) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = now();
    fn();
    times.push(now() - t0);
  }
  return median(times);
}

function run() {
  const sizes = [100, 500, 1000, 2000, 5000];
  console.log('规模\t构建(ms)\t布局(ms)\t索引(ms)\t旧每帧遍历\t新每帧遍历\t每帧降幅');
  sizes.forEach((n) => {
    const members = generateTree(n);
    const buildMs = bench('build', () => buildTree(members));
    const { nodeMap, roots } = buildTree(members);

    const layoutMs = bench('layout', () => calcLayout(nodeMap, roots));
    const layoutMap = calcLayout(nodeMap, roots);

    const indexMs = bench('index', () => buildSpatialIndex(layoutMap));
    const index = buildSpatialIndex(layoutMap);

    // 模拟一个覆盖树中部约 40% 宽度、3 个代际的视口
    const keys = Object.keys(layoutMap);
    let minX = Infinity, maxX = -Infinity;
    keys.forEach((k) => {
      const l = layoutMap[k];
      minX = Math.min(minX, l.x);
      maxX = Math.max(maxX, l.x + l.width);
    });
    const width = maxX - minX;
    const viewLeft = minX + width * 0.3;
    const viewRight = minX + width * 0.7;
    const genValues = Object.keys(index).map(Number).sort((a, b) => a - b);
    const midGen = genValues[Math.floor(genValues.length / 2)] || 1;
    const viewTop = PADDING + (midGen - 1) * LEVEL_H;
    const viewBottom = viewTop + 3 * LEVEL_H;

    const oldVisits = oldFrameCost(layoutMap);
    const newVisits = newFrameCost(index, viewTop, viewBottom, viewLeft, viewRight);
    const reduction = oldVisits > 0 ? ((1 - newVisits / oldVisits) * 100).toFixed(1) : '0.0';

    console.log(
      `${n}\t${buildMs.toFixed(2)}\t${layoutMs.toFixed(2)}\t${indexMs.toFixed(2)}\t${oldVisits}\t${newVisits}\t${reduction}%`
    );
  });
}

run();
