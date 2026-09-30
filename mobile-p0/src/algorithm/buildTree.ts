/**
 * buildTree —— 从扁平成员列表构建父子关系树
 *
 * 移植自 mini-program/pages/family-tree-detail.js 的 buildTree 阶段
 * （perf-tree.js 已有简化版；此处保持完整功能：后代计数、配偶列表、多根处理、根排序）
 */
import type { MemberRaw, TreeNode } from './types';

export interface BuildResult {
  nodeMap: Record<string, TreeNode>;
  roots: TreeNode[];
}

/**
 * 为所有节点建立 children 数组、parentId、hasChildren、childrenCount、descendantCount，
 * 并识别顶层无父节点的 roots。同时按 generation + sortOrder + birthYear 稳定排序 roots。
 */
export function buildTree(members: MemberRaw[]): BuildResult {
  const nodeMap: Record<string, TreeNode> = {};

  // 第一步：为每条记录创建 TreeNode 壳
  for (const m of members) {
    nodeMap[m.id] = {
      ...m,
      children: [],
      hasChildren: false,
      childrenCount: 0,
      descendantCount: 0,
    };
  }

  // 第二步：建立父子关系 + 配偶列表（直系图用）
  const rootIds = new Set<string>(Object.keys(nodeMap));
  for (const id of Object.keys(nodeMap)) {
    const node = nodeMap[id];
    const father = node.fatherId ? nodeMap[node.fatherId] : undefined;
    const mother = node.motherId ? nodeMap[node.motherId] : undefined;

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
  }

  // 第三步：按 generation 升序排序每层 children（保持与小程序一致）
  const sortChildren = (n: TreeNode) => {
    n.children.sort((a, b) => {
      const ga = a.generation ?? 0;
      const gb = b.generation ?? 0;
      if (ga !== gb) return ga - gb;
      const sa = a.sortOrder ?? 0;
      const sb = b.sortOrder ?? 0;
      if (sa !== sb) return sa - sb;
      const ba = a.birthYear ?? 0;
      const bb = b.birthYear ?? 0;
      return ba - bb;
    });
    n.children.forEach(sortChildren);
  };
  for (const rootId of rootIds) {
    sortChildren(nodeMap[rootId]);
  }

  // 第四步：descendantCount（后序遍历累加）
  const countDescendants = (node: TreeNode): number => {
    let count = node.children.length;
    for (const c of node.children) {
      count += countDescendants(c);
    }
    node.descendantCount = count;
    node.childrenCount = node.children.length;
    return count;
  };
  const roots = Array.from(rootIds)
    .map((id) => nodeMap[id])
    .sort((a, b) => {
      const ga = a.generation ?? 0;
      const gb = b.generation ?? 0;
      if (ga !== gb) return ga - gb;
      const sa = a.sortOrder ?? 0;
      const sb = b.sortOrder ?? 0;
      if (sa !== sb) return sa - sb;
      const ba = a.birthYear ?? 0;
      const bb = b.birthYear ?? 0;
      return ba - bb;
    });
  roots.forEach(countDescendants);

  return { nodeMap, roots };
}

/**
 * 折叠剪枝 —— 给定 collapsedIds，返回 visibleIds（保留被折叠节点本身，移除其后代）。
 * 搜索态 collapsedIds 通常忽略（业务层决定），此处提供通用剪枝函数。
 */
export function pruneCollapsed(
  roots: TreeNode[],
  collapsedIds: Set<string>,
  searchKw: string = '',
): Set<string> {
  const visible = new Set<string>();
  // 搜索态：忽略折叠（搜索结果要保证命中可见）
  const ignoreCollapse = searchKw.trim().length > 0;

  const walk = (node: TreeNode): void => {
    visible.add(node.id);
    if (!ignoreCollapse && collapsedIds.has(node.id)) {
      // 折叠到此为止 —— 不往下走
      return;
    }
    for (const c of node.children) walk(c);
  };
  for (const root of roots) walk(root);
  return visible;
}

/**
 * 代数窗口过滤 —— 保留 generation <= maxGen 的节点（保留祖先链、不剪根）。
 * default → 5 代；搜索态通常跳过此过滤。
 */
export function filterByGeneration(
  roots: TreeNode[],
  nodeMap: Record<string, TreeNode>,
  maxGen: number | 'default',
  skip: boolean = false,
): TreeNode[] {
  if (skip) return Object.values(nodeMap);
  const limit = maxGen === 'default' ? 5 : (maxGen as number);
  const keep = new Set<string>();
  const collect = (node: TreeNode) => {
    const gen = node.generation ?? 1;
    if (gen > limit) return;
    keep.add(node.id);
    for (const c of node.children) collect(c);
  };
  for (const root of roots) collect(root);
  return Object.values(nodeMap).filter((n) => keep.has(n.id));
}

/**
 * 搜索过滤 —— 保留名字匹配 + 其祖先链（保证树结构连通）。
 * 小程序实现：先按名字匹配收集 matched，再自顶向下 markAncestors。
 */
export function filterBySearch(
  nodes: TreeNode[],
  roots: TreeNode[],
  keyword: string,
): TreeNode[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodes;

  const matched = new Set<string>();
  for (const n of nodes) {
    if ((n.name ?? '').toLowerCase().includes(kw)) {
      matched.add(n.id);
    }
  }
  if (matched.size === 0) return [];

  // 自顶向下标记：若某子节点在 matched 或已标记，则父节点也要保留
  const ancestorKeep = new Set<string>();
  const walkDown = (node: TreeNode) => {
    for (const c of node.children) {
      walkDown(c);
      if (matched.has(c.id) || ancestorKeep.has(c.id)) {
        ancestorKeep.add(node.id);
      }
    }
  };
  for (const root of roots) walkDown(root);

  return nodes.filter((n) => matched.has(n.id) || ancestorKeep.has(n.id));
}
