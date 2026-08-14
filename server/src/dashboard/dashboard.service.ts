import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DataRow, QueryValues } from '../common/types/common';

export interface DashboardStats {
  /** 家族总数 */
  totalFamilies: number;
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
    const [totalFamilies, totalMembers, dynamics, photos, documents, events, surnames] =
      await Promise.all([
        this.queryValue('SELECT COUNT(*) AS cnt FROM family WHERE status = 1'),
        this.countAllMembers(),
        this.queryValue("SELECT COUNT(*) AS cnt FROM family_dynamic WHERE status = 1"),
        this.queryValue("SELECT COUNT(*) AS cnt FROM family_photo WHERE status = 1"),
        this.queryValue("SELECT COUNT(*) AS cnt FROM family_document WHERE status = 1"),
        this.queryValue("SELECT COUNT(*) AS cnt FROM family_event WHERE status = 1"),
        this.getSurnameStats(),
      ]);

    return {
      totalFamilies,
      totalMembers,
      content: { dynamics, photos, documents, events },
      surnames,
    };
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
