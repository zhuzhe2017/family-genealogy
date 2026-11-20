import {
  Controller, Post, Get, Param, Body, ParseIntPipe,
  UseGuards, HttpException, HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { EntitlementGuard } from '../membership/guards/entitlement.guard';
import { Entitlement } from '../membership/decorators/entitlement.decorator';
import { Capability } from '../membership/types/membership.types';
import type { AuthenticatedRequest } from '../common/types/common';
import { OcrService, type StructuredMember, type MemberPreview } from './ocr.service';

/**
 * OCR 手写族谱录入（识典古籍对标 · 阶段 5）
 *
 * 统一路由：
 *   POST /ocr/:familyId/recognize        第一步：上传图片 → OCR
 *   POST /ocr/:familyId/structure         第二步：OCR 文本 → AI 结构化
 *   POST /ocr/:familyId/preview           第三步：预览去重校验
 *   POST /ocr/:familyId/confirm           第四步：确认导入
 */
@UseGuards(JwtAuthGuard, EntitlementGuard)
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocr: OcrService) {}

  /**
   * 第一步：上传图片 → OCR 识别
   * 前端传 multipart/form-data（file 字段）
   * 后端返回统一协议 { text, lines, provider, errcode?, errmsg? }
   */
  @Post(':familyId/recognize')
  @Entitlement(Capability.OcrImport)
  async recognize(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: { imageDataUrl?: string; imageBase64?: string }
  ) {
    // 支持 data URL 或纯 base64
    const raw = body.imageDataUrl || body.imageBase64;
    if (!raw) {
      throw new HttpException('请提供图片（imageDataUrl 或 imageBase64）', HttpStatus.BAD_REQUEST);
    }

    let buffer: Buffer;
    if (raw.startsWith('data:')) {
      // data:image/jpeg;base64,/9j/...
      const commaIdx = raw.indexOf(',');
      if (commaIdx < 0) throw new HttpException('imageDataUrl 格式错误', HttpStatus.BAD_REQUEST);
      buffer = Buffer.from(raw.slice(commaIdx + 1), 'base64');
    } else {
      buffer = Buffer.from(raw, 'base64');
    }

    return this.ocr.recognize(buffer, familyId, 'buffer');
  }

  /**
   * 第二步：OCR 文本 → AI 结构化
   * 传入 OCR 返回的 text（全文字符串），返回结构化成员数组
   */
  @Post(':familyId/structure')
  @Entitlement(Capability.OcrImport)
  async structure(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: { text: string; allowPartial?: boolean }
  ) {
    if (!body.text || !body.text.trim()) {
      throw new HttpException('OCR 文本为空', HttpStatus.BAD_REQUEST);
    }
    return this.ocr.structure(familyId, body.text, { allowPartial: body.allowPartial });
  }

  /**
   * 第三步：预览去重校验
   * 传入前端校对后的成员列表，返回带 duplicate/warnings 的预览结果
   */
  @Post(':familyId/preview')
  @Entitlement(Capability.OcrImport)
  async preview(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: { members: StructuredMember[] }
  ) {
    if (!Array.isArray(body.members) || body.members.length === 0) {
      throw new HttpException('成员列表为空', HttpStatus.BAD_REQUEST);
    }
    if (body.members.length > 50) {
      throw new HttpException('单次预览最多 50 人', HttpStatus.BAD_REQUEST);
    }
    return this.ocr.previewImport(familyId, body.members);
  }

  /**
   * 第四步：确认导入（写入 family_members_{familyId}）
   * 传入已校对/预览后的成员列表（可以跳过 duplicate）
   */
  @Post(':familyId/confirm')
  @Entitlement(Capability.OcrImport)
  async confirm(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: { members: MemberPreview[] }
  ) {
    if (!Array.isArray(body.members) || body.members.length === 0) {
      throw new HttpException('成员列表为空', HttpStatus.BAD_REQUEST);
    }
    if (body.members.length > 50) {
      throw new HttpException('单次导入最多 50 人', HttpStatus.BAD_REQUEST);
    }
    return this.ocr.confirmImport(familyId, body.members);
  }
}
