/**
 * LOD + Transform + HitTest + Connection —— 渲染层工具
 *
 * LOD：Skia 渲染时依据节点卡片在屏幕上的实际像素宽度决定绘制细节等级
 *   BLOCK   (< 40px) → 色块 + 仅高亮描边
 *   MEDIUM  (< 90px) → 名字 + 性别图标
 *   FULL    (>= 90px) → 完整卡片：头像 + 姓名 + 代际 + 高亮/折叠指示器
 *
 * Transform：视图变换（scale + offsetX/Y），手势结束时最终值；
 *   命中检测也必须用同一 transform 把屏幕坐标 → 世界坐标再查 layoutMap。
 */
import { LOD_BLOCK_THRESHOLD, LOD_MEDIUM_THRESHOLD } from './constants';
import type { TreeLayout, TreeNode, ViewTransform, Bounds } from './types';

export type LodLevel = 'BLOCK' | 'MEDIUM' | 'FULL';

/** 根据节点屏幕像素宽度判定 LOD 等级 */
export function computeLod(
  layoutWidth: number,
  scale: number,
): LodLevel {
  const screenW = layoutWidth * scale;
  if (screenW < LOD_BLOCK_THRESHOLD) return 'BLOCK';
  if (screenW < LOD_MEDIUM_THRESHOLD) return 'MEDIUM';
  return 'FULL';
}

/**
 * 世界坐标 → 屏幕坐标：screen = world * scale + offset
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  t: ViewTransform,
): { x: number; y: number } {
  return {
    x: worldX * t.scale + t.offsetX,
    y: worldY * t.scale + t.offsetY,
  };
}

/**
 * 屏幕坐标 → 世界坐标：world = (screen - offset) / scale
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  t: ViewTransform,
): { x: number; y: number } {
  return {
    x: (screenX - t.offsetX) / t.scale,
    y: (screenY - t.offsetY) / t.scale,
  };
}

/**
 * 命中测试 —— 空间索引 + 二分 + 包围盒判断
 *
 * 给定屏幕坐标，先换算到世界坐标，再在空间索引中按代区间查找，代内二分 + 包围盒判断。
 * 复杂度：O(log n + 该带可见节点数)，比全量 O(N) 好几个量级。
 *
 * 命中成功返回 layout（含 node），否则 null。
 */
export function hitTest(
  screenX: number,
  screenY: number,
  t: ViewTransform,
  index: Record<number, TreeLayout[]>,
): TreeLayout | null {
  const w = screenToWorld(screenX, screenY, t);
  // 反推可能的代际
  // LEVEL_H 和 PADDING 已在 spatialIndex.ts 内部，这里用简易版本
  // 简单做法：遍历所有可见代，代内二分查找 x 范围内的候选，逐个包围盒判断
  // 对于万代以下这个足够快，真正万代树再优化

  // 先用 bounds 过滤 out-of-range
  for (const gStr of Object.keys(index)) {
    const g = Number(gStr);
    const arr = index[g];
    if (!arr || arr.length === 0) continue;
    // 代区间反推
    const worldYAtGen = (g - 1) * 180 + 24; // LEVEL_H + PADDING
    const worldYGenEnd = worldYAtGen + 180;
    if (w.y < worldYAtGen - 10 || w.y > worldYGenEnd + 10) continue;

    // 代内二分：找第一个 x + width >= w.x 的
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].x + arr[mid].width < w.x) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < arr.length; i++) {
      const l = arr[i];
      if (l.x > w.x + 20) break;
      if (w.x >= l.x && w.x <= l.x + l.width &&
          w.y >= l.y && w.y <= l.y + l.height) {
        return l;
      }
    }
  }
  return null;
}

/**
 * 双指缩放锚点保持公式（与小程序 applyZoomAt 完全一致）：
 *   worldX = (screenX - offsetX) / scale          // 锚点当前指向的世界坐标
 *   ns = initialScale * nextZoom                  // 新缩放
 *   offsetX' = screenX - worldX * ns              // 反算 offset 保持锚点不动
 */
export function zoomAtPoint(
  nextZoom: number,
  touchCenterScreenX: number,
  touchCenterScreenY: number,
  currentTransform: ViewTransform,
  initialScale: number,
  viewportOffsetY: (contentH: number, scale: number) => number,
  contentH: number,
): ViewTransform {
  const worldX = (touchCenterScreenX - currentTransform.offsetX) / currentTransform.scale;
  const worldY = (touchCenterScreenY - currentTransform.offsetY) / currentTransform.scale;
  const ns = initialScale * nextZoom;
  return {
    scale: ns,
    offsetX: touchCenterScreenX - worldX * ns,
    offsetY: viewportOffsetY(contentH, ns), // 注意：小程序的垂直定位用了 getContentOffsetY 的 offset 叠加
  };
}
