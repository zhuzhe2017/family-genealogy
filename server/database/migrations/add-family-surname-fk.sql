-- ============================================================
-- 迁移脚本：为 family.surname_id 添加外键约束（关联 surname 表）
-- 执行前请先备份数据库；本脚本幂等，可重复执行
-- ============================================================

-- 1. 将现有 surname_id=0 的记录置为 NULL（0 不是有效的姓氏ID）
UPDATE `family` SET `surname_id` = NULL WHERE `surname_id` = 0;

-- 2. 修改列定义：DEFAULT 0 → DEFAULT NULL
SET @col_sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'family' AND column_name = 'surname_id'
     AND column_default IS NOT NULL) > 0,
  'ALTER TABLE `family` MODIFY COLUMN `surname_id` INT UNSIGNED DEFAULT NULL COMMENT ''姓氏ID（关联 surname 表）''',
  'SELECT ''surname_id already DEFAULT NULL'' AS msg'
));
PREPARE stmt FROM @col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 添加索引（如果不存在）
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.statistics
                    WHERE table_schema = DATABASE() AND table_name = 'family' AND index_name = 'idx_surname');
SET @idx_sql := IF(@idx_exists = 0,
                   'ALTER TABLE `family` ADD INDEX `idx_surname` (`surname_id`)',
                   'SELECT ''idx_surname already exists'' AS msg');
PREPARE stmt FROM @idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. 添加外键约束（如果不存在）
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints
                   WHERE table_schema = DATABASE() AND table_name = 'family'
                     AND constraint_name = 'fk_family_surname' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql := IF(@fk_exists = 0,
                  'ALTER TABLE `family` ADD CONSTRAINT `fk_family_surname` FOREIGN KEY (`surname_id`) REFERENCES `surname` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
                  'SELECT ''fk_family_surname already exists'' AS msg');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
