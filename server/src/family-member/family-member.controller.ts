import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, HttpException, HttpStatus } from '@nestjs/common';
import { FamilyMemberService } from './family-member.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type FamilyMemberCreateData, type FamilyMemberUpdateData, type FamilyMemberImportItem } from './types/family-member.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('family-member/:familyId')
export class FamilyMemberController {
  constructor(private readonly familyMemberService: FamilyMemberService) {}

  @Permissions('system:family-member:list')
  @Get('list')
  async getList(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('generation') generation?: string,
    @Query('gender') gender?: string,
    @Query('status') status?: string
  ) {
    return this.familyMemberService.getList(familyId, {
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      generation: generation !== undefined && generation !== '' ? Number(generation) : undefined,
      gender,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  @Permissions('system:family-member:list')
  @Get('all')
  async getAll(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('keyword') keyword?: string,
    @Query('generation') generation?: string,
    @Query('status') status?: string
  ) {
    return this.familyMemberService.getAll(familyId, {
      keyword,
      generation: generation !== undefined && generation !== '' ? Number(generation) : undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  @Permissions('system:family-member:list')
  @Get('father-candidates')
  async getFatherCandidates(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('generation') generation?: string,
    @Query('keyword') keyword?: string
  ) {
    if (generation === undefined || generation === '') {
      throw new HttpException('缺少 generation 参数', HttpStatus.BAD_REQUEST);
    }
    return this.familyMemberService.getFatherCandidates(familyId, Number(generation), keyword || '');
  }

  @Permissions('system:family-member:list')
  @Get('father-spouses/:id')
  async getFatherSpouses(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.familyMemberService.getFatherSpouses(familyId, id);
  }

  @Permissions('system:family-member:list')
  @Get('check-duplicate')
  async checkDuplicate(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('name') name?: string,
    @Query('fatherId') fatherId?: string,
    @Query('excludeId') excludeId?: string
  ) {
    return this.familyMemberService.checkDuplicate(familyId, name || '', fatherId || '', excludeId || '');
  }

  @Permissions('system:family-member:list')
  @Get(':id')
  async getById(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.familyMemberService.getById(familyId, id);
  }

  @Permissions('system:family-member:create')
  @Post('create')
  async create(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: FamilyMemberCreateData
  ) {
    return this.familyMemberService.create(familyId, {
      name: body.name,
      gender: body.gender,
      generation: body.generation !== undefined ? Number(body.generation) : undefined,
      generationName: body.generationName,
      birthDate: body.birthDate,
      birthPlace: body.birthPlace,
      isAlive: body.isAlive !== undefined ? Number(body.isAlive) : undefined,
      deathDate: body.deathDate,
      deathPlace: body.deathPlace,
      longitude: body.longitude !== undefined ? Number(body.longitude) : undefined,
      latitude: body.latitude !== undefined ? Number(body.latitude) : undefined,
      bio: body.bio,
      avatarUrl: body.avatarUrl,
      fatherId: body.fatherId,
      motherId: body.motherId,
      spouseInfo: body.spouseInfo,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined
    });
  }

  @Permissions('system:family-member:import')
  @Post('batch-import')
  async batchImport(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: { items: FamilyMemberImportItem[] }
  ) {
    return this.familyMemberService.batchImport(familyId, body?.items || []);
  }

  @Permissions('system:family-member:update')
  @Put('update/:id')
  async update(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Body() body: FamilyMemberUpdateData
  ) {
    return this.familyMemberService.update(familyId, id, {
      name: body.name,
      gender: body.gender,
      generation: body.generation !== undefined ? Number(body.generation) : undefined,
      generationName: body.generationName,
      birthDate: body.birthDate,
      birthPlace: body.birthPlace,
      isAlive: body.isAlive !== undefined ? Number(body.isAlive) : undefined,
      deathDate: body.deathDate,
      deathPlace: body.deathPlace,
      longitude: body.longitude !== undefined ? Number(body.longitude) : undefined,
      latitude: body.latitude !== undefined ? Number(body.latitude) : undefined,
      bio: body.bio,
      avatarUrl: body.avatarUrl,
      fatherId: body.fatherId,
      motherId: body.motherId,
      spouseInfo: body.spouseInfo,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      status: body.status !== undefined ? Number(body.status) : undefined
    });
  }

  @Permissions('system:family-member:delete')
  @Delete('delete/:id')
  async delete(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.familyMemberService.delete(familyId, id);
  }

  @Permissions('system:family-member:update')
  @Post('toggle-alive/:id')
  async toggleAlive(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string
  ) {
    return this.familyMemberService.toggleAlive(familyId, id);
  }
}
