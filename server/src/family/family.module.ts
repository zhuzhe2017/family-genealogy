import { Module } from '@nestjs/common';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyImportService } from './family-import.service';

@Module({
  controllers: [FamilyController],
  providers: [FamilyService, FamilyImportService],
  exports: [FamilyService]
})
export class FamilyModule {}
