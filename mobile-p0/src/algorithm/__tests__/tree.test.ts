import { describe, it, expect } from 'vitest';
import {
  buildTree,
  pruneCollapsed,
  filterByGeneration,
  filterBySearch,
  calcLayout,
  buildSpatialIndex,
  forEachVisibleLayout,
  hitTest,
  generateTree,
  computeBounds,
  computeContentSize,
} from '../index';

/** 一个小型确定性合成树：单根 + 3 子女 + 每子女 2 孙 + 每层有固定 generation */
function makeSmallTree() {
  return generateTree({ count: 30, childrenMin: 2, childrenMax: 3, seed: 123 });
}

describe('buildTree', () => {
  it('空列表返回空结果', () => {
    const r = buildTree([]);
    expect(r.nodeMap).toEqual({});
    expect(r.roots).toEqual([]);
  });

  it('所有节点都有 nodeMap 条目', () => {
    const members = makeSmallTree();
    const { nodeMap } = buildTree(members);
    expect(Object.keys(nodeMap).length).toBe(members.length);
    for (const m of members) {
      expect(nodeMap[m.id]).toBeTruthy();
    }
  });

  it('父子关系正确建立', () => {
    const members = makeSmallTree();
    const { nodeMap } = buildTree(members);
    for (const m of members) {
      const n = nodeMap[m.id];
      if (m.fatherId) {
        const father = nodeMap[m.fatherId];
        expect(father.children.map((c) => c.id)).toContain(m.id);
        expect(n.parentId).toBe(m.fatherId);
      }
    }
  });

  it('roots 识别：fatherId 为空 / nodeMap 中不存在 的节点', () => {
    const members = makeSmallTree();
    const { nodeMap, roots } = buildTree(members);
    for (const r of roots) {
      expect(r.fatherId).toBeFalsy();
    }
    // 所有 fatherId 有值且 nodeMap 中存在的节点都不应该出现在 roots
    for (const m of members) {
      if (m.fatherId && nodeMap[m.fatherId]) {
        expect(roots.find((r) => r.id === m.id)).toBeFalsy();
      }
    }
  });

  it('descendantCount 与 childrenCount 一致', () => {
    const members = makeSmallTree();
    const { nodeMap } = buildTree(members);
    // 根节点 descendantCount 应该覆盖整棵树（减去根自身）
    const roots = Object.values(nodeMap).filter((n) => !n.parentId);
    for (const root of roots) {
      expect(root.descendantCount + 1).toBe(
        Object.values(nodeMap).filter((n) => n.id === root.id || n.parentId).length,
      );
    }
    // 叶子节点 descendantCount == childrenCount == 0
    for (const n of Object.values(nodeMap)) {
      if (n.children.length === 0) {
        expect(n.descendantCount).toBe(0);
      } else {
        expect(n.childrenCount).toBe(n.children.length);
      }
    }
  });

  it('多根场景：两个独立子树', () => {
    const members = [
      { id: 'A', generation: 1, fatherId: '' },
      { id: 'A1', generation: 2, fatherId: 'A' },
      { id: 'B', generation: 1, fatherId: '' },
      { id: 'B1', generation: 2, fatherId: 'B' },
    ];
    const { roots, nodeMap } = buildTree(members);
    expect(roots.length).toBe(2);
    expect(roots.map((r) => r.id).sort()).toEqual(['A', 'B']);
    expect(nodeMap['A'].children.map((c) => c.id)).toEqual(['A1']);
    expect(nodeMap['B'].children.map((c) => c.id)).toEqual(['B1']);
  });
});

