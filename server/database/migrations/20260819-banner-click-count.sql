-- ============================================================
-- 迁移: 广告点击统计
-- 为 family_banner 增加 click_count 列（幂等:information_schema 判断）
-- ============================================================

USE `family_genealogy`;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'family_genealogy'
    AND TABLE_NAME = 'family_banner'
    AND COLUMN_NAME = 'click_count'
);

SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE `family_banner` ADD COLUMN `click_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''点击次数（运营统计用）'' AFTER `link_url`',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
