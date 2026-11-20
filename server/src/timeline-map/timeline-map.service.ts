/**
 * 时空地图 Service（识典古籍对标 · 阶段 6）
 *
 * 职责：
 *   1. 按世代分组的家族成员地理分布（含 birthPlace + deathPlace 坐标）
 *   2. 家族迁徙路线（始祖 → 各代始迁祖）
 *   3. 同期历史事件时间线（内置数据，按朝代/年份）
 *   4. 名人故居/祠堂位置标记
 *
 * 数据来源：
 *   family_members_{familyId} 表（location/lat/lng 字段）
 *   内置历史事件表（硬编码，按朝代）
 *
 * 统一输出协议：后端固化稳定结构，前端只消费
 */
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface MigrationPoint {
  lat: number;
  lng: number;
  name: string;
  year?: number;
  generation?: number;
  type: 'ancestor' | 'birth' | 'death' | 'migration';
  memberName: string;
}

export interface GenerationGeo {
  generation: number;
  count: number;
  centers: Array<{ lat: number; lng: number; placeName: string; count: number }>;
  members: Array<{ id: string; name: string; lat: number; lng: number; placeName: string; year?: number }>;
}

export interface HistoryEvent {
  year: number;
  title: string;
  dynasty: string;
  description: string;
  category: 'politics' | 'war' | 'culture' | 'economy' | 'science' | 'society';
}

/** 内置中国历史大事年表（精选，覆盖主要朝代关键事件） */
const HISTORY_TIMELINE: HistoryEvent[] = [
  { year: -221,  title: '秦始皇统一六国',       dynasty: '秦',   description: '秦王嬴政完成统一，建立中国历史上第一个中央集权王朝', category: 'politics' },
  { year: -206,  title: '楚汉之争',             dynasty: '秦汉之际', description: '秦朝灭亡后刘邦与项羽争霸，最终刘邦建立汉朝', category: 'war' },
  { year: -202,  title: '西汉建立',             dynasty: '西汉', description: '刘邦建立汉朝，定都长安', category: 'politics' },
  { year: 25,    title: '东汉建立',             dynasty: '东汉', description: '光武帝刘秀重建汉朝，定都洛阳', category: 'politics' },
  { year: 220,   title: '三国鼎立',             dynasty: '三国', description: '曹丕称帝建立曹魏，后蜀汉、东吴相继建立', category: 'war' },
  { year: 265,   title: '西晋建立',             dynasty: '西晋', description: '司马炎代魏建晋，统一三国', category: 'politics' },
  { year: 317,   title: '东晋南渡',             dynasty: '东晋', description: '司马睿南渡建东晋，衣冠南渡是客家人、闽南人南迁的重要背景', category: 'society' },
  { year: 386,   title: '北魏建立',             dynasty: '南北朝', description: '拓跋珪建立北魏，鲜卑族汉化改革', category: 'politics' },
  { year: 581,   title: '隋朝建立',             dynasty: '隋',   description: '杨坚代周建隋，结束南北朝分裂', category: 'politics' },
  { year: 618,   title: '唐朝建立',             dynasty: '唐',   description: '李渊建唐，开启中国古代最强盛的王朝', category: 'politics' },
  { year: 629,   title: '玄奘西行',             dynasty: '唐',   description: '唐僧玄奘前往天竺取经，促进中印文化交流', category: 'culture' },
  { year: 755,   title: '安史之乱',             dynasty: '唐',   description: '安禄山、史思明叛乱，唐朝由盛转衰', category: 'war' },
  { year: 907,   title: '五代十国',             dynasty: '五代十国', description: '唐朝灭亡后中原地区政权交替频繁', category: 'war' },
  { year: 960,   title: '北宋建立',             dynasty: '北宋', description: '赵匡胤陈桥兵变建立宋朝', category: 'politics' },
  { year: 1127,  title: '靖康之变',             dynasty: '两宋之际', description: '金军攻破开封，宋室南渡建立南宋，北方人口再次大规模南迁', category: 'war' },
  { year: 1279,  title: '南宋灭亡',             dynasty: '元',   description: '崖山海战，南宋灭亡，元朝统一中国', category: 'war' },
  { year: 1368,  title: '明朝建立',             dynasty: '明',   description: '朱元璋推翻元朝建立明朝', category: 'politics' },
  { year: 1405,  title: '郑和下西洋',           dynasty: '明',   description: '郑和率船队七下西洋，最远到达东非', category: 'society' },
  { year: 1644,  title: '明朝灭亡 / 清朝建立',  dynasty: '明清之际', description: '李自成攻破北京，清军入关建立清朝', category: 'war' },
  { year: 1840,  title: '鸦片战争',             dynasty: '清',   description: '英国发动鸦片战争，中国近代史开端', category: 'war' },
  { year: 1851,  title: '太平天国运动',         dynasty: '清',   description: '洪秀全在广西金田起义，历时十四年', category: 'war' },
  { year: 1911,  title: '辛亥革命',             dynasty: '民国', description: '武昌起义，推翻清朝帝制', category: 'politics' },
  { year: 1949,  title: '中华人民共和国成立',   dynasty: '现代', description: '毛泽东在北京天安门宣布建国', category: 'politics' }
];