describe('calcLayout', () => {
  it('空可见节点 → 空 layoutMap', () => {
    const r = calcLayout([], []);
    expect(r.layoutMap).toEqual({});
  });

  it('叶子节点 → x 依次从 PADDING 紧密排列', () => {
    const roots: any[] = [
      { id: 'A', generation: 1, children: [], parentId: '' },
      { id: 'B', generation: 1, children: [], parentId: '' },
      { id: 'C', generation: 1, children: [], parentId: '' },
    ];
    const visible = [...roots];
    const { layoutMap } = calcLayout(roots, visible);
    expect(layoutMap['A'].x).toBe(24); // PADDING
    expect(layoutMap['B'].x).toBeGreaterThan(layoutMap['A'].x);
    expect(layoutMap['C'].x).toBeGreaterThan(layoutMap['B'].x);
  });

  it('父节点居中于子节点范围（简单 1 父 2 子）', () => {
    // 根 A(g1) → B1, B2(g2) → C1, C2(g3)
    const members = generateTree({ count: 7, seed: 1 });
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const { layoutMap } = calcLayout(roots, visible);
    // A 的 x 应该 ≈ (B1.x + B2.x) / 2 - NODE_W/2
    const root = roots[0];
    const leftmostChild = root.children.reduce((a, b) =>
      layoutMap[a.id].x < layoutMap[b.id].x ? a : b,
    );
    const rightmostChild = root.children.reduce((a, b) =>
      layoutMap[a.id].x > layoutMap[b.id].x ? a : b,
    );
    const expectedCenter =
      (layoutMap[leftmostChild.id].x + layoutMap[rightmostChild.id].x + 120) / 2;
    expect(layoutMap[root.id].x + 60).toBeCloseTo(expectedCenter, 0); // NODE_W/2
  });

  it('后序遍历确定性：同输入 → 同 layoutMap', () => {
    const members = makeSmallTree();
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const a = calcLayout(roots, visible);
    const b = calcLayout(roots, visible);
    expect(JSON.stringify(a.layoutMap)).toBe(JSON.stringify(b.layoutMap));
  });

  it('子树水平范围不重叠（兄弟间）', () => {
    const members = makeSmallTree();
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const { layoutMap } = calcLayout(roots, visible);
    // 对每个父节点，其直接子节点的 bbox 不得交叉
    for (const n of Object.values(nodeMap)) {
      if (n.children.length < 2) continue;
      const ls = n.children.map((c) => layoutMap[c.id]).sort((a, b) => a.x - b.x);
      for (let i = 0; i < ls.length - 1; i++) {
        expect(ls[i + 1].x).toBeGreaterThanOrEqual(ls[i].x + ls[i].width - 0.01);
      }
    }
  });

  it('bounds 与 contentSize 可计算', () => {
    const members = makeSmallTree();
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const { layoutMap } = calcLayout(roots, visible);
    const b = computeBounds(layoutMap);
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThan(0);
    const s = computeContentSize(layoutMap);
    expect(s.contentW).toBeGreaterThan(b.width);
    expect(s.contentH).toBeGreaterThan(b.height);
  });
});

describe('折叠 + 搜索过滤', () => {
  it('折叠节点本身保留，后代被隐藏', () => {
    const members = generateTree({ count: 10, seed: 10 });
    const { nodeMap, roots } = buildTree(members);
    // 选一个有子节点的节点折叠
    const withKids = Object.values(nodeMap).find((n) => n.children.length > 0);
    const coll = new Set([withKids.id]);
    const visible = pruneCollapsed(roots, coll);
    expect(visible.has(withKids.id)).toBe(true); // 保留自身
    // 所有后代都不在 visible 里
    const checkDesc = (n) => {
      for (const c of n.children) {
        expect(visible.has(c.id)).toBe(false);
        checkDesc(c);
      }
    };
    checkDesc(withKids);
  });

  it('折叠集合为空 → visible 全覆盖', () => {
    const members = generateTree({ count: 10, seed: 11 });
    const { nodeMap, roots } = buildTree(members);
    const visible = pruneCollapsed(roots, new Set(), '');
    expect(visible.size).toBe(Object.keys(nodeMap).length);
  });

  it('搜索过滤：命中 + 祖先链', () => {
    const members = [
      { id: 'A', generation: 1, fatherId: '', name: '张三丰' },
      { id: 'A1', generation: 2, fatherId: 'A', name: '张大力' },
      { id: 'A2', generation: 2, fatherId: 'A', name: '王小明' },
      { id: 'A1a', generation: 3, fatherId: 'A1', name: '张三' },
    ];
    const { nodeMap, roots } = buildTree(members);
    const visible = filterBySearch(Object.values(nodeMap), roots, '三');
    const ids = new Set(visible.map((n) => n.id));
    expect(ids.has('A')).toBe(true); // 祖先
    expect(ids.has('A1')).toBe(true); // 祖先
    expect(ids.has('A1a')).toBe(true); // 命中
    expect(ids.has('A2')).toBe(false); // 无关
  });

  it('代数窗口：default → 5 代', () => {
    const members = generateTree({ count: 100, seed: 20 });
    const { nodeMap, roots } = buildTree(members);
    const filtered = filterByGeneration(roots, nodeMap, 'default', false);
    const maxGen = Math.max(...filtered.map((n) => n.generation ?? 0));
    expect(maxGen).toBeLessThanOrEqual(5);
  });
});

