/**
 * useTreeGestures —— Pan + Pinch 手势驱动 transform
 *
 * 与小程序的手势语义完全一致：
 *   - Pan 单指平移画布
 *   - Pinch 双指缩放，以双指中点为锚点（锚点下的世界坐标不动）
 *   - 缩放范围 0.005 ~ 2.0（对应小程序 MIN_EXTREME_SCALE * V_SCALE_MAX）
 *   - Pinch 与 Pan simultaneous：双指同时移动既缩放又平移
 *
 * 返回 transform Animated.SharedValue，可以直接传给 TreeSkia
 */
import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedGestureHandler,
  runOnJS,
} from 'react-native-reanimated';
import type { GestureEvent, PanGestureHandlerEventPayload, PinchGestureHandlerEventPayload } from 'react-native-gesture-handler';

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const MIN_SCALE = 0.005;
const MAX_SCALE = 2.0;

export function useTreeGestures(viewportW: number, viewportH: number) {
  const transform = useSharedValue<Transform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  // Pan handler —— 单指平移
  const panHandler = useAnimatedGestureHandler<
    GestureEvent<PanGestureHandlerEventPayload>,
    { startX: number; startY: number }
  >({
    onStart: (_, ctx) => {
      ctx.startX = transform.value.offsetX;
      ctx.startY = transform.value.offsetY;
    },
    onActive: (e, ctx) => {
      transform.value = {
        ...transform.value,
        offsetX: ctx.startX + e.translationX,
        offsetY: ctx.startY + e.translationY,
      };
    },
  });

  // Pinch handler —— 双指缩放 + 以双指中点为锚点保持不动
  const pinchHandler = useAnimatedGestureHandler<
    GestureEvent<PinchGestureHandlerEventPayload>,
    { startScale: number; startFocalX: number; startFocalY: number; startOffsetX: number; startOffsetY: number }
  >({
    onStart: (e, ctx) => {
      ctx.startScale = transform.value.scale;
      ctx.startFocalX = e.focalX;
      ctx.startFocalY = e.focalY;
      ctx.startOffsetX = transform.value.offsetX;
      ctx.startOffsetY = transform.value.offsetY;
    },
    onActive: (e, ctx) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, ctx.startScale * e.scale));
      // 以 focalX/Y 为锚点反算 offset，保持锚点指向的世界坐标不动
      const worldX = (ctx.startFocalX - ctx.startOffsetX) / ctx.startScale;
      const worldY = (ctx.startFocalY - ctx.startOffsetY) / ctx.startScale;
      const offsetX = e.focalX - worldX * nextScale;
      const offsetY = e.focalY - worldY * nextScale;
      transform.value = { scale: nextScale, offsetX, offsetY };
    },
  });

  // 重置（暴露给按钮）
  const reset = useCallback(() => {
    transform.value = { scale: 1, offsetX: 0, offsetY: 0 };
  }, [transform]);

  // 缩放到指定中心（定位功能用）
  const centerOn = useCallback((worldX: number, worldY: number, targetScale = 0.5) => {
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
    transform.value = {
      scale,
      offsetX: viewportW / 2 - worldX * scale,
      offsetY: viewportH / 2 - worldY * scale,
    };
  }, [transform, viewportW, viewportH]);

  return { transform, panHandler, pinchHandler, reset, centerOn };
}
