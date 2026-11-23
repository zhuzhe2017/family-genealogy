# 数字家谱腾讯云部署方案

> 版本：v1.1 ｜ 日期：2026-11-23 ｜ 性质：生产部署方案（腾讯云）
>
> 关联文档：[baota-deployment.md](./baota-deployment.md)（宝塔单机部署，本方案迁移过渡参照）、[saas-transformation-plan.md](./saas-transformation-plan.md)（SaaS 化改造与运维规划）、[commercial-strategy.md](./commercial-strategy.md)（商业策略）
> 本文定位：面向商业运营（冷启动 → 增长 → 规模三阶段）的腾讯云部署方案，含资源规划、迁移步骤、容器化落地、监控容灾与成本估算。
>
> **v1.1 更新**：新增「识典古籍对标」功能层部署专项（6 阶段已全部落地）。详见 **§3.11 识典古籍功能部署**。

---

## 1. 背景与目标

### 1.1 项目现状

| 层 | 技术 | 说明 |
|----|------|------|
| 后端 | NestJS 10 + TypeORM + MySQL 8 | 单体，全局前缀 `/api`，上传静态目录 `/uploads/` |
| 数据库 | MySQL 8 单库 `family_genealogy` | 自建，本地磁盘存图（`server/uploads/`） |
| 管理后台 | Vue3 + Vite + Naive UI | 构建产物 `web-admin/dist/` |
| 小程序 | 原生微信小程序 | 通过 `mini-program/utils/config.js` 的 `API_BASE_URL` 对接 |
| 商业化 | 订阅（free/family/premium）+ 微信支付 | 已落地，能力点模型 |
| 识典古籍对标 | AI 助手 + 在线阅读器 + 听书 TTS + 手写 OCR + 时空地图 + 文化工具箱 | **v1.1 新增**，详见 §3.11 |

**识典古籍对标功能层（v1.1 新增，6 阶段已交付）**：

| 阶段 | 功能 | 后端模块 | 小程序页面 | 核心依赖 |
|------|------|---------|-----------|---------|
| 0 基础设施 | Capability 枚举扩展 + LLM 通用服务 + 5 张新表 | `llm` + `ai_chat_session` / `ai_chat_message` / `cultural_document` / `_page` / `_chapter` / `_dictionary` | — | `sys_config` 3 条 LLM 配置 |
| 1 在线阅读器 | 公共古籍 + 家族族谱双域 CRUD + 种子数据 | `cultural-document` + `cultural-dict` | `pages/cultural-index` + `pages/reader` + web-admin 管理页 | `cultural-seed-data.sql` |
| 2 AI 助手 | RAG 对话 + 亲属关系 LCA 推理 + 会话持久化 | `ai-assistant` | `pages/ai-chat` | `LlmService` + `Entitlement(OcrImport/AiChat/AiSummary/Annotate)` |
| 3 文化工具箱 | 字辈/堂号/家谱术语查询 + 亲属关系计算 | 复用 `cultural-dict` + `ai-assistant` 关系接口 | `pages/tools` + `pages/dict-list` + `pages/relation-tool` | — |
| 4 听书 TTS | 分段并行合成 + 7 天缓存 + edge-tts Provider | `tts` + `tts_audio_cache` | `pages/audio-player` | `sys_config` 3 条 TTS 配置 |
| 5 手写 OCR | Provider 抽象 + LLM 结构化 + 分表确认导入 | `ocr` + `ocr_result_cache` | `pages/ocr-import` | `Entitlement(OcrImport)` 额度 |
| 6 时空地图 | 按世代地理分布 + 迁徙路线 + 内置 23 条历史事件 | `timeline-map` + `timeline_map_cache` | `pages/migration-map` | 成员表 `lat`/`lng` 字段 |

> 后端模块总计 **10 个新文件组**，小程序新增 **36 个页面文件**，新增 **7 个 Capability 能力点**，全部通过 `tsc --noEmit` 零错误编译验证。

