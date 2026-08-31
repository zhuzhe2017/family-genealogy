-- ============================================================
-- 历史数据修复：为已存在但未写入 family_permission 的家族创建者补全权限记录
-- 适用：升级后需要让历史家族创建者也能进入 tenant-web 管理后台
-- 幂等：已存在有效 admin/creator 记录则跳过
-- ============================================================

USE `family_genealogy`;

INSERT IGNORE INTO `family_permission` (`family_id`, `user_id`, `role`, `status`)
SELECT `id`, `creator_user_id`, 'creator', 1
FROM `family`
WHERE `status` = 1
  AND `creator_user_id` IS NOT NULL
  AND `creator_user_id` != '';
