import { IsIn, IsNumber, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { WORSHIP_TYPES } from '../types/worship.types';

/** 提交祭祀记录入参 */
export class WorshipRecordCreateDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  @IsString()
  @IsIn(WORSHIP_TYPES, { message: 'type 必须为 incense / pray / offer / wish' })
  type: string;

  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '内容长度不能超过 500 字符' })
  content?: string;
}

/** 创建纪念对象入参 */
export class WorshipMemorialCreateDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  @IsString()
  @Length(1, 64, { message: '成员ID长度须在 1-64 之间' })
  memberId: string;

  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '墓志铭长度不能超过 500 字符' })
  epitaph?: string;
}
