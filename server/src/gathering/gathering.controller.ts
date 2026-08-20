import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { type AuthenticatedRequest } from '../common/types/common';
import { GatheringService } from './gathering.service';
import { type RegisterData, type GatheringUpsertData } from './types/gathering.types';

/**
 * 小程序用户端宗亲聚会接口
 * @Public 跳过全局管理员 JwtAuthGuard，改用 UserJwtAuthGuard 校验用户令牌
 * 家族归属 / 组织者权限在 Service 内校验
 */
@Public()
@UseGuards(UserJwtAuthGuard)
@Controller('user/gathering')
export class GatheringController {
  constructor(private readonly gatheringService: GatheringService) {}

  /** 聚会分页列表（?familyId=&page=&pageSize=&status=&keyword=） */
  @Get('list')
  getList(@Req() req: AuthenticatedRequest, @Query() query: Record<string, string>) {
    return this.gatheringService.getList(String(req.user.id), Number(query.familyId) || 0, {
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 10,
      status: query.status !== undefined && query.status !== '' ? Number(query.status) : undefined,
      keyword: query.keyword || undefined
    });
  }

  /** 聚会详情（?familyId=） */
  @Get(':id')
  getDetail(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Param('id') id: string) {
    return this.gatheringService.getDetail(String(req.user.id), Number(familyId) || 0, Number(id));
  }

  /** 创建聚会 */
  @Post()
  create(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: GatheringUpsertData) {
    return this.gatheringService.create(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 编辑聚会（组织者） */
  @Put(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('id') id: string,
    @Body() body: GatheringUpsertData
  ) {
    return this.gatheringService.update(String(req.user.id), Number(familyId) || 0, Number(id), body || {});
  }

  /** 状态流转（组织者） */
  @Put(':id/status')
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('id') id: string,
    @Body() body: { status: number }
  ) {
    return this.gatheringService.updateStatus(String(req.user.id), Number(familyId) || 0, Number(id), Number(body?.status));
  }

  /** 删除聚会（组织者） */
  @Delete(':id')
  delete(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Param('id') id: string) {
    return this.gatheringService.delete(String(req.user.id), Number(familyId) || 0, Number(id));
  }

  /** 报名 */
  @Post(':id/register')
  register(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('id') id: string,
    @Body() body: RegisterData
  ) {
    return this.gatheringService.register(String(req.user.id), Number(familyId) || 0, Number(id), (body || {}) as RegisterData);
  }

  /** 我的报名记录 */
  @Get(':id/registration/mine')
  getMyRegistration(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Param('id') id: string) {
    return this.gatheringService.getMyRegistration(String(req.user.id), Number(familyId) || 0, Number(id));
  }

  /** 取消报名 */
  @Put('registration/:registrationId/cancel')
  cancelRegistration(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('registrationId') registrationId: string
  ) {
    return this.gatheringService.cancelRegistration(String(req.user.id), Number(familyId) || 0, Number(registrationId));
  }

  /** 我的签到信息（签到码 + 二维码） */
  @Get(':id/checkin-code')
  getCheckinCode(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Param('id') id: string) {
    return this.gatheringService.getCheckinCode(String(req.user.id), Number(familyId) || 0, Number(id));
  }

  /** 现场签到（双通道：输入签到码 / 扫码核销） */
  @Post(':id/checkin')
  checkin(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('id') id: string,
    @Body() body: { code?: string; method?: string }
  ) {
    return this.gatheringService.checkin(String(req.user.id), Number(familyId) || 0, Number(id), body || {});
  }

  /** 报名名单（组织者） */
  @Get(':id/registrations')
  getRegistrations(@Req() req: AuthenticatedRequest, @Query() query: Record<string, string>, @Param('id') id: string) {
    return this.gatheringService.getRegistrations(String(req.user.id), Number(query.familyId) || 0, Number(id), {
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 10,
      status: query.status !== undefined && query.status !== '' ? Number(query.status) : undefined,
      keyword: query.keyword || undefined
    });
  }

  /** 参会统计分析（组织者） */
  @Get(':id/stats')
  getStats(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Param('id') id: string) {
    return this.gatheringService.getStats(String(req.user.id), Number(familyId) || 0, Number(id));
  }

  /** 新增归档资料（组织者） */
  @Post(':id/archive')
  createArchive(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('id') id: string,
    @Body() body: { title?: string; fileUrl?: string; fileType?: string; description?: string }
  ) {
    return this.gatheringService.createArchive(String(req.user.id), Number(familyId) || 0, Number(id), body || {});
  }

  /** 删除归档资料（组织者） */
  @Delete(':id/archive/:archiveId')
  deleteArchive(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('id') id: string,
    @Param('archiveId') archiveId: string
  ) {
    return this.gatheringService.deleteArchive(String(req.user.id), Number(familyId) || 0, Number(id), Number(archiveId));
  }
}
