# 宝塔面板部署文档（数字家谱管理系统）

> 适用版本：后端 NestJS + 前端 web-admin（Vue3/Vite）+ MySQL + 小程序
> 本文以生产域名 `jiapuadmin.deejee.net` 为例，部署时替换为你的实际域名。

## 1. 项目结构

| 模块 | 目录 | 说明 |
|---|---|---|
| 后端 API | `server/` | NestJS，监听 `PORT`（默认 `3000`，生产示例 `3003`），全局前缀 `/api`，上传文件静态目录 `/uploads/` |
| 管理后台 | `web-admin/` | Vue3 + Vite，构建产物 `web-admin/dist/`，接口走相对路径 `/api`（Nginx 反代） |
| 小程序 | `mini-program/` | 微信小程序，通过 `mini-program/utils/config.js` 的 `API_BASE_URL` 对接后端 |
| 数据库 | MySQL | 库名 `family_genealogy`，结构脚本 `server/database/schema.sql` |

## 2. 环境要求

- 服务器：宝塔面板（Linux），已装 Nginx、MySQL 8.x
- Node.js ≥ 20.19（宝塔「软件商店 → Node.js 版本管理器」安装 20.x）
- pnpm ≥ 10.5（`npm install -g pnpm`）
- PM2 进程守护（`npm install -g pm2`）

## 3. 上传代码

将项目源码上传到服务器，建议目录：

```
/www/wwwroot/jiapuadmin/
├── server/       # 后端源码
├── web-admin/    # 前端源码
└── dist/         # 前端构建产物（站点根目录）
```

## 4. 数据库初始化

### 4.1 全新环境

1. 宝塔「数据库」→ 添加数据库 `family_genealogy`，字符集 `utf8mb4`，记录用户名密码。
2. 导入基础结构（含全部表结构与初始化种子，幂等）：

```bash
cd /www/wwwroot/jiapuadmin/server/database
mysql -u<user> -p<password> family_genealogy < schema.sql
```

3. 执行 schema.sql **未覆盖**的增量迁移（均为幂等脚本，可重复执行）：

```bash
node run-migration.js migrations/20260815-membership-init.sql        # 订阅系统 5 张表
node run-migration.js migrations/add-subscription-admin-permissions.sql  # 订阅管理权限+菜单
node run-migration.js migrations/20260817-worship-admin.sql          # 祭祀管理权限+菜单
node run-migration.js migrations/20260817-worship-memorial.sql       # 纪念对象补充数据
node run-migration.js migrations/20260817-family-invitation.sql      # 家族邀请表+权限
node run-migration.js migrations/20260818-family-banner.sql          # 广告轮播表+权限+菜单
```

> 迁移文件清单与用途详见 `server/database/MIGRATIONS.md`。

### 4.2 存量库升级

按 `MIGRATIONS.md` 逐项执行尚未生效的迁移脚本，方式同上 `node run-migration.js migrations/<file>.sql`。

## 5. 后端部署

```bash
cd /www/wwwroot/jiapuadmin
# 在 web-admin 根执行 pnpm install，一次性安装整个 workspace（含 server、packages/*）
pnpm install

# 构建后端
cd server
pnpm build        # 产物 dist/
```

配置环境变量（参考 `server/.env.example`，`server/.env.local` 仅为本地开发示例）：

```bash
cp .env.example .env
```

