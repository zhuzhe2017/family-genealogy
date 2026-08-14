import { Module } from '@nestjs/common';
import { GenerationTableController } from './generation-table.controller';
import { GenerationTableService } from './generation-table.service';

@Module({
  controllers: [GenerationTableController],
  providers: [GenerationTableService]
})
export class GenerationTableModule {}
