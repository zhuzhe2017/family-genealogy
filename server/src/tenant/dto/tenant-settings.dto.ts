import { IsOptional, IsString, IsInt, Length, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** 家族设置更新 DTO（tenant 后台，家族管理员使用） */
export class TenantSettingsUpdateDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  logo?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  hallName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  origin?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  isPublic?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  allowJoin?: number;
}
