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
 *   family_members_{familyId} 表
 *     真实字段（schema.sql）：
 *       latitude    DECIMAL(10,7)  墓茔纬度
 *       longitude   DECIMAL(10,7)  墓茔经度
 *       birth_place VARCHAR(200)   出生地
 *       death_place VARCHAR(200)   墓茔/安葬地点
 *       birth_date  VARCHAR(30)    出生日期（'1990' / '1990-05' / '1990年5月'）
 *       death_date  VARCHAR(30)    逝世日期
 *       father_id   VARCHAR(32)    父亲成员 ID（不是名字）
 *       generation  INT UNSIGNED   辈分/代数
 *       status      TINYINT(1)     1-正常 0-已删除
 *       create_time DATETIME       创建时间（schema 没有 update_time）
 *   内置历史事件表（硬编码，按朝代）
 *
 * 统一输出协议：后端固化稳定结构，前端只消费
 */
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import {
  MigrationPoint, MigrationRoute, MigrationAggregate,
  GenerationGeo, GenerationRangeQuery,
  HistoryEvent, HistoryRangeQuery, HistoryCategory,
  CombinedTimeline
} from './types/timeline-map.types';
import { HistoryQueryDto } from './dto/timeline-map.dto';

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

/** 从 VARCHAR 日期字符串中解析年份（支持 '1990' / '1990-05-01' / '1990年5月' / '1990/05'） */
function parseYear(dateStr: string | null | undefined): number | undefined {
  if (!dateStr) return undefined;
  const m = String(dateStr).match(/-?\d{3,4}/); // 允许前导负号（公元前情况虽然罕见但正则兼容）
  return m ? Number(m[0]) : undefined;
}

@Injectable()
export class TimelineMapService {
  private readonly logger = new Logger(TimelineMapService.name);
  /** 缓存 TTL：家族时空数据变化频率低，24 小时足够 */
  private readonly CACHE_TTL_HOURS = 24;

  constructor(private readonly dataSource: DataSource) {}

  // =================================================================
  // 1. 按世代分组的地理分布（带缓存）
  // =================================================================

