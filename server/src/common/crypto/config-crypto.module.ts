import { Global, Module } from '@nestjs/common';
import { ConfigCryptoService } from './config-crypto.service';

@Global()
@Module({
  providers: [ConfigCryptoService],
  exports: [ConfigCryptoService]
})
export class ConfigCryptoModule {}
