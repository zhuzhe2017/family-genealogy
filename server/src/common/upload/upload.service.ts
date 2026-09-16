import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/** 上传文件存放目录（server/uploads） */
export const UPLOAD_DIR = join(__dirname, '..', '..', '..', 'uploads');

/** 允许上传的图片类型（MIME 类型 → 扩展名） */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

/** 允许上传的文档类型（MIME 类型 → 扩展名） */
export const ALLOWED_DOC_TYPES: Record<string, string> = {
  'application/pdf': '.pdf'
};

/** 单文件最大体积（5MB） */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** 根据 MIME 类型生成带扩展名的文件名（随机十六进制，避免重名/路径注入） */
export function buildStoredFileName(mimetype: string): string {
  const ext = ALLOWED_IMAGE_TYPES[mimetype] || ALLOWED_DOC_TYPES[mimetype] || '';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
}

/** 生成按年月日三级细分的日期目录段（YYYY/MM/DD），用于上传文件按日期归档 */
export function buildDateScope(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);

  onModuleInit() {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      this.logger.log(`创建上传目录: ${UPLOAD_DIR}`);
    }
  }
}
