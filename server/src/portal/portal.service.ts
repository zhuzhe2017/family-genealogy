import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { FamilyService } from '../family/family.service';
import { FamilyMemberService } from '../family-member/family-member.service';
import { ContentService } from '../content/content.service';
import { type ContentType } from '../content/content.service';
import { type FamilyCreateData } from '../family/types/family.types';
import { type FamilyMemberCreateData, type FamilyMemberUpdateData } from '../family-member/types/family-member.types';
import { type ContentCreateData } from '../content/types/content.types';

const CONTENT_TYPES: ContentType[] = ['dynamic', 'photo', 'document', 'event'];

/**
 * 小程序用户端服务（一期：只读 + 基础提交）
 * 复用 family / family-member / content 三个业务服务的既有查询与校验逻辑，
 * 仅做用户视角的过滤（启用中、审核通过）与参数校验。
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly familyService: FamilyService,
    private readonly familyMemberService: FamilyMemberService,
    private readonly contentService: ContentService
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

  /** 成员详情（仅启用中） */
  async getFamilyMemberDetail(familyId: number, memberId: string) {
    const row = await this.familyMemberService.getById(familyId, memberId);
    if (row.status !== 1) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /** 成员子女列表 */
  getMemberChildren(familyId: number, memberId: string) {
    return this.familyMemberService.getChildren(familyId, memberId);
  }

  /** 创建家族（基础字段，字辈关联后续在管理端维护） */
  createFamily(data: FamilyCreateData) {
    return this.familyService.create({
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
  }

  /** 添加成员 */
  createMember(familyId: number, data: FamilyMemberCreateData) {
    return this.familyMemberService.create(familyId, data);
  }

  /** 更新成员 */
  updateMember(familyId: number, memberId: string, data: FamilyMemberUpdateData) {
    return this.familyMemberService.update(familyId, memberId, data);
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
