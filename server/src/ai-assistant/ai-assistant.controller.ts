import {
  Controller, Get, Post, Delete, Body, Param,
  ParseIntPipe, ValidationPipe, HttpCode, HttpStatus,
  Req, UseGuards
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { EntitlementGuard } from '../membership/guards/entitlement.guard';
import { Entitlement } from '../membership/decorators/entitlement.decorator';
import { Capability } from '../membership/types/membership.types';
import type { AuthenticatedRequest } from '../common/types/common';
import { AiAssistantService } from './ai-assistant.service';
import type { ContextType } from './types/ai-assistant.types';

/**
 * AI 助手端点（识典古籍对标 · 阶段 2）
 * 统一路由前缀：/ai/:familyId/*
 * - POST   /ai/:familyId/session         创建会话
 * - GET    /ai/:familyId/session/list    会话列表
 * - GET    /ai/:familyId/session/:sid/messages  消息历史
 * - DELETE /ai/:familyId/session/:sid    删除会话（级联删消息）
 * - POST   /ai/:familyId/chat            发送消息 → AI 回复（Entitlement AiChat）
 * - POST   /ai/:familyId/summarize       AI 摘要（Entitlement AiSummary）
 * - POST   /ai/:familyId/annotate        古文断句注释（Entitlement Annotate）
 * - POST   /ai/:familyId/extract         实体提取（JWT 基础守卫）
 * - POST   /ai/:familyId/relation        亲属关系推理（JWT 基础守卫）
 */
@UseGuards(JwtAuthGuard, EntitlementGuard)
@Controller('ai')
export class AiAssistantController {
  constructor(private readonly aiService: AiAssistantService) {}

  // ---------- 会话管理 ----------

  @Post(':familyId/session')
  async createSession(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) body: { contextType?: ContextType; title?: string }
  ) {
    return this.aiService.createSession({
      familyId,
      userId: String(req.user!.id),
      contextType: body.contextType || 'general',
      title: body.title
    });
  }

  @Get(':familyId/session/list')
  async listSessions(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Req() req: AuthenticatedRequest
  ) {
    return this.aiService.getSessionList(familyId, String(req.user!.id));
  }

  @Get(':familyId/session/:sessionId/messages')
  async getHistory(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('sessionId') sidRaw: string | number,
    @Req() req: AuthenticatedRequest
  ) {
    return this.aiService.getMessageHistory(String(sidRaw), familyId, String(req.user!.id));
  }

  @Delete(':familyId/session/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('sessionId') sidRaw: string | number,
    @Req() req: AuthenticatedRequest
  ) {
    await this.aiService.deleteSession(String(sidRaw), familyId, String(req.user!.id));
  }

  // ---------- AI 核心端点 ----------

  @Post(':familyId/chat')
  @Entitlement(Capability.AiChat)
  async chat(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) body: { sessionId: string; question: string; historyRounds?: number }
  ) {
    return this.aiService.sendMessage({
      sessionId: body.sessionId,
      familyId,
      userId: String(req.user!.id),
      question: body.question,
      historyRounds: body.historyRounds
    });
  }

  @Post(':familyId/summarize')
  @Entitlement(Capability.AiSummary)
  async summarize(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) body: { text: string; maxWords?: number; documentId?: string }
  ) {
    return this.aiService.summarize({
      familyId, userId: String(req.user!.id),
      text: body.text, maxWords: body.maxWords, documentId: body.documentId
    });
  }

  @Post(':familyId/annotate')
  @Entitlement(Capability.Annotate)
  async annotate(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) body: { text: string }
  ) {
    return this.aiService.annotate({
      familyId, userId: String(req.user!.id),
      text: body.text
    });
  }

  @Post(':familyId/extract')
  async extract(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) body: { text: string }
  ) {
    return this.aiService.extractEntities(familyId, String(req.user!.id), body.text);
  }

  @Post(':familyId/relation')
  async calcRelation(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body(ValidationPipe) body: { memberIdA: string; memberIdB: string }
  ) {
    return this.aiService.calcRelation({
      familyId,
      memberIdA: body.memberIdA,
      memberIdB: body.memberIdB
    });
  }
}
