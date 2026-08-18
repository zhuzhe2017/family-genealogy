import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type BannerItem,
  type BannerListResult,
  type BannerRow
} from './types/banner.types';

/** 轮播切换间隔默认值（毫秒，可在 sys_config.banner_interval 中配置） */
const DEFAULT_INTERVAL = 3000;

/**
 * 小程序用户端广告轮播服务
 * - 查询当前家族的启用广告（含全局广告 family_id=0），按排序值升序
 * - 仅返回当前时间在有效期（start_time~end_time，空=不限）内的广告
 * - 家族归属校验：必须属于目标家族才可查看该家族广告
 */
@Injectable()
export class BannerService {
  constructor(private readonly dataSource: DataSource) {}

  /** 当前家族启用轮播列表 + 切换间隔 */
  async getActiveList(userId: string, familyId: number): Promise<BannerListResult> {
    if (!familyId || familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
    await this.assertFamilyMember(userId, familyId);

    const rows = await this.dataSource.query<BannerRow[]>(
      `SELECT \`id\`, \`family_id\`, \`title\`, \`image_url\`, \`link_type\`, \`link_url\`, \`sort_order\`, \`start_time\`, \`end_time\`, \`create_time\`
       FROM \`family_banner\`
       WHERE \`status\` = 1
         AND (\`family_id\` = ? OR \`family_id\` = 0)
         AND (\`start_time\` IS NULL OR \`start_time\` <= NOW())
         AND (\`end_time\` IS NULL OR \`end_time\` >= NOW())
       ORDER BY \`sort_order\` ASC, \`id\` DESC`,
      [familyId]
    );

    return {
      list: rows.map((r) => this.toItem(r)),
      interval: await this.getInterval()
    };
  }

  /** 读取轮播切换间隔配置（sys_config.banner_interval） */
  private async getInterval(): Promise<number> {
    const [row] = await this.dataSource.query<{ config_value: string | null }[]>(
      'SELECT `config_value` FROM `sys_config` WHERE `config_key` = ? AND `status` = 1',
      ['banner_interval']
    );
    if (!row) return DEFAULT_INTERVAL;
    const n = Number(row.config_value);
    return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_INTERVAL;
  }

  /** 行记录 → 对外条目 */
  private toItem(r: BannerRow): BannerItem {
    return {
      id: r.id,
      familyId: r.family_id,
      title: r.title,
      imageUrl: r.image_url,
      linkType: (r.link_type || 'none') as BannerItem['linkType'],
      linkUrl: r.link_url || '',
      sortOrder: r.sort_order,
      startTime: r.start_time,
      endTime: r.end_time,
      createTime: r.create_time
    };
  }

  /** 家族归属校验：family_permission / user.family_id / 家族创建者 */
  private async assertFamilyMember(userId: string, familyId: number): Promise<void> {
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return;

    const [binding] = await this.dataSource.query<{ family_id: number | null }[]>(
      'SELECT `family_id` FROM `user` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [userId]
    );
    if (binding && Number(binding.family_id) === Number(familyId)) return;

    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    if (family && family.creator_user_id === userId) return;

    throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
  }
}
