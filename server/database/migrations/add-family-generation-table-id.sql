-- ============================================================
-- 迁移脚本：为 family 表添加 generation_table_id 列（关联字辈表）
-- 原因：schema.sql 已包含该列，但运行中的数据库未同步，导致
--       GET /api/family/list 报 Unknown column 'f.generation_table_id'
-- 执行前请先备份数据库；本脚本幂等，可重复执行
-- ============================================================

USE `family_genealogy`;

-- 添加列（如果不存在），位置与 schema.sql 一致：gen_count 之后
SET @col_exists := (SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_schema = DATABASE() AND table_name = 'family' AND column_name = 'generation_table_id');
SET @col_sql := IF(@col_exists = 0,
                   'ALTER TABLE `family` ADD COLUMN `generation_table_id` VARCHAR(32) DEFAULT NULL COMMENT ''关联字辈表ID'' AFTER `gen_count`',
                   'SELECT ''generation_table_id already exists'' AS msg');
PREPARE stmt FROM @col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
