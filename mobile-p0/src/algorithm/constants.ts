/**
 * 家谱树渲染常量 —— 与 mini-program/pages/family-tree-detail.js 保持完全一致
 * （改动会同时影响小程序和 App 的布局输出对齐，谨慎修改）
 */

// —— 树状图（tree）常量 ——
/** 节点卡片宽度 */
export const NODE_W = 120;
/** 节点卡片基础高度（不含配偶行） */
export const NODE_H = 76;
/** 代际垂直间距（px） */
export const LEVEL_H = 180;
/** 节点水平间距 */
export const NODE_GAP_X = 32;
/** 子树间额外间距 */
export const SUBTREE_GAP = 10;
/** 画布/布局内边距 */
export const PADDING = 24;

// —— 直系图（vertical）常量 ——
/** 直系图头像半径 */
export const V_AVATAR_R = 26;
/** 直系图代际垂直间距 */
export const V_LEVEL_H = 112;
/** 直系图夫妇头像间距 */
export const V_SPOUSE_GAP = 36;

// —— 缩放范围 ——
/** 极小宽树的缩放下限初始值（允许整体缩小） */
export const MIN_EXTREME_SCALE = 0.0005;
/** 直系图缩放下限/上限 */
export const V_SCALE_MIN = 0.5;
export const V_SCALE_MAX = 1.0;

// —— LOD 三级阈值（按节点卡片在屏幕上的实际宽度 px 判定）——
/** LOD_BLOCK_THRESHOLD：卡片 < 此宽度 → 仅色块，跳过全部文字 */
export const LOD_BLOCK_THRESHOLD = 40;
/** LOD_MEDIUM_THRESHOLD：卡片 < 此宽度 → 简版，仅名字 */
export const LOD_MEDIUM_THRESHOLD = 90;

/** 配偶行额外高度（直系图用） */
export const SPOUSE_ROW_H = 14;
