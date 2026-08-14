-- ============================================================
-- 迁移脚本：一次性重算 family.member_count（按成员分表 status=1 的数量）
-- 背景：member_count 为冗余列，成员增删改前未同步，导致家族下拉"成员数"显示错误
-- 说明：本脚本幂等，可重复执行；执行前请先备份数据库
-- 运行后，后续成员的增/删/改/批量导入会自动同步该列（见 family-member.service.ts syncMemberCount）
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_sync_family_member_count;
CREATE PROCEDURE sp_sync_family_member_count()
BEGIN
  DECLARE v_id INT UNSIGNED DEFAULT 0;
  DECLARE v_cnt INT DEFAULT 0;
  DECLARE done INT DEFAULT 0;
  DECLARE cur CURSOR FOR SELECT `id` FROM `family`;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  -- 分表不存在等异常直接跳过该家族
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_cnt = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id;
    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET @tbl = CONCAT('family_members_', v_id);
    SET @cnt = NULL;
    SET @sql = CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @tbl, '` WHERE `status` = 1');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    SET v_cnt = IFNULL(@cnt, 0);

    UPDATE `family` SET `member_count` = v_cnt WHERE `id` = v_id;
  END LOOP;

  CLOSE cur;
END //

DELIMITER ;

CALL sp_sync_family_member_count();
DROP PROCEDURE sp_sync_family_member_count;
