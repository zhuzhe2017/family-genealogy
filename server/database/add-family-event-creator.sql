-- 为存量库 family_event 表新增发布者字段 creator_id（配合"发布者本人或管理员"权限控制）
-- 幂等：遗留无该列的库执行 ADD COLUMN；已含该列的库直接跳过
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_event'
    AND COLUMN_NAME = 'creator_id'
);

SET @ddl = IF(
  @col_exists = 0,
  'ALTER TABLE `family_event` ADD COLUMN `creator_id` INT UNSIGNED DEFAULT NULL COMMENT ''发布者用户ID'' AFTER `type_name`',
  'SELECT 1'
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