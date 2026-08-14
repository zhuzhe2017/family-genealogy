import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SurnameService } from './surname.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type SurnameCreateData, type SurnameUpdateData, type SurnameQueryParams } from './types/surname.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('surname')
export class SurnameController {
  constructor(private readonly surnameService: SurnameService) {}

  @Permissions('system:surname:list')
  @Get('list')
  async getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('initial') initial?: string,
    @Query('status') status?: string
  ) {
    const params: SurnameQueryParams = {
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      initial,
      status: status !== undefined ? Number(status) : undefined
    };
    return this.surnameService.getList(params);
  }

  @Permissions('system:surname:list')
  @Get('all')
  async getAll(
    @Query('keyword') keyword?: string,
    @Query('initial') initial?: string,
    @Query('status') status?: string
  ) {
    return this.surnameService.getAll({ keyword, initial, status: status !== undefined ? Number(status) : undefined });
  }

  @Permissions('system:surname:list')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.surnameService.getById(Number(id));
  }

  @Permissions('system:surname:create')
  @Post('create')
  async create(@Body() body: SurnameCreateData) {
    return this.surnameService.create(body);
  }

  @Permissions('system:surname:update')
  @Put('update/:id')
  async update(@Param('id') id: string, @Body() body: SurnameUpdateData) {
    return this.surnameService.update(Number(id), body);
  }

  @Permissions('system:surname:delete')
  @Delete('delete/:id')
  async delete(@Param('id') id: string) {
    return this.surnameService.delete(Number(id));
  }

  @Permissions('system:surname:import')
  @Post('batch-import')
  async batchImport(@Body() body: { items: SurnameCreateData[] }) {
    return this.surnameService.batchImport(body?.items || []);
  }

  @Permissions('system:surname:status')
  @Post('toggle-status/:id')
  async toggleStatus(@Param('id') id: string) {
    return this.surnameService.toggleStatus(Number(id));
  }
}
