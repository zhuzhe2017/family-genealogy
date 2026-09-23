import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { type PluginEntryType } from '../types/plugin.types';

/** 插件新增/编辑入参 */
export class PluginUpsertDto {
  @IsOptional()
  @IsString()
  @Length(1, 50, { message: '插件编码长度须在 1-50 之间' })
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100, { message: '插件名称长度须在 1-100 之间' })
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['page', 'url'] as PluginEntryType[], { message: '入口类型必须为 page / url' })
  entryType?: PluginEntryType;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  entryValue?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  status?: number;
}
