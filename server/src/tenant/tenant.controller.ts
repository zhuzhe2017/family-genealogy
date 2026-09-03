import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe
} from '@nestjs/common';
import { TenantJwtAuthGuard, TenantAuthGuard, TenantAuthenticatedRequest } from './guards/tenant-auth.guard';
import { SkipFamilyCheck } from './guards/skip-family-check.decorator';
import { Public } from '../common/decorators/public.decorator';
import { TenantService } from './tenant.service';
import { TenantMemberQueryDto } from './dto/tenant-member-query.dto';
import { TenantMemberCreateDto } from './dto/tenant-member-create.dto';
import { TenantMemberUpdateDto } from './dto/tenant-member-update.dto';
import { TenantContentQueryDto } from './dto/tenant-content.dto';
import { TenantSettingsUpdateDto } from './dto/tenant-settings.dto';
import { EntitlementGuard } from '../membership/guards/entitlement.guard';
import { Writable } from '../membership/decorators/entitlement.decorator';
import { type ContentType } from '../content/types/content.types';

/**
 * 租户业务后台接口
 * 面向家族管理员/创建者，数据范围严格限定在当前家族
 * 路由前缀 /api/tenant
 *
 * 权限三层（@Public 仅跳过全局管理员 JwtAuthGuard，本控制器不使用管理员令牌）：
 * 1. TenantJwtAuthGuard   —— 认证（仅 C 端用户令牌 type='user'）
 * 2. EntitlementGuard     —— 权益（标注 @Writable 的写接口校验订阅状态，过期只读）
 * 3. TenantAuthGuard      —— 授权（family_permission 中 admin/creator）
 */
@Public()
@UseGuards(TenantJwtAuthGuard, EntitlementGuard, TenantAuthGuard)
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  // ---------- 我的家族（切换列表） ----------

  /** 获取当前用户拥有管理权限的家族列表（不携带 familyId，跳过家族权限校验） */
  @SkipFamilyCheck()
  @Get('families')
  async getMyFamilies(@Req() req: TenantAuthenticatedRequest) {
    return this.tenantService.getMyFamilies(String(req.user.id));
  }

  /** 获取当前家族概览 */
  @Get('family/:familyId/overview')
  async getFamilyOverview(@Param('familyId', ParseIntPipe) familyId: number) {
    return this.tenantService.getFamilyOverview(familyId);
  }

  // ---------- 成员管理 ----------

  /** 成员列表 */
  @Get('family/:familyId/members')
  async getMembers(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query() query: TenantMemberQueryDto
  ) {
    return this.tenantService.getMembers(familyId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword,
      gender: query.gender,
      sort: query.sort
    });
  }

  /** 成员详情 */
  @Get('family/:familyId/members/:id')
  async getMemberDetail(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.tenantService.getMemberDetail(familyId, id);
  }

  /** 创建成员 */
  @Writable()
  @Post('family/:familyId/members')
  async createMember(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: TenantMemberCreateDto,
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.createMember(familyId, body as any, String(req.user.id));
  }

  /** 更新成员 */
  @Writable()
  @Put('family/:familyId/members/:id')
  async updateMember(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Body() body: TenantMemberUpdateDto,
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.updateMember(familyId, id, body as any, String(req.user.id));
  }

  /** 删除成员（软删除） */
  @Writable()
  @Delete('family/:familyId/members/:id')
  async deleteMember(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.deleteMember(familyId, id, String(req.user.id));
  }

  /** 切换在世状态 */
  @Writable()
  @Post('family/:familyId/members/:id/toggle-alive')
  async toggleMemberAlive(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.toggleMemberAlive(familyId, id, String(req.user.id));
  }

  /** 父亲候选 */
  @Get('family/:familyId/father-candidates')
  async getFatherCandidates(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('generation') generation: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.tenantService.getFatherCandidates(
      familyId,
      Number(generation),
      keyword,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20
    );
  }

  /** 父亲配偶候选 */
  @Get('family/:familyId/father-spouses/:id')
  async getFatherSpouses(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.tenantService.getFatherSpouses(familyId, id);
  }

  // ---------- 相册/文档/事件管理 ----------

  private assertContentType(type: string): asserts type is ContentType {
    if (!['photo', 'document', 'event'].includes(type)) {
      throw new Error('内容类型非法，租户后台仅支持 photo/document/event');
    }
  }

  /** 内容列表 */
  @Get('family/:familyId/content/:type')
  async getContentList(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('type') type: string,
    @Query() query: TenantContentQueryDto
  ) {
    this.assertContentType(type);
    return this.tenantService.getContentList(type, familyId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword
    });
  }

  /** 内容详情 */
  @Get('family/:familyId/content/:type/:id')
  async getContentDetail(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('type') type: string,
    @Param('id') id: string
  ) {
    this.assertContentType(type);
    return this.tenantService.getContentDetail(type, id, familyId);
  }

  /** 创建内容 */
  @Writable()
  @Post('family/:familyId/content/:type')
  async createContent(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('type') type: string,
    @Body() body: Record<string, unknown>,
    @Req() req: TenantAuthenticatedRequest
  ) {
    this.assertContentType(type);
    return this.tenantService.createContent(
      type,
      familyId,
      body as any,
      String(req.user.id),
      req.user.nickname || ''
    );
  }

  /** 更新内容（photo/document/event 均支持） */
  @Writable()
  @Put('family/:familyId/content/:type/:id')
  async updateContent(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: TenantAuthenticatedRequest
  ) {
    this.assertContentType(type);
    return this.tenantService.updateContent(type, id, familyId, body as any, String(req.user.id));
  }

  /** 删除内容（软删除） */
  @Writable()
  @Delete('family/:familyId/content/:type/:id')
  async deleteContent(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: TenantAuthenticatedRequest
  ) {
    this.assertContentType(type);
    return this.tenantService.deleteContent(type, id, familyId, String(req.user.id));
  }

  // ---------- 设置 ----------

  /** 家族设置 */
  @Get('family/:familyId/settings')
  async getSettings(@Param('familyId', ParseIntPipe) familyId: number) {
    return this.tenantService.getSettings(familyId);
  }

  /** 更新家族设置（家族管理员/族长） */
  @Writable()
  @Put('family/:familyId/settings')
  async updateSettings(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: TenantSettingsUpdateDto,
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.updateSettings(familyId, body, String(req.user.id));
  }

  // ---------- 权限管理 ----------

  /** 获取家族管理员权限列表（仅族长） */
  @Get('family/:familyId/permissions')
  async getFamilyPermissions(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.getFamilyPermissions(familyId, String(req.user.id));
  }

  /** 设置家族成员角色（仅族长）：admin / member */
  @Put('family/:familyId/permissions/:targetUserId/role')
  async setFamilyPermissionRole(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('targetUserId') targetUserId: string,
    @Body() body: { role: string },
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.setFamilyPermissionRole(familyId, String(req.user.id), targetUserId, body.role);
  }

  /** 移除家族管理员权限（仅族长） */
  @Delete('family/:familyId/permissions/:targetUserId')
  async removeFamilyPermission(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('targetUserId') targetUserId: string,
    @Req() req: TenantAuthenticatedRequest
  ) {
    return this.tenantService.removeFamilyPermission(familyId, String(req.user.id), targetUserId);
  }
}
