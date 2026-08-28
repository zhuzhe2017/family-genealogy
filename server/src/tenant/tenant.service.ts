import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FamilyMemberService } from '../family-member/family-member.service';
import { FamilyService } from '../family/family.service';
import { ContentService, type ContentType } from '../content/content.service';
import { getSafeMemberTableName } from '../common/utils/family-member-table';
import { type TenantMemberQueryParams, type TenantFamilyItem } from './types/tenant.types';
import {
  type QueryValues,
  type PaginationResult,
  type DataRow,
  type IdResult,
  type SuccessResult
} from '../common/types/common';
import { type FamilyMemberRow } from '../family-member/types/family-member.types';
import {
  type FamilyMemberCreateData,
  type FamilyMemberUpdateData,
  type FatherCandidate,
  type FatherSpouse
} from '../family-member/types/family-member.types';
import { type ContentCreateData } from '../content/types/content.types';

/**
 * 租户业务后台服务
 * 职责：
 * 1. 校验并注入 family_id 上下文
 * 2. 复用现有 service 执行业务逻辑
 * 3. 返回当前家族范围内的数据
 */
@Injectable()
export class TenantService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly familyService: FamilyService,
    private readonly familyMemberService: FamilyMemberService,
    private readonly contentService: ContentService
  ) {}

  /** 获取当前用户拥有管理权限的家族列表（用于切换/选择） */
  async getMyFamilies(userId: string): Promise<TenantFamilyItem[]> {
    const rows = await this.dataSource.query<
      { family_id: number; name: string; logo: string; role: string; status: number }[]
    >(
      `SELECT f.\`id\` AS family_id, f.\`name\`, f.\`logo\`, fp.\`role\`, f.\`status\`
       FROM \`family_permission\` fp
       INNER JOIN \`family\` f ON f.\`id\` = fp.\`family_id\`
       WHERE fp.\`user_id\` = ? AND fp.\`status\` = 1 AND f.\`status\` = 1
       ORDER BY fp.\`create_time\` DESC`,
      [userId] as QueryValues
    );

    return rows.map(row => ({
      familyId: row.family_id,
      name: row.name,
      logo: row.logo,
      role: row.role as 'admin' | 'creator' | 'member',
      status: row.status
    }));
  }

  /** 获取家族概览统计 */
  async getFamilyOverview(familyId: number): Promise<DataRow> {
    const [family] = await this.dataSource.query<
      { id: number; name: string; logo: string; member_count: number; gen_count: number }[]
    >(
      'SELECT `id`, `name`, `logo`, `member_count`, `gen_count` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId] as QueryValues
    );

    if (!family) {
      throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);
    }

    const stats = await this.getFamilyStats(familyId);
    return { ...family, ...stats };
  }

  // ---------- 成员管理 ----------

  /** 成员列表 */
  async getMembers(familyId: number, query: TenantMemberQueryParams): Promise<PaginationResult<DataRow>> {
    return this.familyMemberService.getPaged(familyId, {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      gender: query.gender,
      sort: query.sort
    });
  }

  /** 成员详情（带照片、子女） */
  async getMemberDetail(familyId: number, memberId: string): Promise<DataRow> {
    await this.familyMemberService.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const [member] = await this.dataSource.query<FamilyMemberRow[]>(
      `SELECT * FROM \`${tableName}\` WHERE \`id\` = ? AND \`family_id\` = ? AND \`status\` = 1`,
      [memberId, familyId] as QueryValues
    );

    if (!member) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }

    const photos = await this.familyMemberService.getPhotos(familyId, memberId);
    const children = await this.familyMemberService.getChildren(familyId, memberId);
    return { ...member, photos, children };
  }

  /** 创建成员 */
  async createMember(familyId: number, data: FamilyMemberCreateData, userId: string): Promise<IdResult> {
    await this.ensureFamilyAdmin(familyId, userId);
    return this.familyMemberService.create(familyId, data);
  }

  /** 更新成员 */
  async updateMember(familyId: number, memberId: string, data: FamilyMemberUpdateData, userId: string): Promise<IdResult> {
    await this.ensureFamilyAdmin(familyId, userId);
    return this.familyMemberService.update(familyId, memberId, data);
  }

  /** 删除成员（软删除） */
  async deleteMember(familyId: number, memberId: string, userId: string): Promise<SuccessResult> {
    await this.ensureFamilyAdmin(familyId, userId);
    const result = await this.familyMemberService.delete(familyId, memberId);
    return { success: (result as { affected?: number }).affected ? true : false };
  }

  /** 切换在世状态 */
  async toggleMemberAlive(familyId: number, memberId: string, userId: string): Promise<DataRow> {
    await this.ensureFamilyAdmin(familyId, userId);
    await this.familyMemberService.toggleAlive(familyId, memberId);
    return this.getMemberDetail(familyId, memberId);
  }

  /** 父亲候选 */
  async getFatherCandidates(
    familyId: number,
    generation: number,
    keyword?: string,
    page = 1,
    pageSize = 20
  ): Promise<{ list: FatherCandidate[]; total: number }> {
    return this.familyMemberService.getFatherCandidates(familyId, generation, keyword || '', page, pageSize);
  }

  /** 父亲配偶候选 */
  async getFatherSpouses(familyId: number, fatherId: string): Promise<FatherSpouse[]> {
    return this.familyMemberService.getFatherSpouses(familyId, fatherId);
  }

  // ---------- 相册/文档/事件管理 ----------

  /** 内容列表（photo/document/event） */
  async getContentList(
    type: ContentType,
    familyId: number,
    query: { page: number; pageSize: number; keyword?: string }
  ): Promise<PaginationResult<DataRow>> {
    this.assertEditableContentType(type);
    return this.contentService.getList(type, {
      page: query.page,
      pageSize: query.pageSize,
      familyId: String(familyId),
      keyword: query.keyword,
      auditStatus: undefined
    });
  }

  /** 内容详情 */
  async getContentDetail(type: ContentType, id: string): Promise<DataRow> {
    this.assertEditableContentType(type);
    return this.contentService.getById(type, id);
  }

  /** 创建内容 */
  async createContent(
    type: ContentType,
    familyId: number,
    data: ContentCreateData,
    userId: string,
    userName: string
  ): Promise<IdResult> {
    this.assertEditableContentType(type);
    await this.ensureFamilyAdmin(familyId, userId);
    const payload: ContentCreateData = { ...data, familyId };
    if (type === 'photo') {
      payload.uploaderId = userId;
      payload.uploaderName = userName;
    }
    return this.contentService.create(type, payload);
  }

  /** 更新内容（目前仅 event 支持） */
  async updateContent(type: ContentType, id: string, familyId: number, data: ContentCreateData, userId: string): Promise<IdResult> {
    this.assertEditableContentType(type);
    await this.ensureContentBelongs(type, id, familyId);
    await this.ensureFamilyAdmin(familyId, userId);
    return this.contentService.update(type, id, { ...data, familyId });
  }

  /** 删除内容（软删除） */
  async deleteContent(type: ContentType, id: string, familyId: number, userId: string): Promise<{ success: boolean }> {
    this.assertEditableContentType(type);
    await this.ensureContentBelongs(type, id, familyId);
    await this.ensureFamilyAdmin(familyId, userId);
    return this.contentService.delete(type, id);
  }

  // ---------- 设置 ----------

  /** 家族设置信息 */
  async getSettings(familyId: number): Promise<DataRow> {
    const [family] = await this.dataSource.query<
      {
        id: number;
        name: string;
        logo: string;
        hall_name: string;
        origin: string;
        description: string;
        is_public: number;
        allow_join: number;
      }[]
    >(
      'SELECT `id`, `name`, `logo`, `hall_name`, `origin`, `description`, `is_public`, `allow_join` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId] as QueryValues
    );

    if (!family) {
      throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);
    }

    return family;
  }

  // ---------- 私有辅助方法 ----------

  private async getFamilyStats(familyId: number): Promise<DataRow> {
    const [memberCount] = await this.dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*) AS count FROM `family_member` WHERE `family_id` = ? AND `status` = 1',
      [familyId] as QueryValues
    );
    const [photoCount] = await this.dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*) AS count FROM `family_photo` WHERE `family_id` = ? AND `status` = 1',
      [familyId] as QueryValues
    );
    const [documentCount] = await this.dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*) AS count FROM `family_document` WHERE `family_id` = ? AND `status` = 1',
      [familyId] as QueryValues
    );
    const [eventCount] = await this.dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*) AS count FROM `family_event` WHERE `family_id` = ?',
      [familyId] as QueryValues
    );

    return {
      memberCount: memberCount?.count ?? 0,
      photoCount: photoCount?.count ?? 0,
      documentCount: documentCount?.count ?? 0,
      eventCount: eventCount?.count ?? 0
    };
  }

  private async ensureFamilyAdmin(familyId: number, userId: string): Promise<void> {
    const creatorId = await this.familyService.getCreatorUserId(familyId);
    if (String(creatorId || '') === String(userId)) return;

    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `role` IN (\'admin\', \'creator\') AND `status` = 1',
      [familyId, userId] as QueryValues
    );

    if (!perm) {
      throw new HttpException('无家族管理权限', HttpStatus.FORBIDDEN);
    }
  }

  private async ensureContentBelongs(type: ContentType, id: string, familyId: number): Promise<void> {
    const table = this.contentTableOf(type);
    const [row] = await this.dataSource.query<{ family_id: number }[]>(
      `SELECT \`family_id\` FROM \`${table}\` WHERE \`id\` = ? AND \`status\` = 1`,
      [id] as QueryValues
    );
    if (!row || Number(row.family_id) !== familyId) {
      throw new NotFoundException('内容不存在或不属于该家族');
    }
  }

  private contentTableOf(type: ContentType): string {
    switch (type) {
      case 'photo':
        return 'family_photo';
      case 'document':
        return 'family_document';
      case 'event':
        return 'family_event';
      default:
        return '';
    }
  }

  private assertEditableContentType(type: string): asserts type is ContentType {
    if (!['photo', 'document', 'event'].includes(type)) {
      throw new HttpException('内容类型非法，租户后台仅支持 photo/document/event', HttpStatus.BAD_REQUEST);
    }
  }
}
