import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  type InvitationRow,
  type CreateInvitationData,
  type InvitationView,
  type InvitationQueryParams,
  type ProcessInvitationData,
  type InvitationJoinInfo,
  type FamilyRole
} from './types/invitation.types';
import { type QueryValues, type PaginationResult } from '../common/types/common';
import { UPLOAD_DIR } from '../common/upload/upload.service';

/** 邀请码字符表（去除易混淆字符 0/O/1/I） */
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 邀请状态文本 */
const STATUS_TEXT_MAP: Record<number, string> = {
  0: '已失效',
  1: '待接受',
  2: '已接受',
  3: '已拒绝',
  4: '已过期'
};

@Injectable()
export class InvitationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService
  ) {}

  /** 微信 access_token 内存缓存（提前 5 分钟过期） */
  private wxTokenCache: { token: string; expireAt: number } | null = null;

  // ==================== 邀请生成 ====================

  /**
   * 生成家族邀请
   * - 家族创建者/admin 可生成无限邀请
   * - 普通 member 有数量限制（默认每月 5 个待处理邀请）
   * - 支持 link/sms/email/wechat/qrcode 渠道标记
   */
  async createInvitation(userId: string, data: CreateInvitationData): Promise<InvitationView> {
    const familyId = Number(data.familyId) || 0;
    if (!familyId) {
      throw new HttpException('家族ID不能为空', HttpStatus.BAD_REQUEST);
    }

    const [family] = await this.dataSource.query<{ id: number; name: string; creator_user_id: string }[]>(
      'SELECT `id`, `name`, `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    if (!family) {
      throw new HttpException('家族不存在或已停用', HttpStatus.NOT_FOUND);
    }

    const familyRole = await this.getFamilyRole(userId, familyId);
    if (familyRole === 'none') {
      throw new HttpException('您不是该家族成员，无法发起邀请', HttpStatus.FORBIDDEN);
    }

    // 普通会员限制：同时存在的待处理邀请数不超过 5
    if (familyRole === 'member') {
      const [pendingCount] = await this.dataSource.query<{ cnt: number }[]>(
        'SELECT COUNT(*) AS cnt FROM `family_invitation` WHERE `family_id` = ? AND `inviter_user_id` = ? AND `status` = 1',
        [familyId, userId]
      );
      if ((pendingCount?.cnt ?? 0) >= 5) {
        throw new HttpException('您已有 5 个待处理邀请，请先等待处理或撤销后再创建', HttpStatus.FORBIDDEN);
      }
    }

    const role = data.role === 'admin' ? 'admin' : 'member';
    // 仅家族创建者或 admin 可邀请 admin
    if (role === 'admin' && familyRole !== 'creator' && familyRole !== 'admin') {
      throw new HttpException('仅家族管理员可邀请管理员角色', HttpStatus.FORBIDDEN);
    }

    const expireDays = Math.min(Math.max(Number(data.expireDays) || 7, 1), 30);
    const expiresAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);
    const inviteCode = await this.generateUniqueInviteCode();
    const inviteLink = `/pages/invite-accept/invite-accept?code=${inviteCode}`;
    const channel = ['link', 'sms', 'email', 'wechat', 'qrcode', 'poster'].includes(data.channel)
      ? data.channel
      : 'link';

    const result = await this.dataSource.query<{ insertId: number }>(
      `INSERT INTO \`family_invitation\`
        (\`family_id\`, \`inviter_user_id\`, \`invitee_phone\`, \`invitee_email\`, \`invite_code\`, \`invite_link\`, \`channel\`, \`role\`, \`status\`, \`expires_at\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        familyId,
        userId,
        String(data.inviteePhone || '').trim() || null,
        String(data.inviteeEmail || '').trim().toLowerCase() || null,
        inviteCode,
        inviteLink,
        channel,
        role,
        expiresAt
      ] as QueryValues
    );

    return this.getInvitationById(Number(result?.insertId) || 0);
  }

  // ==================== 邀请查询 ====================

  /** 我发出的邀请列表 */
  async getMySentInvitations(
    userId: string,
    params: InvitationQueryParams
  ): Promise<PaginationResult<InvitationView>> {
    return this.queryInvitations({ ...params, inviterUserId: userId });
  }

  /** 我收到的邀请列表 */
  async getMyReceivedInvitations(
    userId: string,
    params: InvitationQueryParams
  ): Promise<PaginationResult<InvitationView>> {
    return this.queryInvitations({ ...params, inviteeUserId: userId });
  }

  /** 某个家族的全部邀请（管理端/家族管理员用） */
  async getFamilyInvitations(
    operatorUserId: string,
    params: InvitationQueryParams
  ): Promise<PaginationResult<InvitationView>> {
    const familyId = Number(params.familyId) || 0;
    if (!familyId) {
      throw new HttpException('家族ID不能为空', HttpStatus.BAD_REQUEST);
    }
    const role = await this.getFamilyRole(operatorUserId, familyId);
    if (role !== 'creator' && role !== 'admin') {
      throw new HttpException('仅家族创建者或管理员可查看全部邀请', HttpStatus.FORBIDDEN);
    }
    return this.queryInvitations({ ...params, familyId });
  }

  /** 通过邀请码查询邀请信息（供被邀请人查看） */
  async getInvitationByCode(inviteCode: string): Promise<InvitationJoinInfo> {
    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code) {
      throw new HttpException('邀请码不能为空', HttpStatus.BAD_REQUEST);
    }
    const row = await this.findValidInvitation(code);
    if (!row) {
      throw new HttpException('邀请码无效或已过期', HttpStatus.NOT_FOUND);
    }
    return this.buildJoinInfo(row, await this.ensureQrCode(row));
  }

  /**
   * 记录一次分享（分享海报/链接/扫码分享）
   * 用于"分享记录"跟踪：分享次数 +1
   */
  async recordShare(inviteCode: string): Promise<{ shareCount: number }> {
    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code) {
      throw new HttpException('邀请码不能为空', HttpStatus.BAD_REQUEST);
    }
    const result = await this.dataSource.query<{ affectedRows?: number }[]>(
      'UPDATE `family_invitation` SET `share_count` = `share_count` + 1 WHERE `invite_code` = ? AND `status` = 1',
      [code] as QueryValues
    );
    const affected = Array.isArray(result)
      ? Number(result[0]?.affectedRows ?? 0)
      : Number((result as unknown as { affectedRows?: number })?.affectedRows ?? 0);
    if (affected === 0) {
      throw new HttpException('邀请码无效或已失效', HttpStatus.NOT_FOUND);
    }
    const [row] = await this.dataSource.query<{ share_count: number }[]>(
      'SELECT `share_count` FROM `family_invitation` WHERE `invite_code` = ? LIMIT 1',
      [code] as QueryValues
    );
    return { shareCount: Number(row?.share_count ?? 0) };
  }

  // ==================== 邀请处理 ====================

  /**
   * 处理邀请：接受/拒绝
   * - 被邀请人必须是登录用户（通过 token 确定）
   * - 接受后：将当前用户加入该家族，并标记邀请为已接受
   */
  async processInvitation(userId: string, data: ProcessInvitationData): Promise<InvitationView> {
    const code = String(data.inviteCode || '').trim().toUpperCase();
    if (!code) {
      throw new HttpException('邀请码不能为空', HttpStatus.BAD_REQUEST);
    }

    const row = await this.findValidInvitation(code);
    if (!row) {
      throw new HttpException('邀请码无效或已过期', HttpStatus.NOT_FOUND);
    }

    // 不能处理自己的邀请
    if (row.inviter_user_id === userId) {
      throw new HttpException('不能处理自己发出的邀请', HttpStatus.FORBIDDEN);
    }

    // 如果邀请已指定 invitee_user_id，则只有该用户可处理
    if (row.invitee_user_id && row.invitee_user_id !== userId) {
      throw new HttpException('该邀请指定了其他被邀请人', HttpStatus.FORBIDDEN);
    }

    const accept = Boolean(data.accept);
    const now = new Date();

    if (accept) {
      // 接受：加入家族
      await this.acceptInvitation(row, userId, now);
    } else {
      // 拒绝
      await this.dataSource.query(
        `UPDATE \`family_invitation\`
         SET \`status\` = 3, \`rejected_at\` = ?, \`processed_by\` = ?, \`remark\` = ?
         WHERE \`id\` = ? AND \`status\` = 1`,
        [now, userId, String(data.remark || '').trim().slice(0, 200), row.id] as QueryValues
      );
    }

    return this.getInvitationById(row.id);
  }

  /** 撤销我发出的邀请（仅限待处理状态） */
  async revokeInvitation(userId: string, invitationId: number): Promise<InvitationView> {
    if (!invitationId) {
      throw new HttpException('邀请ID不能为空', HttpStatus.BAD_REQUEST);
    }
    const [row] = await this.dataSource.query<InvitationRow[]>(
      'SELECT * FROM `family_invitation` WHERE `id` = ? LIMIT 1',
      [invitationId]
    );
    if (!row) {
      throw new HttpException('邀请不存在', HttpStatus.NOT_FOUND);
    }
    if (row.inviter_user_id !== userId) {
      // 家族创建者/admin 也可撤销家族内任意邀请
      const role = await this.getFamilyRole(userId, row.family_id);
      if (role !== 'creator' && role !== 'admin') {
        throw new HttpException('只能撤销自己发出的邀请', HttpStatus.FORBIDDEN);
      }
    }
    if (row.status !== 1) {
      throw new HttpException('只能撤销待处理状态的邀请', HttpStatus.BAD_REQUEST);
    }
    await this.dataSource.query(
      'UPDATE `family_invitation` SET `status` = 0, `remark` = ? WHERE `id` = ?',
      ['邀请人已撤销', row.id] as QueryValues
    );
    return this.getInvitationById(row.id);
  }

  // ==================== 内部方法 ====================

  /** 判断用户在家族中的角色 */
  private async getFamilyRole(userId: string, familyId: number): Promise<FamilyRole | 'none'> {
    const [family] = await this.dataSource.query<{ creator_user_id: string }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    if (!family) return 'none';
    if (family.creator_user_id === userId) return 'creator';

    const [user] = await this.dataSource.query<{ family_id: number | null; family_role: string }[]>(
      'SELECT `family_id`, `family_role` FROM `user` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [userId]
    );
    if (!user || Number(user.family_id) !== familyId) return 'none';
    if (user.family_role === 'admin') return 'admin';
    return 'member';
  }

  /** 查询单条邀请详情 */
  private async getInvitationById(id: number): Promise<InvitationView> {
    const rows = await this.queryInvitationRows({ id });
    if (!rows.length) {
      throw new HttpException('邀请不存在', HttpStatus.NOT_FOUND);
    }
    return rows[0];
  }

  /** 查询邀请列表（内部通用） */
  private async queryInvitations(
    params: InvitationQueryParams & {
      inviterUserId?: string;
      inviteeUserId?: string;
      familyId?: number;
      id?: number;
    }
  ): Promise<PaginationResult<InvitationView>> {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const where: string[] = ['1=1'];
    const values: QueryValues = [];

    if (params.id) {
      where.push('i.`id` = ?');
      values.push(params.id);
    }
    if (params.familyId) {
      where.push('i.`family_id` = ?');
      values.push(params.familyId);
    }
    if (params.inviterUserId) {
      where.push('i.`inviter_user_id` = ?');
      values.push(params.inviterUserId);
    }
    if (params.inviteeUserId) {
      where.push('(i.`invitee_user_id` = ? OR (i.`invitee_user_id` IS NULL AND i.`status` = 1))');
      values.push(params.inviteeUserId);
    }
    if (params.status !== undefined && params.status !== null) {
      where.push('i.`status` = ?');
      values.push(params.status);
    }
    if (params.keyword) {
      where.push('(u.`nickname` LIKE ? OR i.`invitee_phone` LIKE ? OR i.`invitee_email` LIKE ?)');
      const like = `%${params.keyword}%`;
      values.push(like, like, like);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`family_invitation\` i
       LEFT JOIN \`user\` u ON u.\`id\` = i.\`inviter_user_id\`
       ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const rows = await this.dataSource.query<InvitationRow[]>(
      `SELECT i.*, u.\`nickname\` AS inviter_nickname, u.\`avatar_url\` AS inviter_avatar_url
       FROM \`family_invitation\` i
       LEFT JOIN \`user\` u ON u.\`id\` = i.\`inviter_user_id\`
       ${whereClause}
       ORDER BY i.\`create_time\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset] as QueryValues
    );

    return {
      list: rows.map((r) => this.toView(r)),
      total,
      page,
      pageSize
    };
  }

  private async queryInvitationRows(
    params: InvitationQueryParams & {
      inviterUserId?: string;
      inviteeUserId?: string;
      familyId?: number;
      id?: number;
    }
  ): Promise<InvitationView[]> {
    const result = await this.queryInvitations({ ...params, pageSize: 1 });
    return result.list;
  }

  /** 查找有效邀请（待处理且未过期） */
  private async findValidInvitation(
    code: string
  ): Promise<(InvitationRow & { family_name?: string; family_logo?: string; inviter_nickname?: string; inviter_avatar_url?: string }) | null> {
    const [row] = await this.dataSource.query<InvitationRow[]>(
      `SELECT i.*, u.\`nickname\` AS inviter_nickname, u.\`avatar_url\` AS inviter_avatar_url,
              f.\`name\` AS family_name, f.\`logo\` AS family_logo
       FROM \`family_invitation\` i
       JOIN \`family\` f ON f.\`id\` = i.\`family_id\`
       LEFT JOIN \`user\` u ON u.\`id\` = i.\`inviter_user_id\`
       WHERE i.\`invite_code\` = ? AND i.\`status\` = 1 AND i.\`expires_at\` > NOW()
       LIMIT 1`,
      [code] as QueryValues
    );
    if (!row) return null;
    return row;
  }

  /** 接受邀请并加入家族 */
  private async acceptInvitation(row: InvitationRow, userId: string, now: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 幂等加入家族：如果用户已加入其他家族，允许切换
      const [user] = await manager.query<{ family_id: number | null; share_code: string | null }[]>(
        'SELECT `family_id`, `share_code` FROM `user` WHERE `id` = ? AND `status` = 1 FOR UPDATE',
        [userId]
      );
      if (!user) {
        throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
      }

      const shareCode = user.share_code || (await this.generateUniqueInviteCode());
      const familyRole = row.role === 'admin' ? 'admin' : 'member';

      // 切换家族时清空旧成员绑定,避免指向其他家族的 member_id 残留
      await manager.query(
        'UPDATE `user` SET `family_id` = ?, `member_id` = ?, `share_code` = ?, `family_role` = ? WHERE `id` = ?',
        [row.family_id, '', shareCode, familyRole, userId] as QueryValues
      );

      await manager.query(
        `UPDATE \`family_invitation\`
         SET \`status\` = 2, \`accepted_at\` = ?, \`processed_by\` = ?, \`invitee_user_id\` = ?, \`joined_count\` = \`joined_count\` + 1
         WHERE \`id\` = ? AND \`status\` = 1`,
        [now, userId, userId, row.id] as QueryValues
      );
    });
  }

  /** 构建被邀请人看到的加入信息 */
  private buildJoinInfo(
    row: InvitationRow & { family_name?: string; family_logo?: string; inviter_nickname?: string; inviter_avatar_url?: string },
    qrCodeUrl = ''
  ): InvitationJoinInfo {
    return {
      familyId: row.family_id,
      familyName: String(row.family_name || ''),
      familyLogo: String(row.family_logo || ''),
      inviterNickname: String(row.inviter_nickname || ''),
      inviterAvatarUrl: String(row.inviter_avatar_url || ''),
      role: row.role,
      expiresAt: this.formatTime(row.expires_at),
      qrCodeUrl,
      shareCount: Number(row.share_count ?? 0),
      joinedCount: Number(row.joined_count ?? 0)
    };
  }

  /** 视图转换 */
  private toView(row: InvitationRow & { inviter_nickname?: string; inviter_avatar_url?: string }): InvitationView {
    return {
      id: row.id,
      familyId: row.family_id,
      inviterUserId: row.inviter_user_id,
      inviterNickname: row.inviter_nickname || '',
      inviterAvatarUrl: row.inviter_avatar_url || '',
      inviteeUserId: row.invitee_user_id || undefined,
      inviteePhone: row.invitee_phone || undefined,
      inviteeEmail: row.invitee_email || undefined,
      inviteCode: row.invite_code,
      inviteLink: row.invite_link,
      channel: row.channel || 'link',
      posterUrl: row.poster_url || undefined,
      shareCount: Number(row.share_count ?? 0),
      joinedCount: Number(row.joined_count ?? 0),
      role: row.role,
      status: row.status,
      statusText: STATUS_TEXT_MAP[row.status] || '未知',
      expiresAt: this.formatTime(row.expires_at),
      acceptedAt: row.accepted_at ? this.formatTime(row.accepted_at) : undefined,
      rejectedAt: row.rejected_at ? this.formatTime(row.rejected_at) : undefined,
      remark: row.remark || undefined,
      createTime: this.formatTime(row.create_time)
    };
  }

  private formatTime(v: Date | string | null): string {
    if (!v) return '';
    const d = typeof v === 'string' ? new Date(v) : v;
    if (isNaN(d.getTime())) return String(v);
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** 生成全局唯一邀请码 */
  private async generateUniqueInviteCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const chars: string[] = [];
      for (let j = 0; j < 8; j++) {
        chars.push(INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]);
      }
      const code = chars.join('');
      const [dup] = await this.dataSource.query<Pick<InvitationRow, 'id'>[]>(
        'SELECT `id` FROM `family_invitation` WHERE `invite_code` = ? LIMIT 1',
        [code] as QueryValues
      );
      if (!dup) return code;
    }
    throw new HttpException('邀请码生成失败，请重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  // ==================== 分享海报/小程序码 ====================

  /**
   * 生成/复用邀请对应的小程序码图片（供海报绘制）。
   * - 微信凭证(WX_APPID/WX_SECRET)未配置时返回空串，前端海报以邀请码替代
   * - 生成成功后保存到 uploads/poster/{code}.png 并缓存 poster_url
   */
  private async ensureQrCode(row: InvitationRow): Promise<string> {
    if (row.poster_url) return row.poster_url;

    const appId = this.configService.get<string>('WX_APPID');
    const secret = this.configService.get<string>('WX_SECRET');
    if (!appId || !secret) return '';

    try {
      const accessToken = await this.getWxAccessToken(appId, secret);
      const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: `code=${row.invite_code}`,
          page: 'pages/invite-accept/invite-accept',
          width: 430,
          check_path: false
        })
      });
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const err = (await resp.json()) as { errcode?: number; errmsg?: string };
        throw new HttpException(`小程序码生成失败: ${err.errmsg || err.errcode || '未知错误'}`, HttpStatus.BAD_GATEWAY);
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      const dir = join(UPLOAD_DIR, 'poster');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const filename = `${row.invite_code}.png`;
      writeFileSync(join(dir, filename), buf);

      const posterUrl = `/uploads/poster/${filename}`;
      await this.dataSource.query(
        'UPDATE `family_invitation` SET `poster_url` = ? WHERE `id` = ?',
        [posterUrl, row.id] as QueryValues
      );
      return posterUrl;
    } catch (e) {
      // 小程序码生成失败不影响主流程：前端海报用邀请码替代
      console.error('生成小程序码失败:', e);
      return '';
    }
  }

  /** 获取微信全局 access_token（内存缓存，提前 5 分钟过期） */
  private async getWxAccessToken(appId: string, secret: string): Promise<string> {
    const now = Date.now();
    if (this.wxTokenCache && this.wxTokenCache.expireAt > now) {
      return this.wxTokenCache.token;
    }
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`;
    const resp = await fetch(url);
    const data = (await resp.json()) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
    if (!data.access_token) {
      throw new HttpException(`获取微信 access_token 失败: ${data.errmsg || data.errcode || '未知错误'}`, HttpStatus.BAD_GATEWAY);
    }
    const expireAt = Date.now() + (Math.max(Number(data.expires_in || 7200), 60) - 300) * 1000;
    this.wxTokenCache = { token: data.access_token, expireAt };
    return data.access_token;
  }
}