describe('空间索引 + 视口裁剪', () => {
  it('buildSpatialIndex 每个代 x 升序', () => {
    const members = makeSmallTree();
    const { nodeMap, roots } = buildTree(members);
    const { layoutMap } = calcLayout(roots, Object.values(nodeMap));
    const index = buildSpatialIndex(Object.values(layoutMap), Object.values(nodeMap));
    for (const g of Object.keys(index)) {
      const arr = index[Number(g)];
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i].x).toBeGreaterThanOrEqual(arr[i - 1].x);
      }
    }
  });

  it('forEachVisibleLayout 不会漏掉视口内节点（full ⊆ clip，按代粗裁剪语义）', () => {
    const members = generateTree({ count: 5000, seed: 99 });
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const { layoutMap } = calcLayout(roots, visible);
    const index = buildSpatialIndex(Object.values(layoutMap), visible);

    for (let i = 0; i < 10; i++) {
      const keys = Object.keys(layoutMap);
      const rnd = keys[Math.floor(Math.random() * keys.length)];
      const c = layoutMap[rnd];
      const vp = {
        viewLeft: c.x - 100,
        viewRight: c.x + 200,
        viewTop: c.y - 80,
        viewBottom: c.y + 200,
      };
      const clip = new Set<string>();
      forEachVisibleLayout(
        index, vp.viewTop, vp.viewBottom, vp.viewLeft, vp.viewRight, false,
        (_n, l) => clip.add(l.id),
      );
      // 所有严格在视口内的节点，必须在 clip 里
      for (const l of Object.values(layoutMap)) {
        const inView =
          l.x + l.width >= vp.viewLeft && l.x <= vp.viewRight &&
          l.y + l.height >= vp.viewTop && l.y <= vp.viewBottom;
        if (inView) expect(clip.has(l.id)).toBe(true);
      }
    }
  });

  it('extraAbove=true 额外包含父代但不会漏掉视口节点', () => {
    const members = generateTree({ count: 5000, seed: 99 });
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const { layoutMap } = calcLayout(roots, visible);
    const index = buildSpatialIndex(Object.values(layoutMap), visible);

    for (let i = 0; i < 10; i++) {
      const keys = Object.keys(layoutMap);
      const rnd = keys[Math.floor(Math.random() * keys.length)];
      const c = layoutMap[rnd];
      const vp = {
        viewLeft: c.x - 100,
        viewRight: c.x + 200,
        viewTop: c.y - 80,
        viewBottom: c.y + 200,
      };
      const clip: string[] = [];
      forEachVisibleLayout(
        index, vp.viewTop, vp.viewBottom, vp.viewLeft, vp.viewRight, true,
        (_n, l) => clip.push(l.id),
      );
      const clipSet = new Set(clip);
      // 不会漏掉严格视口节点
      for (const l of Object.values(layoutMap)) {
        const inView =
          l.x + l.width >= vp.viewLeft && l.x <= vp.viewRight &&
          l.y + l.height >= vp.viewTop && l.y <= vp.viewBottom;
        if (inView) expect(clipSet.has(l.id)).toBe(true);
      }
      // 额外包含的节点：其父节点必须在严格视口裁剪结果里（或自己就是根）
      const strictClip: string[] = [];
      forEachVisibleLayout(
        index, vp.viewTop, vp.viewBottom, vp.viewLeft, vp.viewRight, false,
        (_n, l) => strictClip.push(l.id),
      );
      const strictSet = new Set(strictClip);
      const extras = clip.filter((id) => !strictSet.has(id));
      for (const extraId of extras) {
        const node = nodeMap[extraId];
        expect(node).toBeTruthy();
        // 额外节点必须有后代出现在严格裁剪里（或自己就是）——因为 extraAbove 的目的是把父代拉进来画连线
        const hasDescendantInStrict = (n: any): boolean => {
          if (strictSet.has(n.id)) return true;
          return n.children.some((c: any) => hasDescendantInStrict(c));
        };
        expect(hasDescendantInStrict(node!)).toBe(true);
      }
    }
  });
});

describe('hitTest', () => {
  it('命中正确节点', () => {
    const members = generateTree({ count: 100, seed: 77 });
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const { layoutMap } = calcLayout(roots, visible);
    const index = buildSpatialIndex(Object.values(layoutMap), visible);

    // 随机 100 个节点做 hitTest
    for (const l of Object.values(layoutMap).slice(0, 100)) {
      const cx = l.x + l.width / 2;
      const cy = l.y + l.height / 2;
      const t = { scale: 1, offsetX: 0, offsetY: 0 };
      const hit = hitTest(cx, cy, t, index);
      expect(hit).toBeTruthy();
      expect(hit!.id).toBe(l.id);
    }
  });

  it('空白区域返回 null', () => {
    const members = generateTree({ count: 100, seed: 77 });
    const { nodeMap, roots } = buildTree(members);
    const visible = Object.values(nodeMap);
    const { layoutMap } = calcLayout(roots, visible);
    const index = buildSpatialIndex(Object.values(layoutMap), visible);
    // 远在布局右上角之外
    const t = { scale: 1, offsetX: 0, offsetY: 0 };
    const hit = hitTest(99999, 99999, t, index);
    expect(hit).toBeNull();
  });
});