### 1.2 商业阶段与部署目标

| 阶段 | 目标规模 | 部署核心诉求 |
|------|----------|--------------|
| 阶段一 冷启动（~6 个月） | 1 万注册 / 500 家族 / MRR 1.5 万 | 稳定、安全、低成本（月 ~300 元），数据不丢 |
| 阶段二 增长（1-2 年） | 50 万注册 / 2 万家族 / MRR 15 万 | 无状态化、多实例、CI/CD、监控完备 |
| 阶段三 规模 | 500 万注册 / 1 万付费家族 / MRR 150 万 | 弹性伸缩、读写分离、按域拆分 |

### 1.3 核心判断

1. **腾讯云是最优选择**：小程序 + 微信支付 + COS 同生态，支付回调、域名备案、API 兼容链路最短。
2. **数据是商业生命线**：家谱 = 家族数字资产，丢失即信任崩塌。数据库必须用云托管（自动备份/容灾），本地自建 MySQL 不作为生产最终形态。
3. **存储必须外置**：`server/uploads/` 本地磁盘是最大技术债（无法多实例、备份困难、扩容受限），阶段一即迁移 COS + CDN。
4. **避免过度设计**：冷启动期单机 + 托管组件即可，不引入 K8s/微服务。

---

## 2. 总体架构（三阶段演进）

```
阶段一(冷启动)                    阶段二(增长)                     阶段三(规模)
──────────────                    ──────────────                 ──────────────
小程序/管理后台                    同左 + CDN 全面加速              同左
   │                                 │                               │
Nginx(HTTPS/限流) ──► NestJS ×1    CLB ──► NestJS ×2~3            TKE(K8s) ──► 按域拆分服务
   │                    │             │            │                  │
   ├── TencentDB MySQL(基础版)        ├── TencentDB 高可用版(主从)     ├── 读写分离 + 分库
   ├── COS + CDN（P0 必做）           ├── Redis(缓存+队列雏形)        ├── 消息队列 + 独立调度
   ├── 云监控 + 告警                  ├── APM + 集中日志(CLS)         ├── Serverless 混合部署
   └── 每日自动备份 + 跨地域备份      └── CI/CD 流水线                └── 弹性伸缩(HPA)
```

---

## 3. 阶段一：冷启动期部署（立即执行）

### 3.1 资源规划与成本估算

| 项 | 规格 | 月成本（约） |
|----|------|--------------|
| 轻量应用服务器 Lighthouse | 2C4G，广州/上海，CentOS 7.9 | 100-150 元 |
| 云数据库 TencentDB MySQL 8.0 | 基础版 1C2G，50GB，开启备份 | 100-200 元 |
| 对象存储 COS | 标准存储 50GB + 外网流量 20GB | ~30 元 |
| CDN | 加速流量 20GB | ~20 元 |
| 域名 + SSL | 已有 `jiapuadmin.deejee.net`，免费证书 | ~0 元 |
| 云监控/CLS 告警 | 基础免费额度内 | ~0 元 |
| **合计** | | **~300 元/月** |

> 首次购买轻量服务器、COS 通常有新用户优惠（1-3 折），实际成本更低。付费节奏建议按年付（约 8-9 折）。

### 3.2 云服务器与基础环境

1. 购买轻量应用服务器（2C4G，CentOS 7.9 / Ubuntu 22.04），建议地域与目标用户（小程序用户分布）就近，预留与数据库同地域内网互通。
2. 初始化环境（以宝塔作为运维面板过渡，容器化后可选保留）：

```bash
# 安装宝塔面板（可选过渡，也可直接纯命令行 + Docker）
curl -sSf https://download.bt.cn/install/install_panel.sh | bash
# 面板内安装：Nginx 1.24、Docker、Docker Compose

# 安装 Node.js 20 LTS + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs && npm install -g pnpm@10
```

