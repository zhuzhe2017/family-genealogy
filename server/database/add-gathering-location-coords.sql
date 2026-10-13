-- ============================================================
-- 增量脚本：聚会主表新增「聚会地点经纬度」字段（latitude / longitude）
-- 适用：存量数据库升级（schema.sql 为全量建表脚本，已包含这两列；
--       若数据库是在接入腾讯位置服务地图选点之前初始化的，需要执行本脚本补列）
-- 说明：
--   1. 执行前请先备份数据库（宝塔 → 数据库 → 备份）
--   2. 脚本幂等：列已存在时自动跳过，重复执行无副作用
--   3. 命令行导入方式：
--      mysql -u<用户> -p<密码> family_genealogy < add-gathering-location-coords.sql
--      或宝塔 phpMyAdmin 中全选执行
--   4. 执行完成后：pm2 restart family-genealogy-server，并强刷浏览器（Ctrl+F5）
-- ============================================================

-- ------------------------------------------------------------
-- ① 幂等新增 latitude 列（位于 address_detail 之后）
-- ------------------------------------------------------------
SET @lat_col_exists := (
  SELECT COUNT(*) FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'family_gathering'
    AND `COLUMN_NAME` = 'latitude'
);

SET @lat_ddl := IF(
  @lat_col_exists = 0,
  'ALTER TABLE `family_gathering` ADD COLUMN `latitude` DECIMAL(10, 7) DEFAULT NULL COMMENT ''聚会地点纬度(地图选点)'' AFTER `address_detail`',
  'SELECT ''latitude 列已存在，跳过'''
);

PREPARE lat_stmt FROM @lat_ddl;
EXECUTE lat_stmt;
DEALLOCATE PREPARE lat_stmt;

-- ------------------------------------------------------------
-- ② 幂等新增 longitude 列（位于 latitude 之后）
-- ------------------------------------------------------------
SET @lng_col_exists := (
  SELECT COUNT(*) FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'family_gathering'
    AND `COLUMN_NAME` = 'longitude'
);

SET @lng_ddl := IF(
  @lng_col_exists = 0,
  'ALTER TABLE `family_gathering` ADD COLUMN `longitude` DECIMAL(10, 7) DEFAULT NULL COMMENT ''聚会地点经度(地图选点)'' AFTER `latitude`',
  'SELECT ''longitude 列已存在，跳过'''
);

PREPARE lng_stmt FROM @lng_ddl;
EXECUTE lng_stmt;
DEALLOCATE PREPARE lng_stmt;

-- ============================================================
-- 验证（以下结果供核对，可安全执行）
-- ============================================================

-- ① 应显示 2 行：latitude、longitude，Type = decimal(10,7)，Default = NULL
SHOW COLUMNS FROM `family_gathering` LIKE 'latitude';
SHOW COLUMNS FROM `family_gathering` LIKE 'longitude';
