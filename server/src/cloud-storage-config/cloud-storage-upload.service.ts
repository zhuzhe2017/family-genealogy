import { Injectable, Logger } from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { createHmac } from 'crypto';
import { CloudStorageConfigService } from './cloud-storage-config.service';
import type {
  AliyunOssConfig,
  CloudStorageProvider,
  QiniuKodoConfig,
  TencentCosConfig
} from './types/cloud-storage-config.types';
import { buildStoredFileName } from '../common/upload/upload.service';

/** 云存储上传结果 */
export interface CloudUploadResult {
  /** 可公开访问的 URL（http/https 完整地址） */
  url: string;
  /** 对象键（文件名） */
  filename: string;
}

/**
 * 云存储上传服务：读取当前启用的服务商配置，将图片上传到云存储。
 * 已接入：腾讯云 COS、阿里云 OSS、七牛云 Kodo。
 * 未启用云存储或上传失败时返回 null，由调用方回退本地磁盘存储。
 */
@Injectable()
export class CloudStorageUploadService {
  private readonly logger = new Logger(CloudStorageUploadService.name);

  constructor(private readonly configService: CloudStorageConfigService) {}

  /**
   * 上传图片到当前启用的云存储服务商。
   * @param folder 业务分类目录（如 photo），为空则存桶根目录
   * @param familyScope 家族 ID 与年月日日期段（家族维度上传时细分，如 12/2026/08/25），为空则不细分
   * @returns 上传成功返回 { url, filename }；未启用云存储、服务商未接入或上传失败返回 null
   */
  async uploadImage(buffer: Buffer, mimetype: string, folder = '', familyScope = ''): Promise<CloudUploadResult | null> {
    let active: { provider: CloudStorageProvider; config: Record<string, unknown> } | null;
    try {
      active = await this.configService.getActiveConfig();
    } catch (error) {
      this.logger.warn(`读取云存储配置失败: ${(error as Error).message}，回退本地存储`);
      return null;
    }
    if (!active) return null;

    const filename = buildStoredFileName(mimetype);
    // 对象键带业务分类 + 家族前缀（avatar/12/xxx.png），便于在桶内按目录管理
    const prefix = [folder, familyScope].filter(Boolean).join('/');
    const key = prefix ? `${prefix}/${filename}` : filename;

    try {
      let url: string;
      switch (active.provider) {
        case 'tencent':
          url = await this.uploadToTencent(active.config as TencentCosConfig, key, buffer, mimetype);
          break;
        case 'aliyun':
          url = await this.uploadToAliyun(active.config as AliyunOssConfig, key, buffer, mimetype);
          break;
        case 'qiniu':
          url = await this.uploadToQiniu(active.config as QiniuKodoConfig, key, buffer, mimetype);
          break;
        default:
          this.logger.warn(`云存储服务商(${active.provider})暂未接入，回退本地存储`);
          return null;
      }
      this.logger.log(`云存储上传成功(${active.provider}): ${key}`);
      return { url, filename: key };
    } catch (error) {
      this.logger.warn(`云存储上传失败(${active.provider}): ${(error as Error).message}，回退本地存储`);
      return null;
    }
  }

  /** 腾讯云 COS 上传 */
  private async uploadToTencent(
    config: TencentCosConfig,
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    const bucketName = String(config.bucket || '').trim();
    const appId = String(config.appId || '').trim();
    // COS 存储桶完整名称为 {名称}-{APPID}，兼容用户直接填完整桶名的情况
    const bucket = appId && !bucketName.endsWith(`-${appId}`) ? `${bucketName}-${appId}` : bucketName;
    const region = String(config.region || '').trim();

    const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
    await new Promise<void>((resolve, reject) => {
      cos.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          // 对象级公有读：即使桶为私有读写，上传的对象也可经公网 URL 直接访问
          ACL: 'public-read'
        },
        err => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          } else {
            resolve();
          }
        }
      );
    });
    return this.buildPublicUrl(config.domain, `https://${bucket}.cos.${region}.myqcloud.com`, key);
  }

  /**
   * 阿里云 OSS 上传（PutObject API，HTTP 签名直连，无 SDK 依赖）
   * 文档：https://help.aliyun.com/document_detail/31978.html
   */
  private async uploadToAliyun(
    config: AliyunOssConfig,
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    const bucket = String(config.bucket || '').trim();
    const endpoint = String(config.endpoint || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const host = endpoint ? `${bucket}.${endpoint}` : `${bucket}.oss-${config.region}.aliyuncs.com`;
    const url = `https://${host}/${key}`;

    const date = new Date().toUTCString();
    const contentMd5 = '';
    const canonicalizedHeaders = `x-oss-object-acl:public-read\nx-oss-security-token:\n`;
    const canonicalizedResource = `/${bucket}/${key}`;
    const stringToSign = [
      'PUT',
      contentMd5,
      contentType,
      date,
      canonicalizedHeaders + canonicalizedResource
    ].join('\n');
    const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64');

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Date: date,
        'Content-Type': contentType,
        'x-oss-object-acl': 'public-read',
        Authorization: `OSS ${config.accessKeyId}:${signature}`
      },
      body: new Uint8Array(buffer)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`阿里云 OSS 上传失败: ${resp.status} ${text.slice(0, 200)}`);
    }
    return this.buildPublicUrl(config.domain, `https://${host}`, key);
  }

  /**
   * 七牛云 Kodo 上传（表单上传，HTTP 签名直连，无 SDK 依赖）
   * 文档：https://developer.qiniu.com/kodo/12788/form-upload
   */
  private async uploadToQiniu(
    config: QiniuKodoConfig,
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    const bucket = String(config.bucket || '').trim();
    const uploadHost = config.region
      ? `https://upload-${String(config.region).trim()}.qiniup.com`
      : 'https://upload.qiniup.com';

    // 上传策略：1 小时有效 + 公有读 + 覆盖同名文件
    const putPolicy = {
      scope: `${bucket}:${key}`,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      insertOnly: 0
    };
    const encodedPolicy = Buffer.from(JSON.stringify(putPolicy)).toString('base64url');
    const uploadToken = `${config.accessKey}:${createHmac('sha1', config.secretKey).update(encodedPolicy).digest('base64url')}:${encodedPolicy}`;

    const form = new FormData();
    form.append('token', uploadToken);
    form.append('key', key);
    form.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), key.split('/').pop() || 'file');

    const resp = await fetch(`${uploadHost}/`, {
      method: 'POST',
      body: form
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`七牛云上传失败: ${resp.status} ${text.slice(0, 200)}`);
    }
    // 默认域名：{bucket}.qiniudn.com 或用户配置的 CDN 域名
    const fallbackBase = config.domain ? '' : `https://${bucket}.qiniudn.com`;
    return this.buildPublicUrl(config.domain, fallbackBase, key);
  }

  /** 拼接公开访问 URL：优先使用自定义 CDN 域名，否则用默认域名 */
  private buildPublicUrl(domain: string, fallbackBase: string, key: string): string {
    const host =
      String(domain || '')
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '') ||
      fallbackBase
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
    return `https://${host}/${key}`;
  }
}
