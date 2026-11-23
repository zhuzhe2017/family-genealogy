# 宝塔面板部署文档（数字家谱管理系统）

> 适用版本：后端 NestJS + 前端 web-admin（Vue3/Vite）+ MySQL + 小程序
> 版本：v1.1 ｜ 日期：2026-11-23 ｜ 性质：宝塔单机部署（阶段一冷启动）
> 本文以生产域名 `jiapuadmin.deejee.net` 为例，部署时替换为你的实际域名。
>
> **v1.1 更新**：新增「识典古籍对标」功能层部署专项（6 阶段已全部落地）。详见 **§4.1 / §5 / §10 / §11**。
>
> 关联文档：[tencent-cloud-deployment.md](./tencent-cloud-deployment.md)（腾讯云生产部署方案，本文档为其单机等价方案）

## 1. 项目结构

| 模块 | 目录 | 说明 |
|---|---|---|
| 后端 API | `server/` | NestJS，监听 `PORT`（默认 `3000`，生产示例 `3003`），全局前缀 `/api`，上传文件静态目录 `/uploads/` |
| 管理后台 | `web-admin/` | Vue3 + Vite，构建产物 `web-admin/dist/`，接口走相对路径 `/api`（Nginx 反代） |
| 小程序 | `mini-program/` | 微信小程序，通过 `mini-program/utils/config.js` 的 `API_BASE_URL` 对接后端 |
| 数据库 | MySQL | 库名 `family_genealogy`，结构脚本 `server/database/schema.sql` |
| 识典古籍对标 | **v1.1 新增** | AI 助手 / 在线阅读器 / 听书 TTS / 手写 OCR / 时空地图 / 文化工具箱，详见 **§1.1** |

### 1.1 识典古籍对标功能层（v1.1 新增，6 阶段已交付）

| 阶段 | 功能 | 后端模块 | 小程序页面 | 核心依赖 |
|------|------|---------|-----------|---------|
| 0 基础设施 | Capability 枚举扩展 + LLM 通用服务 + 5 张新表 | `llm` + `ai_chat_session` / `ai_chat_message` / `cultural_document` / `_page` / `_chapter` / `_dictionary` | — | `sys_config` 3 条 LLM 配置 |
| 1 在线阅读器 | 公共古籍 + 家族族谱双域 CRUD + 种子数据 | `cultural-document` + `cultural-dict` | `pages/cultural-index` + `pages/reader` + web-admin 管理页 | `cultural-seed-data.sql` |
| 2 AI 助手 | RAG 对话 + 亲属关系 LCA 推理 + 会话持久化 | `ai-assistant` | `pages/ai-chat` | `LlmService` + `Entitlement(AiChat/AiSummary/Annotate)` |
| 3 文化工具箱 | 字辈/堂号/家谱术语查询 + 亲属关系计算 | 复用 `cultural-dict` + `ai-assistant` | `pages/tools` + `pages/dict-list` + `pages/relation-tool` | — |
| 4 听书 TTS | 分段并行合成 + 7 天缓存 + edge-tts Provider | `tts` + `tts_audio_cache` | `pages/audio-player` | `sys_config` 3 条 TTS 配置 |
| 5 手写 OCR | Provider 抽象 + LLM 结构化 + 分表确认导入 | `ocr` + `ocr_result_cache` | `pages/ocr-import` | `Entitlement(OcrImport)` 额度 |
| 6 时空地图 | 按世代地理分布 + 迁徙路线 + 内置 23 条历史事件 | `timeline-map` + `timeline_map_cache` | `pages/migration-map` | 成员表 `lat`/`lng` 字段 |

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
2. 导入完整结构（含全部表结构、初始化种子与历史迁移整合内容，幂等）：

```bash
cd /www/wwwroot/jiapuadmin/server/database
mysql -u<user> -p<password> family_genealogy < schema.sql
```

3. **识典古籍对标新增表（v1.1 必执行）**：

```bash
# 文化内容 + AI 会话 + 字典 + 缓存表（9 张） + 7 条权限码 + 8 条 sys_config
mysql -u<user> -p<password> family_genealogy < cultural-content.sql

# 公共古籍种子数据（5 部古籍 + 10 章 + 40 字典词条，可选但推荐）
mysql -u<user> -p<password> family_genealogy < cultural-seed-data.sql
```

> `cultural-content.sql` 已统一幂等（`CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`），可重复执行。新增 **9 张表**（cultural_document / _page / _chapter / _dictionary / ai_chat_session / ai_chat_message / tts_audio_cache / ocr_result_cache / timeline_map_cache）+ **7 条 `system:cultural-*` 权限码** + **8 条 sys_config**（`llm_provider/llm_api_key/llm_model` + `tts_provider/tts_api_key/tts_app_id` + `ocr_provider/ocr_api_key`）。

### 4.2 存量库升级

