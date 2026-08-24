import { Controller, Post, Get, Put, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { type AuthenticatedRequest } from '../common/types/common';
import { type AdminCreateData, type AdminUpdateData, type AdminProfileUpdateData } from './types/admin.types';

@Controller('auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** 管理员登录(公开接口,严格限流防暴力枚举:10 次/分钟/IP) */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.adminService.login(body.userName, body.password, req.ip, {
      token: body.captchaToken,
      code: body.captchaCode
    });
  }

  /** 获取当前管理员信息 */
  @UseGuards(JwtAuthGuard)
  @Get('getUserInfo')
  async getUserInfo(@Req() req: AuthenticatedRequest) {
    return this.adminService.getProfile(req.user.id as number);
  }

  /** 更新当前管理员个人资料（昵称/手机号/邮箱/头像，仅限本人） */
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() body: AdminProfileUpdateData) {
    return this.adminService.updateProfile(req.user.id as number, body);
  }

  /** 修改当前管理员登录密码（任意已登录管理员可修改本人密码） */
  @UseGuards(JwtAuthGuard)
  @Post('password')
  async changePassword(@Req() req: AuthenticatedRequest, @Body() body: { oldPassword: string; newPassword: string }) {
    return this.adminService.updatePassword(req.user.id as number, body.oldPassword, body.newPassword);
  }

  /** 刷新 token:校验 refreshToken 有效后签发新令牌对(限流 20 次/分钟/IP) */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refreshToken')
  async refreshToken(@Body() body: RefreshTokenDto) {
    return this.adminService.refreshToken(body.refreshToken);
  }
}

@Roles('super')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin')
export class AdminManageController {
  constructor(private readonly adminService: AdminService) {}

  /** 管理员列表 */
  @Permissions('system:admin:list')
  @Get('list')
  async list(@Query('page') page = 1, @Query('pageSize') pageSize = 10) {
    return this.adminService.getList(Number(page), Number(pageSize));
  }

  /** 创建管理员 */
  @Permissions('system:admin:create')
  @Post('create')
  async create(@Body() body: AdminCreateData) {
    return this.adminService.create(body);
  }

  /** 更新管理员 */
  @Permissions('system:admin:update')
  @Put('update/:id')
  async update(@Param('id') id: string, @Body() body: AdminUpdateData) {
    return this.adminService.update(Number(id), body);
  }

  /** 修改密码 */
  @Permissions('system:admin:password')
  @Post('update-password')
  async updatePassword(@Req() req: AuthenticatedRequest, @Body() body: { oldPassword: string; newPassword: string }) {
    return this.adminService.updatePassword(req.user.id as number, body.oldPassword, body.newPassword);
  }

  /** 获取管理员管理的家族列表 */
  @Permissions('system:admin:family')
  @Get('families')
  async getFamilies(@Req() req: AuthenticatedRequest) {
    return this.adminService.getFamilies(req.user.id as number);
  }

  /** 绑定管理员到家族 */
  @Permissions('system:admin:bind-family')
  @Post('bind-family/:id')
  async bindFamily(@Param('id') id: string, @Body() body: { familyIds: string[] }) {
    return this.adminService.bindFamily(Number(id), body.familyIds || []);
  }
}
