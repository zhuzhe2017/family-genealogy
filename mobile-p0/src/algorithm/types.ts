/**
 * 家谱树核心类型定义 —— 直接承接 mini-program/pages/family-tree-detail.js
 * 与后端 /user/family/{id}/members 返回的字段对齐。
 */

/** 成员原始记录（后端 API 返回，未附加 children / parent 关系） */
export interface MemberRaw {
  id: string;
  name?: string;
  gender?: 'male' | 'female' | 'unknown';
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  generation?: number;
  birthYear?: number;
  deathYear?: number;
  sortOrder?: number;
  avatarUrl?: string;
  // 其他业务字段（家族支系、出生地等）不影响布局，不强制列出
  [key: string]: unknown;
}

/** 节点：附加了父子关系的内存态（buildTree 产物） */
export interface TreeNode extends MemberRaw {
  children: TreeNode[];
  parentId?: string;
  hasChildren: boolean;
  childrenCount: number;
  descendantCount: number;
  /** 直系图用：配偶列表 */
  spouseList?: TreeNode[];
}

/** 树状图布局结果（calcLayout 产物） */
export interface TreeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node: TreeNode;
}

/** 直系图布局结果（calcVerticalLayout 产物） */
export interface VerticalNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node: TreeNode;
  isCenter?: boolean;
  role?: 'self' | 'parent' | 'child' | 'sibling' | 'ancestor';
  /** 配偶节点相对主节点的偏移（右侧） */
  spouseOffsetX?: number;
}

/** 空间索引结构：按代分层，代内按 x 升序 */
export type SpatialIndex = Record<number, TreeLayout[]>;

/** 视图变换参数（手势最终驱动） */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** 内容边界（世界坐标） */
export interface Bounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
}

/** 节点命中测试结果 */
export interface HitResult {
  nodeId: string;
  x: number;
  y: number;
}
