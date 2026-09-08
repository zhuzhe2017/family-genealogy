import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { EntitlementGuard } from '../membership/guards/entitlement.guard';
import { Entitlement, Writable } from '../membership/decorators/entitlement.decorator';
import { Capability } from '../membership/types/membership.types';
import { type AuthenticatedRequest } from '../common/types/common';
import { PortalService } from './portal.service';
import { type ContentType } from '../content/content.service';
import { type FamilyCreateData } from '../family/types/family.types';
import { type FamilyMemberCreateData, type FamilyMemberUpdateData } from '../family-member/types/family-member.types';
import { type ContentCreateData } from '../content/types/content.types';
import { type CategoryType } from './portal.service';

/**
 * 小程序用户端接口（一期）
 * - @Public 跳过全局管理员 JwtAuthGuard
 * - @UseGuards(UserJwtAuthGuard) 校验用户令牌（type=user）
 * - @UseGuards(EntitlementGuard) 能力点校验：标注了 @Entitlement(capability) 的接口
 *   按当前家族订阅套餐拦截（未解锁 → 4001）；标注了 @Writable() 的接口仅校验订阅状态
 *   （过期 → 4004）；未标注接口直接放行。
 *   付费能力点（backup 等）随业务实现逐步追加 @Entitlement；家族级写操作统一追加
 *   @Writable() 保证订阅过期后全家族数据只读。
 * 路由前缀 /api/user，与既有 /user/wx-login、/user/profile 保持一致
 */
