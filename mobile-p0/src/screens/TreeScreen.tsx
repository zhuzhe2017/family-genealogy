/**
 * TreeScreen —— 家谱树 Skia 渲染 Spike 主屏幕
 *
 * 验证点：
 *   ✓ 不同规模家族（1k / 5k / 10k）Skia 渲染帧率
 *   ✓ Pan + Pinch 手势跟手性（Reanimated worklet 驱动）
 *   ✓ LOD_BLOCK/MEDIUM/FULL 三档自动分级
 *   ✓ 空间索引视口裁剪（默认全览每帧 < 2ms）
 *   ✓ 节点 hitTest（点击选中）
 *
 * 运行：cd mobile-p0 && npx expo start
 *       按 w 进入 Web，或在 iOS/Android 模拟器/真机跑
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { TreeSkia } from '../components/TreeSkia';
import {
  generateTree,
  buildTree,
  calcLayout,
  buildSpatialIndex,
  computeContentSize,
  computeBounds,
} from '../algorithm';
import type { TreeNode, ViewTransform } from '../algorithm';

type Scale = '1k' | '5k' | '10k';
const SCALES: Record<Scale, { count: number; seed: number }> = {
  '1k':  { count: 1_000,  seed: 42 },
  '5k':  { count: 5_000,  seed: 101 },
  '10k': { count: 10_000, seed: 7 },
};

// 缩放范围（与小程序 MIN_EXTREME_SCALE * V_SCALE_MAX 对齐）
const MIN_SCALE = 0.005;
const MAX_SCALE = 2.0;

const BASE_VIEW_W = Dimensions.get('window').width;
const BASE_VIEW_H = Dimensions.get('window').height - 120; // 减去底部控制栏

export function TreeScreen() {
  const [scale, setScale] = useState<Scale>('5k');
  const [canvasSize, setCanvasSize] = useState({ w: BASE_VIEW_W, h: BASE_VIEW_H });

  // —— transform：Pan + Pinch 共享这个 shared value ——
  const transform = useSharedValue<ViewTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  // —— 手势起始状态 ——
  // 新的 Gesture API（Gesture.Pan/Pinch）回调只传 event，不提供 ctx，
  // 因此用 shared value 保存手势开始时的基准值（旧 useAnimatedGestureHandler 才有 ctx）。
  const panStart = useSharedValue({ x: 0, y: 0 });
  const pinchStart = useSharedValue({
    scale: 1,
    focalX: 0,
    focalY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  // —— 数据准备（mount/scale 变化时一次性完成）——
  const data = useMemo(() => {
    const opts = SCALES[scale];
    const members = generateTree(opts);
    const { nodeMap, roots } = buildTree(members);
    // 默认 5 代窗口（与小程序 renderGen=default 一致）
    const visibleNodes: TreeNode[] = [];
    const walk5Gen = (n: TreeNode, g: number) => {
      if (g <= 5) { visibleNodes.push(n); n.children.forEach((c) => walk5Gen(c, g + 1)); }
    };
    roots.forEach((r) => walk5Gen(r, 1));
    const { layoutMap } = calcLayout(roots, visibleNodes);
    const spatialIndex = buildSpatialIndex(Object.values(layoutMap), visibleNodes);
    const bounds = computeBounds(layoutMap);
    const size = computeContentSize(layoutMap);
    return { layoutMap, spatialIndex, bounds, size, totalNodes: members.length };
  }, [scale]);

  // —— Pan 手势 ——
  const panGesture = Gesture.Pan()
    .onStart(() => {
      panStart.value = { x: transform.value.offsetX, y: transform.value.offsetY };
    })
    .onUpdate((e) => {
      transform.value = {
        ...transform.value,
        offsetX: panStart.value.x + e.translationX,
        offsetY: panStart.value.y + e.translationY,
      };
    });

  // —— Pinch 手势（与 Pan simultaneous）——
  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      pinchStart.value = {
        scale: transform.value.scale,
        focalX: e.focalX,
        focalY: e.focalY,
        offsetX: transform.value.offsetX,
        offsetY: transform.value.offsetY,
      };
    })
    .onUpdate((e) => {
      const s = pinchStart.value;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s.scale * e.scale));
      const wX = (s.focalX - s.offsetX) / s.scale;
      const wY = (s.focalY - s.offsetY) / s.scale;
      transform.value = {
        scale: next,
        offsetX: e.focalX - wX * next,
        offsetY: e.focalY - wY * next,
      };
    });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

  // —— 画布测量 ——
  const onCanvasLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize({ w: width, h: height });
  }, []);

  // —— 重置按钮 ——
  const reset = useCallback(() => {
    transform.value = { scale: 1, offsetX: 0, offsetY: 0 };
  }, [transform]);

  // —— 记录当前缩放用于 overlay 显示 ——
  const [currentScale, setCurrentScale] = useState(1);
  useAnimatedReaction(
    () => transform.value.scale,
    (s) => { runOnJS(setCurrentScale)(Number(s.toFixed(3))); },
  );

  return (
    <View style={styles.container}>
      {/* 顶部状态栏 */}
      <View style={styles.header}>
        <Text style={styles.title}>家谱树 Skia Spike</Text>
        <Text style={styles.subtitle}>
          {scale === '1k' ? '1,000' : scale === '5k' ? '5,000' : '10,000'} 节点家族 · 缩放 {currentScale.toFixed(2)}x
        </Text>
      </View>

      {/* Skia 画布 */}
      <View onLayout={onCanvasLayout} style={styles.canvasWrap}>
        {canvasSize.w > 0 && canvasSize.h > 0 && (
          <GestureDetector gesture={gesture}>
            <TreeSkia
              layoutMap={data.layoutMap}
              spatialIndex={data.spatialIndex}
              transform={transform}
              canvasSize={canvasSize}
              contentBounds={data.bounds}
            />
          </GestureDetector>
        )}
      </View>

      {/* 底部控制栏 */}
      <View style={styles.controls}>
        <View style={styles.scaleRow}>
          {(['1k', '5k', '10k'] as Scale[]).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setScale(s)}
              style={[styles.scaleBtn, scale === s && styles.scaleBtnActive]}
            >
              <Text style={[styles.scaleText, scale === s && styles.scaleTextActive]}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={reset} style={styles.resetBtn}>
          <Text style={styles.resetText}>重置视图</Text>
        </TouchableOpacity>
      </View>

      {/* 说明 */}
      <Text style={styles.hint}>
        单指平移画布 · 双指缩放（以双指中点为锚点，小程序同款算法）· LOD 自动分级
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, backgroundColor: '#8B1A1A' },
  title: { color: 'white', fontSize: 18, fontWeight: '600' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  canvasWrap: { flex: 1, backgroundColor: '#F0E9DD' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
  },
  scaleRow: { flexDirection: 'row', gap: 8 },
  scaleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#3a3a3a' },
  scaleBtnActive: { backgroundColor: '#8B1A1A' },
  scaleText: { color: '#888', fontSize: 14, fontWeight: '600' },
  scaleTextActive: { color: 'white' },
  resetBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#4a4a4a' },
  resetText: { color: '#ddd', fontSize: 14 },
  hint: { textAlign: 'center', color: '#666', fontSize: 11, paddingVertical: 8 },
});