> 阶段一允许以宝塔 + PM2 过渡（步骤同 `baota-deployment.md`），但数据库、存储、监控三项必须使用云组件（见 3.3-3.5），避免迁移二次返工。

### 3.3 云数据库 TencentDB MySQL（P0）

自建 MySQL → 腾讯云 TencentDB，理由：自动备份、跨地域备份、一键高可用升级、免 DBA 运维。

1. 控制台创建 MySQL 8.0 基础版实例（1C2G / 50GB，与服务器同地域）。
2. 创建业务账号 `family_app`（最低权限：`family_genealogy` 库 DML）+ 管理账号。
3. **数据迁移**（存量数据）：
   - 腾讯云 DTS（数据传输服务）支持自建 MySQL → TencentDB 全量+增量迁移，业务可不停服切换；
   - 或简单方案：先停机 `mysqldump` 全量导出导入，再切换连接串。
4. 开启配置：
   - 自动备份：每日 1 次，保留 30 天；
   - 跨地域备份（如广州主实例 → 上海），满足异地容灾；
   - 备份加密、SSL 连接（可选）。
5. 修改 `server/.env`：

```
DB_HOST=<TencentDB 内网地址>
DB_PORT=3306
DB_DATABASE=family_genealogy
DB_USERNAME=family_app
DB_PASSWORD=<强密码>
```

> 结构初始化：新环境直接导入 `server/database/schema.sql`（唯一主库升级脚本）；存量库按 `MERGE_LOG.md` 核对增量，方法与 `baota-deployment.md` §4 一致。

**识典古籍对标新增表（v1.1 必执行）**：

`server/database/cultural-content.sql` 已统一幂等（`CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`），在 `schema.sql` 之后追加执行：

```bash
# 新环境：schema.sql 之后执行
mysql -u family_app -p family_genealogy < server/database/schema.sql
mysql -u family_app -p family_genealogy < server/database/cultural-content.sql

# 种子数据（公共古籍 + 字典词条，可选但推荐）
mysql -u family_app -p family_genealogy < server/database/cultural-seed-data.sql
```

新增 **9 张表** + **7 条权限码** + **8 条 sys_config**（LLM 3 条 + TTS 3 条 + OCR 2 条）：

| 分类 | 表名 | 用途 | 数据量 |
|------|------|------|--------|
| 文化内容 | `cultural_document` / `_page` / `_chapter` | 公共古籍 + 家族族谱双域 | 种子数据 5 部 / 业务动态 |
| AI 会话 | `ai_chat_session` / `ai_chat_message` | AI 助手多轮对话持久化 | 按用户增长 |
| 字典 | `cultural_dictionary` | 字辈/堂号/家谱术语 | 种子数据 40 条 |
| 缓存 | `tts_audio_cache` / `ocr_result_cache` / `timeline_map_cache` | TTS/OCR/时空地图查询结果缓存 | 自动填充，TTL 过期 |

### 3.4 对象存储 COS + CDN（P0，需代码改造）

现状 `server/uploads/` 本地磁盘无法支撑多实例与弹性伸缩，阶段一迁移至 COS：

1. 控制台创建 COS 存储桶（私有读写，地域与服务器同地域），开启 CDN 加速域名（如 `cdn.jiapuadmin.deejee.net`）。
2. 后端改造点（改造方案详见 `saas-transformation-plan.md` §1-P0）：
   - `server/src/common/upload/upload.service.ts`：本地写盘 → COS SDK 上传，返回 CDN URL；
   - `main.ts` 静态目录 `/uploads/` 服务可保留用于存量文件，新增文件全部走 COS；
   - 存量文件增量迁移工具（旧 URL 保留兼容）。
3. 上传接口容量限制与权限不变，`client_max_body_size 20m` 保留。
4. 小程序图片加载：`downloadFile` 合法域名追加 CDN 域名。

> 若阶段一改造排期紧张，可短期保留本地存储，但必须将 `server/uploads/` 纳入每日备份；COS 迁移为阶段二前必完成项。

