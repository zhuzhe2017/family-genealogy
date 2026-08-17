-- ============================================================
-- 迁移脚本：会员信息数据结构扩展（家族支系关联 + 成员绑定 + 分享码）
-- 背景：会员（user 账户）需要关联所属家族支系、绑定家族成员、
--       并持有分享码用于家族邀请与加入（数字家谱 - 会员权限体系）
-- 影响范围：
--   1. user 基表（关联家族支系ID family_id / 关联成员ID member_id / 分享码 share_code）
-- 设计：
--   - family_id  INT UNSIGNED  DEFAULT NULL：会员所属家族支系唯一标识（family.id）
--   - member_id  VARCHAR(32)   DEFAULT ''：会员绑定的家族成员ID（family_members_{familyId}.id）
--   - share_code VARCHAR(16)   DEFAULT NULL：分享码，唯一索引（NULL 可重复，仅已入族会员持有）
--   - 幂等：通过 information_schema 判断列/索引是否存在，可重复执行
-- 执行：node run-migration.js migrations/add-user-family-association.sql
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- Step 1: user 表补充 family_id（如不存在）
-- ------------------------------------------------------------
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'user' AND column_name = 'family_id'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `family_id` INT UNSIGNED DEFAULT NULL COMMENT ''关联家族支系ID（会员所属家族支系，family.id）'' AFTER `unionid`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- Step 2: user 表补充 member_id（如不存在）
-- ------------------------------------------------------------
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'user' AND column_name = 'member_id'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `member_id` VARCHAR(32) DEFAULT '''' COMMENT ''关联成员ID（会员与家族成员的绑定关系，family_members_{familyId}.id）'' AFTER `family_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- Step 3: user 表补充 share_code（如不存在）
-- ------------------------------------------------------------
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'user' AND column_name = 'share_code'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `share_code` VARCHAR(16) DEFAULT NULL COMMENT ''分享码（家族邀请/加入，全局唯一，仅已入族会员持有）'' AFTER `member_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- Step 4: 索引
--   idx_user_family_id：按家族支系反查会员
--   idx_user_member_id：按绑定成员反查会员（一成员可被多账户绑定，故非唯一）
--   uk_user_share_code：分享码全局唯一（NULL 不参与唯一约束，可多行）
-- ------------------------------------------------------------
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user' AND index_name = 'idx_user_family_id'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE `user` ADD INDEX `idx_user_family_id` (`family_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user' AND index_name = 'idx_user_member_id'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE `user` ADD INDEX `idx_user_member_id` (`member_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user' AND index_name = 'uk_user_share_code'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE `user` ADD UNIQUE INDEX `uk_user_share_code` (`share_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
