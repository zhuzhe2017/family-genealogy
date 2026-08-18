import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { type AuthenticatedRequest } from '../common/types/common';
import { BannerService } from './banner.service';

/**
 * 小程序用户端广告轮播接口
 * @Public 跳过全局管理员 JwtAuthGuard，改用 UserJwtAuthGuard 校验用户令牌
 * 家族归属在 Service 内校验
 */
@Public()
@UseGuards(UserJwtAuthGuard)
@Controller('user/banner')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  /** 当前家族启用轮播列表（?familyId=，含全局广告与切换间隔） */
  @Get('list')
  getList(@Req() req: AuthenticatedRequest, @Query('familyId') familyId?: string) {
    return this.bannerService.getActiveList(String(req.user.id), Number(familyId) || 0);
  }
}
