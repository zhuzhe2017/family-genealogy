import { Module } from '@nestjs/common';
import { SurnameController } from './surname.controller';
import { SurnameService } from './surname.service';

@Module({
  controllers: [SurnameController],
  providers: [SurnameService]
})
export class SurnameModule {}
