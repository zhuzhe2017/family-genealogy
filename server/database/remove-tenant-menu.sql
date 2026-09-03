-- ============================================================
-- 数字家谱 - 移除「租户管理」菜单树迁移脚本（幂等）
-- 背景：web-admin 的「租户管理」页与「家谱管理→家族管理」页调用同一套
--       /family/* 接口，功能重复，已合并到家族管理页（含"恢复已删除"）。
-- 说明：该菜单树（route_name='tenant' 及其 tenant_* 子菜单）唯一消费者是
--       web-admin（dynamic 路由模式）；tenant-web 使用前端静态路由（登录走
--       /user/* 用户体系，无法通过 /route/getUserRoutes 的管理员鉴权），
--       不依赖此菜单树。
-- 适用：在已有数据库上删除 web-admin 中的重复「租户管理」菜单入口
-- 执行：mysql -u<用户> -p<密码> < remove-tenant-menu.sql
-- 注意：执行后需强刷浏览器（Ctrl+F5）重新拉取菜单
-- ============================================================

USE `family_genealogy`;

-- 1) 删除租户管理树的所有子菜单（parent_id 指向顶级租户菜单）
DELETE FROM `sys_menu`
WHERE `parent_id` IN (
  SELECT `id` FROM (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'tenant') AS tmp
);

-- 2) 防御性清理：route_name 以 tenant_ 开头的孤儿子菜单（_ 需转义）
DELETE FROM `sys_menu`
WHERE `route_name` LIKE 'tenant\\_%' ESCAPE '\\';

-- 3) 删除顶级租户菜单
DELETE FROM `sys_menu`
WHERE `route_name` = 'tenant';
