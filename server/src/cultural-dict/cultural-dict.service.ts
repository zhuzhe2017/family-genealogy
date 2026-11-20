/**
 * 文化字典模块（字辈/堂号/家谱术语/溯源）
 * 对应表：cultural_dictionary
 * 只读查询：小程序端文化工具箱入口
 */
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type DictCategory = 'zibei' | 'tanghao' | 'terminology' | 'suyuan';

export interface DictRow {
  id: number;
  category: DictCategory;
  dict_key: string;
  surname: string;
  content: string;
  source: string;
  tags: string | string[] | null;
  sort_order: number;
}

export interface DictListParams {
  category?: DictCategory;
  keyword?: string;
  surname?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class CulturalDictService {
  constructor(private readonly dataSource: DataSource) {}

  /** 分页列表（支持 category/keyword/surname 筛选） */
  async getList(params: DictListParams = {}): Promise<{ list: DictRow[]; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const where: string[] = ['`status` = 1'];
    const values: any[] = [];

    if (params.category) {
      where.push('`category` = ?');
      values.push(params.category);
    }
    if (params.keyword) {
      where.push('(`dict_key` LIKE ? OR `content` LIKE ? OR `source` LIKE ?)');
      const like = `%${params.keyword}%`;
      values.push(like, like, like);
    }
    if (params.surname) {
      where.push('`surname` = ?');
      values.push(params.surname);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [count] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`cultural_dictionary\` ${whereClause}`,
      values
    );

    const list = await this.dataSource.query<DictRow[]>(
      `SELECT * FROM \`cultural_dictionary\` ${whereClause}
       ORDER BY \`sort_order\` ASC, \`id\` ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total: count?.total ?? 0 };
  }

  /** 分类统计（工具箱首页展示） */
  async getCategoryStats(): Promise<Array<{ category: DictCategory; count: number }>> {
    const rows = await this.dataSource.query<{ category: DictCategory; count: number }[]>(
      `SELECT \`category\`, COUNT(*) AS count
       FROM \`cultural_dictionary\`
       WHERE \`status\` = 1
       GROUP BY \`category\``
    );
    return rows;
  }
}
