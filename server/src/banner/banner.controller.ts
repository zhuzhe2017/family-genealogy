import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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

/** 全局广告公共接口：无需登录/家族归属，未登录或无家族用户也可看到全局广告 */
@Public()
@Controller('banner')
export class BannerPublicController {
  constructor(private readonly bannerService: BannerService) {}

  @Get('global')
  getGlobal() {
    return this.bannerService.getGlobalList();
  }

  /** 点击上报：用户点击广告后调用，用于运营统计（幂等，无副作用） */
  @Post(':id/click')
  recordClick(@Param('id') id: string) {
    return this.bannerService.recordClick(Number(id));
  }
}