  async getGenerations(
    familyId: number,
    range?: { minGen?: number; maxGen?: number }
  ): Promise<GenerationGeo[]> {
    // 缓存 key：fingerprint（数据变化自动失效）+ 参数
    const fp = await this.getFamilyFingerprint(familyId);
    const cacheKey = this.hash(`generations|${familyId}|${fp}|${range?.minGen ?? ''}-${range?.maxGen ?? ''}`);

    const cached: any = await this.getCacheObj(cacheKey);
    if (cached) return cached;

    // schema.sql 真实字段：latitude / longitude / birth_place / death_place / birth_date / death_date
    const table = `family_members_${familyId}`;
    const where: string[] = [
      '`status` != 0',                                   // 排除已删除
      '`latitude` IS NOT NULL AND `latitude` != 0',
      '`longitude` IS NOT NULL AND `longitude` != 0'
    ];
    const params: any[] = [];
    if (range?.minGen !== undefined) { where.push('`generation` >= ?'); params.push(range.minGen); }
    if (range?.maxGen !== undefined) { where.push('`generation` <= ?'); params.push(range.maxGen); }

    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`,
              \`latitude\`, \`longitude\`,
              COALESCE(\`birth_place\`, \`death_place\`, '') AS place_name,
              \`birth_date\`, \`death_date\`
       FROM \`${table}\`
       WHERE ${where.join(' AND ')}
       ORDER BY \`generation\` ASC, \`birth_date\` ASC`,
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
      const placeMap = new Map<string, { latSum: number; lngSum: number; count: number }>();
      for (const m of members) {
        const key = m.place_name || `${m.latitude},${m.longitude}`;
        if (!placeMap.has(key)) placeMap.set(key, { latSum: 0, lngSum: 0, count: 0 });
        const p = placeMap.get(key)!;
        p.latSum += Number(m.latitude);
        p.lngSum += Number(m.longitude);
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
          lat: Number(m.latitude),
          lng: Number(m.longitude),
          placeName: m.place_name,
          year: parseYear(m.birth_date) ?? parseYear(m.death_date)
        }))
      });
    }

    // 写缓存
    await this.setCacheObj(cacheKey, out);
    return out;
  }

  // =================================================================
  // 2. 家族迁徙路线（带缓存）
  // =================================================================

  async getMigration(
    familyId: number
  ): Promise<MigrationAggregate> {
    const fp = await this.getFamilyFingerprint(familyId);
    const cacheKey = this.hash(`migration|${familyId}|${fp}`);

    const cached: any = await this.getCacheObj(cacheKey);
    if (cached) return cached;

    const table = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`,
              \`latitude\`, \`longitude\`,
              COALESCE(\`birth_place\`, \`death_place\`, '') AS place_name,
              \`birth_date\`, \`death_date\`
       FROM \`${table}\`
       WHERE \`status\` != 0
         AND \`latitude\` IS NOT NULL AND \`latitude\` != 0
         AND \`longitude\` IS NOT NULL AND \`longitude\` != 0
       ORDER BY \`generation\` ASC`,
      []
    );

    if (rows.length === 0) {
      return { points: [], routes: [] };
    }

    const points: MigrationPoint[] = [];
    const genMap = new Map<number, MigrationPoint[]>();

    for (const row of rows) {
      const gen = Number(row.generation || 0);
      const p: MigrationPoint = {
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        name: row.place_name || `${row.latitude},${row.longitude}`,
        year: parseYear(row.birth_date) ?? parseYear(row.death_date),
        generation: gen,
        type: gen === 1 ? 'ancestor' : 'birth',
        memberName: row.name
      };
      points.push(p);
      if (!genMap.has(gen)) genMap.set(gen, []);
      genMap.get(gen)!.push(p);
    }

    // 标记迁徙点：同代中心点与上一代差距 > 0.5°（约 50km）
    for (const [gen, genPoints] of genMap) {
      if (gen <= 1) continue;
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

    // 构造迁徙路线
    const routes: MigrationRoute[] = [];
    const sortedGens = [...genMap.keys()].sort((a, b) => a - b);
    for (let i = 0; i < sortedGens.length - 1; i++) {
      const fromPoints = genMap.get(sortedGens[i])!;
      const toPoints = genMap.get(sortedGens[i + 1])!;
      if (fromPoints.length > 0 && toPoints.length > 0) {
        routes.push({ from: fromPoints[0], to: toPoints[0] });
      }
    }

    const result: MigrationAggregate = { points, routes };
    await this.setCacheObj(cacheKey, result);
    return result;
  }

  // =================================================================
  // 3. 同期历史事件时间线（内置）
  // =================================================================

  getHistoryEvents(
    yearRange?: HistoryRangeQuery,
    categories?: HistoryCategory[]
  ): HistoryEvent[] {
    let out = [...HISTORY_TIMELINE];
    if (yearRange?.start !== undefined) out = out.filter(e => e.year >= yearRange.start!);
    if (yearRange?.end !== undefined) out = out.filter(e => e.year <= yearRange.end!);
    if (categories && categories.length > 0) out = out.filter(e => categories.includes(e.category));
    return out.sort((a, b) => a.year - b.year);
  }

  // =================================================================
  // 4. 家族事件 + 历史事件叠加（带缓存）
  // =================================================================

  async getCombinedTimeline(familyId: number): Promise<CombinedTimeline> {
    const fp = await this.getFamilyFingerprint(familyId);
    const cacheKey = this.hash(`timeline|${familyId}|${fp}`);

    const cached: any = await this.getCacheObj(cacheKey);
    if (cached) return cached;

    const table = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`name\`, \`birth_date\`, \`death_date\`, \`generation\`
       FROM \`${table}\`
       WHERE \`status\` != 0
         AND (\`birth_date\` IS NOT NULL AND \`birth_date\` != ''
              OR \`death_date\` IS NOT NULL AND \`death_date\` != '')
       ORDER BY COALESCE(\`birth_date\`, \`death_date\`) ASC`,
      []
    );

    const familyEvents: CombinedTimeline['familyEvents'] = [];
    for (const row of rows) {
      const birthYear = parseYear(row.birth_date);
      const deathYear = parseYear(row.death_date);
      if (birthYear) {
        familyEvents.push({
          year: birthYear,
          title: '出生',
          memberName: row.name,
          event: `${row.name}（第 ${row.generation || '?'} 代）出生`
        });
      }
      if (deathYear) {
        familyEvents.push({
          year: deathYear,
          title: '逝世',
          memberName: row.name,
          event: `${row.name} 逝世`
        });
      }
    }

    const allYears = familyEvents.map(e => e.year);
    let historyEvents: HistoryEvent[] = [];
    if (allYears.length > 0) {
      const minYear = Math.min(...allYears) - 20;
      const maxYear = Math.max(...allYears) + 20;
      historyEvents = this.getHistoryEvents({ start: minYear, end: maxYear });
    }

    const result: CombinedTimeline = { familyEvents, historyEvents };
    await this.setCacheObj(cacheKey, result);
    return result;
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

  // =================================================================
  // 内部：缓存（复用 timeline_map_cache 表）
  // =================================================================

  private hash(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex');
  }

  /**
   * 家族数据指纹：成员总数 + 最新 create_time
   * schema 没有 update_time 字段，用 create_time 近似代表最后修改时间。
   * 成员新增后 fingerprint 变化 → 缓存 key 自然不同 → 自动失效。
   */
  private async getFamilyFingerprint(familyId: number): Promise<string> {
    const table = `family_members_${familyId}`;
    try {
      const rows = await this.dataSource.query<any[]>(
        `SELECT COUNT(*) AS cnt,
                COALESCE(MAX(\`create_time\`), '1970-01-01') AS last_create
         FROM \`${table}\`
         WHERE \`status\` != 0`
      );
      const cnt = Number(rows[0]?.cnt || 0);
      const last = rows[0]?.last_create || '1970-01-01';
      return `${cnt}|${last}`;
    } catch {
      return 'unknown';
    }
  }

  private async getCacheObj<T>(key: string): Promise<T | null> {
    try {
      const rows = await this.dataSource.query<any[]>(
        `SELECT \`data_json\` FROM \`timeline_map_cache\`
         WHERE \`cache_key\` = ? AND \`expire_time\` > NOW() LIMIT 1`,
        [key]
      );
      if (rows.length === 0) return null;
      return JSON.parse(rows[0].data_json) as T;
    } catch { return null; }
  }
  private async setCacheObj(key: string, data: any): Promise<void> {
    try {
      const json = JSON.stringify(data);
      await this.dataSource.query(
        `INSERT INTO \`timeline_map_cache\` (\`cache_key\`, \`data_json\`, \`expire_time\`)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
         ON DUPLICATE KEY UPDATE \`data_json\`=VALUES(\`data_json\`), \`expire_time\`=VALUES(\`expire_time\`)`,
        [key, json, this.CACHE_TTL_HOURS]
      );
    } catch (err) {
      this.logger.warn('[timeline-map] cache write failed:', err);
    }
  }
}
