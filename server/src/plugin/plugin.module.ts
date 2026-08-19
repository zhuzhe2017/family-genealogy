import { Module } from '@nestjs/common';
import { PluginAdminController } from './plugin-admin.controller';
import { PluginAdminService } from './plugin-admin.service';
import { PluginController } from './plugin.controller';
import { PluginService } from './plugin.service';

@Module({
  controllers: [PluginController, PluginAdminController],
  providers: [PluginService, PluginAdminService]
})
export class PluginModule {}
