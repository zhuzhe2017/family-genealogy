/**
 * buildSpatialIndex —— 按代分层 + 代内 x 升序
 *
 * 视口裁剪的性能关键：把 O(N) 全量扫描 → O(log N + 可见节点数)
 * 移植自 mini-program/pages/family-tree-detail.js L571-612
 */
import { LEVEL_H, PADDING } from './constants';
import type { SpatialIndex, TreeLayout, TreeNode } from './types';

/**
 * 建立空间索引。
 * @param layouts  layoutMap.values()
 * @param nodes    对应的 TreeNode[]（用于 generation 字段）
 * @returns        按代分层的 index
 */
export function buildSpatialIndex(
  layouts: TreeLayout[],
  nodes: TreeNode[],
): SpatialIndex {
  const index: SpatialIndex = {};
  const genMap: Record<string, number> = {};
  for (const n of nodes) {
    genMap[n.id] = n.generation ?? 1;
  }
  for (const l of layouts) {
    const gen = genMap[l.id] ?? (l.node.generation ?? 1);
    (index[gen] ??= []).push(l);
  }
  for (const g of Object.keys(index)) {
    index[Number(g)].sort((a, b) => a.x - b.x);
  }
  return index;
}

/**
 * 由视口 y 范围反推代际范围。
 *
 * 严格模式（extraAbove=false）：floor 推 gMin、floor 推 gMax
 * 连线容差模式（extraAbove=true）：gMin 向上多看一代（父代连线跨视口容差）
 *
 * 小程序端原版 ceil+1 其实是额外多算了一代，这里拆成两种模式显式控制。
 */
export function visibleGenRange(
  viewTop: number,
  viewBottom: number,
  extraAbove: boolean = false,
): { gMin: number; gMax: number } {
  // 每代的 y 起点：PADDING + (g-1) * LEVEL_H
  // 所以反推：g = floor((y - PADDING) / LEVEL_H) + 1
  let gMin = Math.floor((viewTop - PADDING) / LEVEL_H) + 1;
  let gMax = Math.floor((viewBottom - PADDING) / LEVEL_H) + 1;
  if (extraAbove) gMin = Math.max(1, gMin - 1);
  return { gMin, gMax };
}

/**
 * 二分查找：在一个按 x 升序的数组中找到第一个 x + width >= target 的索引
 */
function lowerBound(arr: TreeLayout[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].x + arr[mid].width < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 遍历视口内节点 —— 分层 + 代内二分。
 *
 * @param index       空间索引
 * @param viewTop     视口上边界（世界坐标 y）
 * @param viewBottom  视口下边界
 * @param viewLeft    视口左边界
 * @param viewRight   视口右边界
 * @param cb          对每个可见节点调用
 * @returns           命中的节点数（可用于 benchmark）
 */
export function forEachVisibleLayout(
  index: SpatialIndex,
  viewTop: number,
  viewBottom: number,
  viewLeft: number,
  viewRight: number,
  extraAbove: boolean = false,
  cb: (node: TreeNode, layout: TreeLayout) => void,
): number {
  const { gMin, gMax } = visibleGenRange(viewTop, viewBottom, extraAbove);
  let hits = 0;
  for (let g = Math.max(1, gMin); g <= gMax; g++) {
    const arr = index[g];
    if (!arr || arr.length === 0) continue;
    let i = lowerBound(arr, viewLeft);
    for (; i < arr.length; i++) {
      const l = arr[i];
      if (l.x > viewRight) break;
      cb(l.node, l);
      hits++;
    }
  }
  return hits;
}

/**
 * 连接折线视口裁剪 —— 和 forEachVisibleLayout 同范围，但对每条父子连线做一次额外判断
 * （父节点和任何子节点在视口内就需要绘制连线的对应段）。
 *
 * 实际渲染时，每条折线从父底中点 → midY 折点 → 子顶中点。
 * 所以判断"连线要不要画"只需：父在视口 或 任意子在视口。
 */
export function collectVisibleConnections(
  index: SpatialIndex,
  viewTop: number,
  viewBottom: number,
  viewLeft: number,
  viewRight: number,
  layouts: Record<string, TreeLayout>,
): Array<{ parent: TreeLayout; children: TreeLayout[] }> {
  const { gMin, gMax } = visibleGenRange(viewTop, viewBottom, true);
  const parentMap = new Map<string, { parent: TreeLayout; children: TreeLayout[] }>();

  for (let g = Math.max(1, gMin); g <= gMax; g++) {
    const arr = index[g];
    if (!arr || arr.length === 0) continue;
    let i = lowerBound(arr, viewLeft);
    for (; i < arr.length; i++) {
      const l = arr[i];
      if (l.x > viewRight) break;
      // 对每个可见节点，向上回溯到父节点，累加连线
      const parentId = l.node.parentId;
      if (parentId) {
        let entry = parentMap.get(parentId);
        if (!entry) {
          const pLayout = layouts[parentId];
          if (!pLayout) continue;
          entry = { parent: pLayout, children: [] };
          parentMap.set(parentId, entry);
        }
        entry.children.push(l);
      }
    }
  }
  return Array.from(parentMap.values());
}
