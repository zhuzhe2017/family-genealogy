import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength, IsIn } from 'class-validator';
import type { CloudStorageProvider } from '../types/cloud-storage-config.types';

class TencentCosConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsNotEmpty({ message: 'SecretId 不能为空' })
  secretId!: string;

  @IsString()
  @IsNotEmpty({ message: 'SecretKey 不能为空' })
  secretKey!: string;

  @IsString()
  @IsNotEmpty({ message: '存储桶名称不能为空' })
  @MaxLength(63, { message: '存储桶名称长度不能超过 63 字符' })
  bucket!: string;

  @IsString()
  @IsNotEmpty({ message: '地域不能为空' })
  @MaxLength(50, { message: '地域长度不能超过 50 字符' })
  region!: string;

  @IsString()
  appId!: string;

  @IsString()
  @MaxLength(200, { message: '自定义域名长度不能超过 200 字符' })
  domain!: string;
}

class AliyunOssConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsNotEmpty({ message: 'AccessKeyId 不能为空' })
  accessKeyId!: string;

  @IsString()
  @IsNotEmpty({ message: 'AccessKeySecret 不能为空' })
  accessKeySecret!: string;

  @IsString()
  @IsNotEmpty({ message: '存储桶名称不能为空' })
  @MaxLength(63, { message: '存储桶名称长度不能超过 63 字符' })
  bucket!: string;

  @IsString()
  @IsNotEmpty({ message: '地域不能为空' })
  @MaxLength(50, { message: '地域长度不能超过 50 字符' })
  region!: string;

  @IsString()
  @MaxLength(200, { message: 'Endpoint 长度不能超过 200 字符' })
  endpoint!: string;

  @IsString()
  @MaxLength(200, { message: '自定义域名长度不能超过 200 字符' })
  domain!: string;
}

class QiniuKodoConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsNotEmpty({ message: 'AccessKey 不能为空' })
  accessKey!: string;

  @IsString()
  @IsNotEmpty({ message: 'SecretKey 不能为空' })
  secretKey!: string;

  @IsString()
  @IsNotEmpty({ message: '存储桶名称不能为空' })
  @MaxLength(63, { message: '存储桶名称长度不能超过 63 字符' })
  bucket!: string;

  @IsString()
  @MaxLength(50, { message: '区域长度不能超过 50 字符' })
  region!: string;

  @IsString()
  @MaxLength(200, { message: '自定义域名长度不能超过 200 字符' })
  domain!: string;
}

export class SaveCloudStorageConfigDto {
  @IsString()
  @IsIn(['tencent', 'aliyun', 'qiniu'], { message: '无效的云存储服务商' })
  provider!: CloudStorageProvider;

  tencent!: TencentCosConfigDto;
  aliyun!: AliyunOssConfigDto;
  qiniu!: QiniuKodoConfigDto;
}
