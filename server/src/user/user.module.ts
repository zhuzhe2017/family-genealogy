import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { SmsService } from './sms.service';
import { UserJwtStrategy } from './user.strategy';
import { UserJwtAuthGuard } from './user.guard';
import { MembershipModule } from '../membership/membership.module';
import { MemberModule } from '../member/member.module';

@Module({
  imports: [MembershipModule, MemberModule],
  controllers: [UserController],
  providers: [UserService, SmsService, UserJwtStrategy, UserJwtAuthGuard],
  exports: [UserService]
})
export class UserModule {}