先备份数据库，然后按 `server/database/MERGE_LOG.md` 第二节「文件 → 主脚本映射」定位尚未生效的迁移内容，从 git 历史恢复对应语句手动执行（原迁移均为幂等脚本）；或直接对临时库重新导入 `schema.sql` 后核对结构差异。

**v1.1 存量升级新增步骤**：

```bash
# 1. 先备份
mysqldump -u<user> -p<password> family_genealogy > backup_$(date +%Y%m%d).sql

# 2. 执行识典古籍专项 DDL（幂等，不会破坏已有表）
mysql -u<user> -p<password> family_genealogy < cultural-content.sql

# 3. 执行种子数据（幂等，INSERT IGNORE）
mysql -u<user> -p<password> family_genealogy < cultural-seed-data.sql

# 4. 验证
mysql -u<user> -p<password> -e "SHOW TABLES LIKE 'cultural_%'; SHOW TABLES LIKE 'ai_chat_%'; SHOW TABLES LIKE '%cache%';" family_genealogy
# 预期输出：cultural_document / cultural_document_page / cultural_document_chapter / cultural_dictionary /
#           ai_chat_session / ai_chat_message / tts_audio_cache / ocr_result_cache / timeline_map_cache
#           共 9 张表
```

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

**识典古籍新模块注册验证（v1.1 必做）**：

所有新模块已在 `server/src/app.module.ts` 中按字母序注册（`AiAssistantModule` / `TimelineMapModule` / `LlmModule` / `OcrModule` / `TtsModule` / `CulturalDocumentModule` / `CulturalDictModule`），启动时无显式报错即可。PM2 启动后用 `curl` 快速抽查 4 个公开端点（无需鉴权）：

```bash
# 公共古籍列表（cultural-document）
curl -s http://127.0.0.1:3003/api/cultural-doc/public/list?page=1

# 字典分类统计（cultural-dict）
curl -s http://127.0.0.1:3003/api/cultural-dict/stats

# 历史事件（timeline-map 公开）
curl -s "http://127.0.0.1:3003/api/timeline-map/history?start=-221&end=2025&cat=politics"

# TTS 音色列表（公开）
curl -s http://127.0.0.1:3003/api/tts/voices
```

每条命令都应返回有效 JSON（非 `404`、非 `500`）。如果有 404 说明模块没注册上，查 `pm2 logs family-genealogy-server --lines 100`。

**sys_config 生产配置项（v1.1 新增，8 条，已在 SQL 中 INSERT IGNORE，默认值均为 mock）**：

宝塔可直接在「数据库 → phpMyAdmin → sys_config」中修改，或用 SQL：

```sql
-- 生产必须把 mock Provider 切换为真实服务
UPDATE sys_config SET config_value = 'doubao' WHERE config_key = 'llm_provider';
UPDATE sys_config SET config_value = '<加密后的 API Key>' WHERE config_key = 'llm_api_key';
UPDATE sys_config SET config_value = 'doubao-lite-32k' WHERE config_key = 'llm_model';
UPDATE sys_config SET config_value = 'edge-tts' WHERE config_key = 'tts_provider';  -- edge-tts 零成本可留空 tts_api_key
UPDATE sys_config SET config_value = 'tencent' WHERE config_key = 'ocr_provider';
UPDATE sys_config SET config_value = '<腾讯云 OCR SecretId/Key 加密后>' WHERE config_key = 'ocr_api_key';
```

| config_key | 默认值 | 生产建议 | 说明 |
|-----------|--------|---------|------|
| `llm_provider` | `mock` | `doubao` 或 `deepseek` | LLM Provider |
| `llm_api_key` | 空 | 加密后的 API Key | 建议 `config-crypto.module.ts` 加密 |
| `llm_model` | 空 | `doubao-lite-32k` / `deepseek-chat` | 具体模型名 |
| `tts_provider` | `mock` | `edge-tts`（零成本）或 `tencent` | TTS Provider |
| `tts_api_key` | 空 | edge-tts 可留空 | 腾讯云 TTS 必填 |
| `tts_app_id` | 空 | 腾讯云 AppID | — |
| `ocr_provider` | `mock` | `tencent`（手写体推荐） | OCR Provider |
| `ocr_api_key` | 空 | 腾讯云 OCR SecretId/Key | — |

> **⚠️ 关键**：生产环境必须把 `mock` Provider 切换为真实服务，否则 AI 助手返回模拟族谱文本、TTS 无法合成真实音频、OCR 无法识别真实图片。修改后无需重启后端，下一次调用自动生效（每次请求都从 `sys_config` 实时读取）。

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

**v1.1 识典古籍新增页面注册确认**：

`mini-program/app.json` 的 `pages` 数组末尾应包含以下 9 个新页面路径（已自动追加，确认一下没有漏）：

