import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { Public } from '../decorators/public.decorator';
import {
  ALLOWED_IMAGE_TYPES,
  buildStoredFileName,
  MAX_FILE_SIZE,
  UPLOAD_DIR
} from './upload.service';

/**
 * 图片上传
 * @Public 公开访问：管理员端与小程序用户端共用该接口（仅做文件存储，无业务数据），
 * 文件类型与大小已在上传层限制
 */
@Public()
@Controller('common')
export class UploadController {
  /** 图片上传：返回可直接访问的相对 URL（/uploads/xxx.png） */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(UPLOAD_DIR)) {
            mkdirSync(UPLOAD_DIR, { recursive: true });
          }
          cb(null, UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          cb(null, buildStoredFileName(file?.mimetype ?? ''));
        }
      }),
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
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择要上传的图片文件', '400');
    }
    return { url: `/uploads/${file.filename}`, filename: file.filename, size: file.size };
  }
}
