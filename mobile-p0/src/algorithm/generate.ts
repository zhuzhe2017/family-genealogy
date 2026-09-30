/**
 * 合成数据生成 —— 基准测试用的家谱数据集
 *
 * 提供三档：small(1k) / medium(5k) / large(10k) / xlarge(20k)，并支持自定义规模。
 * 为了在不同运行间可复现，加入可选的随机种子。
 *
 * 模拟真实家谱特征：
 *  - 单根或多根（可配置）
 *  - 每节点 2~4 子女（平均 3），可指定 min/max
 *  - 代数随深度递增（单根场景，代数 ≈ log3(n)）
 *  - 随机 sortOrder / birthYear 填充
 */
import type { MemberRaw } from './types';

interface GenerateOptions {
  /** 总节点数（默认 1000） */
  count?: number;
  /** 子女数下限（默认 2） */
  childrenMin?: number;
  /** 子女数上限（默认 4） */
  childrenMax?: number;
  /** 根节点数量（默认 1；>1 时多根独立生长） */
  roots?: number;
  /** 随机种子（可选，保证同 seed 同输出） */
  seed?: number;
  /** 名字池默认用 A/B/C 字母串，可传入自定义 */
  namePool?: string[];
}

/** 简易可复现伪随机（mulberry32） */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_NAMES = [
  '振邦', '文斌', '志强', '建华', '伟华', '丽娟', '淑芬', '秀英',
  '建国', '建军', '丽娜', '志刚', '桂英', '凤英', '明辉', '志明',
  '美玲', '海涛', '晓峰', '春梅', '伟明', '雅琴', '玉兰', '永强',
  '晓燕', '国强', '红梅', '俊涛', '惠芬', '宝林', '桂兰', '德明',
];

export function generateTree(opts: GenerateOptions = {}): MemberRaw[] {
  const {
    count = 1000,
    childrenMin = 2,
    childrenMax = 4,
    roots = 1,
    seed = 42,
    namePool = DEFAULT_NAMES,
  } = opts;

  const rng = makeRng(seed);
  const members: MemberRaw[] = [];
  const frontier: string[] = [];
  let nextId = 1;

  // 先建 roots
  for (let r = 0; r < roots; r++) {
    const id = String(nextId++);
    members.push({
      id,
      name: `${namePool[r % namePool.length]}${r + 1}`,
      gender: 'male',
      fatherId: '',
      motherId: '',
      generation: 1,
      birthYear: 1900 + Math.floor(rng() * 40),
      deathYear: 1960 + Math.floor(rng() * 60),
      sortOrder: Math.floor(rng() * 100),
    });
    frontier.push(id);
  }

  // 广度优先生长
  while (members.length < count && frontier.length > 0) {
    const parentId = frontier.shift()!;
    const parent = members.find((m) => m.id === parentId)!;
    const nChildren = childrenMin + Math.floor(rng() * (childrenMax - childrenMin + 1));
    for (let i = 0; i < nChildren && members.length < count; i++) {
      const id = String(nextId++);
      const gender: 'male' | 'female' = rng() < 0.5 ? 'male' : 'female';
      members.push({
        id,
        name: `${namePool[(nextId + i) % namePool.length]}${nextId}`,
        gender,
        fatherId: parentId,
        motherId: '',
        generation: (parent.generation ?? 1) + 1,
        birthYear: (parent.birthYear ?? 1940) + 20 + Math.floor(rng() * 15),
        deathYear: (parent.deathYear ?? 2000) + Math.floor(rng() * 10),
        sortOrder: Math.floor(rng() * 100),
      });
      frontier.push(id);
    }
  }

  return members;
}

/** 预设档位：small=1k, medium=5k, large=10k, xlarge=20k */
export const presetDatasets: Record<string, () => MemberRaw[]> = {
  small: () => generateTree({ count: 1_000, seed: 42 }),
  medium: () => generateTree({ count: 5_000, seed: 101 }),
  large: () => generateTree({ count: 10_000, seed: 7 }),
  xlarge: () => generateTree({ count: 20_000, seed: 2024 }),
};
