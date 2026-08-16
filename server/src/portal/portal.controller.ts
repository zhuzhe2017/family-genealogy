import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { EntitlementGuard } from '../membership/guards/entitlement.guard';
import { type AuthenticatedRequest } from '../common/types/common';
import { PortalService } from './portal.service';
import { type ContentType } from '../content/content.service';
import { type FamilyCreateData } from '../family/types/family.types';
import { type FamilyMemberCreateData, type FamilyMemberUpdateData } from '../family-member/types/family-member.types';
import { type ContentCreateData } from '../content/types/content.types';

/**
 * 小程序用户端接口（一期）
 * - @Public 跳过全局管理员 JwtAuthGuard
 * - @UseGuards(UserJwtAuthGuard) 校验用户令牌（type=user）
 * - @UseGuards(EntitlementGuard) 能力点校验：标注了 @Entitlement(capability) 的接口
 *   按当前家族订阅套餐拦截（未解锁 → 4001）；未标注接口直接放行。
 *   现有接口均为免费基础能力，付费能力点（backup/export/permission/reminder/digest 等）
 *   对应业务接口随 M2 实现，届时在接口上追加 @Entitlement 即可生效。
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
  getFamilyMembers(@Param('familyId', ParseIntPipe) familyId: number) {
    return this.portalService.getFamilyMembers(familyId);
  }

  @Get('family/:familyId/members/:id')
  getFamilyMemberDetail(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.portalService.getFamilyMemberDetail(familyId, id);
  }

  @Get('family/:familyId/members/:id/children')
  getMemberChildren(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.portalService.getMemberChildren(familyId, id);
  }

  @Post('family/create')
  createFamily(@Body() body: FamilyCreateData, @Req() req: AuthenticatedRequest) {
    // 创建者ID以服务端令牌为准，防止客户端伪造
    body.creatorUserId = String(req.user.id);
    return this.portalService.createFamily(body);
  }

  @Post('family/:familyId/members')
  createMember(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: FamilyMemberCreateData
  ) {
    return this.portalService.createMember(familyId, body);
  }

  @Put('family/:familyId/members/:id')
  updateMember(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Body() body: FamilyMemberUpdateData
  ) {
    return this.portalService.updateMember(familyId, id, body);
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
    return this.portalService.createContent(type as ContentType, body);
  }

  /** 更新内容（目前支持 event） */
  @Put('content/:type/:id')
  updateContent(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: ContentCreateData
  ) {
    return this.portalService.updateContent(type as ContentType, id, body);
  }

  /** 删除内容（软删除，目前支持 event） */
  @Delete('content/:type/:id')
  deleteContent(@Param('type') type: string, @Param('id') id: string) {
    return this.portalService.deleteContent(type as ContentType, id);
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
}