@Injectable()
export class TimelineMapService {
  private readonly logger = new Logger(TimelineMapService.name);

  constructor(private readonly dataSource: DataSource) {}

  // =================================================================
  // 1. 按世代分组的地理分布
  // =================================================================

  async getGenerations(
    familyId: number,
    range?: { minGen?: number; maxGen?: number }
  ): Promise<GenerationGeo[]> {
    const table = `family_members_${familyId}`;
    const where: string[] = [
      '`lat` IS NOT NULL AND `lat` != 0',
      '`lng` IS NOT NULL AND `lng` != 0'
    ];
    const params: any[] = [];
    if (range?.minGen !== undefined) { where.push('`generation` >= ?'); params.push(range.minGen); }
    if (range?.maxGen !== undefined) { where.push('`generation` <= ?'); params.push(range.maxGen); }

    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`, \`lat\`, \`lng\`,
              COALESCE(\`birth_place\`, \`native_place\`, '') AS place_name,
              \`birth_year\`, \`death_year\`,
              COALESCE(\`father_name\`, '') AS father_name
       FROM \`${table}\`
       WHERE ${where.join(' AND ')}
       ORDER BY \`generation\` ASC, \`birth_year\` ASC`,
      params
    );

    // 按世代分组
    const byGen = new Map<number, any[]>();
    for (const row of rows) {
      const gen = Number(row.generation || 0);
      if (!byGen.has(gen)) byGen.set(gen, []);
      byGen.get(gen)!.push(row);
    }

    const out: GenerationGeo[] = [];
    for (const [gen, members] of [...byGen.entries()].sort((a, b) => a[0] - b[0])) {
      // 计算该世代的地理中心（按 placeName 聚类）
      const placeMap = new Map<string, { latSum: number; lngSum: number; count: number }>();
      for (const m of members) {
        const key = m.place_name || `${m.lat},${m.lng}`;
        if (!placeMap.has(key)) placeMap.set(key, { latSum: 0, lngSum: 0, count: 0 });
        const p = placeMap.get(key)!;
        p.latSum += Number(m.lat);
        p.lngSum += Number(m.lng);
        p.count++;
      }
      const centers = [...placeMap.entries()].map(([name, p]) => ({
        lat: p.latSum / p.count,
        lng: p.lngSum / p.count,
        placeName: name,
        count: p.count
      })).sort((a, b) => b.count - a.count);

      out.push({
        generation: gen,
        count: members.length,
        centers,
        members: members.map(m => ({
          id: String(m.id),
          name: m.name,
          lat: Number(m.lat),
          lng: Number(m.lng),
          placeName: m.place_name,
          year: m.birth_year || m.death_year || undefined
        }))
      });
    }

