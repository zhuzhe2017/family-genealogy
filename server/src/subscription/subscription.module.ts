import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { MemberModule } from '../member/member.module';
import { SubscriptionController, WxNotifyController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { WxPayService } from './wx-pay.service';
import { SubscriptionAdminController } from './subscription-admin.controller';
import { SubscriptionAdminService } from './subscription-admin.service';

@Module({
  imports: [MembershipModule, MemberModule],
  controllers: [SubscriptionController, WxNotifyController, SubscriptionAdminController],
  providers: [SubscriptionService, WxPayService, SubscriptionAdminService],
  exports: [SubscriptionService]
})
export class SubscriptionModule {}
