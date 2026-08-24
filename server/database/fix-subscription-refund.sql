-- ============================================================
-- 修复：后台订阅退款权限码（P1-2）
-- 背景：后台订单退款接口（POST /api/subscription/orders/refund）
--       使用权限码 system:subscription:refund，存量库需补齐
-- 说明：全部幂等，可安全重复执行
-- ============================================================

-- ① 插入退款权限码（幂等）
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('订阅退款', 'system:subscription:refund', 1);

-- ② 授予 super 角色（幂等）
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` = 'system:subscription:refund';

-- ============================================================
-- 验证
-- ============================================================

-- ① 权限码应显示 1 条
SELECT `id`, `name`, `code`, `status`
FROM `sys_permission`
WHERE `code` = 'system:subscription:refund';

-- ② super 角色授权数应为 1
SELECT r.`code` AS role_code, COUNT(*) AS granted
FROM `sys_role_permission` rp
JOIN `sys_role` r ON r.`id` = rp.`role_id`
JOIN `sys_permission` p ON p.`id` = rp.`permission_id`
WHERE r.`code` = 'super' AND p.`code` = 'system:subscription:refund'
GROUP BY r.`code`;
