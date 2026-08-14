-- ============================================================
-- 迁移脚本：姓氏表字段 meaning(含义/VARCHAR) → population(人口/INT)
-- 执行前请先备份数据库；本脚本幂等，可重复执行
-- ============================================================

-- 检查当前列名，决定执行 CHANGE 还是已迁移
SET @col_exists := (SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_schema = DATABASE() AND table_name = 'surname' AND column_name = 'meaning');
SET @pop_exists := (SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_schema = DATABASE() AND table_name = 'surname' AND column_name = 'population');

-- meaning 列存在且 population 列不存在时执行重命名+类型变更
-- 注：若 meaning 列中有非数值文本，MySQL 会转为 0（当前表为空，无数据损失风险）
SET @alter_sql := IF(@col_exists = 1 AND @pop_exists = 0,
                     'ALTER TABLE `surname` CHANGE COLUMN `meaning` `population` INT UNSIGNED DEFAULT 0 COMMENT ''人口数量''',
                     'SELECT ''meaning already migrated or population already exists'' AS msg');
PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
