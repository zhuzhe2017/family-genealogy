-- ============================================================
-- 迁移: 家族基金模块
-- 幂等: CREATE TABLE IF NOT EXISTS / INSERT IGNORE
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 家族基金主表
-- 一个家族仅允许一个基金(uk_fund_family);余额与限额 DECIMAL 精确到分
-- status: 1-正常 2-已解散
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_fund` (
  `id`                       INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`                INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `name`                     VARCHAR(50)   NOT NULL COMMENT '基金名称',
  `logo_url`                 VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '图标URL',
  `description`              VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '基金简介',
  `total_amount`             DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '基金当前总额(元)',
  `single_deposit_limit`     DECIMAL(12,2) NOT NULL DEFAULT 1000.00 COMMENT '单次存入限额(元)',
  `single_withdraw_limit`    DECIMAL(12,2) NOT NULL DEFAULT 1000.00 COMMENT '单次取出限额(元)',
  `daily_deposit_limit`      DECIMAL(12,2) NOT NULL DEFAULT 2000.00 COMMENT '每日存入限额(元)',
  `daily_withdraw_limit`     DECIMAL(12,2) NOT NULL DEFAULT 2000.00 COMMENT '每日取出限额(元)',
  `monthly_deposit_limit`    DECIMAL(12,2) NOT NULL DEFAULT 5000.00 COMMENT '每月存入限额(元)',
  `monthly_withdraw_limit`   DECIMAL(12,2) NOT NULL DEFAULT 5000.00 COMMENT '每月取出限额(元)',
  `withdraw_approval_threshold` DECIMAL(12,2) NOT NULL DEFAULT 500.00 COMMENT '大额取出审批阈值(元),超过需审批',
  `need_approval`            TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否需要大额取出审批 1-是 0-否',
  `status`                   TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 2-已解散',
  `creator_user_id`          VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '创建人用户ID',
  `dissolved_at`             DATETIME      DEFAULT NULL COMMENT '解散时间',
  `dissolve_reason`          VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '解散原因',
  `create_time`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fund_family` (`family_id`),
  INDEX `idx_fund_creator` (`creator_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族基金主表';

-- ------------------------------------------------------------
-- 2. 基金成员权限表(显式参与名单 + 角色 + 精细权限)
-- balance: 个人在基金中的净余额(存入+,取出/转出-),成员间转账只影响个人余额,不动公共池
-- role: leader-族长 admin-管理员 member-普通成员
-- permissions: JSON 数组权限码,例如 ["deposit","withdraw","view_all",...]
--   deposit-存入  withdraw-取出  transfer-转账  view_all-查看全部明细
--   approve-审批大额取出  manage_member-成员权限管理  manage_rule-规则/设置管理  dissolve-解散基金
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_fund_member` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `fund_id`      INT UNSIGNED  NOT NULL COMMENT '基金ID',
  `family_id`    INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `user_id`      VARCHAR(32)   NOT NULL COMMENT '用户ID',
  `member_id`    VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '关联家族成员ID(冗余展示)',
  `name`         VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '成员姓名(冗余展示)',
  `role`         VARCHAR(20)   NOT NULL DEFAULT 'member' COMMENT '角色 leader-族长 admin-管理员 member-普通成员',
  `permissions`  JSON          DEFAULT NULL COMMENT '权限码数组',
  `balance`      DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '个人净余额(元)',
  `status`       TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 0-已移除',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fund_user` (`fund_id`, `user_id`),
  INDEX `idx_fund_member` (`fund_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族基金成员权限表';

-- ------------------------------------------------------------
-- 3. 资金交易流水表(所有资金变动的唯一事实来源)
-- type: init-创建初始化 deposit-存入 withdraw-取出 transfer-转账 adjust-族长调账
-- direction: 1-流入 -1-流出
-- status: 1-成功 0-失败 2-待审批 3-已驳回
-- 待审批的取出不扣余额,审批通过后才扣(approve_user_id/approve_time)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_fund_transaction` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `fund_id`        INT UNSIGNED    NOT NULL COMMENT '基金ID',
  `family_id`      INT UNSIGNED    NOT NULL COMMENT '家族ID',
  `type`           VARCHAR(20)     NOT NULL COMMENT '类型 init/deposit/withdraw/transfer/adjust',
  `amount`         DECIMAL(12,2)   NOT NULL COMMENT '金额(正数)',
  `direction`      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '资金方向 1-流入 -1-流出',
  `operator_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '操作人用户ID',
  `target_user_id` VARCHAR(32)     NOT NULL DEFAULT '' COMMENT '对方用户ID(转账接收方/审批人)',
  `payment_method` VARCHAR(20)     NOT NULL DEFAULT '' COMMENT '资金渠道 cash-现金 wechat-微信 alipay-支付宝 bank-银行',
  `status`         TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态 1-成功 0-失败 2-待审批 3-已驳回',
  `remark`         VARCHAR(200)    NOT NULL DEFAULT '' COMMENT '备注',
  `balance_after`  DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '操作后基金余额(成功流水)',
  `approve_user_id` VARCHAR(32)    NOT NULL DEFAULT '' COMMENT '审批人用户ID',
  `approve_time`   DATETIME        DEFAULT NULL COMMENT '审批时间',
  `approve_remark` VARCHAR(200)    NOT NULL DEFAULT '' COMMENT '审批备注',
  `create_time`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_fund_time` (`fund_id`, `create_time`),
  INDEX `idx_fund_type` (`fund_id`, `type`),
  INDEX `idx_fund_user` (`fund_id`, `operator_user_id`),
  INDEX `idx_fund_target` (`fund_id`, `target_user_id`),
  INDEX `idx_fund_status` (`fund_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族基金资金交易流水表';
