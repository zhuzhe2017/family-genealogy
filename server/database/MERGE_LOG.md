# 数据库升级 SQL 合并日志（MERGE_LOG）

本文件记录 `server/database/migrations/*.sql` 整合进主库脚本 `server/database/schema.sql` 的审计与合并明细，供后续审计与回溯。

## 合并信息

| 项 | 值 |
|---|---|
| 合并时间 | 2026-08-21 08:41（Asia/Shanghai） |
| 主库脚本 | `server/database/schema.sql`（现为唯一主库升级脚本） |
| 被整合文件数 | 16 个 SQL 迁移文件 |
| 删除文件数 | 16（均为已整合进 schema.sql 的冗余文件） |
| 目标数据库 | MySQL 5.7.22+ / 8.0（验证环境 MySQL 8.0.31） |

## 一、审核结论

对全部 16 个迁移 SQL 文件完成静态审核 + 本地 MySQL 实库验证：

- **语法正确性**：将合并后的 schema.sql 在临时库 `family_genealogy_merge_verify` 中完整执行，97/97 条语句全部成功；临时库结构校验通过后已清理。
- **逻辑完整性**：临时库结构与现有库逐表/逐列/逐索引比对，无缺失；16 个迁移的预期产物（表/列/索引/权限/菜单）全部存在。
- **兼容性**：所有脚本使用的特性（`JSON`/`JSON_ARRAY`/`JSON_OBJECT`、`PREPARE`、`information_schema` 幂等判断、`DELIMITER` 存储过程、`INSERT IGNORE`）均兼容 MySQL 5.7.22+ / 8.0。
- **现库状态**：本地库 `family_genealogy`（MySQL 8.0.31）已含订阅 5 表、`user_auth_identity`/`user_sms_code`、`family_worship_memorial`、`user.family_id/member_id/share_code` 等结构；**以下迁移尚未在本地库生效**（本次仅做文件整合，未对现有库执行 DDL）：
  - 家族邀请（`family_invitation` 表、`user.family_role`）
  - 应用插件（`app_plugin` 表）
  - 家族基金（`family_fund` 三表）
  - 宗亲聚会（`family_gathering` 四表）
  - 家族种子分享码（`family.seed_share_code` + `uk_family_seed_share_code`）
  - 广告点击统计（`family_banner.click_count`）

## 二、文件 → 主脚本映射（合并明细）

| 原迁移文件 | 合并位置（schema.sql） | 说明 |
|---|---|---|
| `20260815-membership-init.sql` | 37 会员订阅系统 5 表 + 套餐种子 | 表定义与种子语句整体并入 |
| `20260817-family-invitation.sql` | 35 家族邀请表 / user 表 `family_role` 列 / 40-41 权限与菜单 | 建表并入 35；`family_role` 列并入 user 表定义；权限/菜单并入 40/41 |
| `20260817-worship-admin.sql` | 40-41 权限与菜单 | 祭祀管理权限码 + 菜单 |
| `20260817-worship-memorial.sql` | 已有：schema.sql 第 18.1 节 `family_worship_memorial` 表 | 内容已被 schema.sql 完整覆盖，无需新增 |
| `20260818-family-banner.sql` | 34 家族广告轮播表 / 40-41 权限与菜单 | 建表并入 34；`banner_interval` 配置、权限、菜单并入 |
| `20260819-app-center-menu.sql` | 41 应用中心菜单升级 | 依赖 20260819-app-plugin.sql，顺序保持 |
| `20260819-app-plugin.sql` | 36 应用插件表 / 40-41 权限与菜单 | 建表并入 36 |
| `20260819-banner-click-count.sql` | 34 家族广告轮播表 `click_count` 列 | 列直接并入建表语句 |
| `20260819-family-seed-share-code.sql` | family 表 `uk_family_seed_share_code` 索引 / 42b 存量回填 | 索引并入 family 表定义；回填存储过程并入 42b |
| `20260819-family-share.sql` | 35 家族邀请表 4 列 + 存量 `channel` 回填 | 列并入建表语句 |
| `20260820-family-fund.sql` | 38 家族基金 3 表 | 建表整体并入 |
| `20260820-family-gathering.sql` | 39 宗亲聚会 4 表 / 40-41 权限与菜单 | 建表并入 39 |
| `add-subscription-admin-permissions.sql` | 40-41 权限与菜单 | 订阅管理权限码 + 菜单 |
| `add-user-auth-identity.sql` | 已有：schema.sql 1.1/1.2 节两张表；42a 存量回填 | 建表已被覆盖；Step 3 微信绑定回填并入 42a |
| `add-user-family-association.sql` | 已有：schema.sql user 表 `family_id`/`member_id`/`share_code` + 索引 | 内容已被 schema.sql 完整覆盖 |
| `sync-family-member-count.sql` | 42c 一次性重算存储过程 | 工具类语句并入 42c（幂等，新库无数据自动跳过） |

## 三、删除文件清单

以下 16 个 SQL 迁移文件已成功整合进 `schema.sql`，判定为冗余并删除：

1. `migrations/20260815-membership-init.sql`
2. `migrations/20260817-family-invitation.sql`
3. `migrations/20260817-worship-admin.sql`
4. `migrations/20260817-worship-memorial.sql`
5. `migrations/20260818-family-banner.sql`
6. `migrations/20260819-app-center-menu.sql`
7. `migrations/20260819-app-plugin.sql`
8. `migrations/20260819-banner-click-count.sql`
9. `migrations/20260819-family-seed-share-code.sql`
10. `migrations/20260819-family-share.sql`
11. `migrations/20260820-family-fund.sql`
12. `migrations/20260820-family-gathering.sql`
13. `migrations/add-subscription-admin-permissions.sql`
14. `migrations/add-user-auth-identity.sql`
15. `migrations/add-user-family-association.sql`
16. `migrations/sync-family-member-count.sql`

保留未删除：`migrations/generation-table-er.md`、`system-settings-api.md`、`system-settings-guide.md`、`system-settings-test-report.md`（模块文档，非 SQL）；`database/run-migration.js`、`verify-migration.js`（迁移辅助工具）。

## 四、备注

- 被删文件内容均保留于 git 历史与本日志第二节映射中，可随时回溯。
- 对**存量数据库**需要补执行未生效迁移时，可从 git 历史恢复对应文件执行，或按第二节映射在现有库上手动执行对应语句（原脚本均幂等）。
- 全新环境部署：直接执行 `mysql -u<user> -p<password> family_genealogy < schema.sql` 即可获得完整结构，无需再执行任何迁移文件（见 `docs/baota-deployment.md`）。
