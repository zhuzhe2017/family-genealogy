import { IsArray, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 创建/更新套餐入参 */
export class PlanUpsertDto {
  @IsOptional()
  @IsString()
  @Length(1, 50, { message: '套餐编码长度须在 1-50 之间' })
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100, { message: '套餐名称长度须在 1-100 之间' })
  name?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  priceAnnual?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  storageLimit?: number;

  @IsOptional()
  quotaRules?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  status?: number;
}

/** 开通/续费家族订阅入参 */
export class ActivateFamilyDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  @IsString()
  @Length(1, 50, { message: '套餐编码长度须在 1-50 之间' })
  planCode: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1, { message: '月数至少为 1' })
  months?: number;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  ownerUserId?: string;
}

/** 冻结家族订阅入参 */
export class FreezeFamilyDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '原因长度不能超过 200 字符' })
  reason?: string;
}

/** 订单退款入参 */
export class RefundOrderDto {
  @IsString()
  @Length(1, 64, { message: '订单号长度须在 1-64 之间' })
  orderNo: string;

  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '原因长度不能超过 200 字符' })
  reason?: string;
}
