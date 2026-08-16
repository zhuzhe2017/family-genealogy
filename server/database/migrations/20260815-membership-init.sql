-- ============================================================
-- 迁移脚本：会员系统初始化（M1）
-- 背景：数字家谱商业化落地（见 docs/commercial-strategy.md、docs/membership-tech-design.md）
--   1) 5 张新表：subscription_plan / family_subscription / subscription_order / family_quota / storage_usage_record
--   2) 订阅套餐种子数据（free / family / premium，能力点模型）
-- 设计要点：
--   - 成员数量不设限；权益采用「能力点 Capability」模型
--   - 存储容量与按次额度（AI修复张数/祭祀次数）为订阅内含权益
--   - 备份文件不计入家族存储额度
-- 幂等：CREATE TABLE IF NOT EXISTS；种子数据 ON DUPLICATE KEY UPDATE
-- 执行：node run-migration.js migrations/20260815-membership-init.sql
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 订阅套餐表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_plan` (
  `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '套餐ID',
  `code`           VARCHAR(30)    NOT NULL COMMENT '套餐编码 free/family/premium',
  `name`           VARCHAR(50)    NOT NULL COMMENT '套餐名称',
  `price_annual`   DECIMAL(10,2)  NOT NULL DEFAULT 0.00 COMMENT '年费（元）',
  `capabilities`   JSON           NOT NULL COMMENT '能力点集合 ["backup","export",...]',
  `storage_limit`  BIGINT UNSIGNED DEFAULT 0 COMMENT '存储上限(字节)，0=不限',
  `quota_rules`    JSON           DEFAULT NULL COMMENT '按次额度 {"ai_restore":10,"worship_pro":50}',
  `sort_order`     INT UNSIGNED   DEFAULT 0 COMMENT '排序',
  `status`         TINYINT(1)     DEFAULT 1 COMMENT '1-启用 0-停用',
  `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅套餐表';

-- ------------------------------------------------------------
-- 2. 家族订阅表（订阅跟随家族，家族成员共享权益）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_subscription` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '订阅ID',
  `family_id`     INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `plan_code`     VARCHAR(30)   NOT NULL DEFAULT 'free' COMMENT '当前套餐',
  `status`        VARCHAR(20)   NOT NULL DEFAULT 'active' COMMENT 'active-有效 grace-宽限 frozen-冻结 expired-已过期',
  `owner_user_id` VARCHAR(32)   DEFAULT '' COMMENT '订阅支付人（小程序用户ID，32位hex）',
  `auto_renew`    TINYINT(1)    DEFAULT 0 COMMENT '自动续费开关（一期默认关）',
  `paid_at`       DATETIME      DEFAULT NULL COMMENT '最近一次付费时间',
  `expire_at`     DATETIME      DEFAULT NULL COMMENT '当前周期到期时间',
  `grace_until`   DATETIME      DEFAULT NULL COMMENT '宽限期截止',
  `cancel_reason` VARCHAR(200)  DEFAULT '' COMMENT '取消/冻结原因',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family` (`family_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_expire` (`expire_at`),
  CONSTRAINT `fk_subscription_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族订阅表';

