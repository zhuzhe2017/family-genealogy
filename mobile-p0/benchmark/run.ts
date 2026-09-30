/**
 * benchmark/run.ts —— Node 层纯算法性能基准
 *
 * 覆盖：buildTree → calcLayout → buildSpatialIndex → 折叠剪枝 → 搜索过滤
 *       → 视口裁剪（每帧）→ hitTest（每帧）
 *
 * 三档合成数据：1k / 5k / 10k / 20k
 */
import {
  generateTree,
  buildTree,
  calcLayout,
  buildSpatialIndex,
  pruneCollapsed,
  filterBySearch,
  computeBounds,
  computeContentSize,
  forEachVisibleLayout,
  hitTest,
  LOD_BLOCK_THRESHOLD,
  LOD_MEDIUM_THRESHOLD,
  NODE_W,
} from '../src/algorithm/index';

const ITERATIONS = 50;
const WARMUP = 5;
const VIEWPORT_W = 375;
const VIEWPORT_H = 812;

const SIZES = [1_000, 5_000, 10_000, 20_000];

function nowNs() {
  return Number(process.hrtime.bigint());
}
function medianMs(timesNs: bigint[]) {
  const arr = timesNs.slice().sort((a, b) => (a as any) - (b as any));
  const m = Math.floor(arr.length / 2);
  return (arr.length % 2 ? (arr[m] as any) : ((arr[m - 1] as any) + (arr[m] as any)) / 2) / 1e6;
}
function bench(fn: () => void, iterations = ITERATIONS): number {
  for (let i = 0; i < WARMUP; i++) fn();
  const times: bigint[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = nowNs();
    fn();
    times.push(nowNs() - t0);
  }
  return medianMs(times);
}

function run() {
  const header = [
    '规模', 'build(ms)', 'layout(ms)', 'idx(ms)', 'collapse(ms)', 'search(ms)',
    '旧全量', '新裁剪', '降幅', '100hit(ms)', 'content(W×H)', 'LOD_BLK', 'LOD_MED', 'LOD_FULL',
  ];
  console.log(header.join('\t'));

  for (const N of SIZES) {
    const data = generateTree({ count: N, seed: N });
    const bBuild = bench(() => buildTree(data));
    const { nodeMap, roots } = buildTree(data);

    const visibleNodes: any[] = [];
    const walk5Gen = (n: any, g: number) => {
      if (g <= 5) { visibleNodes.push(n); n.children.forEach((c: any) => walk5Gen(c, g + 1)); }
    };
    roots.forEach(r => walk5Gen(r, 1));

    const bLayout = bench(() => calcLayout(roots, visibleNodes));
    const { layoutMap } = calcLayout(roots, visibleNodes);
    const contentSize = computeContentSize(layoutMap);
    const index = buildSpatialIndex(Object.values(layoutMap), visibleNodes);

    // 折叠 + 搜索
    const collIds = new Set<string>();
    Object.keys(nodeMap).forEach((_, i) => { if (i % 20 === 0) collIds.add(_); });
    const bCollapse = bench(() => pruneCollapsed(roots, collIds, ''));
    const bSearch = bench(() => filterBySearch(visibleNodes, roots, '振'));

    // 视口：content 中部 40% 宽 × 3 代
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const l of Object.values(layoutMap)) {
      minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x + l.width);
      minY = Math.min(minY, l.y); maxY = Math.max(maxY, l.y + l.height);
    }
    const width = maxX - minX;
    const vp = { viewLeft: minX + width * 0.3, viewRight: minX + width * 0.7, viewTop: minY, viewBottom: minY + (maxY - minY) * 0.4 };

    let fullCount = 0;
    bench(() => {
      fullCount = 0;
      for (const l of Object.values(layoutMap)) {
        if (l.x + l.width >= vp.viewLeft && l.x <= vp.viewRight &&
            l.y + l.height >= vp.viewTop && l.y <= vp.viewBottom) fullCount++;
      }
    }, 3);
    let clipCount = 0;
    bench(() => {
      clipCount = forEachVisibleLayout(index, vp.viewTop, vp.viewBottom, vp.viewLeft, vp.viewRight, true, () => {});
    }, 3);
    const reduction = fullCount > 0 ? ((1 - clipCount / fullCount) * 100).toFixed(1) : '0.0';

    const bHit = bench(() => {
      for (let i = 0; i < 100; i++) {
        const sx = Math.random() * VIEWPORT_W;
        const sy = Math.random() * VIEWPORT_H;
        hitTest(sx, sy, { scale: 1, offsetX: 0, offsetY: 0 }, index);
      }
    }, 10);

    // LOD 分布
    let blk = 0, med = 0, ful = 0;
    const scale = contentSize.contentW > VIEWPORT_W * 3 ? VIEWPORT_W / contentSize.contentW : 1;
    for (const l of Object.values(layoutMap)) {
      const sw = l.width * scale;
      if (sw < LOD_BLOCK_THRESHOLD) blk++;
      else if (sw < LOD_MEDIUM_THRESHOLD) med++;
      else ful++;
    }

    console.log([
      N.toLocaleString(),
      bBuild.toFixed(2),
      bLayout.toFixed(2),
      (bench(() => buildSpatialIndex(Object.values(layoutMap), visibleNodes))).toFixed(2),
      bCollapse.toFixed(2),
      bSearch.toFixed(2),
      fullCount, clipCount, `${reduction}%`,
      bHit.toFixed(2),
      `${Math.round(contentSize.contentW)}×${Math.round(contentSize.contentH)}`,
      blk, med, ful,
    ].join('\t'));
  }
}

run();
