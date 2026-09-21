import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, ParseIntPipe, HttpException, HttpStatus } from '@nestjs/common';
import { KinshipService } from './kinship.service';
import { UserJwtAuthGuard } from '../user/user.guard';
import { type AuthenticatedRequest } from '../common/types/common';

@UseGuards(UserJwtAuthGuard)
@Controller('user/kinship/:familyId')
export class KinshipController {
  constructor(private readonly kinshipService: KinshipService) {}

  /** 按姓名搜索成员（用于同名候选） */
  @Get('search')
  async searchMembers(
    @Req() req: AuthenticatedRequest,
    @Param('familyId', ParseIntPipe) familyId: number,
    @Query('name') name: string
  ) {
    await this.kinshipService.validateFamilyAccess(String(req.user.id), familyId);
    if (!name || !name.trim()) {
      throw new HttpException('请输入搜索姓名', HttpStatus.BAD_REQUEST);
    }
    return this.kinshipService.searchMembers(familyId, name.trim());
  }

  /** 共同祖先查询 */
  @Post('common-ancestor')
  async findCommonAncestor(
    @Req() req: AuthenticatedRequest,
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body() body: { memberAId: string; memberBId: string }
  ) {
    await this.kinshipService.validateFamilyAccess(String(req.user.id), familyId);
    if (!body.memberAId || !body.memberBId) {
      throw new HttpException('请选择两位成员', HttpStatus.BAD_REQUEST);
    }
    return this.kinshipService.findCommonAncestor(familyId, body.memberAId, body.memberBId);
  }
}
