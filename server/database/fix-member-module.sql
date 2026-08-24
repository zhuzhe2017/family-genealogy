-- ============================================================
-- 修复脚本：管理后台「会员管理」菜单缺失
-- 适用：管理后台找不到「会员管理」菜单（应为系统管理 → 会员管理）
-- 原因：会员管理模块（表/权限/菜单）是后加入 schema.sql 的全新模块，
--       存量数据库不会自动补建，需执行本脚本补齐
-- 说明：
--   1. 执行前请先备份数据库（宝塔 → 数据库 → 备份）
--   2. 所有语句均幂等，重复执行不会产生副作用
--   3. 全部选中后一次性执行即可；或用命令行导入：
--      mysql -u<用户> -p<密码> family_genealogy < fix-member-module.sql
--   4. 执行完成后：pm2 restart family-genealogy-server，并强刷浏览器（Ctrl+F5）
-- ============================================================

-- ------------------------------------------------------------
-- ① 建会员模块数据表（IF NOT EXISTS，已存在则跳过）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `member_level` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '等级ID',
  `name`           VARCHAR(50)   NOT NULL COMMENT '等级名称',
  `code`           VARCHAR(30)   NOT NULL COMMENT '等级编码',
  `points_min`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '升级所需最低积分(含)',
  `points_max`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '积分上限(含)，0=不限',
  `discount_rate`  DECIMAL(5,2)  NOT NULL DEFAULT 1.00 COMMENT '消费折扣率(如 0.95 表示95折)',
  `sort_order`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '排序(越小越靠前)',
  `status`         TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-启用 0-停用',
  `remark`         VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_level_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员等级表';

CREATE TABLE IF NOT EXISTS `member` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '会员ID',
  `member_no`       VARCHAR(32)   NOT NULL COMMENT '会员编号',
  `name`            VARCHAR(50)   NOT NULL COMMENT '会员姓名',
  `phone`           VARCHAR(20)   DEFAULT NULL COMMENT '手机号(空则不参与唯一校验)',
  `user_id`         VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '关联用户ID(user.id,小程序端绑定的账户)',
  `gender`          TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '性别 0-未知 1-男 2-女',
  `birthday`        DATE          DEFAULT NULL COMMENT '生日',
  `level_id`        INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '会员等级ID',
  `points`          INT           NOT NULL DEFAULT 0 COMMENT '当前积分',
  `total_consume`   DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计消费金额(元)',
  `consume_count`   INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '累计消费次数',
  `status`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 0-停用',
  `remark`          VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_no` (`member_no`),
  UNIQUE KEY `uk_member_phone` (`phone`),
  UNIQUE KEY `uk_member_user` (`user_id`),
  INDEX `idx_member_level` (`level_id`),
  INDEX `idx_member_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员信息表';

