import { IsBoolean, IsEnum, IsIn, IsNumber, IsOptional, IsString, Length, Matches, MinLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** 用户手机号密码登录入参 */
export class UserPwdLoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsString()
  @MinLength(1, { message: '密码不能为空' })
  password: string;
}

/** 刷新用户 token 入参 */
export class UserRefreshTokenDto {
  @IsString()
  @MinLength(1, { message: 'refreshToken 不能为空' })
  refreshToken: string;
}

/** 微信小程序登录入参 */
export class WxLoginDto {
  @IsString()
  @MinLength(1, { message: 'code 不能为空' })
  code: string;
}

/** 发送短信验证码入参 */
export class SendSmsCodeDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsOptional()
  @IsIn(['login', 'bind'], { message: 'scene 必须为 login 或 bind' })
  scene?: 'login' | 'bind';
}

/** 手机号验证码登录入参 */
export class PhoneLoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsString()
  @Length(4, 8, { message: '验证码长度须在 4-8 位之间' })
  code: string;
}

/** 设置/修改登录密码入参 */
export class SetPasswordDto {
  @IsString()
  @MinLength(6, { message: '密码长度不能少于 6 位' })
  password: string;
}

/** 绑定手机号入参 */
export class BindPhoneDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsString()
  @Length(4, 8, { message: '验证码长度须在 4-8 位之间' })
  code: string;
}

/** 更新用户资料入参 */
export class UserProfileUpdateDto {
  @IsOptional()
  @IsString()
  @Length(0, 50)
  nickName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(2)
  gender?: number;
}

/** 绑定家族成员入参 */
export class BindMemberDto {
  @IsString()
  @MinLength(1, { message: 'memberId 不能为空' })
  memberId: string;
}

/** 加入家族入参 */
export class JoinFamilyDto {
  @IsString()
  @MinLength(1, { message: '分享码不能为空' })
  shareCode: string;

  @IsOptional()
  @IsString()
  memberId?: string;
}

/** 设置家族成员角色入参 */
export class SetFamilyRoleDto {
  @IsString()
  @IsIn(['admin', 'member'], { message: 'role 必须为 admin 或 member' })
  role: string;
}

/** 记录隐私政策/用户协议同意入参 */
export class RecordConsentDto {
  @IsIn(['privacy', 'agreement', 'member_notice'], { message: 'docType 必须为 privacy / agreement / member_notice' })
  docType: 'privacy' | 'agreement' | 'member_notice';

  @IsOptional()
  @IsString()
  @Length(1, 20)
  docVersion?: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}

/** 记录微信订阅消息授权入参 */
export class RecordSubscribeAuthDto {
  @IsString()
  @MinLength(1, { message: 'tmplId 不能为空' })
  tmplId: string;

  @IsOptional()
  @IsIn(['renewal_reminder'], { message: 'scene 目前仅支持 renewal_reminder' })
  scene?: 'renewal_reminder';
}

/** 注销账号入参 */
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  reason?: string;
}
