import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PluginService } from './plugin.service';

/**
 * 小程序端应用插件接口（应用中心「应用」分区）
 * - @Public 跳过全局管理员 JwtAuthGuard
 * - 插件均为全局应用，无需登录即可查看列表
 */
@Public()
@Controller('plugin')
export class PluginController {
  constructor(private readonly pluginService: PluginService) {}

  /** 启用中的插件列表 */
  @Get('list')
  getList() {
    return this.pluginService.getActiveList();
  }
}
