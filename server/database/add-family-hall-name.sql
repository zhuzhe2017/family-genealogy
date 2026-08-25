-- ============================================================
-- 增量脚本：家族表新增「堂号」字段（hall_name）
-- 适用：存量数据库升级（schema.sql 为全量建表脚本，不含本增量；
--       若数据库是在添加堂号功能之前初始化的，需要执行本脚本补列）
-- 说明：
--   1. 执行前请先备份数据库（宝塔 → 数据库 → 备份）
--   2. 脚本幂等：已存在 hall_name 列时自动跳过，重复执行无副作用
--   3. 命令行导入方式：
--      mysql -u<用户> -p<密码> family_genealogy < add-family-hall-name.sql
--      或宝塔 phpMyAdmin 中全选执行
--   4. 执行完成后：pm2 restart family-genealogy-server，并强刷浏览器（Ctrl+F5）
-- ============================================================

-- ------------------------------------------------------------
-- ① 幂等新增 hall_name 列（位于 founder 之后、origin 之前）
-- ------------------------------------------------------------
SET @hall_col_exists := (
  SELECT COUNT(*) FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'family'
    AND `COLUMN_NAME` = 'hall_name'
);

SET @hall_ddl := IF(
  @hall_col_exists = 0,
  'ALTER TABLE `family` ADD COLUMN `hall_name` VARCHAR(50) NOT NULL DEFAULT '''' COMMENT ''堂号'' AFTER `founder`',
  'SELECT ''hall_name 列已存在，跳过'''
);

PREPARE hall_stmt FROM @hall_ddl;
EXECUTE hall_stmt;
DEALLOCATE PREPARE hall_stmt;

-- ============================================================
-- 验证（以下结果供核对，可安全执行）
-- ============================================================

-- ① 应显示 1 行，Field = hall_name，Type = varchar(50)，Default = 空串
SHOW COLUMNS FROM `family` LIKE 'hall_name';