    return out;
  }

  // =================================================================
  // 2. 家族迁徙路线（始祖 → 始迁祖 → 现代）
  // =================================================================

  async getMigration(
    familyId: number
  ): Promise<{ points: MigrationPoint[]; routes: Array<{ from: MigrationPoint; to: MigrationPoint }> }> {
    const table = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`, \`father_name\`,
              \`lat\`, \`lng\`,
              COALESCE(\`birth_place\`, \`native_place\`, '') AS place_name,
              \`birth_year\`, \`death_year\`
       FROM \`${table}\`
       WHERE \`lat\` IS NOT NULL AND \`lat\` != 0
         AND \`lng\` IS NOT NULL AND \`lng\` != 0
       ORDER BY \`generation\` ASC`,
      []
    );

    if (rows.length === 0) {
      return { points: [], routes: [] };
    }

    // 迁徙规则（简化版）：
    //  - 始祖（generation=1）→ 类型 ancestor
    //  - 后代中 placeName 与父代不同 → 类型 migration（始迁祖）
    //  - 其余按 birth/death 区分
    const points: MigrationPoint[] = [];
    const idMap = new Map<string, MigrationPoint>();
    const genMap = new Map<number, MigrationPoint[]>();

    for (const row of rows) {
      const gen = Number(row.generation || 0);
      const p: MigrationPoint = {
        lat: Number(row.lat),
        lng: Number(row.lng),
        name: row.place_name || `${row.lat},${row.lng}`,
        year: row.birth_year || row.death_year || undefined,
        generation: gen,
        type: gen === 1 ? 'ancestor' : 'birth',
        memberName: row.name
      };
      points.push(p);
      idMap.set(String(row.id), p);
      if (!genMap.has(gen)) genMap.set(gen, []);
      genMap.get(gen)!.push(p);
    }

    // 标记迁徙点：同代中 placeName 发生变化的视为迁徙
    for (const [gen, genPoints] of genMap) {
      if (gen <= 1) continue;
      // 简单规则：同代中心点与上一代中心点差距超过 0.5°（约 50km）视为迁徙
      const prevGenPoints = genMap.get(gen - 1) || [];
      if (prevGenPoints.length > 0 && genPoints.length > 0) {
        const prevCenter = this.average(prevGenPoints);
        const curCenter = this.average(genPoints);
        const dist = Math.sqrt(
          Math.pow(prevCenter.lat - curCenter.lat, 2) +
          Math.pow(prevCenter.lng - curCenter.lng, 2)
        );
        if (dist > 0.5) {
          for (const p of genPoints) p.type = 'migration';
        }
      }
    }

    // 构造迁徙路线：按世代中心点连线
    const routes: Array<{ from: MigrationPoint; to: MigrationPoint }> = [];
    const sortedGens = [...genMap.keys()].sort((a, b) => a - b);
    for (let i = 0; i < sortedGens.length - 1; i++) {
      const fromGen = sortedGens[i];
      const toGen = sortedGens[i + 1];
      const fromPoints = genMap.get(fromGen)!;
      const toPoints = genMap.get(toGen)!;
      if (fromPoints.length > 0 && toPoints.length > 0) {
        routes.push({ from: fromPoints[0], to: toPoints[0] });
      }
    }

    return { points, routes };
  }

  // =================================================================
  // 3. 同期历史事件时间线（内置）
  // =================================================================

  getHistoryEvents(
    yearRange?: { start?: number; end?: number },
    categories?: HistoryEvent['category'][]
  ): HistoryEvent[] {
    let out = [...HISTORY_TIMELINE];
    if (yearRange?.start !== undefined) out = out.filter(e => e.year >= yearRange.start!);
    if (yearRange?.end !== undefined) out = out.filter(e => e.year <= yearRange.end!);
    if (categories && categories.length > 0) out = out.filter(e => categories.includes(e.category));
    return out.sort((a, b) => a.year - b.year);
  }

  // =================================================================
  // 4. 家族事件 + 历史事件叠加
  // =================================================================

  async getCombinedTimeline(familyId: number): Promise<{
    familyEvents: Array<{ year: number; title: string; memberName: string; event: string }>;
    historyEvents: HistoryEvent[];
  }> {
    const table = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`name\`, \`birth_year\`, \`death_year\`, \`generation\`
       FROM \`${table}\`
       WHERE \`birth_year\` IS NOT NULL OR \`death_year\` IS NOT NULL
       ORDER BY COALESCE(\`birth_year\`, \`death_year\`) ASC`,
      []
    );

    const familyEvents: Array<{ year: number; title: string; memberName: string; event: string }> = [];
    for (const row of rows) {
      if (row.birth_year) {
        familyEvents.push({
          year: Number(row.birth_year),
          title: '出生',
          memberName: row.name,
          event: `${row.name}（第 ${row.generation || '?'} 代）出生`
        });
      }
      if (row.death_year) {
        familyEvents.push({
          year: Number(row.death_year),
          title: '逝世',
          memberName: row.name,
          event: `${row.name} 逝世`
        });
      }
    }

    // 取年份范围
    const allYears = familyEvents.map(e => e.year);
    if (allYears.length === 0) {
      return { familyEvents: [], historyEvents: [] };
    }
    const minYear = Math.min(...allYears) - 20;
    const maxYear = Math.max(...allYears) + 20;

    const historyEvents = this.getHistoryEvents({ start: minYear, end: maxYear });
    return { familyEvents, historyEvents };
  }

  // =================================================================
  // 内部：工具
  // =================================================================

  private average(points: MigrationPoint[]): { lat: number; lng: number } {
    const sum = points.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 }
    );
    return { lat: sum.lat / points.length, lng: sum.lng / points.length };
  }
}
