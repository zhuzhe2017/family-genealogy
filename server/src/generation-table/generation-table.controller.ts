import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { GenerationTableService } from './generation-table.service';
import { CreateGenerationTableDto, UpdateGenerationTableDto } from './dto/generation-table.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type BatchImportBody } from './types/generation-table.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('generation-table')
export class GenerationTableController {
  constructor(private readonly service: GenerationTableService) {}

  @Permissions('system:generation-table:list')
  @Get('list')
  async getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('region') region?: string,
    @Query('status') status?: string
  ) {
    return this.service.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      region,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  @Permissions('system:generation-table:list')
  @Get('all')
  async getAll(
    @Query('keyword') keyword?: string,
    @Query('region') region?: string,
    @Query('status') status?: string
  ) {
    return this.service.getAll({
      keyword,
      region,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  @Permissions('system:generation-table:list')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Permissions('system:generation-table:create')
  @Post('create')
  async create(@Body() body: CreateGenerationTableDto) {
    return this.service.create(body);
  }

  @Permissions('system:generation-table:update')
  @Put('update/:id')
  async update(@Param('id') id: string, @Body() body: UpdateGenerationTableDto) {
    return this.service.update(id, body);
  }

  @Permissions('system:generation-table:delete')
  @Delete('delete/:id')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Permissions('system:generation-table:import')
  @Post('batch-import')
  async batchImport(@Body() body: BatchImportBody) {
    return this.service.batchImport(body?.items || []);
  }

  @Permissions('system:generation-table:status')
  @Post('toggle-status/:id')
  async toggleStatus(@Param('id') id: string) {
    return this.service.toggleStatus(id);
  }
}
