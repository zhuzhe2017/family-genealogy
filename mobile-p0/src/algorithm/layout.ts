/**
 * calcLayout —— 后序遍历 + 子树中心居中布局
 *
 * 移植自 mini-program/pages/family-tree-detail.js L505-561 的生产算法
 * （与 preview/perf-tree.js 的简化版同逻辑，多了配偶行高度与可见集过滤）
 *
 * 核心思想：
 *  - 子树内部：叶子按 startX 顺序紧密排列，父节点居中到子树的 left/right 中心
 *  - 多个根节点：从左到右 cursorX 依次排列，根间 NODE_GAP_X
 *  - 宽度始终 ≈ 最底层可见节点数 × (NODE_W + NODE_GAP_X)，任意规模紧凑
 *  - 与旧 currentX+shift 算法相比，不会在满叉树下宽度指数级膨胀
 */
import { NODE_W, NODE_H, LEVEL_H, NODE_GAP_X, PADDING, SPOUSE_ROW_H } from './constants';
import type { TreeNode, TreeLayout } from './types';

export interface LayoutResult {
  layoutMap: Record<string, TreeLayout>;
}

/** 节点实际高度（含多配偶行） */
function nodeHeight(node: TreeNode): number {
  const spouseCount = (node.spouseList ?? []).filter((s) => s && s.name).length;
  return NODE_H + (spouseCount > 0 ? spouseCount * SPOUSE_ROW_H : 0);
}

/**
 * 对可见的子节点做后序遍历布局。
 * 返回当前子树的水平范围 { left, right }（世界坐标），供父节点居中。
 */
function traverse(
  node: TreeNode,
  startX: number,
  visibleSet: Set<string>,
  layoutMap: Record<string, TreeLayout>,
): { left: number; right: number } {
  const visibleChildren = node.children.filter((c) => visibleSet.has(c.id));
  const level = (node.generation ?? 1) - 1;
  const y = PADDING + level * LEVEL_H;
  const h = nodeHeight(node);

  if (visibleChildren.length === 0) {
    const left = startX;
    const right = startX + NODE_W;
    layoutMap[node.id] = { id: node.id, x: left, y, width: NODE_W, height: h, node };
    return { left, right };
  }

  // 子树依次排列
  let childCursor = startX;
  const bounds: Array<{ left: number; right: number }> = [];
  for (const child of visibleChildren) {
    const b = traverse(child, childCursor, visibleSet, layoutMap);
    bounds.push(b);
    childCursor = b.right + NODE_GAP_X;
  }

  const firstLeft = bounds[0].left;
  const lastRight = bounds[bounds.length - 1].right;

  // 父节点居中到子树范围中心；若父节点比子树宽导致左越界，则回推对齐子树左侧
  const idealX = (firstLeft + lastRight) / 2 - NODE_W / 2;
  const nodeX = Math.max(startX, idealX);

  layoutMap[node.id] = { id: node.id, x: nodeX, y, width: NODE_W, height: h, node };
  return {
    left: Math.min(firstLeft, nodeX),
    right: Math.max(lastRight, nodeX + NODE_W),
  };
}

/**
 * 执行后序遍历布局。
 *
 * @param roots          根节点数组（已 sort 过）
 * @param visibleNodes   当前过滤后的可见节点（代数窗口 + 折叠 + 搜索 共同作用）
 * @returns              layoutMap[id] = { x, y, width, height, node }
 */
export function calcLayout(roots: TreeNode[], visibleNodes: TreeNode[]): LayoutResult {
  const visibleSet = new Set(visibleNodes.map((n) => n.id));
  const layoutMap: Record<string, TreeLayout> = {};

  let cursorX = PADDING;
  for (const root of roots) {
    const b = traverse(root, cursorX, visibleSet, layoutMap);
    cursorX = b.right + NODE_GAP_X;
  }

  return { layoutMap };
}

/**
 * 计算内容世界坐标边界。
 * 小程序端缓存这一结果（_boundsCache），布局变化时 invalidateLayoutCache 失效。
 */
export function computeBounds(layoutMap: Record<string, TreeLayout>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasAny = false;

  for (const l of Object.values(layoutMap)) {
    hasAny = true;
    if (l.x < minX) minX = l.x;
    if (l.y < minY) minY = l.y;
    if (l.x + l.width > maxX) maxX = l.x + l.width;
    if (l.y + l.height > maxY) maxY = l.y + l.height;
  }

  if (!hasAny) {
    return { width: 0, height: 0, minX: PADDING, minY: PADDING };
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
  };
}

/**
 * 内容尺寸（带 PADDING 内边距），与小程序 getContentSize 一致。
 */
export function computeContentSize(layoutMap: Record<string, TreeLayout>) {
  const b = computeBounds(layoutMap);
  return {
    contentW: b.width + PADDING * 2,
    contentH: b.height + PADDING * 2,
  };
}

/**
 * 基础适配缩放 —— 与小程序一致，始终返回 1（不自动 fit，用户手势缩放为主）。
 * 如需改为"小树放大、超大宽树整体缩小"（MAX_INITIAL_SCALE / MIN_FIT_SCALE 那段），
 * 则传入 viewportW / viewportH 重新实现。
 */
export function computeFitScale(
  contentW: number,
  contentH: number,
  _viewportW?: number,
  _viewportH?: number,
): number {
  return 1;
}