```json
{
  "pages": [
    "...原页面...",
    "pages/cultural-index/cultural-index",
    "pages/reader/reader",
    "pages/ai-chat/ai-chat",
    "pages/tools/tools",
    "pages/dict-list/dict-list",
    "pages/relation-tool/relation-tool",
    "pages/audio-player/audio-player",
    "pages/ocr-import/ocr-import",
    "pages/migration-map/migration-map"
  ]
}
```

发布流程：微信开发者工具打开项目 → 右上角「上传」→ 填版本号（建议 `1.0.0 → 1.1.0`）+ 描述「识典古籍对标 v1」→ 提交审核 → 通过后在公众平台发布。

## 10. 更新发布流程

```bash
# 后端
cd /www/wwwroot/jiapuadmin/web-admin && git pull && pnpm install
cd /www/wwwroot/jiapuadmin/server && git pull && pnpm install && pnpm build

# 数据库有增量变更时：
# 1. 原 migrations/*.sql 已整合进 schema.sql（见 4.1），
#    存量库按 MERGE_LOG.md 第二节映射补执行对应语句后重启后端
# 2. v1.1 识典古籍专项新增 cultural-content.sql + cultural-seed-data.sql
#    两个都是 INSERT IGNORE / CREATE TABLE IF NOT EXISTS，可安全重复执行
cd /www/wwwroot/jiapuadmin/server/database
mysql -u<user> -p<password> family_genealogy < cultural-content.sql
mysql -u<user> -p<password> family_genealogy < cultural-seed-data.sql

# 重启并验证
cd /www/wwwroot/jiapuadmin/server
pm2 restart family-genealogy-server
sleep 3
curl -s http://127.0.0.1:3003/api/cultural-dict/stats    # 非 404 说明新模块已加载

# 前端
cd /www/wwwroot/jiapuadmin/web-admin && pnpm build
rm -rf /www/wwwroot/jiapuadmin/dist && cp -r dist /www/wwwroot/jiapuadmin/dist
```

## 11. 常见问题排查

### 11.1 原有问题

| 现象 | 原因与处理 |
|---|---|
| 管理后台图片预览失败/列表缩略图不显示 | Nginx 缺少 `/uploads/` 反代；或 `server/uploads/` 被清空 |
| 接口 404 | `/api/` 反代缺失或 `proxy_pass` 拼写错误（注意保留末尾路径） |
| 登录/接口提示密钥错误 | `.env` 未配置 `JWT_SECRET`（缺失会启动失败）或前后端密钥不一致 |
| 小程序报「缺少家族ID」 | 未登录或未选择家族；生产确认 `USE_MOCK=false` |
| 管理后台跨域报错 | `CORS_ORIGINS` 未包含管理后台域名（生产同域反代一般不触发） |
| 上传大图失败 | Nginx `client_max_body_size` 太小 |
| 支付回调失败 | 回调地址必须是公网 HTTPS 且 `WX_PAY_NOTIFY_URL` 配置正确 |

### 11.2 识典古籍 v1.1 新增问题

| 现象 | 原因与处理 |
|---|---|
| `cultural-doc/public/list` 404 | 未执行 `cultural-content.sql`，或 `cultural-document` 表不存在。检查 PM2 日志是否有 Module 加载错误 |
| AI 助手返回模拟文本 | `sys_config.llm_provider` 为 `mock`。改 `doubao` 或 `deepseek` + 配 `llm_api_key`，**无需重启后端** |
| AI 助手返回「额度不足 4003/4004」 | 正常。`subscription_plan.capabilities` 中 `ai_chat` 未给对应套餐开足够额度。用 `JSON_SET` 追加（见腾讯云 §3.11.3） |
| TTS 调用报错但返回音频 URL | `sys_config.tts_provider` 是 `mock`，返回的是假 URL。切 `edge-tts`（零成本）或 `tencent` |
| OCR 识别只返回模拟族谱文本 | `sys_config.ocr_provider` 是 `mock`。切 `tencent`（手写体推荐）+ 配 API Key |
| 时空地图打开但无 marker | 家族成员表 `family_members_{fid}` 中没有 `lat`/`lng` 坐标。先补 2-3 条测试坐标 |
| web-admin 管理后台看不到「文化典籍」菜单 | 1) 超级管理员权限 `super` 角色未新增 `system:cultural-*` 权限码；2) 前端 `web-admin/src/router/elegant/routes.ts` 未同步（v1.1 已自动追加） |
| 后端启动崩溃，日志显示 `Table 'cultural_dictionary' doesn't exist` | 漏执行 `cultural-content.sql`，重新执行即可（幂等） |
| LLM Provider 调不通，`logs` 里有 ECONNREFUSED | 服务器无法访问 Provider 域名。宝塔放行出站 443 端口；或 Provider 域名被墙（国内 Provider 无此问题） |
| edge-tts 超时失败 | 网络抖动。重试一般能恢复；edge-tts 免费不稳定时切 `tencent` Provider |
