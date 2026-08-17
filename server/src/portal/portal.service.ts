import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { FamilyService } from '../family/family.service';
import { FamilyMemberService } from '../family-member/family-member.service';
import { ContentService } from '../content/content.service';
import { UserService } from '../user/user.service';
import { type ContentType } from '../content/content.service';
import { type FamilyCreateData } from '../family/types/family.types';
import { type FamilyMemberCreateData, type FamilyMemberUpdateData } from '../family-member/types/family-member.types';
import { type ContentCreateData } from '../content/types/content.types';

const CONTENT_TYPES: ContentType[] = ['dynamic', 'photo', 'document', 'event'];

/**
 * 小程序用户端服务（一期：只读 + 基础提交）
 * 复用 family / family-member / content 三个业务服务的既有查询与校验逻辑，
 * 仅做用户视角的过滤（启用中、审核通过）与参数校验。
 *
 * 成员写权限（新增/编辑）：
 * - 家族创建者：全权
 * - 已绑定目标成员ID的会员：可编辑该成员（不受 VIP 状态限制）
 * - 已加入该家族的会员：可新增成员
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly familyService: FamilyService,
    private readonly familyMemberService: FamilyMemberService,
    private readonly contentService: ContentService,
    private readonly userService: UserService
  ) {}

  /** 家族列表（仅启用中） */
  getFamilyList(params: { page?: number; pageSize?: number; keyword?: string }) {
    return this.familyService.getList({
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      keyword: params.keyword,
      status: 1
    });
  }

  /** 家族全量（下拉选择用，仅启用中） */
  getFamilyAll() {
    return this.familyService.getAll({ status: 1 });
  }

  /** 家族详情（仅启用中） */
  async getFamilyDetail(id: number) {
    const row = await this.familyService.getById(id);
    if (row.status !== 1) {
      throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /** 家族全部成员（按代排序，仅启用中） */
  getFamilyMembers(familyId: number) {
    return this.familyMemberService.getAll(familyId, { status: 1 });
  }

  /** 成员详情（仅启用中；携带当前用户 canEdit 标识，供前端控制编辑入口） */
  async getFamilyMemberDetail(familyId: number, memberId: string, userId?: string) {
    const row = await this.familyMemberService.getById(familyId, memberId);
    if (row.status !== 1) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }
    const canEdit = userId ? await this.canEditMember(userId, familyId, memberId) : false;
    return { ...row, canEdit };
  }

  /** 成员子女列表 */
  getMemberChildren(familyId: number, memberId: string) {
    return this.familyMemberService.getChildren(familyId, memberId);
  }

  /** 父亲候选列表（上一代男性成员，按姓名/母亲姓名模糊搜索，供添加成员选择父亲） */
  getFatherCandidates(familyId: number, generation: number, keyword: string) {
    return this.familyMemberService.getFatherCandidates(familyId, generation, keyword);
  }

  /** 父亲的配偶列表（候选母亲，从父亲 spouse_info JSON 数组解析） */
  getFatherSpouses(familyId: number, fatherId: string) {
    return this.familyMemberService.getFatherSpouses(familyId, fatherId);
  }

  /** 创建家族（基础字段，字辈关联后续在管理端维护）；创建者自动绑定为该家族会员 */
  async createFamily(data: FamilyCreateData) {
    const result = await this.familyService.create({
      name: data.name,
      logo: data.logo,
      founder: data.founder,
      origin: data.origin,
      description: data.description,
      isPublic: data.isPublic,
      allowJoin: data.allowJoin,
      surnameId: data.surnameId ?? null,
      generationTableId: data.generationTableId ?? null,
      creatorUserId: data.creatorUserId ?? null
    });
    // 创建者自动关联该家族支系（含分享码），保证其具备后续成员管理权限
    if (data.creatorUserId) {
      await this.userService.joinFamily(data.creatorUserId, { familyId: result.id });
    }
    return result;
  }

  /** 添加成员（须已加入该家族或为家族创建者） */
  async createMember(familyId: number, data: FamilyMemberCreateData, userId: string) {
    await this.assertMemberWrite(userId, familyId);
    return this.familyMemberService.create(familyId, data);
  }

  /** 更新成员（绑定该成员ID的会员或家族创建者，不受 VIP 状态限制） */
  async updateMember(familyId: number, memberId: string, data: FamilyMemberUpdateData, userId: string) {
    await this.assertMemberWrite(userId, familyId, memberId);
    return this.familyMemberService.update(familyId, memberId, data);
  }

  // ---------- 成员写权限控制 ----------

  /**
   * 成员写权限判断：
   * - 家族创建者：允许（含新增/编辑）
   * - 编辑指定成员：会员已绑定该成员ID（user.family_id 匹配且 user.member_id 匹配）→ 允许
   * - 新增成员：会员已加入该家族（user.family_id 匹配）→ 允许
   * 该权限基于"关联成员ID"绑定关系，不受会员 VIP 状态限制。
   */
  async canEditMember(userId: string, familyId: number, memberId: string): Promise<boolean> {
    const binding = await this.userService.getUserFamilyBinding(userId);
    const creatorId = await this.familyService.getCreatorUserId(familyId);
    if (String(creatorId || '') === String(userId)) return true;
    return Number(binding.familyId) === Number(familyId) && binding.memberId === memberId;
  }

  /** 写操作前置校验：无权限抛 403（提示具体原因） */
  private async assertMemberWrite(userId: string, familyId: number, memberId?: string): Promise<void> {
    const binding = await this.userService.getUserFamilyBinding(userId);
    const creatorId = await this.familyService.getCreatorUserId(familyId);
    if (String(creatorId || '') === String(userId)) return;

    if (memberId) {
      if (Number(binding.familyId) === Number(familyId) && binding.memberId === memberId) return;
      throw new HttpException('无权限编辑该成员：仅已绑定该成员的会员或家族创建者可编辑', HttpStatus.FORBIDDEN);
    }
    if (Number(binding.familyId) === Number(familyId)) return;
    throw new HttpException('请先加入该家族后再添加成员', HttpStatus.FORBIDDEN);
  }

  /** 内容列表（仅审核通过） */
  getContentList(
    type: ContentType,
    params: { familyId?: string; page?: number; pageSize?: number; keyword?: string },
    userId?: string
  ) {
    this.assertContentType(type);
    return this.contentService.getList(type, {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      familyId: params.familyId,
      auditStatus: 1,
      keyword: params.keyword
    }, userId);
  }

  /** 内容详情（仅审核通过；dynamic 附带图片与当前用户点赞状态） */
  getContentDetail(type: ContentType, id: string, userId?: string) {
    this.assertContentType(type);
    return this.contentService.getById(type, id, userId);
  }

  /** 发布内容（默认待审核） */
  createContent(type: ContentType, data: ContentCreateData) {
    this.assertContentType(type);
    return this.contentService.create(type, data);
  }

  /** 更新内容（目前支持 event） */
  updateContent(type: ContentType, id: string, data: ContentCreateData) {
    this.assertContentType(type);
    return this.contentService.update(type, id, data);
  }

  /** 删除内容（软删除） */
  deleteContent(type: ContentType, id: string) {
    this.assertContentType(type);
    return this.contentService.delete(type, id);
  }

  /** 动态点赞/取消点赞 */
  toggleLike(dynamicId: string, userId: string) {
    return this.contentService.toggleLike(dynamicId, userId);
  }

  /** 动态评论列表（分页） */
  getComments(dynamicId: string, page?: number, pageSize?: number) {
    return this.contentService.getComments(dynamicId, page, pageSize);
  }

  /** 发表评论 */
  createComment(dynamicId: string, userId: string, userName: string, content: string) {
    return this.contentService.createComment(dynamicId, userId, userName, content);
  }

  private assertContentType(type: string): asserts type is ContentType {
    if (!CONTENT_TYPES.includes(type as ContentType)) {
      throw new HttpException('内容类型非法，仅支持 dynamic/photo/document/event', HttpStatus.BAD_REQUEST);
    }
  }
}
