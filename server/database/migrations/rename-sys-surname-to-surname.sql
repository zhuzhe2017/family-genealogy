-- ============================================================
-- 迁移脚本：系统姓氏表 → 姓氏表（模块从「系统管理」迁移至「小程序管理」）
-- 执行前请先备份数据库；本脚本幂等，可重复执行
-- ============================================================

-- 1. 重命名数据表 sys_surname → surname（如尚未重命名）
--    表注释同步由「系统姓氏表」更新为「姓氏表」
SET @has_old_table := (SELECT COUNT(*) FROM information_schema.tables
                       WHERE table_schema = DATABASE() AND table_name = 'sys_surname');
SET @has_new_table := (SELECT COUNT(*) FROM information_schema.tables
                       WHERE table_schema = DATABASE() AND table_name = 'surname');
SET @rename_sql := IF(@has_old_table = 1 AND @has_new_table = 0,
                      'RENAME TABLE `sys_surname` TO `surname`',
                      'SELECT \'sys_surname already renamed or surname already exists\' AS msg');
PREPARE stmt FROM @rename_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 同步更新表注释
ALTER TABLE `surname` COMMENT = '姓氏表';

-- 2. 迁移菜单记录：将「姓氏管理」从系统管理目录移至小程序管理目录
--    并更新路由路径 /system/surname → /mini-program/surname
--    及 component / route_name 由 system_surname → mini-program_surname
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);
UPDATE `sys_menu`
SET `parent_id` = @mini_program_dir,
    `path`      = '/mini-program/surname',
    `component` = 'view.mini-program_surname',
    `route_name`= 'mini-program_surname',
    `sort_order`= 6
WHERE `route_name` = 'system_surname' OR `route_name` = 'mini-program_surname'
  AND `name` = '姓氏管理';

-- 注：权限码 system:surname:* 保持不变，与小程序模块下家族管理(system:family:*)约定一致
--     super 角色授权逻辑 sys_role_permission 按 p.code LIKE 'system:%' 自动覆盖，无需调整