生产必改项：

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=family_genealogy
DB_USERNAME=<宝塔数据库用户名>
DB_PASSWORD=<强密码>
PORT=3003                # 后端监听端口，Nginx 反代须与之一致
NODE_ENV=production
# 强随机密钥: openssl rand -base64 48
JWT_SECRET=<强随机密钥>
# 生产必须为管理后台实际域名，禁止 *
CORS_ORIGINS=https://jiapuadmin.deejee.net
# 微信小程序（真实 AppID/Secret，用于 /api/user/wx-login）
WX_APPID=<小程序 AppID>
WX_SECRET=<小程序 AppSecret>
```

用 PM2 守护并设置开机自启：

```bash
cd /www/wwwroot/jiapuadmin/server
pm2 start dist/main.js --name family-genealogy-server
pm2 save
pm2 startup   # 按输出提示在宝塔执行对应的启动命令
```

> `server/uploads/` 为上传图片目录，务必纳入备份，升级/重启不会清空。

## 6. 前端部署

```bash
cd /www/wwwroot/jiapuadmin/web-admin
pnpm install
pnpm build        # 构建产物 dist/（生产模式，接口为相对路径 /api）
```

发布产物到站点根目录：

```bash
rm -rf /www/wwwroot/jiapuadmin/dist
cp -r dist /www/wwwroot/jiapuadmin/dist
```

> 前端构建后引用的是相对路径 `/api` 与 `/uploads/`，由 Nginx 反代到后端，见第 7 节。

## 7. Nginx 站点配置

宝塔「网站 → 添加站点」→ 域名填 `jiapuadmin.deejee.net`，根目录 `/www/wwwroot/jiapuadmin/dist`，然后修改配置文件：

```nginx
server {
    listen 80;
    server_name jiapuadmin.deejee.net;
    root /www/wwwroot/jiapuadmin/dist;
    index index.html;

    # 前端 History 路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API（保留 /api 前缀，命中后端全局前缀；端口必须与 server/.env 的 PORT 一致，示例为 3003）
    location /api/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 上传图片静态资源（管理后台预览 + 小程序 <image> 均走此路径；端口同 PORT）
    # 必须用 ^~，否则会被宝塔默认的 "location ~ .*\.(png|jpg)$" 静态缓存正则抢走导致 404
    location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
    }

    # 上传接口大小限制
    client_max_body_size 20m;
}
```

保存后「重载配置」。宝塔会自动生成 80→443 的跳转。

## 8. HTTPS（推荐）

宝塔「网站 → SSL」→ 申请 Let's Encrypt 免费证书并开启强制 HTTPS。小程序与微信支付回调均要求 `https` 公网域名。

## 9. 小程序配置

编辑 `mini-program/utils/config.js`：

```js
module.exports = {
  API_BASE_URL: 'https://jiapuadmin.deejee.net/api',  // 与 Nginx 反代一致
  USE_MOCK: false,                                    // 生产必须 false
  TIMEOUT: 10000
};
```

在微信公众平台将 `jiapuadmin.deejee.net` 加入「服务器域名」：
- request 合法域名：`https://jiapuadmin.deejee.net`
- downloadFile 合法域名：同上（图片加载）

## 10. 更新发布流程

```bash
# 后端
cd /www/wwwroot/jiapuadmin/web-admin && git pull && pnpm install
cd /www/wwwroot/jiapuadmin/server && git pull && pnpm install && pnpm build
pm2 restart family-genealogy-server

# 前端
cd /www/wwwroot/jiapuadmin/web-admin && pnpm build
rm -rf /www/wwwroot/jiapuadmin/dist && cp -r dist /www/wwwroot/jiapuadmin/dist

# 数据库有增量迁移时
cd /www/wwwroot/jiapuadmin/server/database && node run-migration.js migrations/<file>.sql
```

## 11. 常见问题排查

| 现象 | 原因与处理 |
|---|---|
| 管理后台图片预览失败/列表缩略图不显示 | Nginx 缺少 `/uploads/` 反代；或 `server/uploads/` 被清空 |
| 接口 404 | `/api/` 反代缺失或 `proxy_pass` 拼写错误（注意保留末尾路径） |
| 登录/接口提示密钥错误 | `.env` 未配置 `JWT_SECRET`（缺失会启动失败）或前后端密钥不一致 |
| 小程序报「缺少家族ID」 | 未登录或未选择家族；生产确认 `USE_MOCK=false` |
| 管理后台跨域报错 | `CORS_ORIGINS` 未包含管理后台域名（生产同域反代一般不触发） |
| 上传大图失败 | Nginx `client_max_body_size` 太小 |
| 支付回调失败 | 回调地址必须是公网 HTTPS 且 `WX_PAY_NOTIFY_URL` 配置正确 |
