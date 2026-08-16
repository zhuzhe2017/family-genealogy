-- ============================================================
-- 迁移: 会员/VIP 管理后台（订阅管理）
-- 新增: system:subscription:list/create/update 权限 + 订阅管理菜单
-- 幂等: INSERT IGNORE 避免重复执行时报错
-- ============================================================

USE `family_genealogy`;

-- 订阅管理权限
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('订阅查询', 'system:subscription:list', 1),
('套餐新增', 'system:subscription:create', 1),
('订阅更新', 'system:subscription:update', 1);

-- 将新增权限授予超级管理员角色
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:subscription:%';

-- 订阅管理菜单（挂在"家谱管理"目录下）
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);
INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
VALUES (@mini_program_dir, '订阅管理', 'menu', '/mini-program/subscription', 'view.mini-program_subscription', 'mini-program_subscription', 'mdi:crown-outline', 'system:subscription:list', 8, 1, 1, 1);

-- 将菜单授予超级管理员角色
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'mini-program_subscription';
