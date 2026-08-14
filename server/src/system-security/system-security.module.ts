import { Global, Module } from '@nestjs/common';
import { SystemSecurityController } from './system-security.controller';
import { SystemSecurityService } from './system-security.service';

@Global()
@Module({
  controllers: [SystemSecurityController],
  providers: [SystemSecurityService],
  exports: [SystemSecurityService]
})
export class SystemSecurityModule {}
