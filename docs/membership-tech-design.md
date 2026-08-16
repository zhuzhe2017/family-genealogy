# 数字家谱会员系统技术方案（Membership Tech Design）

> 版本：v1.0 ｜ 日期：2026-08-15 ｜ 状态：待评审
>
> 关联文档：[commercial-strategy.md](./commercial-strategy.md)（商业策略方案）
> 设计决策：成员数量不设限；权益采用**能力点（Capability）模型**；存储容量与按次额度均作为**订阅内含权益**处理。

---

## 1. 目标与范围

在现有 NestJS + TypeORM + MySQL 架构上新增会员系统，实现：

1. 家族级订阅（`free` / `family` / `premium` 三档）；
2. 能力点权益校验（声明式 Guard，零侵入业务代码）；
3. 存储容量额度（订阅内含，上传层强制校验）；
4. 按次额度（AI 修复张数、祭祀增值次数，订阅周期内有效）；
5. 微信支付闭环（下单 / 回调 / 退款）；
6. 订阅生命周期管理（有效 / 宽限 / 冻结 / 过期）。

**不做**：成员数量限制、家族树代数限制（均不设限，避免统计口径争议）。

---

## 2. 总体架构

```
小程序 / 管理后台
      │
      ▼
  Controller（用户端 PortalController / 新增 membership 模块）
      │
      ▼
  EntitlementGuard（声明式能力点校验）          ← 新增第三层
      │
      ▼
  EntitlementService（订阅状态、额度原子判定）   ← 核心计费逻辑收敛点
      │
      ▼
  family_subscription / family_quota / subscription_plan / subscription_order
```

校验分层（在既有体系上扩展）：

| 层 | 机制 | 现状 |
|----|------|------|
| 认证 | `UserJwtAuthGuard` / `JwtAuthGuard` | 已有 |
| 授权 | 家族归属校验（portal 内）、`RolesGuard`/`PermissionsGuard` | 已有 |
| **权益（新增）** | `EntitlementGuard` + `EntitlementService` | **本期新增** |

---

## 3. 数据模型设计

遵循现有建表规范（`utf8mb4`、`INT UNSIGNED` 自增、`VARCHAR(32)` 用户 ID、`DATETIME DEFAULT CURRENT_TIMESTAMP`、`idx_/uk_/fk_` 命名）。

### 3.1 subscription_plan（订阅套餐表）

```sql
CREATE TABLE `subscription_plan` (
  `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '套餐ID',
  `code`           VARCHAR(30)    NOT NULL COMMENT '套餐编码 free/family/premium',
  `name`           VARCHAR(50)    NOT NULL COMMENT '套餐名称',
  `price_annual`   DECIMAL(10,2)  NOT NULL DEFAULT 0.00 COMMENT '年费（元）',
  `capabilities`   JSON           NOT NULL COMMENT '能力点集合 ["backup","export",...]',
  `storage_limit`  BIGINT UNSIGNED DEFAULT 0 COMMENT '存储上限(字节)，0=不限',
  `quota_rules`    JSON           DEFAULT NULL COMMENT '按次额度 {"ai_restore":10,"worship_pro":50}',
  `sort_order`     INT UNSIGNED   DEFAULT 0 COMMENT '排序',
  `status`         TINYINT(1)     DEFAULT 1 COMMENT '1-启用 0-停用',
  `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅套餐表';
```

种子数据（与 §4.1 权益表一致）：

```json
free:    capabilities [], storage_limit 500MB
family:  capabilities ["backup","export","permission","reminder","digest","theme","badge"],
         storage_limit 10GB, quota_rules {"ai_restore":10,"worship_pro":50}
premium: capabilities ["backup","export","permission","reminder","digest","theme","badge",
         "print","worship_pro","advisor","support","no_ads"],
         storage_limit 0, quota_rules {"ai_restore":100,"worship_pro":999}
```

> `print` / `advisor` / `support` 为非拦截型能力点（前端展示权益、人工服务），不出现在 Guard 校验中。

### 3.2 family_subscription（家族订阅表）

