import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { LlmService } from '../llm/llm.service';
import type { LlmMessage } from '../llm/types/llm.types';
import { EntitlementService } from '../membership/membership.service';
import { Capability } from '../membership/types/membership.types';

import type {
  ContextType,
  CreateSessionParams,
  SendMessageParams,
  SummarizeParams,
  AnnotateParams,
  CalcRelationParams,
  ChatSessionVO,
  ChatMessageVO
} from './types/ai-assistant.types';

/** 生成 32 位 hex ID（与 cultural-document 口径一致） */
function genId(): string {
  const ts = Date.now().toString(16);
  const rand = Math.random().toString(16).slice(2, 10);
  return (ts + rand + '0000000000000000').slice(0, 32).padStart(32, '0');
}

/** 解析 DB 时间/Date 为 ISO 字符串 */
function fmtTime(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly llm: LlmService,
    private readonly entitlement: EntitlementService
  ) {}

  // =================================================================
  // 会话管理
  // =================================================================

  async createSession(params: CreateSessionParams): Promise<{ sessionId: string }> {
    const id = genId();
    const title = params.title || '';

    await this.dataSource.query(
      `INSERT INTO \`ai_chat_session\` (\`id\`, \`family_id\`, \`user_id\`, \`title\`, \`context_type\`)
       VALUES (?, ?, ?, ?, ?)`,
      [id, params.familyId, params.userId, title, params.contextType || 'general']
    );

    return { sessionId: id };
  }

  async getSessionList(familyId: number, userId: string): Promise<ChatSessionVO[]> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT * FROM \`ai_chat_session\`
       WHERE \`family_id\` = ? AND \`user_id\` = ?
       ORDER BY \`last_message_at\` DESC, \`create_time\` DESC`,
      [familyId, userId]
    );
    return rows.map(r => ({
      id: r.id,
      family_id: r.family_id,
      user_id: r.user_id,
      title: r.title,
      context_type: r.context_type as ContextType,
      message_count: r.message_count,
      last_message_at: fmtTime(r.last_message_at || null) as any,
      create_time: fmtTime(r.create_time),
      isEmpty: r.message_count === 0
    }));
  }

  async getMessageHistory(sessionId: string, familyId: number, userId: string): Promise<ChatMessageVO[]> {
    // 归属校验
    await this.assertSessionBelongs(sessionId, familyId, userId);

    const rows = await this.dataSource.query<any[]>(
      `SELECT * FROM \`ai_chat_message\`
       WHERE \`session_id\` = ?
       ORDER BY \`create_time\` ASC`,
      [sessionId]
    );
    return rows.map(r => ({
      id: r.id,
      role: r.role,
      content: r.content,
      model: r.model || undefined,
      create_time: fmtTime(r.create_time)
    }));
  }

  async deleteSession(sessionId: string, familyId: number, userId: string): Promise<void> {
    await this.assertSessionBelongs(sessionId, familyId, userId);
    // 级联删消息（先删子表）
    await this.dataSource.query('DELETE FROM `ai_chat_message` WHERE `session_id` = ?', [sessionId]);
    await this.dataSource.query(
      'DELETE FROM `ai_chat_session` WHERE `id` = ? AND `family_id` = ? AND `user_id` = ?',
      [sessionId, familyId, userId]
    );
  }

  // =================================================================
  // AI 核心：RAG 对话 + 额度扣减
  // =================================================================

  async sendMessage(params: SendMessageParams): Promise<{ reply: string; sessionTitle: string | null }> {
    const { sessionId, familyId, userId, question, historyRounds } = params;

    if (!question || !question.trim()) {
      throw new HttpException('请输入问题内容', HttpStatus.BAD_REQUEST);
    }

    // 1. 归属校验
    const session = await this.assertSessionBelongs(sessionId, familyId, userId);

    // 2. 额度扣减（AiChat）
    await this.entitlement.consumeQuota(familyId, Capability.AiChat, 1);

    // 3. 意图识别 + 上下文检索
    const intent = this.classifyIntent(question);
    const context = await this.retrieveContext(intent, question, familyId);

    // 4. 取最近 N 轮历史（仅 user + assistant）
    const history = await this.getRecentMessages(sessionId, historyRounds ?? 10);

    // 5. 组装消息
    const messages: LlmMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(intent) },
      ...(context ? [{ role: 'system' as const, content: context }] : []),
      ...history,
      { role: 'user', content: question.trim() }
    ];

    // 6. 调用 LLM
    let result;
    try {
      result = await this.llm.chat(messages, { familyId });
    } catch (err) {
      // 额度已在 consumeQuota 预扣，调用失败不回滚（简化实现）
      this.logger.error('[ai] llm call failed:', err);
      throw new HttpException(
        (err as any)?.response?.data?.message || 'AI 服务暂时不可用，请稍后再试',
        HttpStatus.BAD_GATEWAY
      );
    }

    // 7. 存消息
    await this.saveMessages(sessionId, userId, question, result.content, result.model, result.usage);

    // 8. 更新 session 元数据
    const newTitle = this.maybeGenerateTitle(session, question, result.content);
    await this.dataSource.query(
      `UPDATE \`ai_chat_session\`
       SET \`message_count\` = \`message_count\` + 2,
           \`last_message_at\` = NOW()
           ${newTitle ? ', `title` = ?' : ''}
       WHERE \`id\` = ?`,
      newTitle ? [newTitle, sessionId] : [sessionId]
    );

    return { reply: result.content.trim(), sessionTitle: newTitle };
  }

  // =================================================================
  // AI 辅助：摘要 / 注释 / 实体提取
  // =================================================================

  async summarize(params: SummarizeParams): Promise<{ summary: string }> {
    const { familyId, userId, text, maxWords, documentId } = params;
    if (!text || !text.trim()) {
      throw new HttpException('文本内容不能为空', HttpStatus.BAD_REQUEST);
    }

    await this.entitlement.consumeQuota(familyId, Capability.AiSummary, 1);

    const result = await this.llm.summarize(text, {
      familyId,
      userId,
      maxWords
    });

    // 可选：记录到 session（便于历史回看）
    if (documentId) {
      const { sessionId } = await this.createSession({
        familyId, userId,
        contextType: 'ancient',
        title: 'AI 摘要'
      });
      await this.saveMessages(sessionId, userId, `请为文档 ${documentId} 生成摘要`, result, 'system');
    }

    return { summary: result };
  }

  async annotate(params: AnnotateParams): Promise<{ punctuated: string; notes: any[] }> {
    const { familyId, userId, text } = params;
    if (!text || !text.trim()) {
      throw new HttpException('古文内容不能为空', HttpStatus.BAD_REQUEST);
    }

    await this.entitlement.consumeQuota(familyId, Capability.Annotate, 1);

    const result = await this.llm.annotateClassical(text, { familyId, userId });

    return {
      punctuated: result.punctuated,
      notes: result.notes || []
    };
  }

  async extractEntities(familyId: number, userId: string, text: string) {
    if (!text || !text.trim()) {
      throw new HttpException('文本内容不能为空', HttpStatus.BAD_REQUEST);
    }
    const result = await this.llm.extractEntities(text, { familyId, userId });
    return result;
  }

  // =================================================================
  // 亲属关系推理（家族域核心 AI 能力）
  // =================================================================

  async calcRelation(params: CalcRelationParams): Promise<{ relation: string; explanation: string }> {
    const { familyId, memberIdA, memberIdB } = params;
    if (!memberIdA || !memberIdB || memberIdA === memberIdB) {
      throw new HttpException('请选择两位不同的家族成员', HttpStatus.BAD_REQUEST);
    }

    // 1. 拉取成员基本信息（name + father_id + generation）
    const tableName = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`, \`father_id\`
       FROM \`${tableName}\`
       WHERE \`id\` IN (?, ?)`,
      [memberIdA, memberIdB]
    );
    if (rows.length < 2) {
      throw new HttpException('成员不存在或不在当前家族', HttpStatus.NOT_FOUND);
    }
    const a = rows.find(r => String(r.id) === String(memberIdA))!;
    const b = rows.find(r => String(r.id) === String(memberIdB))!;

    // 2. 构建代际链（各自向上遍历到始祖）
    const chainA = await this.buildAncestorChain(tableName, a.id);
    const chainB = await this.buildAncestorChain(tableName, b.id);

    // 3. 找最近公共祖先（LCA）
    const lca = this.findLca(chainA, chainB);

    if (!lca) {
      // 无共同祖先（或家谱数据不全）
      return {
        relation: '暂未找到明确关系',
        explanation: `「${a.name}」和「${b.name}」在当前家族族谱中未发现共同祖先，可能家族谱系数据不完整或关系较远。`
      };
    }

    // 4. 计算相对代差
    const aDepth = chainA.findIndex(c => c.id === lca.id);
    const bDepth = chainB.findIndex(c => c.id === lca.id);

    // 5. 查表定关系
    const { relation, explanation } = this.mapRelation(lca, aDepth, bDepth, a, b);

    return { relation, explanation };
  }

  // =================================================================
  // 内部：会话归属校验 + 消息持久化
  // =================================================================

  private async assertSessionBelongs(sessionId: string, familyId: number, userId: string) {
    const [session] = await this.dataSource.query<any[]>(
      'SELECT * FROM `ai_chat_session` WHERE `id` = ? AND `family_id` = ? AND `user_id` = ? LIMIT 1',
      [sessionId, familyId, userId]
    );
    if (!session) {
      throw new HttpException('会话不存在或无权限访问', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  private async getRecentMessages(sessionId: string, rounds: number): Promise<LlmMessage[]> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`role\`, \`content\` FROM \`ai_chat_message\`
       WHERE \`session_id\` = ?
       ORDER BY \`create_time\` DESC
       LIMIT ?`,
      [sessionId, rounds * 2]
    );
    // DESC 取出后 reverse 还原时间顺序
    return rows.reverse().map(r => ({ role: r.role, content: r.content }));
  }

  private async saveMessages(
    sessionId: string,
    userId: string,
    userMsg: string,
    aiMsg: string,
    model: string,
    usage?: { promptTokens: number; completionTokens: number }
  ) {
    await this.dataSource.query(
      `INSERT INTO \`ai_chat_message\` (\`session_id\`, \`role\`, \`content\`, \`model\`, \`prompt_tokens\`, \`completion_tokens\`)
       VALUES (?, 'user', ?, ?, ?, ?)`,
      [sessionId, userMsg, model, usage?.promptTokens ?? 0, 0]
    );
    await this.dataSource.query(
      `INSERT INTO \`ai_chat_message\` (\`session_id\`, \`role\`, \`content\`, \`model\`, \`prompt_tokens\`, \`completion_tokens\`)
       VALUES (?, 'assistant', ?, ?, ?, ?)`,
      [sessionId, aiMsg, model, 0, usage?.completionTokens ?? 0]
    );
  }

  private maybeGenerateTitle(session: any, question: string, reply: string): string | null {
    // 空会话 + 短问题 → 自动生成标题（取问题前 20 字）
    if (!session.title && question.length <= 30) {
      return question.slice(0, 20) + (question.length > 20 ? '...' : '');
    }
    return null;
  }

  // =================================================================
  // 内部：意图识别 + RAG 上下文
  // =================================================================

  private classifyIntent(question: string): ContextType {
    const q = question.toLowerCase();
    // 家族域关键词
    const famKw = ['族谱', '家族', '家谱', '辈分', '字辈', '世代', '成员', '祖先', '始祖', '公', '迁徙'];
    if (famKw.some(k => question.includes(k))) return 'genealogy';
    // 古籍域关键词
    const ancKw = ['古籍', '古文', '断句', '注释', '百家姓', '三字经', '颜氏家训', '朱子家训', '史记', '典故', '文言'];
    if (ancKw.some(k => question.includes(k))) return 'ancient';
    return 'general';
  }

  private async retrieveContext(intent: ContextType, question: string, familyId: number): Promise<string> {
    try {
      if (intent === 'genealogy') {
        return await this.retrieveFamilyContext(familyId, question);
      }
      if (intent === 'ancient') {
        return await this.retrieveDocContext(question);
      }
    } catch (err) {
      // 上下文检索失败不阻断主流程
      this.logger.warn('[ai] retrieveContext failed:', err);
    }
    return '';
  }

  /** 家族域：从 family_members_{familyId} 检索相关成员 + generation_table */
  private async retrieveFamilyContext(familyId: number, question: string): Promise<string> {
    // 提取疑似人名（启发式：2-4 字中文 + 以"公/祖/父"结尾）
    const names = this.extractChineseNames(question).slice(0, 5);
    if (names.length === 0) return '';

    const tableName = `family_members_${familyId}`;
    const conditions = names.map(() => '`name` LIKE ?').join(' OR ');
    const values = names.map(n => `%${n}%`);

    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`, \`father_id\`, \`birth_year\`, \`death_year\`
       FROM \`${tableName}\`
       WHERE ${conditions}
       LIMIT 10`,
      values
    );

    if (rows.length === 0) return '';

    const lines = rows.map(r => {
      const gen = r.generation ? `第${r.generation}代` : '';
      const span = (r.birth_year || r.death_year) ? `（${r.birth_year || '?'}~${r.death_year || '?'}）` : '';
      return `- ${r.name} ${gen}${span}`;
    });

    return `[家族上下文]\n本家族中与您问题相关的成员：\n${lines.join('\n')}`;
  }

  /** 古籍域：从 cultural_document 检索匹配段落 */
  private async retrieveDocContext(question: string): Promise<string> {
    const keyword = question.slice(0, 10);
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`title\`, LEFT(\`annotated_text\`, 500) AS snippet
       FROM \`cultural_document\`
       WHERE \`audit_status\` = 1 AND \`status\` = 1
         AND (\`title\` LIKE ? OR \`annotated_text\` LIKE ? OR \`summary\` LIKE ?)
       LIMIT 3`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
    );
    if (rows.length === 0) return '';
    const lines = rows.map(r => `【${r.title}】\n${r.snippet || ''}`);
    return `[古籍上下文]\n${lines.join('\n\n')}`;
  }

  /** 极简中文人名提取（启发式：2-4 个连续中文字符） */
  private extractChineseNames(text: string): string[] {
    const matches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    return [...new Set(matches)];
  }

  private buildSystemPrompt(intent: ContextType): string {
    const base =
      '你是数字家谱平台的 AI 助手，擅长：① 家族谱系梳理与亲属关系推理 ' +
      '② 古籍阅读、断句、注释与白话翻译 ③ 字辈/堂号/家谱术语解读。';
    const rules =
      '回答要准确、严谨、有据可查；涉及家族成员时基于用户提供的上下文；' +
      '涉及古籍时标注书名和原文；不确定时坦诚说明，不要臆造。';

    if (intent === 'genealogy') {
      return base + '\n当前问题属于【家族谱系域】，请优先结合用户家族数据回答。\n' + rules;
    }
    if (intent === 'ancient') {
      return base + '\n当前问题属于【古籍文化域】，请以古籍原文和传统注释为依据。\n' + rules;
    }
    return base + '\n' + rules;
  }

  // =================================================================
  // 内部：亲属关系推理工具
  // =================================================================

  /** 从某成员向上遍历到始祖，返回 [始祖, ..., 自己] 代际链 */
  private async buildAncestorChain(tableName: string, startId: string): Promise<any[]> {
    const chain: any[] = [];
    const visited = new Set<string>();
    let curId: string | null = String(startId);
    let guard = 50;

    while (curId && guard-- > 0) {
      if (visited.has(curId)) break; // 防环
      visited.add(curId);

      const [row] = await this.dataSource.query<any[]>(
        `SELECT \`id\`, \`name\`, \`father_id\`, \`generation\` FROM \`${tableName}\` WHERE \`id\` = ? LIMIT 1`,
        [curId]
      );
      if (!row) break;
      chain.push({ id: row.id, name: row.name, generation: row.generation });
      curId = row.father_id ? String(row.father_id) : null;
    }
    return chain; // 从始祖到自己
  }

  /** 找两条链的最近公共祖先 */
  private findLca(chainA: any[], chainB: any[]): any | null {
    // chainA[0] = 始祖，chainA[last] = A 自己
    // 从后往前找 A 的祖先中出现在 B 链的第一个
    const bMap = new Map(chainB.map(c => [String(c.id), c]));
    for (let i = chainA.length - 1; i >= 0; i--) {
      const node = chainA[i];
      if (bMap.has(String(node.id))) {
        return node;
      }
    }
    return null;
  }

  /**
   * 根据公共祖先深度差 + 性别 → 自然语言关系
   * aDepth / bDepth：各自到 LCA 的代数（代差 = |aDepth - bDepth|）
   */
  private mapRelation(lca: any, aDepth: number, bDepth: number, a: any, b: any): { relation: string; explanation: string } {
    const diff = Math.abs(aDepth - bDepth);
    const aIsDescendantOfLca = aDepth > 0;
    const bIsDescendantOfLca = bDepth > 0;

    let relation = '';
    let explanation = '';

    if (diff === 0) {
      // 同代：兄弟姐妹/堂表
      if (aDepth === 0 && bDepth === 0) {
        relation = '同一人（始祖本人）';
      } else if (aDepth === 1 && bDepth === 1) {
        relation = '亲兄弟/姐妹';
      } else {
        const prefix = aDepth === 2 ? '堂/表' : '再' + (aDepth - 2 > 1 ? (aDepth - 2) + '次' : '') + '堂/表';
        relation = `${prefix}兄弟姐妹（同${aDepth}代）`;
      }
    } else if (diff === 1) {
      relation = aDepth > bDepth ? '叔侄/姑侄' : '侄叔/甥舅';
    } else if (diff === 2) {
      relation = aDepth > bDepth ? '祖孙（伯/叔祖父）' : '曾孙（侄孙）';
    } else {
      const elder = aDepth > bDepth ? `${a.name}` : `${b.name}`;
      const younger = aDepth > bDepth ? `${b.name}` : `${a.name}`;
      relation = `${younger}是${elder}的${diff}代后人，${elder}是${younger}的${diff}代祖先`;
    }

    explanation = `「${a.name}」和「${b.name}」的最近共同祖先是「${lca.name}」。` +
      `${a.name}距共同祖先${aDepth}代，${b.name}距共同祖先${bDepth}代，代差${diff}代。` +
      `因此关系为：${relation}。`;

    return { relation, explanation };
  }
}
