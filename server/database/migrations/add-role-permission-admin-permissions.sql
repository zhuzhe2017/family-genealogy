-- ============================================================
-- 迁移: 补充角色管理、权限管理、管理员管理相关权限
-- 说明: 用于已存在 sys_permission 表但缺少 system:role/permission/admin 权限的数据库
-- 幂等: INSERT IGNORE 避免重复执行时报错
-- ============================================================

USE `family_genealogy`;

-- 补充管理员管理权限
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('管理员查询', 'system:admin:list', 1),
('管理员新增', 'system:admin:create', 1),
('管理员编辑', 'system:admin:update', 1),
('管理员改密', 'system:admin:password', 1),
('管理员家族查询', 'system:admin:family', 1),
('管理员家族绑定', 'system:admin:bind-family', 1),
('管理员角色分配', 'system:admin:role', 1);

-- 补充角色管理权限
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('角色查询', 'system:role:list', 1),
('角色新增', 'system:role:create', 1),
('角色编辑', 'system:role:update', 1),
('角色删除', 'system:role:delete', 1);

-- 补充权限管理权限
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('权限查询', 'system:permission:list', 1),
('权限新增', 'system:permission:create', 1),
('权限编辑', 'system:permission:update', 1),
('权限删除', 'system:permission:delete', 1);

-- 将新增权限全部授予超级管理员角色
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:%';
