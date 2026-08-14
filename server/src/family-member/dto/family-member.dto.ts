import { IsString, IsOptional, IsNumber, IsIn, Min, Length } from 'class-validator';

export class CreateFamilyMemberDto {
  @IsString({ message: '姓名必须是字符串' })
  @Length(1, 50, { message: '姓名长度 1-50 字符' })
  name!: string;

  @IsOptional()
  @IsString({ message: '性别必须是字符串' })
  @IsIn(['male', 'female'], { message: '性别只能是 male 或 female' })
  gender?: string;

  @IsOptional()
  @IsNumber({}, { message: '代数必须是数字' })
  @Min(1, { message: '代数至少为 1' })
  generation?: number;

  @IsOptional()
  @IsString({ message: '字辈必须是字符串' })
  @Length(0, 10, { message: '字辈长度 0-10 字符' })
  generationName?: string;

  @IsOptional()
  @IsString({ message: '出生日期必须是字符串' })
  birthDate?: string;

  @IsOptional()
  @IsString({ message: '出生地必须是字符串' })
  birthPlace?: string;

  @IsOptional()
  @IsNumber({}, { message: '是否在世必须是数字' })
  isAlive?: number;

  @IsOptional()
  @IsString({ message: '逝世日期必须是字符串' })
  deathDate?: string;

  @IsOptional()
  @IsString({ message: '安葬地点必须是字符串' })
  deathPlace?: string;

  @IsOptional()
  @IsNumber({}, { message: '经度必须是数字' })
  longitude?: number;

  @IsOptional()
  @IsNumber({}, { message: '纬度必须是数字' })
  latitude?: number;

  @IsOptional()
  @IsString({ message: '生平简介必须是字符串' })
  bio?: string;

  @IsOptional()
  @IsString({ message: '父亲ID必须是字符串' })
  fatherId?: string;

  @IsOptional()
  @IsString({ message: '母亲ID必须是字符串' })
  motherId?: string;

  @IsOptional()
  spouseInfo?: unknown;

  @IsOptional()
  @IsNumber({}, { message: '排序必须是数字' })
  sortOrder?: number;
}

export class UpdateFamilyMemberDto extends CreateFamilyMemberDto {}