@Public()
@UseGuards(UserJwtAuthGuard, EntitlementGuard)
@Controller('user')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  // ---------- 家族 ----------

  @Get('family/list')
  getFamilyList(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string
  ) {
    return this.portalService.getFamilyList({
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      keyword
    });
  }

  @Get('family/all')
  getFamilyAll() {
    return this.portalService.getFamilyAll();
  }

  @Get('family/:id')
  getFamilyDetail(@Param('id', ParseIntPipe) id: number) {
    return this.portalService.getFamilyDetail(id);
  }

  // ---------- 成员 ----------

  @Get('family/:familyId/members')
  getFamilyMembers(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('gender') gender?: string,
    @Query('sort') sort?: string,
    @Query('generation') generation?: string,
    @Query('generations') generations?: string
  ) {
    const p = page !== undefined && page !== '' ? Number(page) : undefined;
    const ps = pageSize !== undefined && pageSize !== '' ? Number(pageSize) : undefined;
    const g = generation !== undefined && generation !== '' ? Number(generation) : undefined;
    const n = generations !== undefined && generations !== '' ? Number(generations) : undefined;
    return this.portalService.getFamilyMembers(familyId, {
      page: p && Number.isInteger(p) && p > 0 ? p : undefined,
      pageSize: ps && Number.isInteger(ps) && ps > 0 ? ps : undefined,
      keyword: keyword || undefined,
      gender: gender || undefined,
      sort: sort || undefined,
      generation: g && Number.isInteger(g) && g > 0 ? g : undefined,
      generations: n && Number.isInteger(n) && n > 0 ? n : undefined
    });
  }

  @Get('family/:familyId/members/search')
  searchMembers(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.portalService.searchMembers(familyId, {
      keyword: (keyword || '').trim(),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined
    });
  }

  @Get('family/:familyId/members/:id')
  getFamilyMemberDetail(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.getFamilyMemberDetail(familyId, id, String(req.user.id));
  }

  @Get('family/:familyId/members/:id/children')
  getMemberChildren(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.portalService.getMemberChildren(familyId, id);
  }

  @Get('family/:familyId/father-candidates')
  getFatherCandidates(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('generation') generation?: string,
    @Query('keyword') keyword?: string
  ) {
    return this.portalService.getFatherCandidates(familyId, Number(generation) || 0, keyword || '');
  }

  @Get('family/:familyId/father-spouses')
  getFatherSpouses(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('fatherId') fatherId?: string
  ) {
    return this.portalService.getFatherSpouses(familyId, fatherId || '');
  }

  @Writable()
  @Post('family/create')
  createFamily(@Body() body: FamilyCreateData, @Req() req: AuthenticatedRequest) {
    // 创建者ID以服务端令牌为准，防止客户端伪造
    body.creatorUserId = String(req.user.id);
    return this.portalService.createFamily(body);
  }

  @Writable({ familyFrom: 'body:familyId' })
  @Post('family/:familyId/members')
  createMember(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: FamilyMemberCreateData,
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.createMember(familyId, body, String(req.user.id));
  }

  @Writable()
  @Put('family/:familyId/members/:id')
  updateMember(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Body() body: FamilyMemberUpdateData,
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.updateMember(familyId, id, body, String(req.user.id));
  }

  // ---------- 内容 ----------

  @Get('content/:type/list')
  getContentList(
    @Param('type') type: string,
    @Query('familyId') familyId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Req() req?: AuthenticatedRequest
  ) {
    return this.portalService.getContentList(type as ContentType, {
      familyId,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      keyword
    }, req?.user ? String(req.user.id) : undefined);
  }

  @Get('content/:type/:id')
  getContentDetail(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req?: AuthenticatedRequest
  ) {
    return this.portalService.getContentDetail(type as ContentType, id, req?.user ? String(req.user.id) : undefined);
  }

  @Writable({ familyFrom: 'body:familyId' })
  @Post('content/:type/create')
  createContent(
    @Param('type') type: string,
    @Body() body: ContentCreateData,
    @Req() req: AuthenticatedRequest
  ) {
    const user = req.user;
    // 发布者信息以服务端令牌为准，防止客户端伪造
    if (type === 'dynamic') {
      body.userId = body.userId || String(user.id);
      body.userName = body.userName || user.nickname || '';
      body.userGender = body.userGender || user.gender || '';
    } else if (type === 'photo') {
      body.uploaderId = body.uploaderId || String(user.id);
      body.uploaderName = body.uploaderName || user.nickname || '';
    }
    return this.portalService.createContent(type as ContentType, body, String(req.user.id));
  }

  /** 更新内容（目前支持 event；仅家族创建者/管理员可操作） */
  @Writable({ familyFrom: 'body:familyId' })
  @Put('content/:type/:id')
  updateContent(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: ContentCreateData,
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.updateContent(type as ContentType, id, body, String(req.user.id));
  }

  /** 删除内容（软删除，目前支持 event；仅家族创建者/管理员可操作） */
  @Writable({ familyFrom: 'query:familyId' })
  @Delete('content/:type/:id')
  deleteContent(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.deleteContent(type as ContentType, id, String(req.user.id));
  }

  /** 动态点赞/取消点赞（toggle） */
  @Post('content/dynamic/:id/like')
  toggleLike(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.portalService.toggleLike(id, String(req.user.id));
  }

  /** 动态评论列表（分页） */
  @Get('content/dynamic/:id/comments')
  getComments(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.portalService.getComments(id, Number(page) || 1, Number(pageSize) || 20);
  }

  /** 发表评论（评论者信息以服务端令牌为准，防止伪造） */
  @Post('content/dynamic/:id/comment')
  createComment(
    @Param('id') id: string,
    @Body() body: { content?: string },
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.createComment(id, String(req.user.id), req.user.nickname || '', body.content || '');
  }

  // ---------- 内容分类（相册/文档） ----------

  /** 分类列表（首次访问自动初始化默认分类；含各分类文件计数） */
  @Get('category/:type/list')
  getCategoryList(
    @Param('type') type: string,
    @Query('familyId') familyId?: string,
    @Req() req?: AuthenticatedRequest
  ) {
    return this.portalService.getCategoryList(type as CategoryType, Number(familyId) || 0);
  }

  /** 创建分类（仅家族创建者/管理员；data: { familyId, name, icon? }） */
  @Writable({ familyFrom: 'body:familyId' })
  @Post('category/:type/create')
  createCategory(
    @Param('type') type: string,
    @Body() body: { familyId?: number; name?: string; icon?: string },
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.createCategory(
      type as CategoryType,
      Number(body.familyId) || 0,
      body.name || '',
      body.icon || '',
      String(req.user.id)
    );
  }

  /** 更新分类（仅家族创建者/管理员；data: { familyId, name?, icon?, sortOrder? }） */
  @Writable({ familyFrom: 'body:familyId' })
  @Put('category/:type/:id')
  updateCategory(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: { familyId?: number; name?: string; icon?: string; sortOrder?: number },
    @Req() req: AuthenticatedRequest
  ) {
    return this.portalService.updateCategory(
      type as CategoryType,
      id,
      Number(body.familyId) || 0,
      { name: body.name, icon: body.icon, sortOrder: body.sortOrder },
      String(req.user.id)
    );
  }

  /** 删除分类（仅家族创建者/管理员；分类下有文件时拒绝） */
  @Writable({ familyFrom: 'query:familyId' })
  @Delete('category/:type/:id')
  deleteCategory(
    @Param('type') type: string,
    @Param('id') id: string,
    @Query('familyId') familyId?: string,
    @Req() req?: AuthenticatedRequest
  ) {
    return this.portalService.deleteCategory(
      type as CategoryType,
      id,
      Number(familyId) || 0,
      String(req?.user?.id || '')
    );
  }

  // ---------- 数据备份 ----------

  /** 备份记录列表（查看历史记录为免费能力，不做权益拦截） */
  @Get('family/:familyId/backups')
  getBackupList(@Param('familyId', ParseIntPipe) familyId: number) {
    return this.portalService.getBackupList(familyId);
  }

  /** 创建备份（数据备份为付费能力点，未解锁返回 4001） */
  @Entitlement(Capability.Backup)
  @Post('family/:familyId/backup')
  createBackup(@Param('familyId', ParseIntPipe) familyId: number, @Req() req: AuthenticatedRequest) {
    return this.portalService.createBackup(familyId, String(req.user.id));
  }
}
