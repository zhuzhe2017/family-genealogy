-- ============================================================
-- 修复脚本：sys_menu.route_name 加唯一索引
-- 目的：防止菜单重复插入（route_name 无唯一索引时 INSERT IGNORE 防不住重）
-- 说明：幂等；执行前建议备份；适用于存量库（新库已由 schema.sql 内置）
-- ============================================================

-- ① 清理 route_name 重复行（保留 id 最小的一行，幂等：无重复则不删）
DELETE m1 FROM `sys_menu` m1
JOIN `sys_menu` m2 ON m1.`route_name` = m2.`route_name` AND m1.`id` > m2.`id`
WHERE m1.`route_name` <> '';

-- ② 加唯一索引（幂等：已存在则跳过）
ALTER TABLE `sys_menu`
  ADD UNIQUE KEY `uk_menu_route_name` (`route_name`);

-- ============================================================
-- 验证
-- ============================================================
SHOW INDEX FROM `sys_menu` WHERE Key_name = 'uk_menu_route_name';
SELECT `route_name`, COUNT(*) AS cnt FROM `sys_menu` WHERE `route_name` <> '' GROUP BY `route_name` HAVING cnt > 1;
