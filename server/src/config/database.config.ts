import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const host = this.configService.getOrThrow<string>('DB_HOST');
    const port = this.configService.getOrThrow<number>('DB_PORT');
    const database = this.configService.getOrThrow<string>('DB_DATABASE');
    const username = this.configService.getOrThrow<string>('DB_USERNAME');
    const password = this.configService.getOrThrow<string>('DB_PASSWORD');

    return {
      type: 'mysql',
      host,
      port,
      database,
      username,
      password,
      // 项目使用手写 SQL 操作,未使用 TypeORM 实体;关闭实体加载与自动同步
      entities: [],
      synchronize: false,
      autoLoadEntities: false,
      logging: this.configService.get<string>('NODE_ENV') === 'development',
      retryAttempts: 10,
      retryDelay: 3000,
      keepConnectionAlive: false,
      extra: {
        pool: {
          max: this.configService.get<number>('DB_POOL_SIZE', 10),
          min: 2,
          idle: 10000,
          acquire: this.configService.get<number>('DB_POOL_TIMEOUT', 60000)
        }
      }
    };
  }
}

export const databaseConfig = {
  useClass: DatabaseConfigService
};
