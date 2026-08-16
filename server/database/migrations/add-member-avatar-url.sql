-- ============================================================
-- 迁移脚本：成员表新增头像字段 avatar_url
-- 背景：家族成员需要保存头像图片信息（数字家谱 - 成员资料增强）
-- 影响范围：
--   1. family_member 基表
--   2. 所有 family_members_{familyId} 分表
-- 设计：
--   - 字段类型 VARCHAR(500)，存图片相对路径（/uploads/xxx）或 http(s) 完整地址
--   - NOT NULL DEFAULT ''：存量数据自动回填空串，保证向后兼容（SELECT 不再出现 NULL）
-- 幂等：通过 information_schema 判断列是否存在，可重复执行
-- 注意：含 DELIMITER/存储过程，需使用 run-migration.js（按 DELIMITER 切分、单语句执行）
-- 执行：node run-migration.js migrations/add-member-avatar-url.sql
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- Step 1: 基表 family_member 补充 avatar_url 列（如不存在）
-- ------------------------------------------------------------
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'family_member' AND column_name = 'avatar_url'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `family_member` ADD COLUMN `avatar_url` VARCHAR(500) NOT NULL DEFAULT '''' COMMENT ''头像URL（/uploads/xxx 或 http(s) 完整地址，最多500字符）'' AFTER `bio`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- Step 2: 遍历所有 family_members_% 分表，补充 avatar_url 列（如不存在）
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_add_member_avatar_url;

DELIMITER //

CREATE PROCEDURE sp_add_member_avatar_url()
BEGIN
  DECLARE v_tbl VARCHAR(64) DEFAULT '';
  DECLARE done INT DEFAULT 0;
  DECLARE cur CURSOR FOR
    SELECT `table_name`
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name LIKE 'family\_members\_%';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  -- 分表列已存在等异常直接跳过（幂等）
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_tbl = v_tbl;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_tbl;
    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET @tbl = v_tbl;
    SET @col_exists = (
      SELECT COUNT(*)
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = 'avatar_url'
    );
    SET @sql = IF(
      @col_exists = 0,
      CONCAT(
        'ALTER TABLE `', @tbl,
        '` ADD COLUMN `avatar_url` VARCHAR(500) NOT NULL DEFAULT '''' COMMENT ''头像URL（/uploads/xxx 或 http(s) 完整地址，最多500字符）'' AFTER `bio`'
      ),
      'SELECT 1'
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;

  CLOSE cur;
END //

DELIMITER ;

CALL sp_add_member_avatar_url();
DROP PROCEDURE sp_add_member_avatar_url;
