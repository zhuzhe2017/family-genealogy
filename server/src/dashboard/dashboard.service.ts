import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DataRow, QueryValues } from '../common/types/common';

/** 订阅增长趋势 */
export interface SubscriptionGrowthPoint {
  date: string;
  newSubscriptions: number;
  totalSubscriptions: number;
}

/** 收入趋势点 */
export interface RevenuePoint {
  date: string;
  amount: number;
}

/** 转化率趋势点 */
export interface ConversionPoint {
  date: string;
  familyCount: number;
  paidCount: number;
  conversionRate: number;
}

/** 关键业务指标 */
export interface SubscriptionKpis {
  /** 区间总收入（元） */
  totalRevenue: number;
  /** 区间付费订单数 */
  totalOrders: number;
  /** 区间累计付费家族数 */
  totalPaidFamilies: number;
  /** 区间整体转化率（%） */
  conversionRate: number;
}

export interface SubscriptionStats {
  /** 订阅用户增长趋势 */
  subscriptionGrowth: SubscriptionGrowthPoint[];
  /** 商业化收入数据 */
  revenue: RevenuePoint[];
  /** 用户转化率分析 */
  conversion: ConversionPoint[];
  /** 关键业务指标 */
  kpis: SubscriptionKpis;
}

export interface DashboardStats {
  /** 总用户数 */
  totalUsers: number;
  /** 今日新增用户 */
  todayNewUsers: number;
  /** 家族总数 */
  totalFamilies: number;
  /** 今日新增家族数 */
  todayNewFamilies: number;
  /** 待审核内容总数 */
  pendingAuditContents: number;
  /** 付费家族数 */
  paidFamilies: number;
  /** 成员总数（跨所有家族分表） */
  totalMembers: number;
  /** 内容统计 */
  content: {
    /** 动态总数 */
    dynamics: number;
    /** 相册总数 */
    photos: number;
    /** 文档总数 */
    documents: number;
    /** 事件总数 */
    events: number;
  };
  /** 姓氏统计 */
  surnames: SurnameStat[];
}

/** 姓氏统计数据 */
export interface SurnameStat {
  /** 姓氏 */
  surname: string;
  /** 百家姓排名 */
  ranking: number;
  /** 关联家族数 */
  familyCount: number;
  /** 成员总数 */
  memberCount: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  /** 获取全局仪表盘统计数据 */
  async getStats(): Promise<DashboardStats> {
    const [
      totalUsers,
      todayNewUsers,
      totalFamilies,
      todayNewFamilies,
      pendingAuditContents,
      paidFamilies,
      totalMembers,
      dynamics,
      photos,
      documents,
      events,
      surnames,
    ] = await Promise.all([
      this.queryValue('SELECT COUNT(*) AS cnt FROM `user` WHERE `status` = 1'),
      this.queryValue(
        "SELECT COUNT(*) AS cnt FROM `user` WHERE `status` = 1 AND DATE(`create_time`) = CURDATE()"
      ),
      this.queryValue('SELECT COUNT(*) AS cnt FROM `family` WHERE `status` = 1'),
      this.queryValue(
        "SELECT COUNT(*) AS cnt FROM `family` WHERE `status` = 1 AND DATE(`create_time`) = CURDATE()"
      ),
      this.queryPendingAuditContents(),
      this.queryValue(
        "SELECT COUNT(*) AS cnt FROM `family_subscription` WHERE `plan_code` != 'free' AND `status` = 'active'"
      ),
      this.countAllMembers(),
      this.queryValue("SELECT COUNT(*) AS cnt FROM family_dynamic WHERE status = 1"),
      this.queryValue("SELECT COUNT(*) AS cnt FROM family_photo WHERE status = 1"),
      this.queryValue("SELECT COUNT(*) AS cnt FROM family_document WHERE status = 1"),
      this.queryValue("SELECT COUNT(*) AS cnt FROM family_event WHERE status = 1"),
      this.getSurnameStats(),
    ]);

    return {
      totalUsers,
      todayNewUsers,
      totalFamilies,
      todayNewFamilies,
      pendingAuditContents,
      paidFamilies,
      totalMembers,
      content: { dynamics, photos, documents, events },
      surnames,
    };
  }

  /** 统计四类内容中 audit_status = 0（待审核）的总数 */
  private async queryPendingAuditContents(): Promise<number> {
    const tables = ['family_dynamic', 'family_photo', 'family_document', 'family_event'];
    const counts = await Promise.all(
      tables.map(table => this.queryValue(
        `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE \`status\` = 1 AND \`audit_status\` = 0`
      ))
    );
    return counts.reduce((sum, c) => sum + c, 0);
  }

