import {
  Controller, Get, Query, Param, ParseIntPipe, UseGuards
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { TimelineMapService } from './timeline-map.service';

/**
 * 时空地图端点（识典古籍对标 · 阶段 6）
 *
 * 统一路由：/timeline-map
 * - GET /timeline-map/:familyId/generations      按世代分组的地理分布
 * - GET /timeline-map/:familyId/migration        家族迁徙路线
 * - GET /timeline-map/history?start=&end=&cat=  同期历史事件（公开）
 * - GET /timeline-map/:familyId/timeline         家族事件 + 历史事件叠加
 */
@UseGuards(JwtAuthGuard)
@Controller('timeline-map')
export class TimelineMapController {
  constructor(private readonly svc: TimelineMapService) {}

  /** 按世代分组的地理分布 */
  @Get(':familyId/generations')
  async generations(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('minGen') minGen?: string,
    @Query('maxGen') maxGen?: string
  ) {
    return this.svc.getGenerations(familyId, {
      minGen: minGen ? Number(minGen) : undefined,
      maxGen: maxGen ? Number(maxGen) : undefined
    });
  }

  /** 家族迁徙路线 */
  @Get(':familyId/migration')
  async migration(@Param('familyId', ParseIntPipe) familyId: number) {
    return this.svc.getMigration(familyId);
  }

  /** 同期历史事件（公开，无需家族） */
  @Get('history')
  history(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('cat') cat?: string
  ) {
    const categories = cat ? cat.split(',').filter(Boolean) : undefined;
    return this.svc.getHistoryEvents(
      { start: start ? Number(start) : undefined, end: end ? Number(end) : undefined },
      categories as any
    );
  }

  /** 家族事件 + 历史事件叠加 */
  @Get(':familyId/timeline')
  async timeline(@Param('familyId', ParseIntPipe) familyId: number) {
    return this.svc.getCombinedTimeline(familyId);
  }
}
