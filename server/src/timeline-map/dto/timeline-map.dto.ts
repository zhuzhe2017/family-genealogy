import { IsOptional, IsInt, IsArray, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { HistoryCategory } from '../types/timeline-map.types';

/**
 * timeline-map 模块 DTO
 *
 * 本模块大部分接口用 ParseIntPipe + 内联参数处理即可，
 * 仅 history 端点有 start/end/cat 等可选查询参数需要集中校验。
 *
 * 注：controller 路由级使用 @UseGuards(AuthGuard) + @Public()，
 *     本 DTO 不涉及身份相关字段。
 */

/** 同期历史事件查询参数（公开接口，任何人可访问） */
export class HistoryQueryDto {
  /** 起始年份（含），负数表示公元前 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '起始年份必须是整数' })
  start?: number;

  /** 结束年份（含） */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '结束年份必须是整数' })
  end?: number;

  /** 分类过滤（逗号分隔），不传则返回全部 */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value
  )
  @IsArray()
  @IsEnum(
    ['politics', 'war', 'culture', 'economy', 'science', 'society'],
    { each: true, message: '分类值无效' }
  )
  cat?: HistoryCategory[];
}