### 3.5 后端部署（容器化为主）

推荐直接容器化（为阶段二多实例铺路），若过渡期用宝塔 + PM2 则参照 `baota-deployment.md` §5。

`server/Dockerfile`：

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "dist/main.js"]
```

部署脚本（服务器执行）：

```bash
cd /www/wwwroot/jiapuadmin/server
cp .env.example .env   # 按 3.3/8 节填入生产值
docker build -t family-genealogy-server:latest .
docker run -d --name family-server \
  -p 3003:3003 \
  --env-file .env \
  --restart unless-stopped \
  -v /www/wwwroot/jiapuadmin/server/uploads:/app/uploads \
  family-genealogy-server:latest
```

**识典古籍新模块注册验证（v1.1 必做）**：

所有新模块已在 `server/src/app.module.ts` 中按字母序注册（`AiAssistantModule` / `TimelineMapModule` / `LlmModule` / `OcrModule` / `TtsModule` / `CulturalDocumentModule` / `CulturalDictModule`），启动时无显式报错即可。生产验证用 `curl` 快速抽查 4 个公开端点（无需鉴权）：

```bash
# 公共古籍列表（cultural-document）
curl -s https://api.jiapuadmin.deejee.net/api/cultural-doc/public/list?page=1 | head -c 200

# 字典分类统计（cultural-dict）
curl -s https://api.jiapuadmin.deejee.net/api/cultural-dict/stats

# 历史事件（timeline-map 公开）
curl -s "https://api.jiapuadmin.deejee.net/api/timeline-map/history?start=-221&end=2025&cat=politics" | head -c 200

# TTS 音色列表（公开）
curl -s https://api.jiapuadmin.deejee.net/api/tts/voices
```

**sys_config 生产配置项（v1.1 新增，8 条，已在 SQL 中 INSERT IGNORE）**：

| config_key | 默认值 | 生产建议 | 说明 |
|-----------|--------|---------|------|
| `llm_provider` | `mock` | `doubao` 或 `deepseek` | LLM Provider 选择 |
| `llm_api_key` | 空 | 填入加密后的 API Key | 建议 `config-crypto.module.ts` 加密存储 |
| `llm_model` | 空 | `doubao-lite-32k` / `deepseek-chat` | 具体模型名 |
| `tts_provider` | `mock` | `edge-tts`（零成本）或 `tencent` | TTS Provider |
| `tts_api_key` | 空 | edge-tts 可留空 | 腾讯云 TTS 必填 |
| `tts_app_id` | 空 | 腾讯云 AppID | — |
| `ocr_provider` | `mock` | `tencent`（手写体推荐） | OCR Provider |
| `ocr_api_key` | 空 | 腾讯云 OCR SecretId/Key | — |

> **⚠️ 关键**：生产环境必须把 `mock` Provider 切换为真实服务，否则 AI 助手返回模拟族谱文本、TTS 无法合成真实音频、OCR 无法识别真实图片。切换方式：在管理后台 → 系统设置 → 基础配置 页面修改，或直接 UPDATE `sys_config` 表。

### 3.6 前端部署

```bash
cd /www/wwwroot/jiapuadmin/web-admin
pnpm install && pnpm build   # 产物 dist/，接口走相对路径 /api
# 发布到 Nginx 站点根目录
rm -rf /www/wwwroot/jiapuadmin/dist && cp -r dist /www/wwwroot/jiapuadmin/dist
```

### 3.7 Nginx 站点配置

与 `baota-deployment.md` §7 相同，要点：History 路由回退、`/api/` 反代后端 3003、`^~ /uploads/` 反代（防止宝塔正则静态缓存抢占）、HTTPS 强制。

```nginx
server {
    listen 443 ssl http2;
    server_name jiapuadmin.deejee.net;
    root /www/wwwroot/jiapuadmin/dist;
    index index.html;
    client_max_body_size 20m;

    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
    }
}
server {
    listen 80;
    server_name jiapuadmin.deejee.net;
    return 301 https://$host$request_uri;
}
```

> 腾讯云已备案域名 + 免费 SSL 证书（控制台一键申请）或宝塔 Let's Encrypt。

### 3.8 小程序配置

`mini-program/utils/config.js`：

```js
module.exports = {
  API_BASE_URL: 'https://jiapuadmin.deejee.net/api',
  USE_MOCK: false,
  TIMEOUT: 10000
};
```

微信公众平台「服务器域名」：request 合法域名 `https://jiapuadmin.deejee.net`，downloadFile 追加 `https://cdn.jiapuadmin.deejee.net`（COS/CDN 图片）。

