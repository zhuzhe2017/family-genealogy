import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { type AuthenticatedRequest } from '../common/types/common';
import { WorshipService } from './worship.service';

/**
 * 小程序用户端祭祀接口
 * @Public 跳过全局管理员 JwtAuthGuard，改用 UserJwtAuthGuard 校验用户令牌
 * 家族归属在 Service 内校验（family_permission / user.family_id / 创建者）
 */
@Public()
@UseGuards(UserJwtAuthGuard)
@Controller('user/worship')
export class WorshipController {
  constructor(private readonly worshipService: WorshipService) {}

  /** 祭祀页面汇总：今日各类型统计 + 最近祈福记录 */
  @Get('summary')
  getSummary(@Req() req: AuthenticatedRequest, @Query('familyId') familyId?: string) {
    return this.worshipService.getSummary(String(req.user.id), Number(familyId) || 0);
  }

  /** 提交祭祀操作：上香/祈福/献祭/许愿（body: { familyId, type, content? }） */
  @Post('record')
  createRecord(
    @Req() req: AuthenticatedRequest,
    @Body() body: { familyId?: number; type?: string; content?: string }
  ) {
    return this.worshipService.createRecord(
      String(req.user.id),
      req.user.nickname || '',
      Number(body.familyId) || 0,
      String(body.type || ''),
      String(body.content || '')
    );
  }

  /** 祈福记录分页（「查看更多」；familyId/page/pageSize/type?） */
  @Get('records')
  getRecords(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string
  ) {
    return this.worshipService.getRecordPage(
      String(req.user.id),
      Number(familyId) || 0,
      Number(page) || 1,
      Number(pageSize) || 20,
      String(type || '')
    );
  }

  /** 纪念日/生日提醒（reminder 权益，拦截型；familyId/days?） */
  @Get('reminders')
  getReminders(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId?: string,
    @Query('days') days?: string
  ) {
    return this.worshipService.getReminders(
      String(req.user.id),
      Number(familyId) || 0,
      Number(days) || 30
    );
  }

  // ---------- 纪念对象（纪念堂） ----------

  /** 纪念对象列表 */
  @Get('memorials')
  getMemorials(@Req() req: AuthenticatedRequest, @Query('familyId') familyId?: string) {
    return this.worshipService.getMemorials(String(req.user.id), Number(familyId) || 0);
  }

  /** 可创建纪念的已故成员列表 */
  @Get('memorial-candidates')
  getMemorialCandidates(@Req() req: AuthenticatedRequest, @Query('familyId') familyId?: string) {
    return this.worshipService.getMemorialCandidates(String(req.user.id), Number(familyId) || 0);
  }

  /** 纪念对象详情：纪念信息 + 家族最近祭祀记录（?familyId=） */
  @Get('memorials/:id')
  getMemorialDetail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('familyId') familyId?: string
  ) {
    return this.worshipService.getMemorialDetail(String(req.user.id), Number(familyId) || 0, id);
  }

  /** 创建纪念对象（消耗 worship_pro 额度；body: { familyId, memberId, epitaph? }） */
  @Post('memorials')
  createMemorial(
    @Req() req: AuthenticatedRequest,
    @Body() body: { familyId?: number; memberId?: string; epitaph?: string }
  ) {
    return this.worshipService.createMemorial(
      String(req.user.id),
      Number(body.familyId) || 0,
      String(body.memberId || ''),
      String(body.epitaph || '')
    );
  }

  /** 删除纪念对象（仅创建者或家族创建者） */
  @Delete('memorials/:id')
  deleteMemorial(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('familyId') familyId?: string
  ) {
    return this.worshipService.deleteMemorial(String(req.user.id), Number(familyId) || 0, id);
  }
}
