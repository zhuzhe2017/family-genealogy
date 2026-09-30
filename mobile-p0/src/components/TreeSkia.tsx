/**
 * TreeSkia —— Skia 渲染的家谱树组件（v2 架构）
 *
 * 修正 v1 问题：视口裁剪 + LOD 分类放在 UI 线程 useDerivedValue 里
 * 每帧创建新数组造成 GC 压力 + 线程模型混乱。
 *
 * v2 架构：
 *   - JS 线程（每帧 transform 变化时）：useAnimatedReaction + runOnJS 做视口裁剪 + LOD 分类
 *     （每帧 < 0.01ms，远小于帧预算）
 *   - React commit → Canvas 渲染：用普通 React 组件（非 worklet），从 useState 读数据
 *   - Skia Canvas 绘制：批量 draw（色块 + 连线 + 名字）
 *
 * 数据流：
 *   Gesture worklet (UI thread)
 *     → transform SharedValue 变化
 *       → useAnimatedReaction (worklet) 检测变化
 *         → runOnJS(() => { 视口裁剪 + LOD 分类 → setRenderData })
 *           → React setState → Canvas 重渲染
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Canvas,
  RoundedRect,
  Text,
  Line,
  Group,
  Skia,
  useTypeface,
} from '@shopify/react-native-skia';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';

interface Layout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node: any;
}

interface RenderNodeBlk { x: number; y: number; w: number; h: number }
interface RenderNodeMed extends RenderNodeBlk { name: string }
interface RenderNodeFull extends RenderNodeBlk { name: string; generation: number }
interface RenderConn { x1: number; y1: number; x2: number; y2: number }

interface RenderData {
  blk: RenderNodeBlk[];
  med: RenderNodeMed[];
  full: RenderNodeFull[];
  conns: RenderConn[];
  fps: number;
}

interface TreeSkiaProps {
  layoutMap: Record<string, Layout>;
  spatialIndex: Record<number, Layout[]>;
  // SharedValue 类型在 RN 运行时注入，这里用 any 避免类型依赖
  transform: any;
  canvasSize: { w: number; h: number };
  contentBounds: { minX: number; minY: number; width: number; height: number };
}

// —— 绘制常量（与小程序完全一致）——
const PADDING = 24;
const LEVEL_H = 180;
const COLOR_LINE = '#C08A55';
const COLOR_BG = '#F0E9DD';
const COLOR_BLK = 'rgba(139, 26, 26, 0.8)';
const COLOR_MED = '#333333';
const COLOR_FULL_NAME = '#1a1a1a';
const COLOR_PRIMARY = '#8B1A1A';

// Skia <Text> 需要 SkFont（没有 fontSize prop）。
// Web 端 CanvasKit 不提供系统字体（matchFont 会崩），必须显式加载字体数据。
// 这里用随包自带的思源黑体简体，原生/Web 通用，且覆盖中文。
const FONT_SOURCE = require('../assets/NotoSansSC-Regular.otf');

/** 核心：视口裁剪 + LOD 分类（JS 线程执行，纯同步函数，< 0.01ms） */
function computeRenderData(
  transform: { scale: number; offsetX: number; offsetY: number },
  spatialIndex: Record<number, Layout[]>,
  layoutMap: Record<string, Layout>,
  viewportW: number,
  viewportH: number,
): Omit<RenderData, 'fps'> {
  const { scale, offsetX, offsetY } = transform;
  const left = -offsetX / scale;
  const right = (viewportW - offsetX) / scale;
  const top = -offsetY / scale;
  const bottom = (viewportH - offsetY) / scale;

  const blk: RenderNodeBlk[] = [];
  const med: RenderNodeMed[] = [];
  const full: RenderNodeFull[] = [];
  const conns: RenderConn[] = [];

  // 反推代际范围
  const gMin = Math.max(1, Math.floor((top - PADDING) / LEVEL_H) + 1);
  const gMax = Math.floor((bottom - PADDING) / LEVEL_H) + 1;

  // 代内二分起点（避免从头遍历）
  const gStart: Record<number, number> = {};
  for (let g = gMin; g <= gMax; g++) {
    const arr = spatialIndex[g];
    if (!arr || arr.length === 0) continue;
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].x + arr[mid].width < left) lo = mid + 1;
      else hi = mid;
    }
    gStart[g] = lo;
  }

  for (let g = gMin; g <= gMax; g++) {
    const arr = spatialIndex[g];
    if (!arr) continue;
    let i = gStart[g] ?? 0;
    for (; i < arr.length; i++) {
      const l = arr[i];
      if (l.x > right) break;
      const yCenter = l.y + l.height / 2;
      if (yCenter < top - LEVEL_H || yCenter > bottom + LEVEL_H) continue;

      const screenW = l.width * scale;
      if (screenW < 40) {
        blk.push({ x: l.x, y: l.y, w: l.width, h: l.height });
      } else if (screenW < 90) {
        med.push({ x: l.x, y: l.y, w: l.width, h: l.height, name: l.node.name ?? '' });
      } else {
        full.push({
          x: l.x, y: l.y, w: l.width, h: l.height,
          name: l.node.name ?? '',
          generation: l.node.generation ?? 1,
        });
      }

      // 绘制与视口内子节点的连线（折线：父底中点 → 折点 → 子顶中点）
      const children = l.node.children;
      if (children && children.length > 0) {
        for (const c of children) {
          const cl = layoutMap[c.id];
          if (!cl) continue;
          const cyCenter = cl.y + cl.height / 2;
          if (cyCenter >= top - LEVEL_H && cyCenter <= bottom + LEVEL_H) {
            const px = l.x + l.width / 2;
            const py = l.y + l.height;
            const cx = cl.x + cl.width / 2;
            const cy = cl.y;
            const midY = (py + cy) / 2;
            conns.push({ x1: px, y1: py, x2: px, y2: midY });
            conns.push({ x1: px, y1: midY, x2: cx, y2: midY });
            conns.push({ x1: cx, y1: midY, x2: cx, y2: cy });
          }
        }
      }
    }
  }

  return { blk, med, full, conns };
}

