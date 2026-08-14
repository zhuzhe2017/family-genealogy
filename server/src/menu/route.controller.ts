import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { type AuthenticatedRequest } from '../common/types/common';

@UseGuards(JwtAuthGuard)
@Controller('route')
export class RouteController {
  constructor(private readonly menuService: MenuService) {}

  /** 获取常量路由 */
  @Get('getConstantRoutes')
  getConstantRoutes() {
    return this.menuService.getConstantRoutes();
  }

  /** 获取当前用户有权限访问的路由 */
  @Get('getUserRoutes')
  async getUserRoutes(@Req() req: AuthenticatedRequest) {
    const isSuper = req.user.roles?.includes('super');
    return this.menuService.getUserRoutes(req.user.id as number, isSuper ? 'super' : (req.user.role ?? ''));
  }

  /** 判断路由是否存在 */
  @Get('isRouteExist')
  async isRouteExist(@Query('routeName') routeName: string, @Req() req: AuthenticatedRequest) {
    const isSuper = req.user.roles?.includes('super');
    const exist = await this.menuService.isRouteExist(routeName, req.user.id as number, isSuper ? 'super' : (req.user.role ?? ''));
    return exist;
  }
}
