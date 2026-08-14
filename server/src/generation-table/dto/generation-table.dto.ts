import { IsArray, IsString, IsOptional, Matches, ArrayMinSize } from 'class-validator';

// 汉字约束正则（兼容诗句型多字辈：同代多字可用空格或逗号分隔）
const RE_SURNAME = /^(?:[\u4e00-\u9fa5]{1,4}|\S{1,20})$/; // 姓氏 1-4 汉字或任意非空白 1-20 字符（兼容单姓、复姓、少数民族姓氏）
const RE_FOUNDER = /^[\u4e00-\u9fa5]{1,20}$/; // 始祖/支系名 1-20 汉字
const RE_GEN = /^[\u4e00-\u9fa5\s,，]{1,20}$/; // 每代字辈：1-20 个汉字，可含空格/逗号分隔多字（诗句模式）

export class CreateGenerationTableDto {
  @Matches(RE_SURNAME, { message: '姓氏必须为1-4个汉字或1-20个非空白字符' })
  surname!: string;

  @Matches(RE_FOUNDER, { message: '始祖/支系名必须为1-20个汉字' })
  founder!: string;

  @IsArray({ message: '字辈序列必须为数组' })
  @ArrayMinSize(1, { message: '字辈序列至少1代' })
  @Matches(RE_GEN, { each: true, message: '每代字辈必须为1-20个汉字，同代多字可用空格或逗号分隔' })
  generationSequence!: string[];

  @IsArray({ message: '常见区域必须为数组' })
  @ArrayMinSize(1, { message: '常见区域至少1项' })
  @IsString({ each: true, message: '区域必须为字符串' })
  commonRegions!: string[];

  @IsOptional()
  @IsString()
  createBy?: string;
}

export class UpdateGenerationTableDto {
  @IsOptional()
  @Matches(RE_SURNAME, { message: '姓氏必须为1-4个汉字或1-20个非空白字符' })
  surname?: string;

  @IsOptional()
  @Matches(RE_FOUNDER, { message: '始祖/支系名必须为1-20个汉字' })
  founder?: string;

  @IsOptional()
  @IsArray({ message: '字辈序列必须为数组' })
  @ArrayMinSize(1, { message: '字辈序列至少1代' })
  @Matches(RE_GEN, { each: true, message: '每代字辈必须为1-20个汉字，同代多字可用空格或逗号分隔' })
  generationSequence?: string[];

  @IsOptional()
  @IsArray({ message: '常见区域必须为数组' })
  @ArrayMinSize(1, { message: '常见区域至少1项' })
  @IsString({ each: true, message: '区域必须为字符串' })
  commonRegions?: string[];
}
