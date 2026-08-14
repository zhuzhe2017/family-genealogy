import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ContentService, ContentType } from './content.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  /** 统一列表查询 */
  @Permissions('system:content:list')
  @Get(':type/list')
  async getList(
    @Param('type') type: ContentType,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('familyId') familyId?: string,
    @Query('auditStatus') auditStatus?: string,
    @Query('keyword') keyword?: string
  ) {
    this.assertType(type);
    return this.contentService.getList(type, {
      page: Number(page),
      pageSize: Number(pageSize),
      familyId,
      auditStatus: auditStatus !== undefined && auditStatus !== '' ? Number(auditStatus) : undefined,
      keyword
    });
  }

  /** 审核 */
  @Permissions('system:content:audit')
  @Post(':type/audit/:id')
  async audit(
    @Param('type') type: ContentType,
    @Param('id') id: string,
    @Body() body: { auditStatus: number }
  ) {
    this.assertType(type);
    return this.contentService.audit(type, id, body.auditStatus);
  }

  /** 下架/上架切换 */
  @Permissions('system:content:toggle')
  @Post(':type/toggle/:id')
  async toggle(
    @Param('type') type: ContentType,
    @Param('id') id: string
  ) {
    this.assertType(type);
    return this.contentService.toggle(type, id);
  }

  /** 删除（软删除） */
  @Permissions('system:content:delete')
  @Delete(':type/:id')
  async delete(
    @Param('type') type: ContentType,
    @Param('id') id: string
  ) {
    this.assertType(type);
    return this.contentService.delete(type, id);
  }

  private assertType(type: string): asserts type is ContentType {
    if (!['dynamic', 'photo', 'document', 'event'].includes(type)) {
      throw new Error('内容类型非法，仅支持 dynamic/photo/document/event');
    }
  }
}
