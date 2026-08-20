-- ============================================================
-- 迁移: 宗亲聚会管理系统
-- 幂等: INSERT IGNORE / IF NOT EXISTS
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 聚会主表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_gathering` (
  `id`                INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`         INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `title`             VARCHAR(100)  NOT NULL COMMENT '聚会名称',
  `description`       TEXT          COMMENT '聚会介绍',
  `cover_image`       VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '封面图URL',
  `location`          VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '聚会地点(简)',
  `address_detail`    VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '详细地址',
  `start_time`        DATETIME      DEFAULT NULL COMMENT '开始时间',
  `end_time`          DATETIME      DEFAULT NULL COMMENT '结束时间',
  `signup_deadline`   DATETIME      DEFAULT NULL COMMENT '报名截止时间(空=截止到开始前)',
  `agenda`            TEXT          COMMENT '议程(JSON数组 [{time,item,remark}])',
  `capacity`          INT           NOT NULL DEFAULT 0 COMMENT '总人数上限(0=不限)',
  `status`            TINYINT       NOT NULL DEFAULT 0 COMMENT '状态 0-草稿 1-已发布 2-进行中 3-已结束 4-已归档',
  `organizer_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '组织者用户ID(创建人)',
  `create_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family_status` (`family_id`, `status`, `start_time`),
  INDEX `idx_organizer` (`organizer_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会主表';

-- ------------------------------------------------------------
-- 2. 聚会场次/时间段表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_gathering_session` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `gathering_id` INT UNSIGNED NOT NULL COMMENT '聚会ID',
  `name`         VARCHAR(100) NOT NULL DEFAULT '' COMMENT '场次/时间段名称(如:上午场)',
  `start_time`   DATETIME     DEFAULT NULL COMMENT '场次开始时间',
  `end_time`     DATETIME     DEFAULT NULL COMMENT '场次结束时间',
  `capacity`     INT          NOT NULL DEFAULT 0 COMMENT '本场人数上限(0=不限)',
  `signed_count` INT          NOT NULL DEFAULT 0 COMMENT '已报名人数',
  `create_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_gathering` (`gathering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会场次/时间段表';

-- ------------------------------------------------------------
-- 3. 报名登记表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_gathering_registration` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `gathering_id`  INT UNSIGNED  NOT NULL COMMENT '聚会ID',
  `session_id`    INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '场次ID(0=不选场次)',
  `user_id`       VARCHAR(32)   NOT NULL COMMENT '报名用户ID',
  `member_id`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '关联家族成员ID(0=未关联)',
  `name`          VARCHAR(50)   NOT NULL COMMENT '参会人姓名',
  `phone`         VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '联系电话',
  `diet_type`     VARCHAR(20)   NOT NULL DEFAULT 'normal' COMMENT '饮食偏好 normal-无要求 vegetarian-素食 halal-清真 custom-其他',
  `diet_note`     VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '饮食备注',
  `special_need`  VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '特殊需求',
  `guest_count`   INT           NOT NULL DEFAULT 0 COMMENT '随行人数',
  `status`        TINYINT       NOT NULL DEFAULT 1 COMMENT '状态 1-已报名 2-已取消 3-已签到',
  `checkin_code`  VARCHAR(6)    NOT NULL DEFAULT '' COMMENT '签到码(6位数字)',
  `checkin_time`  DATETIME      DEFAULT NULL COMMENT '签到时间',
  `checkin_method` VARCHAR(10)  NOT NULL DEFAULT '' COMMENT '签到方式 qr-扫码 manual-手动输入',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_gathering_session` (`gathering_id`, `session_id`),
  INDEX `idx_user_gathering` (`user_id`, `gathering_id`),
  INDEX `idx_checkin_code` (`checkin_code`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会报名登记表';

-- ------------------------------------------------------------
-- 4. 聚会资料归档表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_gathering_archive` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `gathering_id`     INT UNSIGNED  NOT NULL COMMENT '聚会ID',
  `title`            VARCHAR(200)  NOT NULL COMMENT '资料标题',
  `file_url`         VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '文件/图片URL',
  `file_type`        VARCHAR(20)   NOT NULL DEFAULT 'image' COMMENT '类型 image-图片 file-文件 link-链接',
  `description`      VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '说明',
  `creator_user_id`  VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '上传人用户ID',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_gathering` (`gathering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会资料归档表';

-- ------------------------------------------------------------
-- 5. 后台管理权限与菜单
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('宗亲聚会查询', 'system:gathering:list', 1),
('宗亲聚会新增', 'system:gathering:create', 1),
('宗亲聚会编辑', 'system:gathering:update', 1),
('宗亲聚会删除', 'system:gathering:delete', 1);

-- 将新增权限授予超级管理员角色
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:gathering:%';

-- 宗亲聚会菜单（挂在"小程序管理"目录下）
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);
INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
VALUES (@mini_program_dir, '宗亲聚会', 'menu', '/mini-program/gathering', 'view.mini-program_gathering', 'mini-program_gathering', 'mdi:account-group', 'system:gathering:list', 12, 1, 1, 1);

-- 将菜单授予超级管理员角色
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'mini-program_gathering';
