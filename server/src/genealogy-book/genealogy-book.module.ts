import { Module } from '@nestjs/common';
import { GenealogyBookController } from './genealogy-book.controller';
import { GenealogyBookService } from './genealogy-book.service';

@Module({
  controllers: [GenealogyBookController],
  providers: [GenealogyBookService],
  exports: [GenealogyBookService]
})
export class GenealogyBookModule {}
