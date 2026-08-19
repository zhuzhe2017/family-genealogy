# 数据库迁移文件清单（MIGRATIONS）

本文件记录 `server/database/` 下 SQL 升级/迁移文件的当前状态。

## 执行方式

- `schema.sql`：数据库完整结构 + 初始化种子（幂等），**全新环境直接执行**。
- `migrations/*.sql`：存量库增量迁移（幂等，可重复执行），执行：
  `node database/run-migration.js migrations/<file>.sql`

## 当前保留的迁移文件

| 文件 | 用途 | 为什么保留 |
|---|---|---|
| `migrations/20260815-membership-init.sql` | 会员系统初始化：`subscription_plan` / `family_subscription` / `subscription_order` / `family_quota` / `storage_usage_record` 5 张表 + 套餐种子 | schema.sql **未包含**这 5 张订阅表，本脚本是唯一建表来源 |
| `migrations/add-subscription-admin-permissions.sql` | 订阅管理权限码 + 菜单 | schema.sql 未包含 `system:subscription:*` 权限与 `mini-program_subscription` 菜单 |
| `migrations/add-user-auth-identity.sql` | 多端账号统一：`user_auth_identity` / `user_sms_code` 建表 + 存量 openid 回填 | 含**数据回填逻辑**（存量 user.openid → wechat 绑定），不可由 schema.sql 重建 |
| `migrations/add-user-family-association.sql` | 会员家族关联：user 表 `family_id` / `member_id` / `share_code` + 索引 | 当前会员-家族功能依赖的增量迁移，e2e 测试引用 |
| `migrations/sync-family-member-count.sql` | 一次性重算 `family.member_count` 冗余列 | 存量数据修复工具，成员数不一致时仍可使用 |
| `migrations/20260819-app-plugin.sql` | 应用插件注册表 `app_plugin` + 权限/菜单 | 应用中心「应用」分区动态数据源，schema.sql 未包含，本脚本是唯一建表来源 |
| `migrations/20260819-banner-click-count.sql` | `family_banner.click_count` 点击统计列 | 幂等加列，schema.sql 未包含 |

## 已删除的迁移文件（2026-08-17）

以下文件因「已被 schema.sql 完整覆盖」或「一次性迁移已生效、重复执行有风险/无意义」被移除。删除前已核实数据库当前结构与 schema.sql 完全一致，不影响现有数据。

| 删除的文件 | 删除原因 |
|---|---|
| `migrations/rebuild-family-table.sql` | 一次性重建 family 表脚本（含 `DROP TABLE`）。已生效（family.id 已是 INT 自增），重复执行会删除现有家族数据，风险极高；新结构已由 schema.sql 定义 |
| `migrations/add-family-generation-table-id.sql` | 为旧 family 表补 `generation_table_id` 列。已被 rebuild-family-table.sql 覆盖且 schema.sql 已含该列，当前库已生效 |
| `migrations/add-family-surname-fk.sql` | 为 family 表补 `idx_surname` 索引与 `fk_family_surname` 外键。已被 rebuild-family-table.sql 覆盖且 schema.sql 已含，当前库已生效 |
| `migrations/rename-sys-surname-to-surname.sql` | 一次性重命名 `sys_surname` → `surname`。已生效（当前库仅存在 surname），schema.sql 直接使用 surname |
| `migrations/rename-meaning-to-population.sql` | 一次性重命名 `surname.meaning` → `population`。已生效，schema.sql 已使用 population |
| `migrations/add-role-permission-admin-permissions.sql` | 补充 `system:admin/role/permission:*` 权限码。schema.sql 初始化块已完整包含这些权限码与 super 角色授权，当前库已生效 |
| `migrations/refactor-generation-table.sql` | 字辈表重构（删 `family_generation`、建 `generation_table`、权限/菜单）。schema.sql 已完整覆盖表/权限/菜单，当前库已生效 |
| `migrations/add-member-avatar-url.sql` | 为 family_member 基表与全部分表补 `avatar_url` 列。当前库基表与分表均已含该列；新分表创建逻辑（family.service.ts）已带该列，脚本不再需要 |
| `migration-system-settings.sql` | 系统设置：`sys_config` / `sys_log` 建表 + 配置/权限/菜单种子。schema.sql 已完整覆盖，当前库已生效 |
| `migration-drop-spouse-id.sql` | 废弃 `spouse_id` 列并迁移至 `spouse_info`。非幂等（直接 DROP COLUMN），已生效（基表与分表均无 spouse_id），重复执行会报错；schema.sql 无该列 |

## 其他文件说明

- `migrations/generation-table-er.md` / `system-settings-api.md` / `system-settings-guide.md` / `system-settings-test-report.md`：模块设计/验收文档，非 SQL 文件，保留。
- `verify-migration.js` / `run-migration.js`：迁移辅助脚本（执行/校验工具），保留。
