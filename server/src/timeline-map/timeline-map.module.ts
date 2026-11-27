import { Module } from '@nestjs/common';
import { TimelineMapController } from './timeline-map.controller';
import { TimelineMapService } from './timeline-map.service';
import { HistoryEventsAdminController } from './history-events-admin.controller';
import { HistoryEventsAdminService } from './history-events-admin.service';
import { UserModule } from '../user/user.module';

/**
 * 时空地图模块（识典古籍对标 · 阶段 6）
 *
 * controller:
 *   - TimelineMapController            小程序消费端（generations / migration / combined-timeline）
 *   - HistoryEventsAdminController     管理后台（history_events CRUD）
 *
 * UserModule import 为 AuthGuard(['jwt','user-jwt']) 提供 user-jwt 策略
 */
@Module({
  imports: [UserModule],
  controllers: [TimelineMapController, HistoryEventsAdminController],
  providers: [TimelineMapService, HistoryEventsAdminService],
  exports: [TimelineMapService, HistoryEventsAdminService]
})
export class TimelineMapModule {}
