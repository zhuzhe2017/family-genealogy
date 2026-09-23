import { IsInt, IsNumber, IsOptional, IsString, Length, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** 家族创建入参（小程序用户端） */
export class PortalFamilyCreateDto {
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

  /** 小程序用户创建者ID（由服务端令牌注入，防客户端伪造） */
  @IsOptional()
  @IsString()
  @Length(0, 64)
  creatorUserId?: string;
}

/** 家族成员创建入参（小程序用户端） */
export class PortalFamilyMemberCreateDto {
  @IsString({ message: '姓名必须是字符串' })
  @Length(1, 50, { message: '姓名长度 1-50 字符' })
  name: string;

  @IsOptional()
  @IsString({ message: '性别必须是字符串' })
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
  @IsString({ message: '头像必须是字符串' })
  @Length(0, 500)
  avatarUrl?: string;

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

/** 家族成员更新入参（小程序用户端） */
export class PortalFamilyMemberUpdateDto {
  @IsOptional()
  @IsString({ message: '姓名必须是字符串' })
  @Length(1, 50, { message: '姓名长度 1-50 字符' })
  name?: string;

  @IsOptional()
  @IsString({ message: '性别必须是字符串' })
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
  @IsString({ message: '头像必须是字符串' })
  @Length(0, 500)
  avatarUrl?: string;

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

  @IsOptional()
  @IsNumber({}, { message: '状态必须是数字' })
  status?: number;
}

/** 内容创建/更新入参（dynamic/photo/document/event 合并） */
export class PortalContentCreateDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  // dynamic 专用
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  userGender?: string;

  // photo 专用
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  uploaderId?: string;

  @IsOptional()
  @IsString()
  uploaderName?: string;

  // document 专用
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  volume?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pageCount?: number;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  // event 专用
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  month?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  day?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  typeName?: string;

  @IsOptional()
  @IsString()
  creatorId?: string;

  @IsOptional()
  details?: Array<{ label: string; value: string }>;

  @IsOptional()
  relatedMembers?: Array<{ id: string; name: string; gender?: string; relation?: string }>;

  @IsOptional()
  @IsString({ each: true })
  photos?: string[];
}

/** 动态评论入参 */
export class PortalCommentCreateDto {
  @IsString()
  @Length(1, 500, { message: '评论内容长度须在 1-500 之间' })
  content: string;
}

/** 分类创建入参 */
export class PortalCategoryCreateDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  @IsString()
  @Length(1, 50, { message: '分类名称长度须在 1-50 之间' })
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

/** 分类更新入参 */
export class PortalCategoryUpdateDto {
  @IsNumber({}, { message: '家族ID必须是数字' })
  @Type(() => Number)
  familyId: number;

  @IsOptional()
  @IsString()
  @Length(1, 50, { message: '分类名称长度须在 1-50 之间' })
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}
