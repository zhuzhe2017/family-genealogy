import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { UserJwtAuthGuard } from '../user/user.guard';
import { MemberService } from './member.service';
import { type AuthenticatedRequest } from '../common/types/common';

/**
 * 用户侧会员接口：小程序「我的会员」页
 * - GET  /api/user/member/profile  我的会员信息（等级/积分/明细）
 * - POST /api/user/member/signin   每日签到得积分
 */
@UseGuards(UserJwtAuthGuard)
@Controller('user/member')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  /** 我的会员信息（未建档返回 { member: null }） */
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const data = await this.memberService.getMyMember(String(req.user.id));
    return { member: data ? data.member : null, level: data ? data.level : null, pointsRecords: data ? data.pointsRecords : [] };
  }

  /** 每日签到 */
  @Post('signin')
  async signIn(@Req() req: AuthenticatedRequest) {
    return this.memberService.signIn(String(req.user.id));
  }
}
