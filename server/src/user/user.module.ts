import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { SmsService } from './sms.service';
import { WxSubscribeMessageService } from './wx-subscribe-message.service';
import { UserJwtStrategy } from './user.strategy';
import { UserJwtAuthGuard } from './user.guard';
import { MembershipModule } from '../membership/membership.module';
import { MemberModule } from '../member/member.module';
import { ConsentService } from './consent.service';
import { MaskingService } from '../common/masking/masking.service';

@Module({
  imports: [MembershipModule, MemberModule],
  controllers: [UserController],
  providers: [UserService, SmsService, WxSubscribeMessageService, UserJwtStrategy, UserJwtAuthGuard, ConsentService, MaskingService],
  exports: [UserService, SmsService, WxSubscribeMessageService]
})
export class UserModule {}
