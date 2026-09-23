import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type AuthenticatedRequest } from '../common/types/common';
import { SubscriptionAdminService } from './subscription-admin.service';
import { SubscriptionService } from './subscription.service';
import { PlanUpsertDto, ActivateFamilyDto, FreezeFamilyDto, RefundOrderDto } from './dto/subscription-admin.dto';

/**
 * 订阅管理后台接口（套餐 / 家族订阅 / 订单记录）
 * 受 JwtAuthGuard + RolesGuard + PermissionsGuard 保护
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('subscription')
export class SubscriptionAdminController {
  constructor(
    private readonly adminService: SubscriptionAdminService,
    private readonly subscriptionService: SubscriptionService
  ) {}

  // ==================== 套餐管理 ====================

  @Permissions('system:subscription:list')
  @Get('plans/list')
  async getPlanList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string
  ) {
    return this.adminService.getPlanList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  @Permissions('system:subscription:create')
  @Post('plans/create')
  async createPlan(@Body() body: PlanUpsertDto, @Req() req: AuthenticatedRequest) {
    return this.adminService.createPlan(
      {
        code: body.code,
        name: body.name,
        priceAnnual: body.priceAnnual === undefined ? undefined : Number(body.priceAnnual),
        capabilities: body.capabilities,
        storageLimit: body.storageLimit === undefined ? undefined : Number(body.storageLimit),
        quotaRules: body.quotaRules,
        sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
        status: body.status === undefined ? undefined : Number(body.status)
      },
      req.user.username,
      (req.user.id as number) ?? null
    );
  }

  @Permissions('system:subscription:update')
  @Put('plans/update/:code')
  async updatePlan(
    @Param('code') code: string,
    @Body() body: PlanUpsertDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.adminService.updatePlan(
      code,
      {
        name: body.name,
        priceAnnual: body.priceAnnual === undefined ? undefined : Number(body.priceAnnual),
        capabilities: body.capabilities,
        storageLimit: body.storageLimit === undefined ? undefined : Number(body.storageLimit),
        quotaRules: body.quotaRules,
        sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
        status: body.status === undefined ? undefined : Number(body.status)
      },
      req.user.username,
      (req.user.id as number) ?? null
    );
  }

  // ==================== 家族订阅管理 ====================

  @Permissions('system:subscription:list')
  @Get('families/list')
  async getFamilyList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('planCode') planCode?: string,
    @Query('status') status?: string
  ) {
    return this.adminService.getFamilySubscriptionList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      planCode,
      status
    });
  }

  @Permissions('system:subscription:update')
  @Post('families/activate')
  async activateFamily(
    @Body() body: ActivateFamilyDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.adminService.activateFamily(
      {
        familyId: Number(body.familyId),
        planCode: body.planCode,
        months: body.months === undefined ? undefined : Number(body.months),
        ownerUserId: body.ownerUserId
      },
      req.user.username,
      (req.user.id as number) ?? null
    );
  }

  @Permissions('system:subscription:update')
  @Post('families/freeze')
  async freezeFamily(
    @Body() body: FreezeFamilyDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.adminService.freezeFamily(
      { familyId: Number(body.familyId), reason: body.reason },
      req.user.username,
      (req.user.id as number) ?? null
    );
  }

  // ==================== 订单记录 ====================

  @Permissions('system:subscription:list')
  @Get('orders/list')
  async getOrderList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('familyId') familyId?: string
  ) {
    return this.adminService.getOrderList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      status,
      familyId: familyId !== undefined && familyId !== '' ? Number(familyId) : undefined
    });
  }

  /** 后台订单退款（仅已支付订单；真实/模拟微信退款 + 订阅降级，权限码 system:subscription:refund） */
  @Permissions('system:subscription:refund')
  @Post('orders/refund')
  async refundOrder(
    @Body() body: RefundOrderDto,
    @Req() req: AuthenticatedRequest
  ) {
    const orderNo = (body.orderNo || '').trim();
    if (!orderNo) {
      throw new HttpException('缺少订单号', HttpStatus.BAD_REQUEST);
    }
    await this.subscriptionService.adminRefund(
      orderNo,
      body.reason,
      req.user.username,
      (req.user.id as number) ?? null
    );
    return { success: true };
  }
}
