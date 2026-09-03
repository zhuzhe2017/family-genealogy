import {
  IsOptional,
  IsString,
  IsInt,
  IsNumber,
  Min,
  Max,
  Length,
  Matches
} from 'class-validator';
import { Type } from 'class-transformer';

export class TenantMemberCreateDto {
  @IsString()
  @Length(1, 50)
  name: string;

  @IsOptional()
  @IsString()
  gender?: string = 'male';

  @IsInt()
  @Type(() => Number)
  @Min(1)
  generation: number;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  generationName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 30)
  birthDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  birthPlace?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  isAlive?: number = 1;

  @IsOptional()
  @IsString()
  @Length(0, 30)
  deathDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  deathPlace?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  fatherId?: string;

  @IsOptional()
  @IsString()
  motherId?: string;

  @IsOptional()
  spouseInfo?: unknown;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}
