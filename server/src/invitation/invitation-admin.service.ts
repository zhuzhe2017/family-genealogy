import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type QueryValues } from '../common/types/common';

export interface AdminInvitationQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
  familyId?: number;
}

export interface AdminInvitationItem {
  id: number;
  familyId: number;
  familyName: string;
  inviterUserId: string;
  inviterNickname: string;
  inviteeUserId: string | null;
  inviteeNickname: string;
  inviteePhone: string;
  inviteeEmail: string;
  inviteCode: string;
  inviteLink: string;
  channel: string;
  posterUrl: string;
  shareCount: number;
  joinedCount: number;
  role: string;
  status: number;
  expiresAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  remark: string;
  createTime: string;
}

export interface AdminInvitationListResult {
  list: AdminInvitationItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 家族邀请后台管理服务
 * - 分页列表（keyword/status/familyId 筛选），联查家族名/邀请人昵称/被邀请人昵称
 * - 删除（物理删除）
 */
@Injectable()
export class InvitationAdminService {
  constructor(private readonly dataSource: DataSource) {}

  /** 分页列表 */
  async getList(params: AdminInvitationQueryParams): Promise<AdminInvitationListResult> {
    const { page, pageSize, keyword, status, familyId } = params;
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const values: QueryValues = [];

    if (status !== undefined) {
      where.push('i.`status` = ?');
      values.push(status);
    }
    if (familyId !== undefined) {
      where.push('i.`family_id` = ?');
      values.push(familyId);
    }
    if (keyword) {
      where.push('(i.`invite_code` LIKE ? OR f.`name` LIKE ? OR inviter.`nickname` LIKE ? OR invitee.`nickname` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const joinClause = `
      FROM \`family_invitation\` i
      LEFT JOIN \`family\` f ON f.\`id\` = i.\`family_id\`
      LEFT JOIN \`user\` inviter ON inviter.\`id\` = i.\`inviter_user_id\`
      LEFT JOIN \`user\` invitee ON invitee.\`id\` = i.\`invitee_user_id\``;

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total ${joinClause} ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT i.\`id\`, i.\`family_id\`, f.\`name\` AS family_name, i.\`inviter_user_id\`,
              inviter.\`nickname\` AS inviter_nickname, i.\`invitee_user_id\`, invitee.\`nickname\` AS invitee_nickname,
              i.\`invitee_phone\`, i.\`invitee_email\`, i.\`invite_code\`, i.\`invite_link\`, i.\`channel\`,
              i.\`poster_url\`, i.\`share_count\`, i.\`joined_count\`, i.\`role\`,
              i.\`status\`, i.\`expires_at\`, i.\`accepted_at\`, i.\`rejected_at\`, i.\`remark\`, i.\`create_time\`
       ${joinClause} ${whereClause}
       ORDER BY i.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((r) => this.toItem(r)),
      total,
      page,
      pageSize
    };
  }

  /** 删除（物理删除） */
  async delete(id: number) {
    const result = await this.dataSource.query<{ affectedRows?: number } | { affectedRows?: number }[]>(
      'DELETE FROM `family_invitation` WHERE `id` = ?',
      [id]
    );
    // TypeORM query 对 DELETE 返回 OkPacket 对象（mysql2 driver 可能包装为数组），兼容两种形态
    const affected = Array.isArray(result)
      ? Number(result[0]?.affectedRows ?? 0)
      : Number(result?.affectedRows ?? 0);
    if (affected === 0) {
      throw new HttpException('邀请记录不存在或已删除', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  /** 行记录 → 对外条目 */
  private toItem(r: Record<string, unknown>): AdminInvitationItem {
    const str = (v: unknown) => (v == null ? '' : String(v));
    return {
      id: Number(r.id),
      familyId: Number(r.family_id),
      familyName: str(r.family_name),
      inviterUserId: str(r.inviter_user_id),
      inviterNickname: str(r.inviter_nickname),
      inviteeUserId: r.invitee_user_id == null ? null : str(r.invitee_user_id),
      inviteeNickname: str(r.invitee_nickname),
      inviteePhone: str(r.invitee_phone),
      inviteeEmail: str(r.invitee_email),
      inviteCode: str(r.invite_code),
      inviteLink: str(r.invite_link),
      channel: str(r.channel) || 'link',
      posterUrl: str(r.poster_url),
      shareCount: Number(r.share_count ?? 0),
      joinedCount: Number(r.joined_count ?? 0),
      role: str(r.role) || 'member',
      status: Number(r.status),
      expiresAt: str(r.expires_at),
      acceptedAt: r.accepted_at == null ? null : str(r.accepted_at),
      rejectedAt: r.rejected_at == null ? null : str(r.rejected_at),
      remark: str(r.remark),
      createTime: str(r.create_time)
    };
  }
}