  /** 遍历所有 family_members_* 分表，汇总成员总数 */
  private async countAllMembers(): Promise<number> {
    const map = await this.getFamilyMemberCounts();
    let total = 0;
    map.forEach((cnt) => (total += cnt));
    return total;
  }

  /** 获取每个启用家族分表的活跃成员数 */
  private async getFamilyMemberCounts(): Promise<Map<number, number>> {
    // 1. 查询所有家族 ID
    const families = (await this.dataSource.query(
      `SELECT id FROM family WHERE status = 1`
    )) as { id: number }[];

    const map = new Map<number, number>();

    // 2. 并行查询每个家族分表的成员数
    await Promise.all(
      families.map(async (f) => {
        const cnt = await this.queryValue(
          `SELECT COUNT(*) AS cnt FROM \`family_members_${f.id}\` WHERE status = 1`
        ).catch(() => 0); // 分表可能不存在
        map.set(f.id, cnt);
      })
    );

    return map;
  }

  /** 执行 COUNT 查询并返回单数值 */
  private async queryValue(sql: string, values?: QueryValues): Promise<number> {
    const rows = (await this.dataSource.query(sql, values)) as DataRow[];
    return rows.length > 0 ? Number((rows[0] as any).cnt) : 0;
  }

  /** 生成指定日期范围内的日期数组（YYYY-MM-DD） */
  private generateDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]!);
    }
    return dates;
  }

  /** 获取指定日期内新增家族数映射 */
  private async getNewFamilyMap(startDate: string, endDate: string): Promise<Map<string, number>> {
    const rows = (await this.dataSource.query(
      `SELECT DATE(create_time) AS date, COUNT(*) AS cnt
       FROM \`family\`
       WHERE status = 1 AND DATE(create_time) BETWEEN ? AND ?
       GROUP BY DATE(create_time)`,
      [startDate, endDate]
    )) as { date: string; cnt: number }[];

    const map = new Map<string, number>();
    rows.forEach((row) => {
      const dateStr = new Date(row.date).toISOString().split('T')[0]!;
      map.set(dateStr, Number(row.cnt));
    });
    return map;
  }

  /** 获取指定日期内新增订阅（首次购买）映射 */
  private async getNewSubscriptionMap(startDate: string, endDate: string): Promise<Map<string, number>> {
    const rows = (await this.dataSource.query(
      `SELECT DATE(so.pay_time) AS date, COUNT(DISTINCT so.family_id) AS cnt
       FROM \`subscription_order\` so
       INNER JOIN \`family_subscription\` fs ON fs.family_id = so.family_id
       WHERE so.status = 'paid'
         AND so.plan_code != 'free'
         AND DATE(so.pay_time) BETWEEN ? AND ?
       GROUP BY DATE(so.pay_time)`,
      [startDate, endDate]
    )) as { date: string; cnt: number }[];

    const map = new Map<string, number>();
    rows.forEach((row) => {
      const dateStr = new Date(row.date).toISOString().split('T')[0]!;
      map.set(dateStr, Number(row.cnt));
    });
    return map;
  }

  /** 获取指定日期内收入映射 */
  private async getRevenueMap(startDate: string, endDate: string): Promise<Map<string, number>> {
    const rows = (await this.dataSource.query(
      `SELECT DATE(pay_time) AS date, SUM(amount) AS total
       FROM \`subscription_order\`
       WHERE status = 'paid'
         AND plan_code != 'free'
         AND DATE(pay_time) BETWEEN ? AND ?
       GROUP BY DATE(pay_time)`,
      [startDate, endDate]
    )) as { date: string; total: number }[];

    const map = new Map<string, number>();
    rows.forEach((row) => {
      const dateStr = new Date(row.date).toISOString().split('T')[0]!;
      map.set(dateStr, Number(row.total) || 0);
    });
    return map;
  }

  /** 获取商业化订阅统计数据 */
  async getSubscriptionStats(startDate: string, endDate: string): Promise<SubscriptionStats> {
    const dates = this.generateDateRange(startDate, endDate);
    const newFamilyMap = await this.getNewFamilyMap(startDate, endDate);
    const newSubMap = await this.getNewSubscriptionMap(startDate, endDate);
    const revenueMap = await this.getRevenueMap(startDate, endDate);

    const subscriptionGrowth: SubscriptionGrowthPoint[] = [];
    const revenue: RevenuePoint[] = [];
    const conversion: ConversionPoint[] = [];

    let cumulativePaidFamilies = await this.queryValue(
      `SELECT COUNT(DISTINCT fs.family_id) AS cnt
       FROM \`family_subscription\` fs
       INNER JOIN \`subscription_order\` so ON so.family_id = fs.family_id
       WHERE fs.plan_code != 'free'
         AND fs.status IN ('active', 'grace')
         AND so.status = 'paid'
         AND DATE(so.pay_time) < ?`,
      [startDate]
    );

    let totalFamilyCount = 0;
    let totalPaidCount = 0;

    for (const date of dates) {
      const newFamilies = newFamilyMap.get(date) || 0;
      const newPaid = newSubMap.get(date) || 0;
      const dailyRevenue = revenueMap.get(date) || 0;

      cumulativePaidFamilies += newPaid;

      totalFamilyCount += newFamilies;
      totalPaidCount += newPaid;

      subscriptionGrowth.push({
        date,
        newSubscriptions: newPaid,
        totalSubscriptions: cumulativePaidFamilies,
      });

      revenue.push({ date, amount: dailyRevenue });

      conversion.push({
        date,
        familyCount: newFamilies,
        paidCount: newPaid,
        conversionRate: newFamilies > 0 ? Number(((newPaid / newFamilies) * 100).toFixed(2)) : 0,
      });
    }

    const [totalRevenue, totalOrders, totalPaidFamilies] = await Promise.all([
      this.queryValue(
        `SELECT COALESCE(SUM(amount), 0) AS cnt
         FROM \`subscription_order\`
         WHERE status = 'paid' AND plan_code != 'free' AND DATE(pay_time) BETWEEN ? AND ?`,
        [startDate, endDate]
      ),
      this.queryValue(
        `SELECT COUNT(*) AS cnt
         FROM \`subscription_order\`
         WHERE status = 'paid' AND plan_code != 'free' AND DATE(pay_time) BETWEEN ? AND ?`,
        [startDate, endDate]
      ),
      this.queryValue(
        `SELECT COUNT(DISTINCT fs.family_id) AS cnt
         FROM \`family_subscription\` fs
         INNER JOIN \`subscription_order\` so ON so.family_id = fs.family_id
         WHERE fs.plan_code != 'free' AND fs.status IN ('active', 'grace') AND so.status = 'paid'`,
        []
      ),
    ]);

    const conversionRate = totalFamilyCount > 0 ? Number(((totalPaidCount / totalFamilyCount) * 100).toFixed(2)) : 0;

    return {
      subscriptionGrowth,
      revenue,
      conversion,
      kpis: {
        totalRevenue,
        totalOrders,
        totalPaidFamilies,
        conversionRate,
      },
    };
  }

  /** 姓氏统计：基于分表实时统计成员数，避免 family.member_count 冗余字段滞后 */
  async getSurnameStats(): Promise<SurnameStat[]> {
    // 1. 所有启用姓氏
    const surnames = (await this.dataSource.query(
      `SELECT id, surname, ranking FROM surname WHERE status = 1`
    )) as { id: number; surname: string; ranking: number }[];

    // 2. 启用家族及其姓氏关联
    const families = (await this.dataSource.query(
      `SELECT id, surname_id FROM family WHERE status = 1`
    )) as { id: number; surname_id: number | null }[];

    // 3. 分表实时成员数
    const memberCounts = await this.getFamilyMemberCounts();

    // 4. 按姓氏聚合家族数/成员数
    const aggBySurname = new Map<number, { familyCount: number; memberCount: number }>();
    families.forEach((f) => {
      if (!f.surname_id) return; // 无姓氏关联的家族不计入
      const cur = aggBySurname.get(f.surname_id) || { familyCount: 0, memberCount: 0 };
      cur.familyCount += 1;
      cur.memberCount += memberCounts.get(f.id) || 0;
      aggBySurname.set(f.surname_id, cur);
    });

    return surnames
      .map((s) => {
        const agg = aggBySurname.get(s.id);
        return {
          surname: s.surname,
          ranking: Number(s.ranking),
          familyCount: agg?.familyCount || 0,
          memberCount: agg?.memberCount || 0,
        };
      })
      .sort((a, b) => b.memberCount - a.memberCount || a.ranking - b.ranking);
  }
}
