import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { type UserRow, type UserInfo, type UserLoginResult, type UserAuthIdentityRow } from './types/user.types';
import { type FamilyRow } from '../family/types/family.types';
import { SmsService } from './sms.service';
import { EntitlementService } from '../membership/membership.service';
import { Capability } from '../membership/types/membership.types';
import { MemberService } from '../member/member.service';
import { MaskingService } from '../common/masking/masking.service';
import { type WxSessionResponse, type QueryValues, type DataRow, type SuccessResult } from '../common/types/common';
import { getSafeMemberTableName } from '../common/utils/family-member-table';

/** 将 unknown 值安全转换为字符串（null/undefined → ''，字符串原样返回，其余 JSON 序列化） */
function toStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
}

@Injectable()
export class UserService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
    private readonly entitlementService: EntitlementService,
    private readonly memberService: MemberService,
    private readonly maskingService: MaskingService
  ) {}

  /**
   * 用户手机号密码登录(公开接口)
   * 前期用于租户后台/PC 端快速验证流程逻辑
   */
  async pwdLogin(phone: string, password: string): Promise<UserLoginResult> {
    const normalized = this.normalizePhone(phone);

    if (!password || String(password).length < 6) {
      throw new HttpException('密码长度不能小于 6 位', HttpStatus.BAD_REQUEST);
    }

    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `phone`, `password`, `family_id`, `member_id`, `share_code`, `status` FROM `user` WHERE `phone` = ? LIMIT 1',
      [normalized] as QueryValues
    );

    if (!user) {
      throw new HttpException('手机号或密码错误', HttpStatus.UNAUTHORIZED);
    }

    if (user.status !== 1) {
      throw new HttpException('账号已被禁用', HttpStatus.FORBIDDEN);
    }

    if (!user.password) {
      throw new HttpException('该账号未设置密码，请使用验证码登录', HttpStatus.BAD_REQUEST);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new HttpException('手机号或密码错误', HttpStatus.UNAUTHORIZED);
    }

    return this.issueUserToken(user);
  }

  /**
   * 设置/修改登录密码(需已登录)
   */
  async setPassword(userId: string, password: string): Promise<SuccessResult> {
    if (!password || String(password).length < 6) {
      throw new HttpException('密码长度不能小于 6 位', HttpStatus.BAD_REQUEST);
    }

    const hashed = await bcrypt.hash(password, 10);
    await this.dataSource.query('UPDATE `user` SET `password` = ? WHERE `id` = ?', [hashed, userId] as QueryValues);
    return { success: true };
  }

  /**
   * 刷新用户 token
   */
  async refreshToken(refreshToken: string): Promise<UserLoginResult> {
    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new HttpException('refreshToken 无效或已过期', HttpStatus.UNAUTHORIZED);
    }

    if (payload.type !== 'user') {
      throw new HttpException('非用户令牌', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.findUserById(payload.sub);
    if (!user || user.status !== 1) {
      throw new HttpException('用户不存在或已禁用', HttpStatus.UNAUTHORIZED);
    }

    return this.issueUserToken(user);
  }

  /**
   * 微信小程序登录
   * 1. 用前端传来的 wx.login code 调用微信 jscode2session 换取 openid/unionid
   * 2. 通过 user_auth_identity 绑定表解析账户（多端账号统一）：
   *    a. 按 (provider=wechat, provider_uid=openid) 查绑定 → 命中即登录
   *    b. 未命中且返回了 unionid → 按同 unionid 的其他微信绑定反查账户并自动合并绑定
   *    c. 仍未命中 → 兼容存量 user.openid 数据（迁移前/历史脏数据），命中则补建绑定
   *    d. 全新用户 → 创建账户 + 绑定
   * 3. 签发 type=user 的 JWT 返回
   * 开发环境(WX_APPID/WX_SECRET 未配置)使用 code 模拟 openid,便于本地调试
   */
  async wxLogin(code: string): Promise<UserLoginResult> {
    if (!code) {
      throw new HttpException('code 不能为空', HttpStatus.BAD_REQUEST);
    }

    const appId = this.configService.get<string>('WX_APPID');
    const secret = this.configService.get<string>('WX_SECRET');

    let openid: string;
    let unionid: string;

    if (appId && secret) {
      // 生产环境:调用微信 API
      const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
      const resp = await fetch(wxUrl);
      const data = (await resp.json()) as WxSessionResponse;
      if (data.errcode) {
        throw new HttpException(`微信登录失败: ${data.errmsg}`, HttpStatus.UNAUTHORIZED);
      }
      openid = data.openid ?? '';
      if (!openid) {
        throw new HttpException('微信登录失败: 未获取到 openid', HttpStatus.UNAUTHORIZED);
      }
      unionid = data.unionid || '';
    } else {
      // 开发环境:用 code 生成模拟 openid,保证同一 code 得到同一 openid
      openid = 'dev_' + code;
      unionid = '';
    }

    const user = await this.findOrCreateUserByWechat(openid, unionid);
    if (user.status !== 1) {
      throw new HttpException('账号已被禁用', HttpStatus.FORBIDDEN);
    }
    return this.issueUserToken(user);
  }

  /** 按微信 openid/unionid 解析账户：查绑定 → unionid 合并 → 存量兜底 → 新建 */
  private async findOrCreateUserByWechat(openid: string, unionid: string) {
    // a. 按 openid 查绑定
    const binding = await this.findBinding('wechat', openid);
    if (binding) {
      const user = await this.findUserById(binding.user_id);
      if (user) return user;
    }

    // b. unionid 自动合并：同 unionid 已有微信绑定 → 复用其账户并补建 openid 绑定
    if (unionid) {
      const unionBinding = await this.findBindingByUnionid(unionid);
      if (unionBinding) {
        const user = await this.findUserById(unionBinding.user_id);
        if (user) {
          await this.bindIdentity(user.id, 'wechat', openid, unionid);
          return user;
        }
      }
    }

    // c. 存量兜底：迁移未执行或历史数据仍以 user.openid 为准
    const [legacy] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `phone`, `family_id`, `member_id`, `share_code`, `status` FROM `user` WHERE `openid` = ? LIMIT 1',
      [openid] as QueryValues
    );
    if (legacy) {
      await this.bindIdentity(legacy.id, 'wechat', openid, unionid);
      return legacy;
    }

    // d. 全新用户：创建账户（openid/unionid 双写，微信支付 JSAPI 依赖 user.openid）
    const id = randomBytes(16).toString('hex');
    await this.dataSource.query(
      'INSERT INTO `user` (`id`, `nickname`, `openid`, `unionid`, `status`) VALUES (?, ?, ?, ?, 1)',
      [id, '微信用户', openid, unionid] as QueryValues
    );
    await this.bindIdentity(id, 'wechat', openid, unionid);
    const user = await this.findUserById(id);
    if (!user) {
      throw new HttpException('用户创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return user;
  }

  /**
   * 手机号验证码登录
   * 1. 校验验证码（一次性消费）
   * 2. 按 (provider=phone, provider_uid=手机号) 解析账户；无则自动注册
   */
  async phoneLogin(phone: string, code: string): Promise<UserLoginResult> {
    const normalized = this.normalizePhone(phone);
    await this.smsService.verifyCode(normalized, 'login', code);

    let user = await this.findUserByBinding('phone', normalized);
    if (!user) {
      const id = randomBytes(16).toString('hex');
      await this.dataSource.query(
        'INSERT INTO `user` (`id`, `nickname`, `phone`, `status`) VALUES (?, ?, ?, 1)',
        [id, this.maskPhone(normalized), normalized] as QueryValues
      );
      await this.bindIdentity(id, 'phone', normalized, '');
      user = await this.findUserById(id);
    }

    if (!user) {
      throw new HttpException('用户创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (user.status !== 1) {
      throw new HttpException('账号已被禁用', HttpStatus.FORBIDDEN);
    }
    // 手机号命中 CRM 会员档案 → 自动绑定（幂等）
    await this.memberService.bindByPhone(user.id, normalized);
    return this.issueUserToken(user);
  }

  /** 已登录用户绑定手机号（作为跨端统一锚点） */
  async bindPhone(userId: string, phone: string, code: string): Promise<UserLoginResult['userInfo']> {
    const normalized = this.normalizePhone(phone);
    await this.smsService.verifyCode(normalized, 'bind', code);

    const owner = await this.findUserByBinding('phone', normalized);
    if (owner && owner.id !== userId) {
      throw new HttpException('该手机号已绑定其他账号', HttpStatus.CONFLICT);
    }
    if (owner) {
      // 已绑定到当前账号，幂等返回
      return this.getProfile(userId);
    }

    await this.bindIdentity(userId, 'phone', normalized, '');
    await this.dataSource.query('UPDATE `user` SET `phone` = ? WHERE `id` = ?', [normalized, userId] as QueryValues);
    // 绑定手机号后按号自动匹配 CRM 会员（幂等）
    await this.memberService.bindByPhone(userId, normalized);
    return this.getProfile(userId);
  }

  /** 发送短信验证码（login/bind 场景） */
  async sendSmsCode(phone: string, scene: 'login' | 'bind'): Promise<{ success: boolean; devCode?: string }> {
    const normalized = this.normalizePhone(phone);
    const devCode = await this.smsService.sendCode(normalized, scene);
    return { success: true, ...(devCode ? { devCode } : {}) };
  }

  // ---------- 多端账号统一辅助方法 ----------

  /** 手机号校验（当前支持中国大陆 11 位手机号） */
  private normalizePhone(phone: string): string {
    const normalized = String(phone ?? '').trim();
    if (!/^1[3-9]\d{9}$/.test(normalized)) {
      throw new HttpException('手机号格式不正确', HttpStatus.BAD_REQUEST);
    }
    return normalized;
  }

  /** 手机号脱敏昵称：138****1234 */
  private maskPhone(phone: string): string {
    return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }

  /** 按 (provider, provider_uid) 查绑定 */
  private async findBinding(provider: string, providerUid: string) {
    const [row] = await this.dataSource.query<UserAuthIdentityRow[]>(
      'SELECT * FROM `user_auth_identity` WHERE `provider` = ? AND `provider_uid` = ? AND `status` = 1 LIMIT 1',
      [provider, providerUid] as QueryValues
    );
    return row;
  }

  /** 按微信 unionid 查绑定（跨 appid 合并锚点） */
  private async findBindingByUnionid(unionid: string) {
    const [row] = await this.dataSource.query<UserAuthIdentityRow[]>(
      'SELECT * FROM `user_auth_identity` WHERE `provider` = ? AND `unionid` = ? AND `unionid` <> \'\' AND `status` = 1 LIMIT 1',
      ['wechat', unionid] as QueryValues
    );
    return row;
  }

  /** 按绑定关系取用户 */
  private async findUserByBinding(provider: string, providerUid: string) {
    const binding = await this.findBinding(provider, providerUid);
    if (!binding) return undefined;
    return this.findUserById(binding.user_id);
  }

  /** 按 ID 查用户 */
  private async findUserById(userId: string) {
    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `phone`, `password`, `family_id`, `member_id`, `share_code`, `status` FROM `user` WHERE `id` = ? LIMIT 1',
      [userId] as QueryValues
    );
    return user;
  }

  /** 新增绑定（并发冲突时回查，保证幂等） */
  private async bindIdentity(userId: string, provider: string, providerUid: string, unionid: string) {
    try {
      await this.dataSource.query(
        'INSERT INTO `user_auth_identity` (`user_id`, `provider`, `provider_uid`, `unionid`) VALUES (?, ?, ?, ?)',
        [userId, provider, providerUid, unionid] as QueryValues
      );
    } catch (e: any) {
      // 唯一键冲突：说明并发下已存在绑定，忽略（绑定关系由先到者确立）
      if (e?.code !== 'ER_DUP_ENTRY') throw e;
      const existing = await this.findBinding(provider, providerUid);
      if (existing && existing.user_id !== userId) {
        throw new HttpException('该凭证已绑定其他账号', HttpStatus.CONFLICT);
      }
    }
  }

  /** 签发用户 JWT（含 refreshToken） */
  private issueUserToken(user: UserRow): UserLoginResult {
    const payload = { sub: user.id, type: 'user' };
    const token = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });
    return {
      token,
      refreshToken,
      // 登录响应为本人上下文：手机号原样返回（本人查看不脱敏）
      userInfo: this.maskUserPhone(user.id, user)
    };
  }

  /** 行记录 → 对外用户信息（含家族关联字段） */
  private toUserInfo(user: UserRow): UserInfo {
    return {
      id: user.id,
      nickName: user.nickname,
      avatarUrl: user.avatar_url,
      gender: user.gender,
      phone: user.phone || undefined,
      familyId: user.family_id ?? null,
      memberId: user.member_id || '',
      shareCode: user.share_code || null
    };
  }

  /**
   * 出参脱敏：个人资料/登录结果中的手机号对他人不可见时掩码（138****5678）
   * @param viewerUserId 当前查看者；为空（登录前/系统上下文）一律掩码
   */
  private maskUserPhone(viewerUserId: string | null, user: UserRow): UserInfo {
    const info = this.toUserInfo(user);
    if (user.phone) {
      info.phone = viewerUserId
        ? this.maskingService.phoneForViewer(viewerUserId, user.id, user.phone)
        : this.maskingService.phone(user.phone);
    }
    return info;
  }

  /** 获取当前用户信息 */
  async getProfile(userId: string): Promise<UserInfo> {
    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `phone`, `family_id`, `member_id`, `share_code`, `status` FROM `user` WHERE `id` = ?',
      [userId] as QueryValues
    );
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }
    // 本人查看：手机号不脱敏
    return this.maskUserPhone(userId, user);
  }

  /** 获取用户家族绑定信息（供权限判断，仅需 family_id/member_id） */
  async getUserFamilyBinding(userId: string): Promise<{ familyId: number | null; memberId: string }> {
    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `family_id`, `member_id` FROM `user` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [userId] as QueryValues
    );
    return { familyId: user?.family_id ?? null, memberId: user?.member_id || '' };
  }

  // ==================== 家族关联（支系归属/成员绑定/分享码） ====================

  /**
   * 获取我的家族关联信息：
   * - 关联的家族支系（仅启用中，已删除返回 null）
   * - 绑定的家族成员（仅启用中，已删除返回 null）
   * - 我的分享码（供他人加入我的家族）
   * 登录后调用，用于"自动检测并进入已关联的家族支系"。
   */
  async getMyFamily(userId: string) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }

    let family = null;
    let member = null;
    if (user.family_id) {
      family = await this.getFamilyBrief(user.family_id);
      if (family && user.member_id) {
        member = await this.getMemberBrief(user.family_id, user.member_id);
      }
    }

    return {
      familyId: user.family_id ?? null,
      family,
      memberId: user.member_id || '',
      member,
      shareCode: user.share_code || null
    };
  }

  /**
   * 加入家族支系（仅允许通过有效的分享码加入）：
   * - 家族种子分享码（family.seed_share_code）：创建家族时自动生成，指向该家族本身
   * - 会员分享码（user.share_code）：指向该会员当前所属家族
   * - 可选 memberId：加入时同步绑定指定家族成员
   * - 校验：家族必须存在且启用；memberId 必须属于目标家族。
   * 已入其他家族时允许切换（重新关联），分享码沿用。
   */
  async joinFamily(
    userId: string,
    params: { shareCode: string; memberId?: string }
  ) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }

    const shareCode = String(params.shareCode || '').trim().toUpperCase();
    if (!shareCode) {
      throw new HttpException('请提供分享码', HttpStatus.BAD_REQUEST);
    }

    // 优先匹配家族种子分享码（家族专属，不可重复）
    let familyId: number | null = null;
    const [familyBySeed] = await this.dataSource.query<Pick<FamilyRow, 'id' | 'status'>[]>(
      'SELECT `id`, `status` FROM `family` WHERE `seed_share_code` = ? AND `status` = 1 LIMIT 1',
      [shareCode] as QueryValues
    );
    if (familyBySeed) {
      familyId = Number(familyBySeed.id);
    } else {
      // 否则匹配会员分享码，定位持有者当前所属家族
      const [owner] = await this.dataSource.query<Pick<UserRow, 'family_id'>[]>(
        'SELECT `family_id` FROM `user` WHERE `share_code` = ? AND `status` = 1 LIMIT 1',
        [shareCode] as QueryValues
      );
      if (!owner || !owner.family_id) {
        throw new HttpException('分享码无效或已失效', HttpStatus.BAD_REQUEST);
      }
      familyId = Number(owner.family_id);
    }

    const [family] = await this.dataSource.query<Pick<FamilyRow, 'id' | 'status'>[]>(
      'SELECT `id`, `status` FROM `family` WHERE `id` = ? LIMIT 1',
      [familyId]
    );
    if (!family || family.status !== 1) {
      throw new HttpException('家族不存在或已停用', HttpStatus.NOT_FOUND);
    }

    const memberId = String(params.memberId || '').trim();
    if (memberId) {
      await this.assertMemberInFamily(familyId, memberId);
    }

    // 同家族重复加入且未指定 memberId 时，保留原绑定，避免清空 member_id
    const isSameFamily = Number(user.family_id) === familyId;
    const finalMemberId = memberId || (isSameFamily ? user.member_id : '');

    // 生成分享码（幂等：已持有则沿用），保证该会员可继续邀请他人
    const code = user.share_code || (await this.generateShareCode());
    await this.dataSource.query(
      'UPDATE `user` SET `family_id` = ?, `member_id` = ?, `share_code` = ? WHERE `id` = ?',
      [familyId, finalMemberId, code, userId] as QueryValues
    );

    return {
      userInfo: this.toUserInfo({ ...user, family_id: familyId, member_id: finalMemberId, share_code: code }),
      family: await this.getFamilyBrief(familyId),
      member: finalMemberId ? await this.getMemberBrief(familyId, finalMemberId) : null,
      shareCode: code
    };
  }

  /**
   * 绑定家族成员：会员账号绑定当前所属家族中的指定成员ID。
   * 绑定后该会员获得编辑此成员信息的权限（不受 VIP 状态限制）。
   * 校验：必须已加入家族；成员必须属于该家族且启用中。
   */
  async bindMember(userId: string, memberId: string): Promise<UserInfo> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }
    const trimmed = String(memberId || '').trim();
    if (!trimmed) {
      throw new HttpException('成员ID不能为空', HttpStatus.BAD_REQUEST);
    }
    if (!user.family_id) {
      throw new HttpException('请先加入家族后再绑定成员', HttpStatus.BAD_REQUEST);
    }
    await this.assertMemberInFamily(user.family_id, trimmed);

    await this.dataSource.query(
      'UPDATE `user` SET `member_id` = ? WHERE `id` = ?',
      [trimmed, userId] as QueryValues
    );
    return this.getProfile(userId);
  }

  /**
   * 家族成员角色列表（用户端，角色管理入口）
   * - 数据源：user.family_id 绑定的用户 + family_permission 表的角色记录
   * - 角色优先级：族长(family.creator_user_id) > 管理员(family_permission.role=admin) > 普通成员
   * - canManage：仅族长可分配/回收角色
   * - 大族优化：列表仅返回「当前登录用户 + 族长 + 管理员」，普通成员不展示；
   *   total 返回全量成员数，供头部统计展示
   */
  async getFamilyRoles(userId: string) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }
    if (!user.family_id) {
      throw new HttpException('请先加入家族', HttpStatus.BAD_REQUEST);
    }
    const familyId = Number(user.family_id);
    // 拦截型能力点：多管理员/高级权限为会员权益，未开通 → 4001；订阅过期 → 4004
    await this.entitlementService.assertCapability(familyId, Capability.Permission);
    const [family] = await this.dataSource.query<DataRow[]>(
      'SELECT `id`, `name`, `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    if (!family) {
      throw new HttpException('家族不存在或已停用', HttpStatus.NOT_FOUND);
    }
    const leaderUserId = toStr(family.creator_user_id);
    const canManage = leaderUserId === userId;

    // 大族性能优化：列表仅返回「当前登录用户 + 族长 + 管理员」，普通成员不展示；
    // total 仍取全量 COUNT，保证头部"共 N 位家族成员"准确
    const [members, admins, totalRows] = await Promise.all([
      this.dataSource.query<DataRow[]>(
        `SELECT \`id\`, \`nickname\`, \`avatar_url\`, \`member_id\`
         FROM \`user\`
         WHERE \`family_id\` = ? AND \`status\` = 1
           AND (
             \`id\` = ?
             OR \`id\` = ?
             OR \`id\` IN (
               SELECT \`user_id\` FROM \`family_permission\`
               WHERE \`family_id\` = ? AND \`role\` = 'admin' AND \`status\` = 1
             )
           )
         ORDER BY \`create_time\` ASC`,
        [familyId, userId, leaderUserId, familyId]
      ),
      this.dataSource.query<DataRow[]>(
        'SELECT `user_id` FROM `family_permission` WHERE `family_id` = ? AND `role` = \'admin\' AND `status` = 1',
        [familyId]
      ),
      this.dataSource.query<DataRow[]>(
        'SELECT COUNT(*) AS cnt FROM `user` WHERE `family_id` = ? AND `status` = 1',
        [familyId]
      )
    ]);
    const adminSet = new Set<string>(admins.map((a) => toStr(a.user_id)));
    const list = members.map((m) => {
      const uid = toStr(m.id);
      const role = uid === leaderUserId ? 'leader' : adminSet.has(uid) ? 'admin' : 'member';
      return {
        userId: uid,
        nickname: m.nickname || '未设置昵称',
        avatarUrl: m.avatar_url || '',
        memberId: m.member_id || '',
        role,
        roleLabel: role === 'leader' ? '族长' : role === 'admin' ? '管理员' : '普通成员'
      };
    });
    return {
      familyId,
      familyName: family.name,
      leaderUserId,
      canManage,
      list,
      total: Number((totalRows[0] && totalRows[0].cnt) || list.length)
    };
  }

  /**
   * 设置家族成员角色（仅族长可操作）
   * role: 'admin' 设为管理员（写入 family_permission，幂等 upsert）/ 'member' 取消管理员
   */
  async setFamilyRole(userId: string, targetUserId: string, role: string) {
    const user = await this.findUserById(userId);
    if (!user || !user.family_id) {
      throw new HttpException('请先加入家族', HttpStatus.BAD_REQUEST);
    }
    const familyId = Number(user.family_id);

    const [family] = await this.dataSource.query<DataRow[]>(
      'SELECT `id`, `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    if (!family) {
      throw new HttpException('家族不存在或已停用', HttpStatus.NOT_FOUND);
    }
    if (toStr(family.creator_user_id) !== userId) {
      throw new HttpException('仅族长可设置管理员', HttpStatus.FORBIDDEN);
    }
    if (targetUserId === userId) {
      throw new HttpException('不能设置自己的角色', HttpStatus.BAD_REQUEST);
    }

    const targetUser = await this.findUserById(targetUserId);
    if (!targetUser || targetUser.family_id !== user.family_id) {
      throw new HttpException('目标用户不属于当前家族', HttpStatus.BAD_REQUEST);
    }

    if (role === 'admin') {
      await this.dataSource.query(
        `INSERT INTO \`family_permission\` (\`family_id\`, \`user_id\`, \`role\`, \`status\`) VALUES (?, ?, 'admin', 1)
         ON DUPLICATE KEY UPDATE \`role\` = 'admin', \`status\` = 1`,
        [familyId, targetUserId] as QueryValues
      );
    } else if (role === 'member') {
      await this.dataSource.query(
        'UPDATE `family_permission` SET `role` = ?, `status` = 1 WHERE `family_id` = ? AND `user_id` = ?',
        ['member', familyId, targetUserId] as QueryValues
      );
    } else {
      throw new HttpException('role 参数错误', HttpStatus.BAD_REQUEST);
    }

    return { success: true };
  }

  /**
   * 更新当前用户资料(昵称/头像/性别)
   */
  async updateProfile(userId: string, body: { nickName?: string; avatarUrl?: string; gender?: number }): Promise<UserInfo> {
    const fields: string[] = [];
    const values: QueryValues = [];

    if (body.nickName !== undefined) {
      fields.push('`nickname` = ?');
      values.push(body.nickName);
    }
    if (body.avatarUrl !== undefined) {
      fields.push('`avatar_url` = ?');
      values.push(body.avatarUrl);
    }
    if (body.gender !== undefined) {
      fields.push('`gender` = ?');
      values.push(body.gender);
    }

    if (fields.length === 0) {
      return this.getProfile(userId);
    }

    await this.dataSource.query(`UPDATE \`user\` SET ${fields.join(', ')} WHERE \`id\` = ?`, [...values, userId] as QueryValues);
    return this.getProfile(userId);
  }

  /**
   * 注销账号(停用用户记录并匿名化：联系方式置空，其发布内容匿名化保留)
   * 满足《个保法》删除权：撤销登录凭证 + 记录注销审计（deleted_at / delete_reason）
   */
  async deleteAccount(userId: string, reason?: string) {
    await this.dataSource.query(
      'UPDATE `user` SET `status` = 0, `phone` = NULL, `openid` = NULL, `unionid` = NULL, `deleted_at` = NOW(), `delete_reason` = ? WHERE `id` = ?',
      [reason || '', userId] as QueryValues
    );
    await this.dataSource.query('UPDATE `user_auth_identity` SET `status` = 0 WHERE `user_id` = ?', [userId] as QueryValues);
    return { success: true };
  }

  // ==================== 家族辅助方法 ====================

  private async getFamilyBrief(familyId: number) {
    const [row] = await this.dataSource.query<DataRow[]>(
      'SELECT `id`, `name`, `logo`, `surname_id`, `hall_name`, `origin` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    if (!row) return null;
    let surname = '';
    if (row.surname_id) {
      const [surnameRow] = await this.dataSource.query<DataRow[]>(
        'SELECT `surname` FROM `surname` WHERE `id` = ? LIMIT 1',
        [row.surname_id]
      );
      surname = toStr(surnameRow?.surname);
    }
    return {
      id: Number(row.id),
      name: toStr(row.name),
      logo: toStr(row.logo),
      surname,
      hallName: toStr(row.hall_name),
      origin: toStr(row.origin)
    };
  }

  private async getMemberBrief(familyId: number, memberId: string) {
    const tableName = this.getMemberTableName(familyId);
    const [row] = await this.dataSource.query<DataRow[]>(
      `SELECT \`id\`, \`name\`, \`avatar_url\`, \`gender\`, \`generation\` FROM ${tableName} WHERE \`id\` = ? AND \`status\` = 1 LIMIT 1`,
      [memberId]
    );
    if (!row) return null;
    return {
      id: toStr(row.id),
      name: toStr(row.name),
      avatarUrl: toStr(row.avatar_url),
      gender: Number(row.gender || 0),
      generation: Number(row.generation || 0)
    };
  }

  private async assertMemberInFamily(familyId: number, memberId: string) {
    const tableName = this.getMemberTableName(familyId);
    const [row] = await this.dataSource.query<DataRow[]>(
      `SELECT \`id\` FROM ${tableName} WHERE \`id\` = ? AND \`family_id\` = ? AND \`status\` = 1 LIMIT 1`,
      [memberId, familyId]
    );
    if (!row) {
      throw new HttpException('成员不存在或不属于该家族', HttpStatus.BAD_REQUEST);
    }
  }

  private getMemberTableName(familyId: number): string {
    return getSafeMemberTableName(familyId);
  }

  private async generateShareCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(randomInt(chars.length));
    }
    const [existing] = await this.dataSource.query<DataRow[]>('SELECT `id` FROM `user` WHERE `share_code` = ? LIMIT 1', [code]);
    if (existing) {
      return this.generateShareCode();
    }
    return code;
  }
}
