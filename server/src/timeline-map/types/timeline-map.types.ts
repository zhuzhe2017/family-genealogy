/**
 * timeline-map 模块类型定义
 *
 * 全部为纯 interface，不依赖 NestJS 运行时，方便 service 与 controller 共享。
 * 按数据来源分为三组：
 *   1. 迁徙路线数据（service 内部聚合 family_members_{familyId}）
 *   2. 世代地理分布（service 聚合输出，前端时空地图消费）
 *   3. 同期历史事件（内置硬编码 + 接口输出）
 */

// =========================================================================
// 1. 迁徙路线
// =========================================================================

/** 迁徙点（后端从 family_members_{familyId} 聚合而来，按世代分组后标注类型） */
export interface MigrationPoint {
  lat: number;
  lng: number;
  /** 地点名称（birth_place / native_place 字段） */
  name: string;
  year?: number;
  generation?: number;
  /**
   * 标记点类型：
   *   ancestor  —— 始祖（第 1 代成员）
   *   birth     —— 普通出生点
   *   death     —— 逝世点（预留）
   *   migration —— 迁徙点（同代中心与上一代差距 > 0.5° 自动标记）
   */
  type: MigrationPointType;
  memberName: string;
}

export type MigrationPointType = 'ancestor' | 'birth' | 'death' | 'migration';

/** 迁徙路线（世代之间的连接段，由相邻世代的第一个点连线而成） */
export interface MigrationRoute {
  from: MigrationPoint;
  to: MigrationPoint;
}

/** 迁徙路线聚合输出 */
export interface MigrationAggregate {
  points: MigrationPoint[];
  routes: MigrationRoute[];
}

// =========================================================================
// 2. 世代地理分布
// =========================================================================

/** 单个世代的地理中心（按地点聚合后的中心点，展示用） */
export interface GenerationCenter {
  lat: number;
  lng: number;
  placeName: string;
  count: number;
}

/** 世代内成员标记点（前端时空地图 marker 数据源） */
export interface GenerationMember {
  /** 后端 family_members_{familyId}.id */
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeName: string;
  year?: number;
}

/** 按世代分组的地理分布（getGenerations 接口输出） */
export interface GenerationGeo {
  generation: number;
  count: number;
  centers: GenerationCenter[];
  members: GenerationMember[];
}

/** getGenerations 查询参数（controller 的 minGen / maxGen） */
export interface GenerationRangeQuery {
  minGen?: number;
  maxGen?: number;
}

// =========================================================================
// 3. 同期历史事件
// =========================================================================

/** 历史事件分类 */
export type HistoryCategory =
  | 'politics'
  | 'war'
  | 'culture'
  | 'economy'
  | 'science'
  | 'society';

/** 同期历史事件（内置硬编码历史大事年表） */
export interface HistoryEvent {
  /** 年份，负数表示公元前 */
  year: number;
  title: string;
  dynasty: string;
  description: string;
  category: HistoryCategory;
}

/** getHistoryEvents 查询参数 */
export interface HistoryRangeQuery {
  start?: number;
  end?: number;
}

// =========================================================================
// 4. 家族事件 + 历史事件叠加输出（getCombinedTimeline 接口）
// =========================================================================

/** 家族成员关键事件（出生 / 逝世） */
export interface FamilyTimelineEvent {
  year: number;
  /** 事件标题：出生 / 逝世 */
  title: string;
  memberName: string;
  /** 事件完整描述 */
  event: string;
}

/** 叠加时间线输出 */
export interface CombinedTimeline {
  familyEvents: FamilyTimelineEvent[];
  historyEvents: HistoryEvent[];
}
