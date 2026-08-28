import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { FamilyService } from './family.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type FamilyCreateData, type FamilyUpdateData } from './types/family.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('family')
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Permissions('system:family:list')
  @Get('list')
  async getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('isPublic') isPublic?: string
  ) {
    return this.familyService.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      isPublic: isPublic !== undefined && isPublic !== '' ? Number(isPublic) : undefined
    });
  }

  @Permissions('system:family:list', 'system:family-member:list')
  @Get('all')
  async getAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string
  ) {
    return this.familyService.getAll({
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  @Permissions('system:family:list')
  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.familyService.getById(id);
  }

  @Permissions('system:family:create')
  @Post('create')
  async create(@Body() body: FamilyCreateData) {
    return this.familyService.create({
      surnameId: body.surnameId === undefined ? undefined : (body.surnameId === null ? null : Number(body.surnameId)),
      generationTableId: body.generationTableId === undefined ? undefined : (body.generationTableId === null ? null : body.generationTableId),
      name: body.name,
      logo: body.logo,
      founder: body.founder,
      hallName: body.hallName,
      origin: body.origin,
      description: body.description,
      isPublic: body.isPublic !== undefined ? Number(body.isPublic) : undefined,
      allowJoin: body.allowJoin !== undefined ? Number(body.allowJoin) : undefined,
      creatorId: body.creatorId !== undefined ? Number(body.creatorId) : undefined
    });
  }

  @Permissions('system:family:update')
  @Put('update/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: FamilyUpdateData) {
    return this.familyService.update(id, {
      surnameId: body.surnameId === undefined ? undefined : (body.surnameId === null ? null : Number(body.surnameId)),
      generationTableId: body.generationTableId === undefined ? undefined : (body.generationTableId === null ? null : body.generationTableId),
      name: body.name,
      logo: body.logo,
      founder: body.founder,
      hallName: body.hallName,
      origin: body.origin,
      description: body.description,
      isPublic: body.isPublic !== undefined ? Number(body.isPublic) : undefined,
      allowJoin: body.allowJoin !== undefined ? Number(body.allowJoin) : undefined,
      status: body.status !== undefined ? Number(body.status) : undefined
    });
  }

  @Permissions('system:family:delete')
  @Delete('delete/:id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.familyService.delete(id);
  }

  @Permissions('system:family:update')
  @Post('restore/:id')
  async restore(@Param('id', ParseIntPipe) id: number) {
    return this.familyService.restore(id);
  }

  @Permissions('system:family:update')
  @Post('toggle-public/:id')
  async togglePublic(@Param('id', ParseIntPipe) id: number) {
    return this.familyService.togglePublic(id);
  }
}
