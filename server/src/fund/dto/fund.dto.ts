import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Length, Min, Max, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/** 创建基金入参 */
export class FundCreateDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  initAmount?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  singleDepositLimit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  singleWithdrawLimit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  dailyDepositLimit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  dailyWithdrawLimit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  monthlyDepositLimit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  monthlyWithdrawLimit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  withdrawApprovalThreshold?: number;

  @IsOptional()
  @IsBoolean()
  needApproval?: number | boolean;
}

/** 更新基金设置入参（全字段可空） */
export class FundUpdateDto extends FundCreateDto {}

/** 资金操作入参（存取/转账/调账共用） */
export class FundOpDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  amount?: number | string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  targetUserId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  direction?: number;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}

/** 添加/更新基金成员入参 */
export class FundMemberDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  userId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  memberId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['leader', 'admin', 'member'], { message: '角色必须为 leader / admin / member' })
  role?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions?: string[];
}

/** 审批大额取出入参 */
export class FundApproveDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}

/** 解散基金入参 */
export class FundDissolveDto {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  reason?: string;
}
