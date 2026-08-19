-- ============================================================
-- 迁移: 家族加入机制改造
--   1. 为 family 表增加种子分享码 seed_share_code（全局唯一）
--   2. 为所有存量家族生成种子分享码
--   3. 创建家族时通过唯一索引保证不可重复
-- 幂等: IF NOT EXISTS / INSERT IGNORE / 幂等字段更新
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 新增 family.seed_share_code 字段
-- ------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family'
    AND COLUMN_NAME = 'seed_share_code'
);
SET @add_col_ddl := IF(@col_exists = 0,
  'ALTER TABLE `family` ADD COLUMN `seed_share_code` VARCHAR(16) DEFAULT NULL COMMENT ''家族种子分享码（全局唯一，创建家族时自动生成，用于新成员加入）'' AFTER `allow_join`',
  'SELECT 1'
);
PREPARE add_col_stmt FROM @add_col_ddl;
EXECUTE add_col_stmt;
DEALLOCATE PREPARE add_col_stmt;

-- ------------------------------------------------------------
-- 2. 添加唯一索引（避免种子分享码重复）
-- ------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family'
    AND INDEX_NAME = 'uk_family_seed_share_code'
);
SET @add_idx_ddl := IF(@idx_exists = 0,
  'ALTER TABLE `family` ADD UNIQUE INDEX `uk_family_seed_share_code` (`seed_share_code`)',
  'SELECT 1'
);
PREPARE add_idx_stmt FROM @add_idx_ddl;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;

-- ------------------------------------------------------------
-- 3. 为没有种子分享码的存量家族生成 8 位唯一码
--    字符表：去除 0/O/1/I
-- ------------------------------------------------------------
DELIMITER //
DROP PROCEDURE IF EXISTS `sp_generate_family_seed_share_codes`//
CREATE PROCEDURE `sp_generate_family_seed_share_codes`()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_family_id INT UNSIGNED;
  DECLARE v_code VARCHAR(16);
  DECLARE v_dup INT;
  DECLARE cur CURSOR FOR
    SELECT `id` FROM `family`
    WHERE `status` = 1 AND (`seed_share_code` IS NULL OR `seed_share_code` = '');
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_family_id;
    IF done THEN LEAVE read_loop; END IF;

    SET v_code = '';
    gen_loop: LOOP
      SET v_code = UPPER(SUBSTRING(MD5(RAND()), 1, 8));
      -- 替换易混淆字符为安全字符
      SET v_code = REPLACE(REPLACE(REPLACE(REPLACE(v_code, '0', 'Z'), 'O', 'Y'), '1', 'X'), 'I', 'W');
      SELECT COUNT(*) INTO v_dup FROM `family` WHERE `seed_share_code` = v_code;
      IF v_dup = 0 THEN LEAVE gen_loop; END IF;
    END LOOP gen_loop;

    UPDATE `family` SET `seed_share_code` = v_code WHERE `id` = v_family_id;
  END LOOP read_loop;
  CLOSE cur;
END//
DELIMITER ;

CALL `sp_generate_family_seed_share_codes`();
DROP PROCEDURE IF EXISTS `sp_generate_family_seed_share_codes`;

-- ------------------------------------------------------------
-- 4. 更新 schema 注释一致性（可选，避免 NULL 值导致空字符串语义混淆）
-- ------------------------------------------------------------
UPDATE `family` SET `seed_share_code` = NULL WHERE `seed_share_code` = '';
