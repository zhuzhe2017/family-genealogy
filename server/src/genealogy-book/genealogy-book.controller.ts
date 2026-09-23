import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Res, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { GenealogyBookService } from './genealogy-book.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type BookPreviewParams, type BookTemplate } from './types/genealogy-book.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('genealogy-book/:familyId')
export class GenealogyBookController {
  constructor(private readonly bookService: GenealogyBookService) {}

  /** 获取可用模板列表 */
  @Get('templates')
  getTemplates() {
    return this.bookService.getTemplates();
  }

  /** 分页列表 */
  @Permissions('system:genealogy-book:list')
  @Get('list')
  async getList(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10
  ) {
    return this.bookService.getList(familyId, {
      page: Number(page),
      pageSize: Number(pageSize)
    });
  }

  /** 获取单条 */
  @Permissions('system:genealogy-book:list')
  @Get(':id')
  async getById(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.bookService.getById(familyId, id);
  }

  /** 创建 */
  @Permissions('system:genealogy-book:create')
  @Post('create')
  async create(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: {
      title: string;
      subtitle?: string;
      template?: BookTemplate;
      preface?: string;
      introduction?: string;
      clanRules?: string;
      generationPoem?: string;
      appendix?: string;
      coverStyle?: string;
      fontFamily?: string;
      paperSize?: string;
      includeGenerationTable?: number;
      includeMemberBio?: number;
      includeTreeChart?: number;
      includeIndex?: number;
      sortOrder?: number;
    }
  ) {
    return this.bookService.create(familyId, {
      familyId,
      title: body.title,
      subtitle: body.subtitle,
      template: body.template,
      preface: body.preface,
      introduction: body.introduction,
      clanRules: body.clanRules,
      generationPoem: body.generationPoem,
      appendix: body.appendix,
      coverStyle: body.coverStyle,
      fontFamily: body.fontFamily,
      paperSize: body.paperSize,
      includeGenerationTable: body.includeGenerationTable !== undefined ? Number(body.includeGenerationTable) : undefined,
      includeMemberBio: body.includeMemberBio !== undefined ? Number(body.includeMemberBio) : undefined,
      includeTreeChart: body.includeTreeChart !== undefined ? Number(body.includeTreeChart) : undefined,
      includeIndex: body.includeIndex !== undefined ? Number(body.includeIndex) : undefined,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined
    });
  }

  /** 更新 */
  @Permissions('system:genealogy-book:update')
  @Put('update/:id')
  async update(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      title?: string;
      subtitle?: string;
      template?: BookTemplate;
      preface?: string;
      introduction?: string;
      clanRules?: string;
      generationPoem?: string;
      appendix?: string;
      coverStyle?: string;
      fontFamily?: string;
      paperSize?: string;
      includeGenerationTable?: number;
      includeMemberBio?: number;
      includeTreeChart?: number;
      includeIndex?: number;
      sortOrder?: number;
      status?: number;
    }
  ) {
    return this.bookService.update(familyId, id, {
      title: body.title,
      subtitle: body.subtitle,
      template: body.template,
      preface: body.preface,
      introduction: body.introduction,
      clanRules: body.clanRules,
      generationPoem: body.generationPoem,
      appendix: body.appendix,
      coverStyle: body.coverStyle,
      fontFamily: body.fontFamily,
      paperSize: body.paperSize,
      includeGenerationTable: body.includeGenerationTable !== undefined ? Number(body.includeGenerationTable) : undefined,
      includeMemberBio: body.includeMemberBio !== undefined ? Number(body.includeMemberBio) : undefined,
      includeTreeChart: body.includeTreeChart !== undefined ? Number(body.includeTreeChart) : undefined,
      includeIndex: body.includeIndex !== undefined ? Number(body.includeIndex) : undefined,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      status: body.status !== undefined ? Number(body.status) : undefined
    });
  }

  /** 删除 */
  @Permissions('system:genealogy-book:delete')
  @Delete('delete/:id')
  async delete(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.bookService.delete(familyId, id);
  }

  /** 切换状态 */
  @Permissions('system:genealogy-book:update')
  @Post('toggle-status/:id')
  async toggleStatus(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.bookService.toggleStatus(familyId, id);
  }

  /** 预览：获取成书数据 */
  @Permissions('system:genealogy-book:list')
  @Get('preview/:id')
  async preview(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id', ParseIntPipe) id: number
  ) {
    const book = await this.bookService.getById(familyId, id);
    const params: BookPreviewParams = {
      template: book.template,
      preface: book.preface,
      introduction: book.introduction,
      clanRules: book.clan_rules,
      generationPoem: book.generation_poem,
      appendix: book.appendix,
      includeGenerationTable: book.include_generation_table,
      includeMemberBio: book.include_member_bio,
      includeTreeChart: book.include_tree_chart,
      includeIndex: book.include_index
    };
    return this.bookService.preview(familyId, params);
  }

  /** 导出 HTML */
  @Permissions('system:genealogy-book:export')
  @Get('export/:id')
  async exportHtml(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response
  ) {
    const { html, book } = await this.bookService.exportHtml(familyId, id);
    const filename = encodeURIComponent(`${book.title || 'genealogy-book'}.html`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(html);
  }
}
