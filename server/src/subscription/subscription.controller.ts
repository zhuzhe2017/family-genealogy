import { Body, Controller, Get, HttpStatus, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response, Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { UserJwtAuthGuard } from '../user/user.guard';
import { EntitlementService } from '../membership/membership.service';
import { type AuthenticatedRequest } from '../common/types/common';
import { SubscriptionService } from './subscription.service';
import { PrepayDto, RefundDto } from './dto/subscription.dto';
import { type WechatNotifyBody } from './types/subscription.types';

/**
 * 小程序用户端订阅接口（current / plans / prepay / refund）
 * @Public 跳过全局管理员 JwtAuthGuard，改用 UserJwtAuthGuard 校验用户令牌
 */
@Public()
@UseGuards(UserJwtAuthGuard)
@Controller('user/subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly entitlementService: EntitlementService
  ) {}

  /** 订阅状态：当前套餐 + 存储用量 + 按次额度消耗（会员中心展示用） */
  @Get('current')
  getCurrent(@Req() req: AuthenticatedRequest, @Query('familyId') familyId?: string) {
    return this.subscriptionService.getCurrent(String(req.user.id), Number(familyId) || 0);
  }

  /** 套餐列表（会员中心展示，含免费版） */
  @Get('plans')
  getPlans() {
    return this.entitlementService.getAllPlans();
  }

  /** 订阅下单：返回 wx.requestPayment 参数（模拟模式下返回 mock 标记） */
  @Post('prepay')
  prepay(@Req() req: AuthenticatedRequest, @Body() dto: PrepayDto) {
    return this.subscriptionService.prepay(String(req.user.id), dto);
  }

  /** 申请退款（订单支付人本人） */
  @Post('refund')
  refund(@Req() req: AuthenticatedRequest, @Body() dto: RefundDto) {
    return this.subscriptionService.refund(String(req.user.id), dto);
  }
}

/**
 * 微信支付回调（微信服务器调用，无需用户认证）
 * 使用 @Res() 手动响应微信要求的 { code: 'SUCCESS' | 'FAIL' } 格式
 */
@Public()
@Controller('subscription')
export class WxNotifyController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('pay/notify')
  async notify(@Body() body: WechatNotifyBody, @Req() req: Request, @Res() res: Response) {
    // 验签需用微信回调的原始请求体（express rawBody，由 body-parser raw 中间件提供）
    const rawBody = (req as { rawBody?: string }).rawBody || JSON.stringify(body);
    const result = await this.subscriptionService.handleNotify(body, req.headers, rawBody);
    res.status(HttpStatus.OK).json(result);
  }
}
