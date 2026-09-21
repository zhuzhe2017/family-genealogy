import { type DataRow } from '../../common/types/common';

/** 成员简节点（共同祖先查询用） */
export interface MemberNode extends DataRow {
  id: string;
  name: string;
  gender: string;
  generation: number;
  generation_name: string;
  birth_date: string;
  death_date: string;
  is_alive: number;
  father_id: string;
  sort_order: number;
}

/** 祖先路径节点 */
export interface AncestorPathNode {
  id: string;
  name: string;
  gender: string;
  generation: number;
  generationName: string;
  birthDate: string;
  deathDate: string;
  isAlive: number;
}

/** 共同祖先查询请求 */
export interface CommonAncestorQuery {
  /** 成员A ID */
  memberAId: string;
  /** 成员B ID */
  memberBId: string;
}

/** 共同祖先信息 */
export interface CommonAncestorInfo {
  id: string;
  name: string;
  gender: string;
  generation: number;
  generationName: string;
  birthDate: string;
  deathDate: string;
  isAlive: number;
}

/** 亲缘路径 */
export interface KinshipPath {
  /** 从共同祖先到成员A的路径（含共同祖先和成员A） */
  pathToA: AncestorPathNode[];
  /** 从共同祖先到成员B的路径（含共同祖先和成员B） */
  pathToB: AncestorPathNode[];
}

/** 关系描述 */
export interface RelationshipInfo {
  /** 中文称谓（如：堂兄弟、表姐妹、叔侄等） */
  label: string;
  /** 亲疏程度描述 */
  closeness: string;
  /** 世代差（A 比 B 大几代，负数表示 A 比 B 小） */
  generationDiff: number;
}

/** 共同祖先查询结果 */
export interface CommonAncestorResult {
  /** 是否有共同祖先 */
  hasCommonAncestor: boolean;
  /** 共同祖先信息（无则为 null） */
  commonAncestor: CommonAncestorInfo | null;
  /** 亲缘路径 */
  path: KinshipPath | null;
  /** 关系描述 */
  relationship: RelationshipInfo | null;
  /** 成员A简要信息 */
  memberA: AncestorPathNode;
  /** 成员B简要信息 */
  memberB: AncestorPathNode;
  /** 无法确定共同祖先时的原因说明 */
  noCommonReason?: string;
}

/** 同名成员候选项 */
export interface MemberSearchResult {
  id: string;
  name: string;
  gender: string;
  generation: number;
  generationName: string;
  birthDate: string;
  fatherName: string;
}
