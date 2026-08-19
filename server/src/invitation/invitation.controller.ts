import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { type AuthenticatedRequest } from '../common/types/common';
import { InvitationService } from './invitation.service';
import {
  type CreateInvitationData,
  type ProcessInvitationData,
  type InvitationQueryParams
} from './types/invitation.types';

/**
 * 家族会员邀请接口（小程序用户端）
 * - 前缀 /api/user/invitation
 * - 创建/撤销/列表需登录
 * - 接受/拒绝邀请需登录
 * - 通过邀请码查询邀请信息需登录（未登录用户先跳登录）
 */
@Public()
@UseGuards(UserJwtAuthGuard)
@Controller('user/invitation')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  /**
   * 创建邀请
   * body: { familyId, inviteePhone?, inviteeEmail?, role?, expireDays?, channel? }
   */
  @Post('create')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateInvitationData
  ) {
    return this.invitationService.createInvitation(String(req.user.id), body);
  }

  /**
   * 我发出的邀请列表
   */
  @Get('sent')
  getMySentInvitations(
    @Req() req: AuthenticatedRequest,
    @Query() query: InvitationQueryParams
  ) {
    return this.invitationService.getMySentInvitations(String(req.user.id), query);
  }

  /**
   * 我收到的邀请列表
   */
  @Get('received')
  getMyReceivedInvitations(
    @Req() req: AuthenticatedRequest,
    @Query() query: InvitationQueryParams
  ) {
    return this.invitationService.getMyReceivedInvitations(String(req.user.id), query);
  }

  /**
   * 查询家族全部邀请（仅限家族创建者/管理员）
   */
  @Get('family/:familyId/list')
  getFamilyInvitations(
    @Req() req: AuthenticatedRequest,
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query() query: InvitationQueryParams
  ) {
    return this.invitationService.getFamilyInvitations(String(req.user.id), { ...query, familyId });
  }

  /**
   * 通过邀请码查询邀请信息（供被邀请人查看详情）
   */
  @Get('info/:code')
  getInvitationByCode(@Param('code') code: string) {
    return this.invitationService.getInvitationByCode(code);
  }

  /**
   * 记录一次分享（分享海报/链接/扫码），用于分享记录与加入状态跟踪
   */
  @Post('share/:code')
  recordShare(@Param('code') code: string) {
    return this.invitationService.recordShare(code);
  }

  /**
   * 处理邀请：接受/拒绝
   * body: { inviteCode, accept, remark? }
   */
  @Post('process')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  processInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() body: ProcessInvitationData
  ) {
    return this.invitationService.processInvitation(String(req.user.id), body);
  }

  /**
   * 撤销我发出的邀请
   */
  @Put('revoke/:id')
  revokeInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.invitationService.revokeInvitation(String(req.user.id), id);
  }
}
