-- ============================================================
-- 生产环境修复脚本：成员管理打不开
-- 适用：管理后台「成员管理」菜单点击无反应 / 提示无权访问
-- 说明：
--   1. 执行前请先备份数据库（宝塔 → 数据库 → 备份）
--   2. 所有语句均幂等，重复执行不会产生副作用
--   3. 全部选中后一次性执行即可；或用命令行导入：
--      mysql -u<用户> -p<密码> family_genealogy < fix-prod-member-perms.sql
--   4. 执行完成后：pm2 restart family-genealogy-server，并强刷浏览器（Ctrl+F5）
-- ============================================================

-- ------------------------------------------------------------
-- ① 修正成员管理菜单路由名
--    原 route_name='members'、component='mini-program_members'（少了 view. 前缀），
--    与前端路由名 mini-program_members 不一致，导致菜单点击路由无法匹配
-- ------------------------------------------------------------
UPDATE `sys_menu`
SET `route_name` = 'mini-program_members',
    `component` = 'view.mini-program_members'
WHERE `path` = '/mini-program/members'
  AND `name` = '成员管理';

-- ------------------------------------------------------------
-- ② 补充 family-member 权限码（缺失会导致接口 403 无权访问）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('家族成员查询', 'system:family-member:list', 1),
('家族成员新增', 'system:family-member:create', 1),
('家族成员编辑', 'system:family-member:update', 1),
('家族成员删除', 'system:family-member:delete', 1),
('家族成员导入', 'system:family-member:import', 1);

-- ------------------------------------------------------------
-- ③ 将上述权限授权给 super 角色（超级管理员）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:family-member:%';

-- ============================================================
-- 验证（以下 SELECT 结果供核对，可安全执行）
-- ============================================================

-- ① 菜单记录应显示 route_name = mini-program_members
SELECT `id`, `name`, `path`, `component`, `route_name`
FROM `sys_menu`
WHERE `path` = '/mini-program/members';

-- ② 权限码应显示 5 条
SELECT `id`, `name`, `code`, `status`
FROM `sys_permission`
WHERE `code` LIKE 'system:family-member:%';

-- ③ super 角色授权数应为 5
SELECT r.`code` AS role_code, COUNT(*) AS granted
FROM `sys_role_permission` rp
JOIN `sys_role` r ON r.`id` = rp.`role_id`
JOIN `sys_permission` p ON p.`id` = rp.`permission_id`
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:family-member:%'
GROUP BY r.`code`;
