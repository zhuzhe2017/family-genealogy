import { IsString, MinLength, MaxLength, IsArray, IsInt } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(6, { message: '旧密码至少 6 位' })
  @MaxLength(64, { message: '旧密码最长 64 位' })
  oldPassword: string;

  @IsString()
  @MinLength(6, { message: '新密码至少 6 位' })
  @MaxLength(64, { message: '新密码最长 64 位' })
  newPassword: string;
}

export class BindFamilyDto {
  @IsArray()
  @IsString({ each: true })
  familyIds: string[];
}