### 3.9 监控与告警（P1）

腾讯云原生监控，冷启动阶段覆盖：

| 对象 | 指标 | 告警阈值 |
|------|------|----------|
| 服务器 | CPU / 内存 / 磁盘 / 进程存活 | CPU>80% 15min、内存>85% |
| TencentDB | 连接数 / CPU / 慢查询 | 连接数>80%、CPU>70% |
| COS | 存储量 / 4xx/5xx | 存储>80% 容量 |
| 业务（自定义上报） | 支付失败率、订阅下单异常、备份失败 | 支付失败率>1% |

- 主机：腾讯云云监控（免费额度覆盖轻量服务器）。
- 业务：后端接口耗时/错误率可接入腾讯云 APM（阶段二）或先用 `sys_log` 表人工巡检。

### 3.10 备份与容灾（P0，合规红线）

| 层级 | 方案 | 频率 | 保留 |
|------|------|------|------|
| 数据库全量 | TencentDB 自动备份 | 每日 | 30 天 |
| 数据库容灾 | 跨地域备份（主地域故障可恢复） | 实时 | 7 天 |
| 文件 | COS 版本管理 + 跨区域复制 | 实时 | 按版本策略 |
| 业务 | 家族数据导出（现有 backup 能力点） | 用户自助 | 用户自持 |
| 演练 | 每季度恢复演练（RPO≤24h / RTO≤4h） | 每季度 | — |

---

### 3.11 识典古籍功能部署（v1.1 新增）

**前置条件**：§3.3 数据库 SQL 已执行、§3.5 后端已重新构建部署、§3.9 监控已开启。

#### 3.11.1 生产环境 CheckList（按顺序）

| # | 检查项 | 命令/操作 | 通过标准 |
|---|--------|----------|---------|
| 1 | 新增表存在 | `SHOW TABLES LIKE 'cultural_%';` + `SHOW TABLES LIKE 'ai_chat_%';` + `SHOW TABLES LIKE '%cache%';` | 9 张表全在 |
| 2 | 权限码已授权 | `SELECT COUNT(*) FROM sys_role_permission rp JOIN sys_role r ON r.id = rp.role_id JOIN sys_permission p ON p.id = rp.permission_id WHERE r.code = 'super' AND p.code LIKE 'system:cultural-%';` | 返回 **7** |
| 3 | sys_config 已填真实值 | `SELECT config_key, config_value FROM sys_config WHERE config_key IN ('llm_provider','llm_api_key','tts_provider','ocr_provider');` | `provider ≠ 'mock'`，key 非空 |
| 4 | 公共古籍种子 | `SELECT COUNT(*) FROM cultural_document WHERE family_id IS NULL;` | 返回 **5** |
| 5 | 字典种子 | `SELECT COUNT(*) FROM cultural_dictionary;` | 返回 **40** |
| 6 | 后端启动无报错 | 看 Docker 日志 `docker logs family-server --tail 100` | 无 Error 堆栈 |
| 7 | 公开端点探活 | 见 §3.5 底部 4 条 curl 命令 | 每条都返回有效 JSON（非 404） |
| 8 | 会员权益点生效 | JWT 登录态调 `POST /ai/:fid/chat` + 传 `AiChat` 次数耗尽 | 返回 4003/4004 额度不足，而不是 500 |
| 9 | TTS 合成不报错 | JWT 登录态调 `POST /tts/:fid/chapter/:cid` | 返回音频 URL（非 `mock` Provider） |
| 10 | OCR 入口存在 | 小程序打开工具箱 → 看到 ✍️ 手写录入、🗺️ 时空地图入口 | — |

