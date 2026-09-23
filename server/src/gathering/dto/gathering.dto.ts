import { IsArray, IsInt, IsNumber, IsOptional, IsString, Length, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 议程项 */
export class AgendaItemDto {
  @IsString()
  @Length(1, 20)
  time: string;

  @IsString()
  @Length(1, 200)
  item: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}

/** 场次项 */
export class GatheringSessionDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  id?: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  capacity?: number;
}

/** 聚会创建/编辑入参 */
export class GatheringUpsertDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  familyId?: number;

  @IsOptional()
  @IsString()
  @Length(1, 200, { message: '标题长度须在 1-200 之间' })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  addressDetail?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  signupDeadline?: string;

  @IsOptional()
  agenda?: AgendaItemDto[] | string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  @Max(4)
  status?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GatheringSessionDto)
  sessions?: GatheringSessionDto[];
}

/** 报名入参 */
export class GatheringRegisterDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sessionId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  memberId?: number;

  @IsString()
  @Length(1, 50, { message: '姓名长度须在 1-50 之间' })
  name: string;

  @IsOptional()
  @IsString()
  @Length(0, 20, { message: '手机号长度不能超过 20 字符' })
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  dietType?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  dietNote?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  specialNeed?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  guestCount?: number;
}

/** 状态流转入参 */
export class GatheringStatusUpdateDto {
  @IsInt()
  @Type(() => Number)
  @Min(0)
  @Max(4)
  status: number;
}

/** 签到入参 */
export class GatheringCheckinDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  method?: string;
}

/** 归档资料创建入参 */
export class GatheringArchiveCreateDto {
  @IsOptional()
  @IsString()
  @Length(1, 200, { message: '标题长度须在 1-200 之间' })
  title?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  fileType?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
