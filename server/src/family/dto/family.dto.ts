import { IsInt, IsNumber, IsOptional, IsString, Length, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/** 家族创建入参 */
export class FamilyCreateDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  surnameId?: number | null;

  @IsOptional()
  @IsString()
  generationTableId?: string | null;

  @IsString()
  @Length(1, 100, { message: '家族名称长度须在 1-100 之间' })
  name: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  founder?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  hallName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  origin?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  isPublic?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  allowJoin?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  creatorId?: number;
}

/** 家族更新入参 */
export class FamilyUpdateDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  surnameId?: number | null;

  @IsOptional()
  @IsString()
  generationTableId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100, { message: '家族名称长度须在 1-100 之间' })
  name?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  founder?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  hallName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  origin?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  isPublic?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  allowJoin?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  status?: number;
}
