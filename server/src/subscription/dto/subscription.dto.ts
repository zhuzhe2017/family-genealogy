import { IsIn, IsInt, IsOptional, IsString, Min, Max, Length } from 'class-validator';

/** 可购买的套餐编码（免费版不参与购买） */
export const PURCHASABLE_PLANS = ['family', 'premium'] as const;

/** 下单请求 */
export class PrepayDto {
  @IsInt()
  @Min(1)
  familyId!: number;

  @IsIn(PURCHASABLE_PLANS)
  planCode!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;
}

/** 退款请求 */
export class RefundDto {
  /** 平台订单号 order_no 或商户订单号 out_trade_no */
  @IsString()
  @Length(1, 64)
  orderNo!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  reason?: string;
}
