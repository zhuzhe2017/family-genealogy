import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { MenuModule } from './menu/menu.module';
import { SurnameModule } from './surname/surname.module';
import { RoleModule } from './role/role.module';
import { ContentModule } from './content/content.module';
import { FamilyModule } from './family/family.module';
import { FamilyMemberModule } from './family-member/family-member.module';
import { GenerationTableModule } from './generation-table/generation-table.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UserModule } from './user/user.module';
import { PortalModule } from './portal/portal.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { SystemLogModule } from './system-log/system-log.module';
import { SystemSecurityModule } from './system-security/system-security.module';
import { MembershipModule } from './membership/membership.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { WorshipModule } from './worship/worship.module';
import { UploadModule } from './common/upload/upload.module';
import { InvitationModule } from './invitation/invitation.module';
import { BannerModule } from './banner/banner.module';
import { PluginModule } from './plugin/plugin.module';
import { JwtAuthGuard } from './auth/guard/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env.local 优先级高于 .env,本地开发配置可覆盖默认模板
      envFilePath: ['.env.local', '.env']
    }),
    TypeOrmModule.forRootAsync(databaseConfig),
    // 全局限流:每分钟 60 次/IP,覆盖所有接口
    // 登录/刷新令牌等敏感接口在 controller 上用 @Throttle 进一步加严
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60
      }
    ]),
    DatabaseModule,
    AuthModule,
    AdminModule,
    MenuModule,
    SurnameModule,
    RoleModule,
    ContentModule,
    FamilyModule,
    FamilyMemberModule,
    GenerationTableModule,
    DashboardModule,
    UserModule,
    PortalModule,
    SystemConfigModule,
    SystemLogModule,
    SystemSecurityModule,
    MembershipModule,
    SubscriptionModule,
    WorshipModule,
    UploadModule,
    InvitationModule,
    BannerModule,
    PluginModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 顺序:ThrottlerGuard 在 JwtAuthGuard 之前注册,
    // 限流检查(廉价)先于鉴权(昂贵)执行,超限直接 429 不消耗 DB 查询
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    // 全局异常过滤器(通过 DI 注入日志服务,用于记录 5xx 错误日志)
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter
    }
  ]
})
export class AppModule {}
