import { Module } from '@nestjs/common';
import { TimelineMapController } from './timeline-map.controller';
import { TimelineMapService } from './timeline-map.service';
import { UserModule } from '../user/user.module';

/**
 * 时空地图模块（识典古籍对标 · 阶段 6）
 * UserModule import 为 AuthGuard(['jwt','user-jwt']) 提供 user-jwt 策略
 */
@Module({
  imports: [UserModule],
  controllers: [TimelineMapController],
  providers: [TimelineMapService],
  exports: [TimelineMapService]
})
export class TimelineMapModule {}
