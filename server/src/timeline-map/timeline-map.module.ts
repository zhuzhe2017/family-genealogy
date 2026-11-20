import { Module } from '@nestjs/common';
import { TimelineMapController } from './timeline-map.controller';
import { TimelineMapService } from './timeline-map.service';

/** 时空地图模块（识典古籍对标 · 阶段 6） */
@Module({
  controllers: [TimelineMapController],
  providers: [TimelineMapService],
  exports: [TimelineMapService]
})
export class TimelineMapModule {}
