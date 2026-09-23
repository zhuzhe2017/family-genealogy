# ============================================================
# 合规补充：用户同意记录表 + 数据脱敏支持
# 对应 saas-transformation-plan.md §7-P0「隐私政策与同意」「数据分级与脱敏」
# 幂等：可重复执行（CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS）
# ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 34. 用户同意记录表（隐私政策/用户协议/成员信息告知 的告知-同意留存）
-- 满足《个人信息保护法》告知-同意与撤回留痕要求
-- doc_type + doc_version 唯一约束防止同一版本重复记录
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_consent` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `user_id`     VARCHAR(32)  NOT NULL COMMENT '用户ID(user.id)',
  `doc_type`    VARCHAR(20)  NOT NULL COMMENT '文档类型 privacy-隐私政策 agreement-用户协议 member_notice-成员信息告知',
  `doc_version` VARCHAR(20)  NOT NULL DEFAULT 'v1.0' COMMENT '文档版本号',
  `consent`     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否同意 1-同意 0-拒绝/撤回',
  `ip`          VARCHAR(64)  DEFAULT '' COMMENT '同意时 IP（审计用）',
  `user_agent`  VARCHAR(255) DEFAULT '' COMMENT '客户端 UA（审计用）',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_doc_version` (`user_id`, `doc_type`, `doc_version`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_doc_type` (`doc_type`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户同意记录表';

-- ------------------------------------------------------------
-- user 表补充注销审计字段（配合已有 deleteAccount：status=0 + 联系方式置空 + 内容匿名化）
-- 注：MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，需先查询 information_schema 判断列是否存在
-- ------------------------------------------------------------
SET @deleted_at_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'deleted_at'
);
SET @sql := IF(@deleted_at_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `deleted_at` DATETIME DEFAULT NULL COMMENT ''注销时间''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @delete_reason_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'delete_reason'
);
SET @sql := IF(@delete_reason_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `delete_reason` VARCHAR(200) DEFAULT '''' COMMENT ''注销原因（选填）''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
