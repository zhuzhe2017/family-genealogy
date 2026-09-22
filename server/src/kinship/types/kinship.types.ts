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

/** 亲缘路径（顺序均为 [成员本人, ..., 共同祖先]） */
export interface KinshipPath {
  /** 从成员A到共同祖先的路径（含成员A和共同祖先） */
  pathToA: AncestorPathNode[];
  /** 从成员B到共同祖先的路径（含成员B和共同祖先） */
  pathToB: AncestorPathNode[];
}

/** 关系描述 */
export interface RelationshipInfo {
  /** 中文称谓（如：堂兄弟、姐妹、叔伯与侄子等；直系时含双方姓名） */
  label: string;
  /** 亲疏程度描述 */
  closeness: string;
  /** 世代差（A 的世代号减 B 的世代号；本系统世代号越小辈分越高，正值表示 A 辈分更低） */
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
