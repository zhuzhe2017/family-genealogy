-- ============================================================
-- 迁移: 应用插件注册表（应用中心动态应用）
-- 幂等: INSERT IGNORE / IF NOT EXISTS
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 应用插件注册表
--    应用中心「应用」分区从该表动态拉取,后续接入运势取名/照片翻新/电子罗盘等
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_plugin` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `code`            VARCHAR(64)   NOT NULL COMMENT '插件编码（唯一）',
  `name`            VARCHAR(64)   NOT NULL COMMENT '插件名称',
  `icon`            VARCHAR(255)  NOT NULL DEFAULT '' COMMENT '图标（emoji 或图片URL）',
  `description`     VARCHAR(255)  NOT NULL DEFAULT '' COMMENT '插件简介',
  `entry_type`      VARCHAR(16)   NOT NULL DEFAULT 'page' COMMENT '入口类型 page-小程序页面 url-外部H5链接',
  `entry_value`     VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '入口地址（小程序页面路径或H5链接）',
  `sort_order`      INT           NOT NULL DEFAULT 0 COMMENT '排序值（小在前）',
  `status`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-启用 0-停用',
  `creator_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '创建人用户ID',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  INDEX `idx_status_sort` (`status`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='应用插件注册表';

-- ------------------------------------------------------------
-- 2. 后台管理权限与菜单
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('应用插件查询', 'system:app-plugin:list', 1),
('应用插件新增', 'system:app-plugin:create', 1),
('应用插件编辑', 'system:app-plugin:update', 1),
('应用插件删除', 'system:app-plugin:delete', 1);

-- 将新增权限授予超级管理员角色
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:app-plugin:%';

-- 应用插件菜单（挂在"小程序管理"目录下）
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);
INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
VALUES (@mini_program_dir, '应用插件', 'menu', '/mini-program/plugin', 'view.mini-program_plugin', 'mini-program_plugin', 'mdi:puzzle', 'system:app-plugin:list', 12, 1, 1, 1);

-- 将菜单授予超级管理员角色
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'mini-program_plugin';
