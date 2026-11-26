import { IsArray, IsInt, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 配置更新入参 */
export class SysConfigUpdateDto {
  @IsOptional()
  @IsString()
  @Length(0, 2000, { message: '配置值长度不能超过 2000 字符' })
  configValue?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100, { message: '配置名称长度须在 1-100 之间' })
  configName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  status?: number;
}

/** 批量保存条目 */
export class SysConfigSaveItemDto {
  @IsInt()
  @Type(() => Number)
  id: number;

  /** 配置值可以是任意类型（string/number/boolean），service 层统一 String() 入库 */
  configValue: string | number | boolean;
}

/** 批量保存入参 */
export class SysConfigSaveBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SysConfigSaveItemDto)
  items: SysConfigSaveItemDto[];
}
