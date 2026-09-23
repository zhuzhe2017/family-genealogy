import { IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { type InvitationRole, type InvitationChannel } from '../types/invitation.types';

/** 创建邀请入参 */
export class CreateInvitationDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  @IsOptional()
  @IsString()
  @Length(1, 20, { message: '手机号长度须在 1-20 之间' })
  inviteePhone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100, { message: '邮箱长度须在 1-100 之间' })
  inviteeEmail?: string;

  @IsOptional()
  @IsIn(['member', 'admin'] as InvitationRole[], { message: '角色必须为 member / admin' })
  role?: InvitationRole;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1, { message: '有效期至少 1 天' })
  @Max(365, { message: '有效期最多 365 天' })
  expireDays?: number;

  @IsOptional()
  @IsIn(['link', 'sms', 'email', 'wechat', 'qrcode', 'poster'] as InvitationChannel[], { message: '渠道不合法' })
  channel?: InvitationChannel;
}

/** 处理邀请入参 */
export class ProcessInvitationDto {
  @IsString()
  @Length(1, 64, { message: '邀请码长度须在 1-64 之间' })
  inviteCode: string;

  @IsIn([true, false], { message: 'accept 必须为布尔值' })
  accept: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '备注长度不能超过 200 字符' })
  remark?: string;
}
