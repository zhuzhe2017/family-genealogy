import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { type AuthenticatedRequest } from '../common/types/common';
import { FundService } from './fund.service';
import {
  FundCreateDto,
  FundUpdateDto,
  FundOpDto,
  FundMemberDto,
  FundApproveDto,
  FundDissolveDto
} from './dto/fund.dto';

/**
 * 小程序用户端家族基金接口
 * @Public 跳过全局管理员 JwtAuthGuard，改用 UserJwtAuthGuard 校验用户令牌
 * 家族归属 / 角色权限 / 限额校验均在 Service 内完成
 */
@Public()
@UseGuards(UserJwtAuthGuard)
@Controller('user/fund')
export class FundController {
  constructor(private readonly fundService: FundService) {}

  /** 基金信息 + 我的角色/权限（无基金时 hasFund=false） */
  @Get('info')
  getInfo(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string) {
    return this.fundService.getInfo(String(req.user.id), Number(familyId) || 0);
  }

  /** 创建基金（每家族唯一，创建人自动成为族长） */
  @Post()
  create(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: FundCreateDto) {
    return this.fundService.create(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 更新基金基本信息与限额规则（manage_rule） */
  @Put('settings')
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Body() body: FundUpdateDto
  ) {
    return this.fundService.updateSettings(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 基金成员列表（view_all 可见全部，否则仅本人） */
  @Get('members')
  getMembers(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string) {
    return this.fundService.getMembers(String(req.user.id), Number(familyId) || 0);
  }

  /** 添加基金成员（manage_member） */
  @Post('members')
  addMember(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: FundMemberDto) {
    return this.fundService.addMember(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 更新成员角色/权限（manage_member） */
  @Put('members/:userId')
  updateMember(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('userId') targetUserId: string,
    @Body() body: FundMemberDto
  ) {
    return this.fundService.updateMember(String(req.user.id), Number(familyId) || 0, targetUserId, body || {});
  }

  /** 移除基金成员（manage_member） */
  @Delete('members/:userId')
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('userId') targetUserId: string
  ) {
    return this.fundService.removeMember(String(req.user.id), Number(familyId) || 0, targetUserId);
  }

  /** 存入（deposit） */
  @Post('deposit')
  deposit(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: FundOpDto) {
    return this.fundService.deposit(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 取出（withdraw；超阈值自动进入待审批） */
  @Post('withdraw')
  withdraw(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: FundOpDto) {
    return this.fundService.withdraw(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 成员间转账（transfer，仅个人余额转移） */
  @Post('transfer')
  transfer(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: FundOpDto) {
    return this.fundService.transfer(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 调账（族长，公共池直接增减） */
  @Post('adjust')
  adjust(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: FundOpDto) {
    return this.fundService.adjust(String(req.user.id), Number(familyId) || 0, body || {});
  }

  /** 审批大额取出（approve） */
  @Post('transactions/:txId/approve')
  approveTx(
    @Req() req: AuthenticatedRequest,
    @Query('familyId') familyId: string,
    @Param('txId') txId: string,
    @Body() body: FundApproveDto
  ) {
    return this.fundService.approveTx(String(req.user.id), Number(familyId) || 0, Number(txId), body || {});
  }

  /** 交易明细分页（?familyId=&type=&status=&userId=&startDate=&endDate=&page=&pageSize=） */
  @Get('transactions')
  getTransactions(@Req() req: AuthenticatedRequest, @Query() query: Record<string, string>) {
    return this.fundService.getTransactions(String(req.user.id), Number(query.familyId) || 0, {
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 10,
      type: query.type || undefined,
      status: query.status !== undefined && query.status !== '' ? Number(query.status) : undefined,
      userId: query.userId || undefined,
      startDate: query.startDate || undefined,
      endDate: query.endDate || undefined
    });
  }

  /** 慈善榜单（?familyId=&limit=，默认10条，最多20条） */
  @Get('rank')
  getRank(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Query('limit') limit?: string) {
    return this.fundService.getRank(String(req.user.id), Number(familyId) || 0, Number(limit) || 10);
  }

  /** 基金统计（余额/今日/本月/我的） */
  @Get('stats')
  getStats(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string) {
    return this.fundService.getStats(String(req.user.id), Number(familyId) || 0);
  }

  /** 解散基金（dissolve，公共池余额需为 0） */
  @Post('dissolve')
  dissolve(@Req() req: AuthenticatedRequest, @Query('familyId') familyId: string, @Body() body: FundDissolveDto) {
    return this.fundService.dissolve(String(req.user.id), Number(familyId) || 0, body || {});
  }
}
