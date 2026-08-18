-- ============================================================
-- 迁移: 家族广告轮播功能
-- 幂等: INSERT IGNORE / IF NOT EXISTS / DROP IF EXISTS 谨慎使用
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 家族广告轮播表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_banner` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`       INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '家族ID（0=全局广告，对所有家族展示）',
  `title`           VARCHAR(100)  NOT NULL COMMENT '广告标题',
  `image_url`       VARCHAR(500)  NOT NULL COMMENT '广告图片URL',
  `link_type`       VARCHAR(20)   NOT NULL DEFAULT 'none' COMMENT '跳转类型 none-无 page-小程序页面 url-外部链接',
  `link_url`        VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '跳转地址（小程序页面路径或外部链接）',
  `sort_order`      INT           NOT NULL DEFAULT 0 COMMENT '排序值（小在前）',
  `status`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-启用 0-停用',
  `start_time`      DATETIME      DEFAULT NULL COMMENT '生效时间（空=立即生效）',
  `end_time`        DATETIME      DEFAULT NULL COMMENT '失效时间（空=永久有效）',
  `creator_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '创建人用户ID',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family_status` (`family_id`, `status`, `sort_order`),
  INDEX `idx_time_range` (`start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族广告轮播表';

-- ------------------------------------------------------------
-- 2. 轮播切换时间全局配置（毫秒，默认 3000）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_config` (`config_key`, `config_name`, `config_value`, `value_type`, `group`, `remark`, `sort_order`, `status`, `is_system`)
VALUES ('banner_interval', '轮播图切换时间(毫秒)', '3000', 'number', 'basic', '小程序首页广告轮播自动切换间隔，单位毫秒，默认 3000', 40, 1, 0);

-- ------------------------------------------------------------
-- 3. 后台管理权限与菜单
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('广告轮播查询', 'system:family-banner:list', 1),
('广告轮播新增', 'system:family-banner:create', 1),
('广告轮播编辑', 'system:family-banner:update', 1),
('广告轮播删除', 'system:family-banner:delete', 1);

-- 将新增权限授予超级管理员角色
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:family-banner:%';

-- 广告轮播菜单（挂在"小程序管理"目录下）
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);
INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
VALUES (@mini_program_dir, '广告轮播', 'menu', '/mini-program/banner', 'view.mini-program_banner', 'mini-program_banner', 'mdi:image-carousel', 'system:family-banner:list', 11, 1, 1, 1);

-- 将菜单授予超级管理员角色
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'mini-program_banner';
