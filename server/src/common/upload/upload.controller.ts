import {
  BadRequestException,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { Public } from '../decorators/public.decorator';
import { EntitlementService } from '../../membership/membership.service';
import { CloudStorageUploadService } from '../../cloud-storage-config/cloud-storage-upload.service';
import { type AuthenticatedRequest } from '../types/common';
import {
  ALLOWED_IMAGE_TYPES,
  buildStoredFileName,
  MAX_FILE_SIZE,
  UPLOAD_DIR
} from './upload.service';

/** 上传业务类型白名单（storage_usage_record.biz_type） */
const BIZ_TYPES = ['photo', 'document', 'dynamic', 'album', 'member_avatar', 'event'];

/**
 * 图片上传
 * - @Public 跳过全局管理员 JwtAuthGuard
 * - @UseGuards(AuthGuard(['jwt','user-jwt'])) 显式放行管理员与小程序用户两种令牌
 * - 存储额度校验（M1）：请求携带 familyId 时视为家族维度上传，
 *   校验用户归属 → 预检存储余量（4002）→ 存文件 → 记账 storage_usage_record；
 *   管理员上传 / 无 familyId（如用户头像）不占家族存储额度。
 */
@Public()
@UseGuards(AuthGuard(['jwt', 'user-jwt']))
@Controller('common')
export class UploadController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly entitlementService: EntitlementService,
    private readonly cloudStorageUploadService: CloudStorageUploadService
  ) {}

  /** 图片上传：云存储启用时存到 COS/OSS/Kodo 并返回公网 URL，否则存本地（/uploads/xxx.png） */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
          return cb(
            new BadRequestException(
              '仅支持上传 png/jpg/jpeg/gif/webp 格式的图片',
              '400'
            ),
            false
          );
        }
        cb(null, true);
      }
    })
  )
  async upload(@UploadedFile() file?: Express.Multer.File, @Req() req?: AuthenticatedRequest) {
    if (!file) {
      throw new BadRequestException('请选择要上传的图片文件', '400');
    }

    // 优先上传云存储（已启用时）；未启用或上传失败则回退本地磁盘
    const cloud = await this.cloudStorageUploadService.uploadImage(file.buffer, file.mimetype);
    let url: string;
    let filename: string;
    if (cloud) {
      url = cloud.url;
      filename = cloud.filename;
    } else {
      filename = buildStoredFileName(file.mimetype);
      if (!existsSync(UPLOAD_DIR)) {
        mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      await writeFile(join(UPLOAD_DIR, filename), file.buffer);
      url = `/uploads/${filename}`;
    }

    const familyId = Number((req?.body as Record<string, unknown>)?.familyId || 0);
    const bizType = String((req?.body as Record<string, unknown>)?.bizType || 'photo');

    // 家族维度上传（小程序用户令牌）：校验归属 + 存储额度 + 记账
    if (familyId > 0 && req?.user && typeof req.user.id === 'string') {
      await this.assertFamilyMember(String(req.user.id), familyId);
      await this.entitlementService.assertStorage(familyId, file.size);
      await this.entitlementService.recordStorage(
        familyId,
        url,
        file.size,
        BIZ_TYPES.includes(bizType) ? bizType : 'photo',
        '',
        String(req.user.id)
      );
    }
    // 管理员上传 / 无家族归属（头像等）：不占家族存储额度

    return { url, filename, size: file.size };
  }

  /** 用户是否属于该家族（family_permission 记录或家族创建者），与订阅服务校验逻辑一致 */
  private async assertFamilyMember(userId: string, familyId: number): Promise<void> {
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return;

    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    if (!family || family.creator_user_id !== userId) {
      throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
    }
  }
}
