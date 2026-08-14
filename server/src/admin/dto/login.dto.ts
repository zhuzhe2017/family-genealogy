import { IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1, { message: '用户名不能为空' })
  userName: string;

  @IsString()
  @MinLength(1, { message: '密码不能为空' })
  password: string;

  /** 登录验证码 token（开启验证码时必填） */
  @IsOptional()
  @IsString()
  captchaToken?: string;

  /** 登录验证码输入值（开启验证码时必填） */
  @IsOptional()
  @IsString()
  captchaCode?: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(1, { message: 'refreshToken 不能为空' })
  refreshToken: string;
}
