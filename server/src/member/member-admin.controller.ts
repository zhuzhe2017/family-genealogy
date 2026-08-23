import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type AuthenticatedRequest } from '../common/types/common';
import { MemberAdminService } from './member-admin.service';
import {
  type MemberCreateData,
  type MemberUpdateData,
  type LevelUpsertData,
  type PointsRuleUpsertData,
  type PointsAdjustData,
  type ConsumeCreateData
} from './types/member-admin.types';

/**
 * 会员管理后台接口（会员信息 / 等级 / 积分规则 / 积分记录 / 消费记录 / 统计 / 导出）
 * 受 JwtAuthGuard + RolesGuard + PermissionsGuard 保护，不同权限码区分操作权限
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('member')
export class MemberAdminController {
  constructor(private readonly memberService: MemberAdminService) {}

  // ==================== 会员信息 ====================

  @Permissions('system:member:list')
  @Get('members/list')
  async getMemberList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('levelId') levelId?: string,
    @Query('status') status?: string
  ) {
    return this.memberService.getMemberList({
      page: Number(page),
      pageSize: Math.min(Number(pageSize) || 10, 100),
      keyword,
      levelId: levelId !== undefined && levelId !== '' ? Number(levelId) : undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  @Permissions('system:member:create')
  @Post('members/create')
  async createMember(@Body() body: MemberCreateData, @Req() req: AuthenticatedRequest) {
    return this.memberService.createMember(
      {
        name: body.name,
        phone: body.phone ?? null,
        gender: body.gender === undefined ? undefined : Number(body.gender),
        birthday: body.birthday ?? null,
        levelId: body.levelId === undefined ? undefined : Number(body.levelId),
        points: body.points === undefined ? undefined : Number(body.points),
        status: body.status === undefined ? undefined : Number(body.status),
        remark: body.remark
      },
      req.user.username || '',
      (req.user.id as number) ?? null
    );
  }

  @Permissions('system:member:update')
  @Put('members/update/:id')
  async updateMember(
    @Param('id') id: string,
    @Body() body: MemberUpdateData,
    @Req() req: AuthenticatedRequest
  ) {
    return this.memberService.updateMember(
      Number(id),
      {
        name: body.name,
        phone: body.phone !== undefined ? body.phone : undefined,
        gender: body.gender === undefined ? undefined : Number(body.gender),
        birthday: body.birthday !== undefined ? body.birthday : undefined,
        levelId: body.levelId === undefined ? undefined : Number(body.levelId),
        status: body.status === undefined ? undefined : Number(body.status),
        remark: body.remark
      },
      req.user.username || '',
      (req.user.id as number) ?? null
    );
  }

  @Permissions('system:member:delete')
  @Delete('members/delete/:id')
  async deleteMember(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.memberService.deleteMember(
      Number(id),
      req.user.username || '',
      (req.user.id as number) ?? null
    );
  }

  @Permissions('system:member:list')
  @Get('members/:id')
  async getMemberById(@Param('id') id: string) {
    return this.memberService.getMemberById(Number(id));
  }

  // ==================== 会员等级 ====================

  @Permissions('system:member:list')
  @Get('levels/list')
  async getLevelList() {
    return this.memberService.getLevelList();
  }

  @Permissions('system:member:create')
  @Post('levels/create')
  async createLevel(@Body() body: LevelUpsertData, @Req() req: AuthenticatedRequest) {
    return this.memberService.createLevel(this.mapLevelData(body), req.user.username || '', (req.user.id as number) ?? null);
  }

  @Permissions('system:member:update')
  @Put('levels/update/:id')
  async updateLevel(@Param('id') id: string, @Body() body: LevelUpsertData, @Req() req: AuthenticatedRequest) {
    return this.memberService.updateLevel(Number(id), this.mapLevelData(body), req.user.username || '', (req.user.id as number) ?? null);
  }

  @Permissions('system:member:delete')
  @Delete('levels/delete/:id')
  async deleteLevel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.memberService.deleteLevel(Number(id), req.user.username || '', (req.user.id as number) ?? null);
  }

  // ==================== 积分规则 ====================

  @Permissions('system:member:list')
  @Get('points-rules/list')
  async getPointsRuleList() {
    return this.memberService.getPointsRuleList();
  }

  @Permissions('system:member:create')
  @Post('points-rules/create')
  async createPointsRule(@Body() body: PointsRuleUpsertData, @Req() req: AuthenticatedRequest) {
    return this.memberService.createPointsRule(this.mapRuleData(body), req.user.username || '', (req.user.id as number) ?? null);
  }

  @Permissions('system:member:update')
  @Put('points-rules/update/:id')
  async updatePointsRule(@Param('id') id: string, @Body() body: PointsRuleUpsertData, @Req() req: AuthenticatedRequest) {
    return this.memberService.updatePointsRule(Number(id), this.mapRuleData(body), req.user.username || '', (req.user.id as number) ?? null);
  }

  @Permissions('system:member:delete')
  @Delete('points-rules/delete/:id')
  async deletePointsRule(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.memberService.deletePointsRule(Number(id), req.user.username || '', (req.user.id as number) ?? null);
  }

  // ==================== 积分变动记录 ====================

  @Permissions('system:member:list')
  @Get('points-records/list')
  async getPointsRecordList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('memberId') memberId?: string,
    @Query('bizType') bizType?: string,
    @Query('keyword') keyword?: string
  ) {
    return this.memberService.getPointsRecordList({
      page: Number(page),
      pageSize: Math.min(Number(pageSize) || 10, 100),
      memberId: memberId !== undefined && memberId !== '' ? Number(memberId) : undefined,
      bizType,
      keyword
    });
  }

  @Permissions('system:member:update')
  @Post('points/adjust')
  async adjustPoints(@Body() body: PointsAdjustData, @Req() req: AuthenticatedRequest) {
    return this.memberService.adjustPoints(
      {
        memberId: Number(body.memberId),
        changePoints: Number(body.changePoints),
        remark: body.remark
      },
      req.user.username || '',
      (req.user.id as number) ?? null
    );
  }

  // ==================== 消费记录 ====================

  @Permissions('system:member:list')
  @Get('consume/list')
  async getConsumeList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('memberId') memberId?: string,
    @Query('consumeType') consumeType?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string
  ) {
    return this.memberService.getConsumeList({
      page: Number(page),
      pageSize: Math.min(Number(pageSize) || 10, 100),
      memberId: memberId !== undefined && memberId !== '' ? Number(memberId) : undefined,
      consumeType,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      keyword,
      startTime,
      endTime
    });
  }

  @Permissions('system:member:create')
  @Post('consume/create')
  async createConsume(@Body() body: ConsumeCreateData, @Req() req: AuthenticatedRequest) {
    return this.memberService.createConsume(
      {
        orderNo: body.orderNo,
        memberId: Number(body.memberId),
        consumeType: body.consumeType,
        amount: Number(body.amount),
        payTime: body.payTime,
        remark: body.remark
      },
      req.user.username || '',
      (req.user.id as number) ?? null
    );
  }

  @Permissions('system:member:delete')
  @Delete('consume/delete/:id')
  async deleteConsume(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.memberService.deleteConsume(
      Number(id),
      req.user.username || '',
      (req.user.id as number) ?? null
    );
  }

  // ==================== 统计 ====================

  @Permissions('system:member:list')
  @Get('stats/overview')
  async getStatsOverview() {
    return this.memberService.getStatsOverview();
  }

  @Permissions('system:member:list')
  @Get('stats/trend')
  async getConsumeTrend(@Query('months') months?: string) {
    return this.memberService.getConsumeTrend(Number(months) || 6);
  }

  // ==================== Excel 导出 ====================

  /** 导出会员信息 Excel（在 :id 路由之前声明，避免被参数路由吞掉） */
  @Permissions('system:member:export')
  @Get('export/members')
  async exportMembers(
    @Res() res: Response,
    @Query('keyword') keyword?: string,
    @Query('levelId') levelId?: string,
    @Query('status') status?: string
  ) {
    const filename = `会员信息_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    try {
      const buf = await this.memberService.buildMemberExport({
        keyword,
        levelId: levelId !== undefined && levelId !== '' ? Number(levelId) : undefined,
        status: status !== undefined && status !== '' ? Number(status) : undefined
      });
      res.send(buf);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(500).json({ code: '500', data: null, msg: '会员信息导出失败' });
        return;
      }
      res.end();
      // eslint-disable-next-line no-console
      console.error('[member] 会员导出失败:', err instanceof Error ? err.message : err);
    }
  }

  /** 导出消费记录 Excel */
  @Permissions('system:member:export')
  @Get('export/consume')
  async exportConsume(
    @Res() res: Response,
    @Query('memberId') memberId?: string,
    @Query('consumeType') consumeType?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string
  ) {
    const filename = `消费记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    try {
      const buf = await this.memberService.buildConsumeExport({
        memberId: memberId !== undefined && memberId !== '' ? Number(memberId) : undefined,
        consumeType,
        status: status !== undefined && status !== '' ? Number(status) : undefined,
        keyword,
        startTime,
        endTime
      });
      res.send(buf);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(500).json({ code: '500', data: null, msg: '消费记录导出失败' });
        return;
      }
      res.end();
      // eslint-disable-next-line no-console
      console.error('[member] 消费导出失败:', err instanceof Error ? err.message : err);
    }
  }

  // ==================== 工具 ====================

  private mapLevelData(body: LevelUpsertData) {
    return {
      name: body.name,
      code: body.code,
      pointsMin: body.pointsMin === undefined ? undefined : Number(body.pointsMin),
      pointsMax: body.pointsMax === undefined ? undefined : Number(body.pointsMax),
      discountRate: body.discountRate === undefined ? undefined : Number(body.discountRate),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      status: body.status === undefined ? undefined : Number(body.status),
      remark: body.remark
    };
  }

  private mapRuleData(body: PointsRuleUpsertData) {
    return {
      name: body.name,
      code: body.code,
      points: body.points === undefined ? undefined : Number(body.points),
      pointsPerAmount: body.pointsPerAmount === undefined ? undefined : Number(body.pointsPerAmount),
      enabled: body.enabled === undefined ? undefined : Number(body.enabled),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      remark: body.remark
    };
  }
}
