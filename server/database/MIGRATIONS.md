# 数据库迁移文件清单（MIGRATIONS）

本文件记录 `server/database/` 下 SQL 升级/迁移文件的当前状态。

## 执行方式

- `schema.sql`：数据库完整结构 + 初始化种子（幂等，**2026-08-21 起为唯一主库升级脚本**），全新环境直接执行：
  `mysql -u<user> -p<password> family_genealogy < schema.sql`
- 已无独立的 `migrations/*.sql` 增量迁移文件——全部内容已合并进 `schema.sql`（详见 `MERGE_LOG.md`）。

## 当前状态（2026-08-21 起）

原 `migrations/*.sql` 共 16 个 SQL 升级文件已于 **2026-08-21** 全部审核、整合进 `schema.sql` 后删除：

| 原文件 | 合并位置（schema.sql） | 备注 |
|---|---|---|
| `20260815-membership-init.sql` | 37 会员订阅 5 表 + 套餐种子 | |
| `20260817-family-invitation.sql` | 35 邀请表 / user.family_role / 40-41 权限菜单 | |
| `20260817-worship-admin.sql` | 40-41 祭祀权限菜单 | |
| `20260817-worship-memorial.sql` | 已含于 18.1 节 | 原内容已被 schema.sql 覆盖 |
| `20260818-family-banner.sql` | 34 广告轮播表 / 40-41 权限菜单 | |
| `20260819-app-center-menu.sql` | 41 应用中心菜单升级 | 依赖应用插件菜单 |
| `20260819-app-plugin.sql` | 36 应用插件表 / 40-41 权限菜单 | |
| `20260819-banner-click-count.sql` | 34 click_count 列 | |
| `20260819-family-seed-share-code.sql` | family 唯一索引 / 42b 回填 | |
| `20260819-family-share.sql` | 35 邀请表 4 列 / 回填 | |
| `20260820-family-fund.sql` | 38 基金 3 表 | |
| `20260820-family-gathering.sql` | 39 聚会 4 表 / 40-41 权限菜单 | |
| `add-subscription-admin-permissions.sql` | 40-41 订阅权限菜单 | |
| `add-user-auth-identity.sql` | 已含于 1.1/1.2 节；42a 回填 | 建表已被覆盖 |
| `add-user-family-association.sql` | 已含于 user 表定义 | 原内容已被 schema.sql 覆盖 |
| `sync-family-member-count.sql` | 42c 重算工具 | 幂等，新库自动跳过 |

> 合并明细、文件来源映射、删除清单与审计结论见 **`MERGE_LOG.md`**。
> 被删文件内容均保留于 git 历史，存量库需要补执行时可按 `MERGE_LOG.md` 第二节映射恢复。

## 已删除的迁移文件（历史）

以下文件此前因「已被 schema.sql 完整覆盖」或「一次性迁移已生效」被移除，保留记录备查。

### 2026-08-17 删除

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

### 2026-08-21 删除（整合入 schema.sql）

见上方「当前状态」表与 `MERGE_LOG.md`。

## 其他文件说明

- `migrations/generation-table-er.md` / `system-settings-api.md` / `system-settings-guide.md` / `system-settings-test-report.md`：模块设计/验收文档，非 SQL 文件，保留。
- `verify-migration.js` / `run-migration.js`：迁移辅助脚本（执行/校验工具），保留。

## 存量库修复脚本（增量，2026-08-24）

以下脚本针对**存量库**（schema.sql 升级前已存在的库）补齐新增结构，均为幂等，可安全重复执行；全新环境直接执行 `schema.sql` 即可，无需这些脚本：

| 文件 | 用途 | 幂等性 |
|---|---|---|
| `fix-member-module.sql` | 会员（CRM）模块补全：member/member_level/points_rule/points_record/member_consume 表 + 种子 + 权限码 + 菜单（挂系统管理）+ super 授权 | INSERT IGNORE / NOT EXISTS / UPDATE，幂等 |
| `fix-menu-unique-route-name.sql` | 清理 sys_menu.route_name 重复行 + 建立唯一索引 `uk_menu_route_name`（根治 INSERT IGNORE 防重失效问题） | 非重复执行无副作用 |
| `fix-subscription-refund.sql` | 后台订单退款权限码 `system:subscription:refund` + super 授权（配合 P1-2 退款接口） | INSERT IGNORE，幂等 |

> 上述脚本对应的结构变更已同步进 `schema.sql`：`sys_menu` 唯一索引、`member.user_id` + `uk_member_user` 唯一索引、`system:subscription:refund` 权限码。
