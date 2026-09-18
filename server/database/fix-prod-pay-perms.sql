-- ============================================================
-- 生产环境修复脚本：支付配置打开提示无权限
-- 适用：管理后台「系统设置 → 支付配置」Tab 显示 403「暂无访问权限」
-- 原因：支付配置权限（system:settings:pay:list/update）仅写入 schema.sql（新库），
--       存量生产库未包含这两条权限，super 角色拿不到 → 前端 hasAuth 校验失败
-- 说明：
--   1. 执行前请先备份数据库（宝塔 → 数据库 → 备份）
--   2. 所有语句均幂等，重复执行不会产生副作用
--   3. 全部选中后一次性执行即可；或用命令行导入：
--      mysql -u<用户> -p<密码> family_genealogy < fix-prod-pay-perms.sql
--   4. 执行完成后：pm2 restart family-genealogy-server，并强刷浏览器（Ctrl+F5）
-- ============================================================

-- ------------------------------------------------------------
-- ① 补充支付配置权限码（缺失会导致接口 403 无权访问）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('支付配置查询', 'system:settings:pay:list', 1),
('支付配置编辑', 'system:settings:pay:update', 1);

-- ------------------------------------------------------------
-- ② 将上述权限授权给 super 角色（超级管理员）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:settings:pay:%';

-- ============================================================
-- 验证（以下 SELECT 结果供核对，可安全执行）
-- ============================================================

-- ① 权限码应显示 2 条
SELECT `id`, `name`, `code`, `status`
FROM `sys_permission`
WHERE `code` LIKE 'system:settings:pay:%';

-- ② super 角色授权数应为 2
SELECT r.`code` AS role_code, COUNT(*) AS granted
FROM `sys_role_permission` rp
JOIN `sys_role` r ON r.`id` = rp.`role_id`
JOIN `sys_permission` p ON p.`id` = rp.`permission_id`
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:settings:pay:%'
GROUP BY r.`code`;
