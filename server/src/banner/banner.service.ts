import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type BannerItem,
  type BannerListResult,
  type BannerRow
} from './types/banner.types';

/** 轮播切换间隔默认值（毫秒，可在 sys_config.banner_interval 中配置） */
const DEFAULT_INTERVAL = 3000;
/** 轮播切换间隔最大值（毫秒），防止配置过大导致几乎不切换 */
const MAX_INTERVAL = 60000;

/**
 * 小程序用户端广告轮播服务
 * - 查询当前家族的启用广告（含全局广告 family_id=0），按排序值升序
 * - 仅返回当前时间在有效期（start_time~end_time，空=不限）内的广告
 * - 家族归属校验：非成员不报错，仅不展示该家族私有广告，全局广告对所有用户可见
 */
@Injectable()
export class BannerService {
  constructor(private readonly dataSource: DataSource) {}

  /** 当前家族启用轮播列表 + 切换间隔 */
  async getActiveList(userId: string, familyId: number): Promise<BannerListResult> {
    if (!familyId || familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
    const isMember = await this.isFamilyMember(userId, familyId);

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

    // 非家族成员仅返回全局广告，保证"全局显示"广告对所有用户可见
    const list = isMember ? rows : rows.filter((r) => Number(r.family_id) === 0);

    return {
      list: list.map((r) => this.toItem(r)),
      interval: await this.getInterval()
    };
  }

  /** 全局广告列表（family_id=0）：无需登录/家族归属，对所有用户可见 */
  async getGlobalList(): Promise<BannerListResult> {
    const rows = await this.dataSource.query<BannerRow[]>(
      `SELECT \`id\`, \`family_id\`, \`title\`, \`image_url\`, \`link_type\`, \`link_url\`, \`sort_order\`, \`start_time\`, \`end_time\`, \`create_time\`
       FROM \`family_banner\`
       WHERE \`status\` = 1
         AND \`family_id\` = 0
         AND (\`start_time\` IS NULL OR \`start_time\` <= NOW())
         AND (\`end_time\` IS NULL OR \`end_time\` >= NOW())
       ORDER BY \`sort_order\` ASC, \`id\` DESC`
    );

    return {
      list: rows.map((r) => this.toItem(r)),
      interval: await this.getInterval()
    };
  }

  /** 记录广告点击次数（用于运营统计；id 无效时静默忽略） */
  async recordClick(id: number) {
    if (!id || id <= 0) return { success: true };
    await this.dataSource.query(
      'UPDATE `family_banner` SET `click_count` = `click_count` + 1 WHERE `id` = ?',
      [id]
    );
    return { success: true };
  }

  /** 读取轮播切换间隔配置（sys_config.banner_interval） */
  private async getInterval(): Promise<number> {
    const [row] = await this.dataSource.query<{ config_value: string | null }[]>(
      'SELECT `config_value` FROM `sys_config` WHERE `config_key` = ? AND `status` = 1',
      ['banner_interval']
    );
    if (!row) return DEFAULT_INTERVAL;
    const n = Number(row.config_value);
    if (!Number.isFinite(n) || n < 1000) return DEFAULT_INTERVAL;
    return Math.min(n, MAX_INTERVAL);
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

  /** 家族归属校验（布尔）：family_permission / user.family_id / 家族创建者，并校验家族未被禁用 */
  private async isFamilyMember(userId: string, familyId: number): Promise<boolean> {
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return true;

    const [binding] = await this.dataSource.query<{ family_id: number | null }[]>(
      'SELECT `family_id` FROM `user` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [userId]
    );
    if (binding && Number(binding.family_id) === Number(familyId)) return true;

    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    if (family && family.creator_user_id === userId) return true;

    return false;
  }
}
