/**
 * calcVerticalLayout —— 直系图放射布局
 *
 * 移植自 mini-program/pages/family-tree-detail.js L616+
 * 逻辑：以选中的 vRootId 为中心，沿父指针向上收集可见祖先链，
 * 沿子指针向下收集子/孙链，兄弟节点左右排布。
 * 小程序实现用 vLayoutMap 记录 {x, y, role, spouseOffsetX}。
 */
import { PADDING, V_AVATAR_R, V_LEVEL_H, V_SPOUSE_GAP } from './constants';
import type { TreeNode, VerticalNode } from './types';

export interface VerticalLayoutResult {
  vLayoutMap: Record<string, VerticalNode>;
  vContentW: number;
  vContentH: number;
}

/**
 * 直系图布局。
 *
 * @param roots         树的根节点
 * @param nodeMap       全部节点
 * @param visibleNodes  过滤后的可见节点
 * @param centerId      中心成员 id（直系图围绕此人放射）
 */
export function calcVerticalLayout(
  roots: TreeNode[],
  nodeMap: Record<string, TreeNode>,
  visibleNodes: TreeNode[],
  centerId?: string,
): VerticalLayoutResult {
  const vLayoutMap: Record<string, VerticalNode> = {};
  const visibleSet = new Set(visibleNodes.map((n) => n.id));

  // 选择中心：优先传入，否则选 visibleNodes 中 generation 居中的
  let center: TreeNode | undefined;
  if (centerId && visibleSet.has(centerId)) {
    center = nodeMap[centerId];
  } else {
    const mid = Math.floor(visibleNodes.length / 2);
    center = visibleNodes[mid];
  }
  if (!center) {
    return { vLayoutMap, vContentW: 0, vContentH: 0 };
  }

  // 向上收集祖先链（每层一个）
  const ancestors: TreeNode[] = [];
  let cur: TreeNode | undefined = center;
  while (cur) {
    ancestors.unshift(cur);
    const parentId: string | undefined = cur.parentId;
    cur = parentId && visibleSet.has(parentId) ? nodeMap[parentId] : undefined;
  }
  const centerLevel = ancestors.length - 1; // center 在祖先链中的索引

  // 布局坐标
  const avatarSize = V_AVATAR_R * 2;
  const nodeW = avatarSize;
  const nodeH = avatarSize;

  // 中心节点
  vLayoutMap[center.id] = {
    id: center.id,
    x: PADDING,
    y: PADDING + centerLevel * V_LEVEL_H,
    width: nodeW,
    height: nodeH,
    node: center,
    isCenter: true,
    role: 'self',
  };

  // 祖先链（向上）
  for (let i = 0; i < ancestors.length - 1; i++) {
    const a = ancestors[i];
    const y = PADDING + i * V_LEVEL_H;
    if (!vLayoutMap[a.id]) {
      vLayoutMap[a.id] = {
        id: a.id,
        x: PADDING,
        y,
        width: nodeW,
        height: nodeH,
        node: a,
        role: i === ancestors.length - 1 ? 'parent' : 'ancestor',
      };
    }
  }

  // 向下收集子节点（左右两列兄弟）
  const placeChildren = (
    parentId: string,
    parentY: number,
    generation: number,
  ): void => {
    const parent = nodeMap[parentId];
    if (!parent) return;
    const children = parent.children.filter((c) => visibleSet.has(c.id));
    if (children.length === 0) return;

    // 奇数排：中心放第一个，其余左右交替
    // 偶数排：左右分列
    let leftIdx = 0;
    let rightIdx = 0;
    const isOdd = children.length % 2 === 1;

    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const y = parentY + V_LEVEL_H;
      let x: number;
      if (isOdd && i === 0) {
        // 中心
        x = PADDING;
      } else {
        const side = isOdd ? (i % 2 === 1 ? 'L' : 'R') : (i % 2 === 0 ? 'L' : 'R');
        const delta = Math.max(leftIdx, rightIdx) + 1;
        if (side === 'L') {
          x = PADDING - delta * (V_AVATAR_R * 2 + 20);
          leftIdx++;
        } else {
          x = PADDING + delta * (V_AVATAR_R * 2 + 20);
          rightIdx++;
        }
      }
      vLayoutMap[c.id] = {
        id: c.id,
        x,
        y,
        width: nodeW,
        height: nodeH,
        node: c,
        role: i === 0 ? 'child' : 'sibling',
      };
      // 递归往下
      placeChildren(c.id, y, generation + 1);
    }
  };

  const centerY = vLayoutMap[center.id].y;
  placeChildren(center.id, centerY, centerLevel);

  // 计算包围盒
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of Object.values(vLayoutMap)) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x + v.width);
    maxY = Math.max(maxY, v.y + v.height);
  }

  // 平移把 minX/minY 对齐到 PADDING
  const shiftX = PADDING - minX;
  const shiftY = PADDING - minY;
  for (const v of Object.values(vLayoutMap)) {
    v.x += shiftX;
    v.y += shiftY;
  }

  const vContentW = maxX - minX + PADDING * 2;
  const vContentH = maxY - minY + PADDING * 2;

  return { vLayoutMap, vContentW, vContentH };
}