```sql
CREATE TABLE `family_subscription` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '订阅ID',
  `family_id`     INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `plan_code`     VARCHAR(30)   NOT NULL DEFAULT 'free' COMMENT '当前套餐',
  `status`        VARCHAR(20)   NOT NULL DEFAULT 'active' COMMENT 'active-有效 grace-宽限 frozen-冻结 expired-已过期',
  `owner_user_id` VARCHAR(32)   DEFAULT '' COMMENT '订阅支付人（小程序用户ID）',
  `auto_renew`    TINYINT(1)    DEFAULT 0 COMMENT '自动续费开关（一期默认关）',
  `paid_at`       DATETIME      DEFAULT NULL COMMENT '最近一次付费时间',
  `expire_at`     DATETIME      DEFAULT NULL COMMENT '当前周期到期时间',
  `grace_until`   DATETIME      DEFAULT NULL COMMENT '宽限期截止',
  `cancel_reason` VARCHAR(200)  DEFAULT '' COMMENT '取消/冻结原因',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family` (`family_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_expire` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族订阅表';
```

> 订阅跟随**家族**（而非个人），家族成员共享权益。`owner_user_id` 仅用于记录支付人。

### 3.3 subscription_order（订阅订单表）

```sql
CREATE TABLE `subscription_order` (
  `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `order_no`       VARCHAR(64)    NOT NULL COMMENT '平台订单号',
  `out_trade_no`   VARCHAR(64)    NOT NULL COMMENT '商户订单号（微信支付）',
  `family_id`      INT UNSIGNED   NOT NULL COMMENT '家族ID',
  `user_id`        VARCHAR(32)    NOT NULL COMMENT '支付人用户ID',
  `plan_code`      VARCHAR(30)    NOT NULL COMMENT '购买的套餐',
  `amount`         DECIMAL(10,2)  NOT NULL COMMENT '实付金额（元）',
  `period_months`  INT UNSIGNED   DEFAULT 12 COMMENT '订阅时长（月）',
  `status`         VARCHAR(20)    NOT NULL DEFAULT 'pending' COMMENT 'pending/paid/failed/refunded/closed',
  `transaction_id` VARCHAR(64)    DEFAULT '' COMMENT '微信支付单号',
  `pay_time`       DATETIME       DEFAULT NULL COMMENT '支付时间',
  `refund_time`    DATETIME       DEFAULT NULL COMMENT '退款时间',
  `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_out_trade_no` (`out_trade_no`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅订单表';
```

### 3.4 family_quota（家族额度账户表）

存储用量 + 按次额度的原子计数载体。

```sql
CREATE TABLE `family_quota` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`          INT UNSIGNED NOT NULL COMMENT '家族ID',
  `storage_used`       BIGINT UNSIGNED DEFAULT 0 COMMENT '已用存储(字节)，冗余列+定时对账',
  `ai_restore_used`    INT UNSIGNED DEFAULT 0 COMMENT 'AI修复已用张数（当前订阅周期）',
  `worship_pro_used`   INT UNSIGNED DEFAULT 0 COMMENT '祭祀增值已用次数（当前订阅周期）',
  `quota_period_start` DATE DEFAULT NULL COMMENT '额度周期起点',
  `quota_period_end`   DATE DEFAULT NULL COMMENT '额度周期终点',
  `create_time`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family` (`family_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族额度账户表';
```

### 3.5 storage_usage_record（存储占用明细表）

支持"删除即释放"与精确对账。

```sql
CREATE TABLE `storage_usage_record` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `file_key`    VARCHAR(200)  NOT NULL COMMENT '文件标识（/uploads/xxx.png）',
  `file_size`   BIGINT UNSIGNED NOT NULL COMMENT '占用字节数',
  `biz_type`    VARCHAR(30)   NOT NULL COMMENT '业务类型 photo/document/dynamic/album/member_avatar',
  `biz_id`      VARCHAR(64)   DEFAULT '' COMMENT '业务记录ID',
  `user_id`     VARCHAR(32)   DEFAULT '' COMMENT '上传人',
  `status`      TINYINT(1)    DEFAULT 1 COMMENT '1-占用 0-已释放',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_family_status` (`family_id`, `status`),
  INDEX `idx_file_key` (`file_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='存储占用明细表';
```

> **备份文件不计入家族存储额度**：备份是家族版能力，备份产物存独立目录，避免"权益互相打架"。

---

## 4. 能力点体系

### 4.1 能力点枚举

```ts
export enum Capability {
  Backup      = 'backup',      // 数据备份（拦截型）
  Export      = 'export',      // 谱牒数据导出（拦截型）
  Permission  = 'permission',  // 高级权限/多管理员（拦截型）
  Reminder    = 'reminder',    // 纪念日/生日推送（拦截型）
  Digest      = 'digest',      // 家族简报（拦截型）
  Theme       = 'theme',       // 家族主页定制（展示型）
  Badge       = 'badge',       // 徽章体系（展示型）
  AiRestore   = 'ai_restore',  // AI老照片修复（额度型）
  WorshipPro  = 'worship_pro', // 祭祀增值（额度型）
  Print       = 'print',       // 谱牒印刷折扣（非拦截）
  Advisor     = 'advisor',     // 修谱顾问（非拦截）
  Support     = 'support',     // 专属客服（非拦截）
  NoAds       = 'no_ads'       // 去广告（非拦截）
}
```

### 4.2 三种能力点形态

| 形态 | 判定方式 | 校验位置 | 示例 |
|------|----------|----------|------|
| 拦截型 | 套餐 capabilities 是否包含 | EntitlementGuard | backup / export / permission |
| 额度型 | capabilities 包含 + 额度余额比较 | Service 内原子扣减 | ai_restore / worship_pro |
| 展示型 | 前端读取套餐配置展示 | 前端 | print / no_ads / advisor |

---

## 5. 权益校验机制

### 5.1 装饰器与 Guard

```ts
// 装饰器：@Entitlement('backup') 或 @Entitlement('backup', { familyFrom: 'param:familyId' })
// familyFrom 支持：param / query / body / header，默认 param.familyId
export const ENTITLEMENT_KEY = 'entitlement';
export const Entitlement = (capability: Capability, options?: EntitlementOptions) => ...

// Guard：类级/方法级挂载，失败抛 4001 错误码
@Injectable()
export class EntitlementGuard implements CanActivate {
  // 读取装饰器 → 解析 familyId → EntitlementService.assertCapability(familyId, capability)
}
```

### 5.2 EntitlementService 核心方法

```ts
@Injectable()
export class EntitlementService {
  // 拦截型：套餐是否含能力点（含宽限期放行）
  assertCapability(familyId: number, capability: Capability): void;

  // 额度型：原子扣减，超限抛 4003
  consumeQuota(familyId: number, capability: Capability, delta = 1): Promise<void>;

  // 存储型：预检余量（上传前）
  assertStorage(familyId: number, fileSize: number): Promise<void>;

  // 记录存储占用（上传成功后）
  recordStorage(familyId: number, file: FileMeta, biz: BizMeta): Promise<void>;

  // 释放存储占用（业务删除时）
  releaseStorage(fileKey: string): Promise<void>;

  // 订阅状态查询（缓存版）
  getSubscription(familyId: number): Promise<FamilySubscriptionView>;

  // 缓存失效（支付回调/续费/后台调整时调用）
  invalidateSubscriptionCache(familyId: number): void;
}
```

### 5.3 额度型原子扣减（防并发）

```sql
-- 条件更新：仅在额度未超限时 +1，杜绝并发超扣
UPDATE `family_quota`
SET `ai_restore_used` = `ai_restore_used` + 1
WHERE `family_id` = ? AND `ai_restore_used` < ?;
-- 影响行数 = 0 说明额度不足 → 抛 4003
```

### 5.4 校验流程（伪代码）

```
请求 → JwtAuthGuard(认证) → 家族归属(授权)
     → EntitlementGuard(能力点是否在 plan.capabilities)
         ├─ 拦截型：命中即放行 / 未命中 → 4001
         ├─ 额度型：进入 Service.consumeQuota 原子扣减 → 超限 → 4003
         └─ 存储型：assertStorage 预检 + recordStorage 记账
```

---

## 6. 存储容量校验实现

### 6.1 上传接口改造（前置条件）

现状 [upload.controller.ts](file:///c:/wwwroot/family-genealogy/server/src/common/upload/upload.controller.ts) 为 `@Public()` 无身份无归属，必须改造：

1. 移除 `@Public()`，改挂 `UserJwtAuthGuard`；
2. 请求中携带 `familyId`（form 字段），服务端校验该用户属于该家族；
3. 上传**前**：`assertStorage(familyId, file.size)` 预检；
4. 上传**成功**：写入 `storage_usage_record`（占用 +），更新 `family_quota.storage_used`；
5. 各业务删除接口（照片/文档/动态/成员头像）：调用 `releaseStorage(fileKey)` 释放占用。

> 若部分业务上传仍需兼容管理员端，可对管理员通道放行（`JwtAuthGuard` + 角色判断），额度仅对家族维度生效。

### 6.2 余量计算

```
storage_used = SUM(storage_usage_record.file_size WHERE family_id=? AND status=1)
storage_limit = plan.storage_limit（0=不限）
剩余 = storage_limit - storage_used
```

- 实时聚合 + `family_quota.storage_used` 冗余列（读缓存列，写时同步更新，每日对账脚本校准）。

---

## 7. 按次额度扣减

- 额度在**订阅周期内**有效（`paid_at` → `expire_at`）；
- 续费成功时重置 `ai_restore_used = 0`、`worship_pro_used = 0`，并更新 `quota_period_start/end`；
- 扣减走 §5.3 原子条件更新；
- 超限返回 4003，前端引导购买"额度叠加包"（二期扩展，本次仅预留错误码）。

---

## 8. 订阅生命周期状态机

```
free（无订阅记录 / plan=free, active）
  │ 支付成功（首购）
  ▼
active（expire_at = now + 周期）
  │ 到期未续费
  ▼
grace（宽限期 7 天，能力点仍放行）
  │ 宽限期内续费          │ 宽限期结束仍未续费
  ├──────────────┐        ▼
  ▼              │      expired（能力点写操作拒绝，数据只读）
active（顺延）   │        │ 续费
                  └──────────► active
```

| 状态 | 能力点读 | 能力点写 | 数据访问 |
|------|:---:|:---:|----------|
| active | ✓ | ✓ | 全量 |
| grace | ✓ | ✓ | 全量（7 天宽限） |
| frozen（用户取消） | ✓ | ✗ | 全量只读（当前周期内仍有效） |
| expired | ✓ | ✗ | 全量只读，数据永不删除 |

- 到期扫描：每日定时任务（cron）将 `expire_at < now < grace_until` → grace；`grace_until < now` → expired。
- 数据只读策略：**已产生的数据（谱牒、照片、导出）永久保留可读**，这是产品信任基石。

---

## 9. 微信支付对接

### 9.1 流程

```
小程序选套餐
  → POST /user/subscription/prepay（建 order + 调微信 JSAPI 下单）
  → 返回支付参数 → wx.requestPayment
  → 微信异步回调 notify_url（验签 → 幂等更新 order=paid + 订阅激活 + 失效缓存）
  → 小程序轮询/回调确认 → 跳转会员中心
```

### 9.2 关键点

- `out_trade_no` 唯一（防重复支付）；回调幂等（重复通知不重复激活）；
- 回调验签失败直接拒收，微信会重试；
- 退款：管理后台发起（原路退回），回调更新 `refund_time` + 订阅降级为 free；
- 一期不做自动续费扣款，采用"到期前 7 天订阅消息提醒 + 一键续费"，降低协议复杂度；
- 到期提醒：`reminder` 能力点内实现（订阅消息模板，合规申报）。

---

## 10. 错误码设计

沿用 `{ code, data, msg }` 响应体系（[response.interceptor.ts](file:///c:/wwwroot/family-genealogy/server/src/common/interceptors/response.interceptor.ts)），新增权益类错误码：

| code | 含义 | 前端动作 |
|------|------|----------|
| 4000 | 权益校验失败（通用） | 跳会员中心 |
| 4001 | 能力点未解锁，需升级套餐 | 弹升级引导 |
| 4002 | 存储空间不足 | 弹升级/清理引导 |
| 4003 | 额度已用尽（AI 修复/祭祀） | 提示叠加包/下周期 |
| 4004 | 订阅已过期/冻结，数据只读 | 提示续费 |
| 4005 | 支付订单异常 | 客服引导 |

小程序 [request.js](file:///c:/wwwroot/family-genealogy/mini-program/utils/request.js) 统一拦截 `4xxx` 类 code，按映射弹窗。

---

## 11. 缓存策略

- 订阅状态缓存：内存缓存 + TTL 60s + 主动失效（沿用 [system-config.service.ts](file:///c:/wwwroot/family-genealogy/server/src/system-config/system-config.service.ts) 的 `invalidateConfigCache` 模式）；
- 失效触发点：支付回调、续费、后台手动调整、退款、到期定时任务；
- 套餐配置（subscription_plan）启动时加载 + 后台变更时失效。

---

## 12. 管理后台（web-admin）改造

| 模块 | 内容 |
|------|------|
| 套餐管理 | subscription_plan CRUD、能力点配置、价格 |
| 订单管理 | 订单查询、退款、对账 |
| 订阅管理 | 家族订阅列表（状态/到期时间）、手动调整、失效缓存 |
| 商业化看板 | 付费家族数、MRR、转化漏斗、存储占用 TOP |
| 额度监控 | 超限告警（存储 90% 预警） |

---

## 13. 小程序端改造

| 页面/组件 | 内容 |
|-----------|------|
| 会员中心页 | 套餐展示、能力点对比、当前订阅状态、续费/购买 |
| 付费引导组件 | 全局拦截 4xxx 错误码弹窗 → 跳会员中心 |
| 权益标识 | 家族版徽章、存储用量进度条 |
| 购买流程 | 套餐选择 → wx.requestPayment → 结果页 |

---

## 14. 数据迁移与存量处理

- 迁移脚本（置于 [server/database/migrations](file:///c:/wwwroot/family-genealogy/server/database/migrations)）：
  1. 建 5 张新表；
  2. 插入 subscription_plan 种子数据；
  3. 为**每个已有家族**插入 `family_subscription (plan=free, active)` + `family_quota`（storage_used 初始为 0，后续对账）；
  4. 存量已上传文件：按业务表（照片/文档/动态图）反查回填 `storage_usage_record`；
  5. 存量存储超 500MB 的家族：不做强删，标记"超限"进入 grace 展示，引导升级。

---

## 15. 边界情况清单

| # | 场景 | 处理 |
|---|------|------|
| 1 | 支付成功但回调延迟 | 前端轮询订单状态；回调幂等 |
| 2 | 重复支付（同单双回调） | out_trade_no 唯一约束 + 幂等更新 |
| 3 | 订阅期内用户取消 | frozen：当前周期内权益保留，到期只读 |
| 4 | 到期未续费 | grace 7 天 → expired；数据只读不删 |
| 5 | 免费家族存储超限 | 拒绝上传（4002），数据可读；引导升级 |
| 6 | 家族删除/解散 | 强确认；订阅随之注销，可退剩余周期费用 |
| 7 | 家族转让（族长变更） | 订阅跟随家族，不动 |
| 8 | 并发上传/并发修复 | 额度型走条件更新；存储走行锁/幂等记账 |
| 9 | 上传成功但业务保存失败 | 记录占用于上传成功时即写，业务失败则释放（补偿） |
| 10 | 后台手动改套餐 | 变更生效 + 失效缓存 + 记 system_log |
| 11 | AI 修复中途失败 | 扣减失败时回滚（先扣后修，失败返还） |
| 12 | 存储对账偏差 | 每日定时任务聚合校准 |

---

## 16. 实施里程碑

### 里程碑 M1（MVP 商业化闭环）
1. 建表 + 迁移脚本 + 套餐种子数据
2. `membership` 模块：EntitlementService + EntitlementGuard + 装饰器 + 错误码
3. 上传接口归属改造 + 存储校验 + 占用记账
4. 拦截型能力点标注：backup / export / permission / reminder / digest
5. 微信支付：prepay / notify / refund
6. 小程序会员中心 + 付费引导
7. 到期扫描定时任务 + 订阅状态机

### 里程碑 M2（增值能力）
8. ai_restore 额度账户 + AI 修复服务接入
9. worship_pro 祭祀增值
10. 家族简报（digest）定时生成与推送

### 里程碑 M3（平台化）
11. web-admin 套餐/订单/订阅管理 + 商业化看板
12. 额度叠加包、优惠券、自动续费

---

## 17. 待评审决策点

1. 支付回调验签依赖微信支付商户号与证书，需确认商户资质与回调地址部署环境；
2. 备份文件存储介质（本地目录 / OSS）——建议 OSS，成本与可靠性更优；
3. 存储"文件删除"的兜底：业务软删除时是否同步释放存储占用（建议物理删除文件时释放）。
