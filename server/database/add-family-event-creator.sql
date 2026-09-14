-- 为存量库 family_event 表新增/修正发布者字段 creator_id（配合"发布者本人或管理员"权限控制）
-- 类型为 VARCHAR(32)（存小程序用户32位hex id），与 family.creator_user_id / user.id 保持一致。
-- 幂等：无列则 ADD COLUMN；已存在则 MODIFY 为正确类型。
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_event'
    AND COLUMN_NAME = 'creator_id'
);

SET @ddl = IF(
  @col_exists = 0,
  'ALTER TABLE `family_event` ADD COLUMN `creator_id` VARCHAR(32) DEFAULT NULL COMMENT ''发布者用户ID'' AFTER `type_name`',
  'ALTER TABLE `family_event` MODIFY COLUMN `creator_id` VARCHAR(32) DEFAULT NULL COMMENT ''发布者用户ID'''
);

SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_event'
    AND INDEX_NAME = 'idx_creator'
);

SET @idx_ddl = IF(
  @idx_exists = 0,
  'ALTER TABLE `family_event` ADD INDEX `idx_creator` (`creator_id`)',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

PREPARE stmt FROM @idx_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;