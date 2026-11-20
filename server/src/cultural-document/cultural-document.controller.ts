import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, ParseIntPipe, ParseUUIDPipe, HttpException, HttpStatus
} from '@nestjs/common';
import { CulturalDocumentService } from './cultural-document.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import type {
  CulturalDocumentCreateData,
  CulturalDocumentUpdateData,
  DocumentType,
  PageUploadItem
} from './types/cultural-document.types';

// =================================================================
// 公开端点：公共古籍（family_id = NULL），无需登录
// =================================================================
@Public()
@Controller('cultural-doc/public')
export class CulturalDocumentPublicController {
  constructor(private readonly docService: CulturalDocumentService) {}

  /** 公共古籍分页列表 */
  @Get('list')
  async getPublicList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('type') type?: DocumentType,
    @Query('keyword') keyword?: string,
    @Query('dynasty') dynasty?: string
  ) {
    return this.docService.getPublicList({
      page: Number(page),
      pageSize: Number(pageSize),
      type,
      keyword,
      dynasty
    });
  }

  /** 公共古籍详情 */
  @Get(':id')
  async getPublicById(@Param('id') id: string) {
    return this.docService.getPublicById(id);
  }

  /** 公共古籍章节树 */
  @Get(':id/chapters')
  async getPublicChapters(@Param('id') id: string) {
    return this.docService.getChapters(id);
  }

  /** 公共古籍章节正文 */
  @Get('chapter/:chapterId')
  async getPublicChapterContent(@Param('chapterId', ParseIntPipe) chapterId: number) {
    return this.docService.getChapterContent(chapterId);
  }

  /** 公共古籍原页图片 */
  @Get(':id/pages')
  async getPublicPages(@Param('id') id: string) {
    return this.docService.getPages(id);
  }
}

// =================================================================
// 家族私有端点：需 JWT + 权限守卫 + familyId 归属校验
// =================================================================
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('cultural-doc/:familyId')
export class CulturalDocumentFamilyController {
  constructor(private readonly docService: CulturalDocumentService) {}

  /** 家族文档分页列表 */
  @Permissions('system:cultural-doc:list')
  @Get('list')
  async getList(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('type') type?: DocumentType,
    @Query('keyword') keyword?: string
  ) {
    return this.docService.getFamilyList(familyId, {
      page: Number(page),
      pageSize: Number(pageSize),
      type,
      keyword
    });
  }

  /** 家族文档详情 */
  @Permissions('system:cultural-doc:list')
  @Get(':id')
  async getById(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.docService.getFamilyById(familyId, id);
  }

  /** 家族文档章节树 */
  @Permissions('system:cultural-doc:list')
  @Get(':id/chapters')
  async getChapters(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    // 归属校验
    await this.docService.getFamilyById(familyId, id);
    return this.docService.getChapters(id);
  }

  /** 家族文档原页图片 */
  @Permissions('system:cultural-doc:list')
  @Get(':id/pages')
  async getPages(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    await this.docService.getFamilyById(familyId, id);
    return this.docService.getPages(id);
  }

  /** 创建家族文档 */
  @Permissions('system:cultural-doc:create')
  @Post('create')
  async create(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: CulturalDocumentCreateData
  ) {
    if (!body.type) {
      throw new HttpException('请指定文档类型（type）', HttpStatus.BAD_REQUEST);
    }
    return this.docService.create({
      ...body,
      familyId,
      title: body.title,
      type: body.type,
      tags: Array.isArray(body.tags) ? body.tags : undefined
    });
  }

  /** 更新家族文档 */
  @Permissions('system:cultural-doc:update')
  @Put('update/:id')
  async update(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Body() body: CulturalDocumentUpdateData
  ) {
    return this.docService.update(familyId, id, body);
  }

  /** 删除家族文档 */
  @Permissions('system:cultural-doc:delete')
  @Delete('delete/:id')
  async delete(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.docService.delete(familyId, id);
  }

  /** 批量上传/覆盖家族文档原页图片 */
  @Permissions('system:cultural-doc:page')
  @Post(':id/pages')
  async uploadPages(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Body('pages') pages: PageUploadItem[]
  ) {
    // 归属校验
    await this.docService.getFamilyById(familyId, id);
    return this.docService.upsertPages(id, pages);
  }
}

// =================================================================
// 公共古籍管理端点（后台 CRUD family_id = NULL）
// =================================================================
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('cultural-doc/admin/public')
export class CulturalDocumentPublicAdminController {
  constructor(private readonly docService: CulturalDocumentService) {}

  /** 创建公共古籍 */
  @Permissions('system:cultural-doc:create')
  @Post('create')
  async createPublic(@Body() body: CulturalDocumentCreateData) {
    if (!body.type) throw new HttpException('请指定文档类型（type）', HttpStatus.BAD_REQUEST);
    return this.docService.create({
      ...body,
      familyId: undefined, // family_id = NULL
      title: body.title,
      type: body.type
    });
  }

  /** 更新公共古籍 */
  @Permissions('system:cultural-doc:update')
  @Put('update/:id')
  async updatePublic(
    @Param('id') id: string,
    @Body() body: CulturalDocumentUpdateData
  ) {
    return this.docService.update(null, id, body);
  }

  /** 删除公共古籍 */
  @Permissions('system:cultural-doc:delete')
  @Delete('delete/:id')
  async deletePublic(@Param('id') id: string) {
    return this.docService.delete(null, id);
  }

  /** 上传公共古籍原页 */
  @Permissions('system:cultural-doc:page')
  @Post(':id/pages')
  async uploadPublicPages(
    @Param('id') id: string,
    @Body('pages') pages: PageUploadItem[]
  ) {
    return this.docService.upsertPages(id, pages);
  }
}
