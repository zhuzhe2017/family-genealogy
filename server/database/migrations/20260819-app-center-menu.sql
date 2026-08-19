-- ============================================================
-- 迁移: 菜单结构调整 —— "应用插件" 提升为顶级菜单 "应用中心"
-- 说明:
--   1. 将 sys_menu 中 route_name='mini-program_plugin' 的记录升级为
--      顶级菜单(parent_id=0), 名称改为"应用中心"
--   2. 保留原权限码(system:app-plugin:list)、图标、状态等配置
--   3. sys_role_menu 以 menu_id 关联, 菜单 id 不变, 原有角色授权自动保留
-- 幂等: 可重复执行, 不产生重复数据
-- 注意: 全新环境请先执行 20260819-app-plugin.sql 再执行本脚本
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 升级原有"应用插件"菜单为顶级"应用中心"
--    若已被本脚本升级过(route_name 已变为 app-center), 则无匹配行, 无副作用
-- ------------------------------------------------------------
UPDATE `sys_menu`
SET `parent_id`  = 0,
    `name`       = '应用中心',
    `type`       = 'menu',
    `path`       = '/app-center',
    `component`  = 'layout.base$view.app-center',
    `route_name` = 'app-center',
    `icon`       = 'mdi:puzzle',
    `permission` = 'system:app-plugin:list',
    `sort_order` = 4,
    `status`     = 1,
    `visible`    = 1,
    `keep_alive` = 1
WHERE `route_name` = 'mini-program_plugin';

-- ------------------------------------------------------------
-- 2. 兜底: 若数据库中不存在"应用插件"旧菜单(全新环境直接执行本脚本),
--    则直接创建顶级"应用中心"菜单
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
SELECT 0, '应用中心', 'menu', '/app-center', 'layout.base$view.app-center', 'app-center', 'mdi:puzzle', 'system:app-plugin:list', 4, 1, 1, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sys_menu` WHERE `route_name` = 'app-center');

-- ------------------------------------------------------------
-- 3. 清理: 删除任何残留的旧嵌套"应用插件"菜单, 防止新旧并存
-- ------------------------------------------------------------
DELETE FROM `sys_menu` WHERE `route_name` = 'mini-program_plugin';

-- ------------------------------------------------------------
-- 4. 确保新菜单已授权给超级管理员角色(基于菜单 id, 幂等)
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'app-center';
