import { IsOptional, IsString, IsInt, Min, Max, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class TenantContentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  keyword?: string;
}

export class TenantPhotoCreateDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  year?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class TenantDocumentCreateDto {
  @IsString()
  @Length(1, 200)
  name: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  volume?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  pageCount?: number;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