-- ------------------------------------------------------------
-- 3. 订阅订单表（微信支付）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_order` (
  `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `order_no`       VARCHAR(64)    NOT NULL COMMENT '平台订单号',
  `out_trade_no`   VARCHAR(64)    NOT NULL COMMENT '商户订单号（微信支付）',
  `family_id`      INT UNSIGNED   NOT NULL COMMENT '家族ID',
  `user_id`        VARCHAR(32)    NOT NULL COMMENT '支付人用户ID',
  `plan_code`      VARCHAR(30)    NOT NULL COMMENT '购买的套餐',
  `amount`         DECIMAL(10,2)  NOT NULL COMMENT '实付金额（元）',
  `period_months`  INT UNSIGNED   DEFAULT 12 COMMENT '订阅时长（月）',
  `status`         VARCHAR(20)    NOT NULL DEFAULT 'pending' COMMENT 'pending/paid/failed/refunded/closed',
  `transaction_id` VARCHAR(64)    DEFAULT '' COMMENT '微信支付单号',
  `pay_time`       DATETIME       DEFAULT NULL COMMENT '支付时间',
  `refund_time`    DATETIME       DEFAULT NULL COMMENT '退款时间',
  `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_out_trade_no` (`out_trade_no`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_user` (`user_id`),
  CONSTRAINT `fk_order_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅订单表';

-- ------------------------------------------------------------
-- 4. 家族额度账户表（存储用量 + 按次额度）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_quota` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`          INT UNSIGNED NOT NULL COMMENT '家族ID',
  `storage_used`       BIGINT UNSIGNED DEFAULT 0 COMMENT '已用存储(字节)，冗余列+定时对账',
  `ai_restore_used`    INT UNSIGNED DEFAULT 0 COMMENT 'AI修复已用张数（当前订阅周期）',
  `worship_pro_used`   INT UNSIGNED DEFAULT 0 COMMENT '祭祀增值已用次数（当前订阅周期）',
  `quota_period_start` DATE DEFAULT NULL COMMENT '额度周期起点',
  `quota_period_end`   DATE DEFAULT NULL COMMENT '额度周期终点',
  `create_time`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family` (`family_id`),
  CONSTRAINT `fk_quota_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族额度账户表';

-- ------------------------------------------------------------
-- 5. 存储占用明细表（支持「删除即释放」与精确对账）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `storage_usage_record` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `file_key`    VARCHAR(200)  NOT NULL COMMENT '文件标识（/uploads/xxx.png）',
  `file_size`   BIGINT UNSIGNED NOT NULL COMMENT '占用字节数',
  `biz_type`    VARCHAR(30)   NOT NULL COMMENT '业务类型 photo/document/dynamic/album/member_avatar',
  `biz_id`      VARCHAR(64)   DEFAULT '' COMMENT '业务记录ID',
  `user_id`     VARCHAR(32)   DEFAULT '' COMMENT '上传人（小程序用户ID）',
  `status`      TINYINT(1)    DEFAULT 1 COMMENT '1-占用 0-已释放',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_family_status` (`family_id`, `status`),
  INDEX `idx_file_key` (`file_key`),
  CONSTRAINT `fk_storage_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='存储占用明细表';

-- ------------------------------------------------------------
-- 6. 套餐种子数据（能力点模型，幂等更新）
-- ------------------------------------------------------------
INSERT INTO `subscription_plan`
  (`code`, `name`, `price_annual`, `capabilities`, `storage_limit`, `quota_rules`, `sort_order`, `status`)
VALUES
  ('free',    '免费版', 0.00,
   JSON_ARRAY(),
   524288000,  -- 500MB
   NULL,
   1, 1),
  ('family',  '家族版', 199.00,
   JSON_ARRAY('backup', 'export', 'permission', 'reminder', 'digest', 'theme', 'badge', 'ai_restore', 'worship_pro'),
   10737418240,  -- 10GB
   JSON_OBJECT('ai_restore', 10, 'worship_pro', 50),
   2, 1),
  ('premium', '尊享版', 599.00,
   JSON_ARRAY('backup', 'export', 'permission', 'reminder', 'digest', 'theme', 'badge', 'print', 'worship_pro', 'ai_restore', 'advisor', 'support', 'no_ads'),
   0,  -- 0=不限
   JSON_OBJECT('ai_restore', 100, 'worship_pro', 999),
   3, 1)
ON DUPLICATE KEY UPDATE
  `name`          = VALUES(`name`),
  `price_annual`  = VALUES(`price_annual`),
  `capabilities`  = VALUES(`capabilities`),
  `storage_limit` = VALUES(`storage_limit`),
  `quota_rules`   = VALUES(`quota_rules`),
  `sort_order`    = VALUES(`sort_order`),
  `status`        = VALUES(`status`);
