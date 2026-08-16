import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { SmsService } from './sms.service';
import { UserJwtStrategy } from './user.strategy';
import { UserJwtAuthGuard } from './user.guard';

@Module({
  controllers: [UserController],
  providers: [UserService, SmsService, UserJwtStrategy, UserJwtAuthGuard]
})
export class UserModule {}