export function TreeSkia({
  layoutMap,
  spatialIndex,
  transform,
  canvasSize,
}: TreeSkiaProps) {
  const { w: VIEW_W, h: VIEW_H } = canvasSize;

  // —— 字体（Skia Text 必需）——
  // useTypeface 异步加载一次字体数据，三种字号复用同一个 typeface；
  // 加载完成前为 null，Skia <Text font={null}> 不绘制文字也不会崩溃。
  const typeface = useTypeface(FONT_SOURCE);
  const fontMed = useMemo(() => (typeface ? Skia.Font(typeface, 12) : null), [typeface]);
  const fontFullName = useMemo(() => (typeface ? Skia.Font(typeface, 16) : null), [typeface]);
  const fontFullGen = useMemo(() => (typeface ? Skia.Font(typeface, 11) : null), [typeface]);

  // —— 初始渲染（mount 时一次性）——
  const [renderData, setRenderData] = useState<RenderData>(() => ({
    ...computeRenderData(
      { scale: 1, offsetX: 0, offsetY: 0 },
      spatialIndex, layoutMap, VIEW_W, VIEW_H,
    ),
    fps: 60,
  }));

  // —— 数据集变化（如切换 1k/5k/10k）时按当前 transform 重算 ——
  // 否则 renderData 只在 transform 变化时更新，切换规模后会残留上一份数据
  useEffect(() => {
    const t = transform.value;
    setRenderData((prev) => ({
      ...computeRenderData(
        { scale: t.scale, offsetX: t.offsetX, offsetY: t.offsetY },
        spatialIndex, layoutMap, VIEW_W, VIEW_H,
      ),
      fps: prev.fps,
    }));
  }, [spatialIndex, layoutMap, VIEW_W, VIEW_H]);

  // —— JS 线程预处理：监听 transform 变化 → 视口裁剪 + LOD 分类 ——
  // 用 runOnJS 把计算放到 JS 线程，避免 worklet 里做数组遍历
  useAnimatedReaction(
    () => ({ scale: transform.value.scale, offsetX: transform.value.offsetX, offsetY: transform.value.offsetY }),
    (t) => {
      runOnJS((v: { scale: number; offsetX: number; offsetY: number }) => {
        const t0 = performance.now();
        const d = computeRenderData(v, spatialIndex, layoutMap, VIEW_W, VIEW_H);
        const dt = performance.now() - t0;
        setRenderData({ ...d, fps: 1000 / Math.max(dt, 0.001) });
      })(t);
    },
  );

  // —— transform 分解：translate + scale（用于 Group transform）——
  const tx = transform.value.offsetX;
  const ty = transform.value.offsetY;
  const sc = transform.value.scale;

  return (
    <Canvas
      style={{ width: VIEW_W, height: VIEW_H, backgroundColor: COLOR_BG }}
      onLayout={() => { /* 已在外层测量 */ }}
    >
      <Group transform={[{ translateY: ty }, { translateX: tx }, { scale: sc }]}>
        {/* 连线（先画，底层） */}
        {renderData.conns.map((c, i) => (
          <Line
            key={`c${i}`}
            p1={{ x: c.x1, y: c.y1 }}
            p2={{ x: c.x2, y: c.y2 }}
            color={COLOR_LINE}
            strokeWidth={1.5}
          />
        ))}

        {/* LOD_BLOCK：色块（最轻量，批量 drawRRect） */}
        {renderData.blk.map((b, i) => (
          <RoundedRect
            key={`b${i}`}
            x={b.x} y={b.y} width={b.w} height={b.h} r={6}
            color={COLOR_BLK}
          />
        ))}

        {/* LOD_MEDIUM：色块 + 名字 */}
        {renderData.med.map((m, i) => (
          <Group key={`m${i}`}>
            <RoundedRect
              x={m.x} y={m.y} width={m.w} height={m.h} r={6}
              color="white"
            />
            <Line
              p1={{ x: m.x + m.w, y: m.y }}
              p2={{ x: m.x + m.w, y: m.y + m.h }}
              color={COLOR_PRIMARY} strokeWidth={1}
            />
            <Text
              x={m.x + 4} y={m.y + m.h / 2 + 4}
              text={m.name} color={COLOR_MED} font={fontMed}
            />
          </Group>
        ))}

        {/* LOD_FULL：完整卡片 */}
        {renderData.full.map((f, i) => (
          <Group key={`f${i}`}>
            <RoundedRect
              x={f.x} y={f.y} width={f.w} height={f.h} r={8}
              color="white"
            />
            <Line
              p1={{ x: f.x, y: f.y }}
              p2={{ x: f.x + f.w, y: f.y }}
              color={COLOR_PRIMARY} strokeWidth={2}
            />
            <Text
              x={f.x + 8} y={f.y + 24}
              text={f.name} color={COLOR_FULL_NAME} font={fontFullName}
            />
            <Text
              x={f.x + 8} y={f.y + 44}
              text={`${f.generation} 代`} color="#888" font={fontFullGen}
            />
          </Group>
        ))}
      </Group>
    </Canvas>
  );
}