#### 3.11.2 小程序侧部署

1. **版本号提升**：`mini-program/app.json` 的 `version` 字段升级（如 `1.0.0 → 1.1.0`），确保微信审核与现有包体区分。
2. **新页面注册确认**：`pages` 数组末尾应包含 4 个新页面路径：
   ```
   pages/cultural-index/cultural-index
   pages/reader/reader
   pages/ai-chat/ai-chat
   pages/tools/tools
   pages/dict-list/dict-list
   pages/relation-tool/relation-tool
   pages/audio-player/audio-player
   pages/ocr-import/ocr-import
   pages/migration-map/migration-map
   ```
3. **API Base URL**：`mini-program/utils/config.js` 的 `API_BASE_URL` 指向生产域名（与管理后台共用）。
4. **微信开发者工具**：上传代码 → 提交审核 → 发布上线。

#### 3.11.3 会员权益配置（production 表直接 UPDATE）

```sql
-- 示例：family 套餐新增识典古籍权益
UPDATE subscription_plan 
SET capabilities = JSON_SET(
  capabilities,
  '$.ai_chat',          'unlimited',     -- 或 '200/day'
  '$.ai_summary',       '200/month',
  '$.annotate',         '100/month',
  '$.reader_pro',       true,
  '$.tts_listen',       true,
  '$.ocr_import',       '50',
  '$.cultural_doc',     true
)
WHERE code = 'family';
```

#### 3.11.4 监控点（§3.9 告警追加）

| 监控项 | 阈值 | 告警方式 |
|--------|------|---------|
| `cultural-doc/public/list` 接口 P95 耗时 | >500ms | 企业微信 |
| `ai/:fid/chat` 接口错误率 | >1% | 企业微信 |
| LLM Provider 调用失败率（后端 Logger 中 error 关键字） | >3 次/分钟 | 短信 |
| `timeline_map_cache` 命中率（定时脚本查询） | <50% | 企业微信 |

---

## 4. 阶段二：增长期演进（目标 MRR 15 万）

触发条件：单实例 CPU 持续 >60%、并发明显上升、或需多实例发布。

1. **容器化收口**：全部服务 Docker 化，`docker-compose.yml` 编排（app + nginx），废弃宝塔单机脚本。
2. **多实例 + CLB**：后端扩至 2-3 副本，前置负载均衡 CLB（HTTPS 证书统一管理）；NestJS 无状态化（COS 存储已外置，JWT 无会话）。
3. **Redis 接入**：缓存套餐/能力点热点读 + 定时任务分布式锁（订阅到期扫描等防多实例重复执行）+ 简单队列（AI 修复、PDF 导出异步化）。
4. **CI/CD**：GitHub Actions（lint + build + test + e2e）→ 自动构建镜像 → 部署 test 环境 → 手动确认生产发布，回滚策略。
5. **TencentDB 升级高可用版**（主从自动切换），应用层读写分离按需开启。
6. **日志**：后端结构化日志（JSON）→ 腾讯云 CLS（日志服务）集中检索，traceId 串联。
7. **监控升级**：腾讯云 APM（接口耗时/错误率）+ 业务告警完备化。

---

## 5. 阶段三：规模期演进（目标 MRR 150 万）

