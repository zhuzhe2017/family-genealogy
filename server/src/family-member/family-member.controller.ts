import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, HttpException, HttpStatus, UploadedFile, Req, UseInterceptors, BadRequestException, Header } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { FamilyMemberService } from './family-member.service';
import { MemberImportService, IMPORT_SUPPORTED_EXTS, MAX_IMPORT_FILE_SIZE } from './member-import.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type AuthenticatedRequest } from '../common/types/common';
import { CreateFamilyMemberDto, UpdateFamilyMemberDto } from './dto/family-member.dto';
import { type FamilyMemberImportItem } from './types/family-member.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('family-member/:familyId')
export class FamilyMemberController {
  constructor(
    private readonly familyMemberService: FamilyMemberService,
    private readonly memberImportService: MemberImportService
  ) {}

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
    @Query('keyword') keyword?: string,
    @Query('page') page?: string
  ) {
    if (generation === undefined || generation === '') {
      throw new HttpException('缺少 generation 参数', HttpStatus.BAD_REQUEST);
    }
    return this.familyMemberService.getFatherCandidates(familyId, Number(generation), keyword || '', page ? Number(page) : 1);
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

  /** 下载 CSV 导入模板（需在 :id 路由之前注册，避免被参数路由吞掉） */
  @Permissions('system:family-member:import')
  @Get('import-template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="member-import-template.csv"')
  getImportTemplate() {
    return this.memberImportService.buildTemplate();
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
    @Body() body: CreateFamilyMemberDto
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

  /** 文件批量导入（Excel/CSV，multipart，字段名 file） */
  @Permissions('system:family-member:import')
  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = (file.originalname.split('.').pop() || '').toLowerCase();
        if (!IMPORT_SUPPORTED_EXTS.includes(ext)) {
          return cb(new BadRequestException('仅支持 .xlsx / .xls / .csv 格式的文件', '400'), false);
        }
        cb(null, true);
      }
    })
  )
  async importFile(
    @Param('familyId', ParseIntPipe) familyId: number,
    @UploadedFile() file?: Express.Multer.File,
    @Req() req?: AuthenticatedRequest
  ) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件', '400');
    }
    return this.memberImportService.importFromFile(familyId, file, {
      username: req?.user?.username || 'admin',
      id: typeof req?.user?.id === 'number' ? req.user.id : undefined
    });
  }

  @Permissions('system:family-member:update')
  @Put('update/:id')
  async update(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Param('id') id: string,
    @Body() body: UpdateFamilyMemberDto
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
