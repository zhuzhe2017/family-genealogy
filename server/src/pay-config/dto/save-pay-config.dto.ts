import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUrl, MaxLength, IsIn, ValidateNested, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

class WxPayConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @ValidateIf((o: WxPayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '微信支付 AppId 不能为空' })
  @MaxLength(64, { message: '微信支付 AppId 长度不能超过 64 字符' })
  appId!: string;

  @IsString()
  @ValidateIf((o: WxPayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '微信支付商户号不能为空' })
  @MaxLength(32, { message: '微信支付商户号长度不能超过 32 字符' })
  mchId!: string;

  @IsString()
  @ValidateIf((o: WxPayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '商户证书序列号不能为空' })
  @MaxLength(64, { message: '商户证书序列号长度不能超过 64 字符' })
  mchSerialNo!: string;

  @IsString()
  @ValidateIf((o: WxPayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '商户 API 私钥不能为空' })
  privateKey!: string;

  @IsString()
  @ValidateIf((o: WxPayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: 'API v3 密钥不能为空' })
  @MaxLength(64, { message: 'API v3 密钥长度不能超过 64 字符' })
  apiV3Key!: string;

  @IsString()
  @ValidateIf((o: WxPayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '支付回调通知 URL 不能为空' })
  @IsUrl({ protocols: ['http', 'https'] }, { message: '支付回调通知 URL 必须是合法的 http/https 地址' })
  @MaxLength(300, { message: '支付回调通知 URL 长度不能超过 300 字符' })
  notifyUrl!: string;

  @IsString()
  platformPublicKey!: string;

  @IsString()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] }, { message: '支付状态通知 URL 必须是合法的 http/https 地址' })
  @MaxLength(300, { message: '支付状态通知 URL 长度不能超过 300 字符' })
  statusNotifyUrl?: string;
}

class AlipayConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @ValidateIf((o: AlipayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '支付宝 AppId 不能为空' })
  @MaxLength(64, { message: '支付宝 AppId 长度不能超过 64 字符' })
  appId!: string;

  @IsString()
  @ValidateIf((o: AlipayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '应用私钥不能为空' })
  privateKey!: string;

  @IsString()
  @ValidateIf((o: AlipayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '支付宝公钥不能为空' })
  alipayPublicKey!: string;

  @IsString()
  @ValidateIf((o: AlipayConfigDto) => o.enabled === true)
  @IsNotEmpty({ message: '支付回调通知 URL 不能为空' })
  @IsUrl({ protocols: ['http', 'https'] }, { message: '支付回调通知 URL 必须是合法的 http/https 地址' })
  @MaxLength(300, { message: '支付回调通知 URL 长度不能超过 300 字符' })
  notifyUrl!: string;

  @IsString()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] }, { message: '支付状态通知 URL 必须是合法的 http/https 地址' })
  @MaxLength(300, { message: '支付状态通知 URL 长度不能超过 300 字符' })
  statusNotifyUrl?: string;
}

export class SavePayConfigDto {
  @IsString()
  @IsIn(['wxpay', 'alipay'], { message: '无效的支付服务商' })
  provider!: 'wxpay' | 'alipay';

  @ValidateNested()
  @Type(() => WxPayConfigDto)
  wxpay!: WxPayConfigDto;

  @ValidateNested()
  @Type(() => AlipayConfigDto)
  alipay!: AlipayConfigDto;
}
