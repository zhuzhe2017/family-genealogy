# 家族数字谱牒后台服务

本项目是数字家谱小程序的后端 API 服务，基于 NestJS + TypeORM + MySQL 构建。

## 快速开始

```bash
cd server
pnpm install
pnpm start:dev
```

## 环境变量

服务启动前请在 `server/.env` 文件中配置数据库连接参数：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=family_genealogy
DB_USERNAME=root
DB_PASSWORD=your_password
DB_POOL_SIZE=10
DB_POOL_TIMEOUT=60000

# 服务端口
PORT=3000
```

## 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/database/status` | 数据库连接状态 |
| POST | `/api/database/test` | 测试数据库连接 |
| GET | `/api/health` | 服务健康检查 |

## 连接池与重连

TypeORM 内置连接池管理，通过 `extra.pool` 配置：
- `max`：最大连接数
- `min`：最小连接数
- `idle`：连接最大空闲时间
- `acquire`：获取连接超时时间

当连接断开时，TypeORM 会尝试自动重连。
