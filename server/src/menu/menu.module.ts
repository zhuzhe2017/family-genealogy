import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { RouteController } from './route.controller';
import { MenuService } from './menu.service';

@Module({
  controllers: [MenuController, RouteController],
  providers: [MenuService]
})
export class MenuModule {}