1. **TKE（K8s）**：多副本 HPA 弹性伸缩，按域拆分服务（订阅/支付/内容独立部署）。
2. **数据层**：读写分离 + 大表分库分表（member/photo/document），TencentDB 分布式版本或自建分片。
3. **异步体系**：消息队列（TDMQ/CMQ）+ 独立定时调度，耗时任务全部异步。
4. **Serverless 混合**：AI 老照片修复、PDF 导出等突发型负载用云函数 SCF，降本。
5. **企业租户专享**：高端 B 端客户独立实例部署能力（对应 `saas-transformation-plan.md` §2 隔离升级开关）。

---

## 6. 从现状（宝塔自建）迁移清单

| # | 事项 | 风险 | 步骤 |
|---|------|------|------|
| 1 | MySQL → TencentDB | 数据丢失/停机 | 备份 → DTS 全量+增量迁移 → 切换连接串 → 验证 → 保留旧库 7 天 |
| 2 | 本地 uploads → COS | 历史文件丢失/URL 失效 | 改造上传服务 → 增量迁移工具 → 旧 URL 兼容 → 校验 MD5 |
| 3 | 宝塔 → Docker | 部署方式变更 | 编写 Dockerfile/compose → 测试环境验证 → 灰度发布 |
| 4 | 域名解析/证书 | 短暂不可用 | 先配好新环境 → 改 DNS → 验证后下线旧环境 |
| 5 | 小程序域名白名单 | 图片/请求失败 | 同步新增 request/downloadFile 合法域名 |

> 迁移窗口建议选择低峰期（凌晨），微信支付回调地址指向新域名后需在小程序后台同步确认。

---

## 7. 合规检查清单（上线前）

- [ ] 隐私政策 + 用户协议 + 成员告知文本（《个保法》告知-同意）
- [ ] 数据分级（公开/家族内/私密）与敏感字段脱敏展示
- [ ] 账号注销 → 数据删除/匿名化全链路
- [ ] 敏感字段（手机号等）应用层加密存储
- [ ] 微信小程序类目合规（工具-传统文化）、支付走标准流程
- [ ] 祭祀祈福文案合规（定位"文化纪念与情感表达"，规避迷信表述）
- [ ] 安全应急预案（泄露定位/止损/通知/上报流程）
- [ ] 等保 2.0 二级评估（立项后纳入路线图）

---

## 8. 附录：生产环境变量对照（腾讯云）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `DB_HOST` | TencentDB 内网地址 | 与服务器同地域走内网，免外网流量 |
| `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | 云库账号 | 最低权限账号 |
| `PORT` | `3003` | Nginx/CLB 反代一致 |
| `NODE_ENV` | `production` | |
| `JWT_SECRET` | `openssl rand -base64 48` | 强随机，缺失启动失败 |
| `CORS_ORIGINS` | `https://jiapuadmin.deejee.net` | 禁止 `*` |
| `WX_APPID` / `WX_SECRET` | 小程序真实值 | 真实登录 |
| `SMS_PROVIDER` | `aliyun` / `tencent` | 生产必切真实短信 |
| `WX_MCH_ID` / `WX_MCH_SERIAL_NO` / `WX_MCH_PRIVATE_KEY` / `WX_PAY_API_V3_KEY` / `WX_PAY_NOTIFY_URL` | 微信商户平台 | 未配置则走模拟支付 |
| 存储 | COS 密钥（环境变量注入，勿入镜像/仓库） | 上传服务改造后启用 |

---

## 9. 关键决策摘要

| 决策 | 推荐 | 理由 |
|------|------|------|
| 云厂商 | 腾讯云 | 微信生态闭环，支付/回调/备案链路最短 |
| 数据库 | TencentDB（基础版起步→高可用版） | 自动备份/跨地域容灾/免运维 |
| 存储 | COS + CDN（P0） | 无状态化前置条件，多实例/伸缩基础 |
| 部署形态 | 宝塔过渡 → Docker → TKE 渐进 | 小团队成本与演进兼顾，避免过度设计 |
| CI/CD | 阶段二接入（GitHub Actions） | 发布自动化，回归有保障 |
| 小程序 | 自有服务器起步 | 云托管绑定深，增长期再评估 |
