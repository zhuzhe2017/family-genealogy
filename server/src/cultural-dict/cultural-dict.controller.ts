import { Controller, Get, Query } from '@nestjs/common';
import { CulturalDictService, type DictListParams } from './cultural-dict.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * 文化字典查询（公开端点，无需登录）
 * - GET /cultural-dict/list?category=zibei&keyword=文&surname=李&page=1&pageSize=20
 * - GET /cultural-dict/stats  返回各分类条数
 */
@Public()
@Controller('cultural-dict')
export class CulturalDictController {
  constructor(private readonly dictService: CulturalDictService) {}

  @Get('list')
  async getList(@Query() params: DictListParams) {
    return this.dictService.getList(params);
  }

  @Get('stats')
  async getStats() {
    return this.dictService.getCategoryStats();
  }
}
