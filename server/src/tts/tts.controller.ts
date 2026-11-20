import {
  Controller, Get, Post, Body, Param, ParseIntPipe,
  HttpException, HttpStatus, UseGuards
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { EntitlementGuard } from '../membership/guards/entitlement.guard';
import { Entitlement } from '../membership/decorators/entitlement.decorator';
import { Capability } from '../membership/types/membership.types';
import { Public } from '../common/decorators/public.decorator';
import { TtsService } from './tts.service';

/**
 * TTS 端点（识典古籍对标 · 阶段 4）
 *
 * 统一路由前缀：/tts
 * - GET    /tts/voices                       可用音色列表（公开）
 * - POST   /tts/:familyId/synthesize         通用合成（Entitlement TtsListen）
 * - POST   /tts/:familyId/chapter/:chapterId 用章节正文合成（Entitlement TtsListen）
 * - GET    /tts/:familyId/chapter/:chapterId  获取缓存音频，未命中返回 null
 */
@UseGuards(JwtAuthGuard, EntitlementGuard)
@Controller('tts')
export class TtsController {
  constructor(
    private readonly tts: TtsService,
    private readonly dataSource: DataSource
  ) {}

  @Public()
  @Get('voices')
  getVoices() {
    return this.tts.getVoices();
  }

  /** 通用合成接口（文本直接传入） */
  @Post(':familyId/synthesize')
  @Entitlement(Capability.TtsListen)
  async synthesize(
    @Param('familyId', ParseIntPipe) _familyId: number,
    @Body() body: { text: string; voice?: string }
  ) {
    if (!body.text || !body.text.trim()) {
      throw new HttpException('文本内容不能为空', HttpStatus.BAD_REQUEST);
    }
    return this.tts.synthesize(body.text.trim(), body.voice);
  }

  /** 章节正文合成（从 cultural_document_chapter 表读取 content/translated） */
  @Post(':familyId/chapter/:chapterId')
  @Entitlement(Capability.TtsListen)
  async synthesizeChapter(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('chapterId', ParseIntPipe) chapterId: number,
    @Body() body: { voice?: string; field?: 'content' | 'translated' } = {}
  ) {
    const field = body.field === 'translated' ? 'translated' : 'content';
    const voice = body.voice;

    // 查章节正文
    const rows = await this.dataSource.query<any[]>(
      `SELECT c.${field} AS text, d.id AS doc_id, d.family_id AS doc_family_id
       FROM \`cultural_document_chapter\` c
       JOIN \`cultural_document\` d ON d.id = c.document_id
       WHERE c.id = ? LIMIT 1`,
      [chapterId]
    );
    if (rows.length === 0) {
      throw new HttpException('章节不存在', HttpStatus.NOT_FOUND);
    }
    // 归属校验：公开古籍（doc_family_id IS NULL）或属于本家族
    const row = rows[0];
    if (row.doc_family_id !== null && Number(row.doc_family_id) !== familyId) {
      throw new HttpException('无权限访问该章节', HttpStatus.FORBIDDEN);
    }
    const text = String(row.text || '').trim();
    if (!text) {
      throw new HttpException('该章节暂无内容', HttpStatus.BAD_REQUEST);
    }

    return this.tts.synthesize(text, voice, chapterId);
  }

  /** 查询章节缓存音频（不触发新合成） */
  @Get(':familyId/chapter/:chapterId')
  @Entitlement(Capability.TtsListen)
  async getChapterAudio(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('chapterId', ParseIntPipe) chapterId: number
  ) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT audio_url, duration_sec, segments, update_time
       FROM \`tts_audio_cache\`
       WHERE chapter_id = ? AND status = 1
       ORDER BY update_time DESC
       LIMIT 1`,
      [chapterId]
    );
    if (rows.length === 0) {
      return { hit: false, audioUrl: null };
    }
    return { hit: true, ...rows[0] };
  }
}
