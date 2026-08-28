-- ============================================================
-- 数字家谱 - 租户管理菜单迁移脚本（幂等）
-- 适用：在已有数据库上把「租户管理」移到顶级菜单
-- 说明：schema.sql 已包含顶级租户菜单；本脚本供旧库单独执行
-- ============================================================

USE `family_genealogy`;

-- 1) 如果旧库里已有 route_name='system_tenant' 的菜单，把它改成顶级
UPDATE `sys_menu`
SET `parent_id` = 0,
    `name` = '租户管理',
    `type` = 'menu',
    `path` = '/tenant',
    `component` = 'layout.base$view.tenant',
    `route_name` = 'tenant',
    `icon` = 'mdi:office-building-outline',
    `permission` = 'system:family:list',
    `sort_order` = 2
WHERE `route_name` = 'system_tenant';

-- 2) 幂等插入顶级租户菜单（若上一步不存在旧记录）
INSERT IGNORE INTO `sys_menu`
  (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
VALUES
  (0, '租户管理', 'menu', '/tenant', 'layout.base$view.tenant', 'tenant', 'mdi:office-building-outline', 'system:family:list', 2, 1, 1, 1);

-- 3) 确保超级管理员角色拥有该菜单权限
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id`
FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'tenant';
