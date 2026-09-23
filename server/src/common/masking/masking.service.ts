import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type DataRow, type QueryValues } from '../types/common';

/**
 * 数据脱敏服务：敏感字段默认最小可见（《个保法》《数安法》数据分级落地）
 * - 手机号：保留前 3 后 4，中间掩码（138****5678）
 * - 证件号/其他长数字串：保留前 4 后 4
 * 展示层（个人资料、家族成员列表、管理端列表）出参前统一过此服务，避免逐处硬编码遗漏
 */
@Injectable()
export class MaskingService {
  constructor(private readonly dataSource: DataSource) {}

  /** 手机号脱敏：138****5678；空值/长度不足原样返回 */
  phone(value: string | null | undefined): string | undefined {
    if (!value) return value ?? undefined;
    const str = String(value);
    if (str.length < 7) return str;
    return str.slice(0, 3) + '****' + str.slice(-4);
  }

  /** 通用长数字串脱敏（证件号、银行卡等）：保留前 4 后 4 */
  longNumber(value: string | null | undefined): string | undefined {
    if (!value) return value ?? undefined;
    const str = String(value);
    if (str.length < 9) return str;
    return str.slice(0, 4) + '********' + str.slice(-4);
  }

  /**
   * 判断请求者是否为数据所有者本人（本人查看自己的手机号时不脱敏）
   * @param viewerUserId 当前登录用户 ID
   * @param targetUserId 目标数据归属用户 ID
   */
  isSelf(viewerUserId: string, targetUserId: string): boolean {
    return viewerUserId === targetUserId;
  }

  /**
   * 按查看者身份脱敏手机号：本人看原值，他人看掩码
   */
  phoneForViewer(viewerUserId: string, targetUserId: string, phone: string | null | undefined): string | undefined {
    if (this.isSelf(viewerUserId, targetUserId)) return phone || undefined;
    return this.phone(phone);
  }

  /** 供后续家族成员/管理端列表批量脱敏时查询归属（预留扩展） */
  async findUserIdByMemberId(familyId: number, memberId: string): Promise<string | null> {
    const tableName = `family_members_${familyId}`;
    const rows = await this.dataSource.query<DataRow[]>(
      `SELECT \`user_id\` FROM \`${tableName}\` WHERE \`id\` = ? LIMIT 1`,
      [memberId] as QueryValues
    );
    if (!rows.length) return null;
    const userId: unknown = rows[0].user_id;
    return typeof userId === 'string' ? userId : typeof userId === 'number' ? String(userId) : null;
  }
}