CREATE TABLE IF NOT EXISTS `points_rule` (
  `id`                 INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  `name`               VARCHAR(50)   NOT NULL COMMENT '规则名称',
  `code`               VARCHAR(30)   NOT NULL COMMENT '规则编码',
  `points`             INT           NOT NULL DEFAULT 0 COMMENT '固定积分值(正奖励/负扣减)',
  `points_per_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '消费积分倍率(每消费1元得积分，仅消费规则使用)',
  `enabled`            TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用 1-是 0-否',
  `sort_order`         INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '排序',
  `remark`             VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分规则表';

CREATE TABLE IF NOT EXISTS `points_record` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `member_id`      INT UNSIGNED  NOT NULL COMMENT '会员ID',
  `change_points`  INT           NOT NULL COMMENT '变动积分(正增负减)',
  `balance_points` INT           NOT NULL DEFAULT 0 COMMENT '变动后积分余额',
  `biz_type`       VARCHAR(30)   NOT NULL DEFAULT '' COMMENT '业务类型 consume-消费 register-注册 signin-签到 adjust-人工调整 refund-退款退货',
  `source_id`      VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '来源业务ID(消费记录ID/订单号)',
  `remark`         VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '备注',
  `operator`       VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '操作人',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_points_member` (`member_id`, `create_time`),
  INDEX `idx_points_type` (`biz_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分变动记录表';

CREATE TABLE IF NOT EXISTS `member_consume` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `order_no`       VARCHAR(64)   NOT NULL COMMENT '订单号',
  `member_id`      INT UNSIGNED  NOT NULL COMMENT '会员ID',
  `consume_type`   VARCHAR(30)   NOT NULL DEFAULT '' COMMENT '消费类型 goods-商品 service-服务 recharge-充值 membership-会员续费 other-其他',
  `amount`         DECIMAL(12,2) NOT NULL COMMENT '消费金额(元)',
  `points_gained`  INT           NOT NULL DEFAULT 0 COMMENT '本次获得积分',
  `pay_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '消费时间',
  `status`         TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 0-已作废(退货)',
  `operator`       VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '录入人',
  `remark`         VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_consume_order_no` (`order_no`),
  INDEX `idx_consume_member` (`member_id`, `create_time`),
  INDEX `idx_consume_type` (`consume_type`),
  INDEX `idx_consume_pay_time` (`pay_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员消费记录表';

-- ------------------------------------------------------------
-- ② 会员等级 / 积分规则种子数据（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `member_level` (`name`, `code`, `points_min`, `points_max`, `discount_rate`, `sort_order`, `status`, `remark`) VALUES
('普通会员', 'normal',  0,      999,    1.00, 1, 1, '默认等级，0-999 积分'),
('银卡会员', 'silver',  1000,   4999,   0.98, 2, 1, '1000-4999 积分，98折'),
('金卡会员', 'gold',    5000,   19999,  0.95, 3, 1, '5000-19999 积分，95折'),
('钻石会员', 'diamond', 20000,  0,      0.90, 4, 1, '20000 积分及以上，9折');

INSERT IGNORE INTO `points_rule` (`name`, `code`, `points`, `points_per_amount`, `enabled`, `sort_order`, `remark`) VALUES
('消费得积分', 'consume',  0,    1.00, 1, 1, '每消费 1 元得 1 积分'),
('注册送积分', 'register', 100,  0.00, 1, 2, '新会员注册赠送 100 积分'),
('签到得积分', 'signin',   5,    0.00, 1, 3, '每日签到得 5 积分'),
('退款扣积分', 'refund',   0,    0.00, 1, 4, '退款退货时按原获得积分回扣');

-- ------------------------------------------------------------
-- ③ 会员管理权限码（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('会员查询', 'system:member:list', 1),
('会员新增', 'system:member:create', 1),
('会员编辑', 'system:member:update', 1),
('会员删除', 'system:member:delete', 1),
('会员导出', 'system:member:export', 1);

-- ------------------------------------------------------------
-- ④ 将会员权限授予 super 角色（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:member:%';

-- ------------------------------------------------------------
-- ⑤ 会员管理菜单（挂在「系统管理」目录下，幂等）
--    注意：sys_menu.route_name 无唯一索引，INSERT IGNORE 无法防重，
--    故采用「先修正已有行 → 不存在才插入」的方式，重复执行不会产生副作用
-- ------------------------------------------------------------
SET @system_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'system' LIMIT 1);

-- 修正已有行的父目录（覆盖旧版本脚本误挂到「家谱管理」的情况）
UPDATE `sys_menu`
SET `parent_id` = @system_dir
WHERE `route_name` = 'mini-program_member';

-- 菜单不存在时才插入
INSERT INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
SELECT @system_dir, '会员管理', 'menu', '/mini-program/member', 'view.mini-program_member', 'mini-program_member', 'mdi:card-account-details', 'system:member:list', 7, 1, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `sys_menu` WHERE `route_name` = 'mini-program_member');

-- ------------------------------------------------------------
-- ⑥ 将会员管理菜单授予 super 角色（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super'
  AND m.`route_name` = 'mini-program_member';

-- ============================================================
-- 验证（以下 SELECT 结果供核对，可安全执行）
-- ============================================================

-- ① 会员菜单应显示 1 条（route_name = mini-program_member）
SELECT `id`, `name`, `path`, `component`, `route_name`
FROM `sys_menu`
WHERE `route_name` = 'mini-program_member';

-- ② 权限码应显示 5 条
SELECT `id`, `name`, `code`, `status`
FROM `sys_permission`
WHERE `code` LIKE 'system:member:%';

-- ③ super 角色授权数应为 5
SELECT r.`code` AS role_code, COUNT(*) AS granted
FROM `sys_role_permission` rp
JOIN `sys_role` r ON r.`id` = rp.`role_id`
JOIN `sys_permission` p ON p.`id` = rp.`permission_id`
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:member:%'
GROUP BY r.`code`;

-- ④ 会员等级种子应为 4 条、积分规则应为 4 条
SELECT 'member_level' AS tbl, COUNT(*) AS cnt FROM `member_level`
UNION ALL
SELECT 'points_rule', COUNT(*) FROM `points_rule`;
