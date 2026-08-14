-- ============================================================
-- 迁移脚本：重构字辈表数据模型
-- 1. 删除旧 family_generation 表（按家族存储的逐代字辈模型）
-- 2. 创建新 generation_table 表（姓氏级字辈序列参考，按 姓氏+始祖 唯一）
-- 3. 种子化字辈管理权限码与菜单
-- 执行前请备份数据库；本脚本幂等，可重复执行
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 删除旧 family_generation 表（数据随表一并移除）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `family_generation`;

-- ------------------------------------------------------------
-- 2. 创建新 generation_table 表（如不存在）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `generation_table` (
  `id`                   VARCHAR(32)   NOT NULL COMMENT '字辈表ID（32位hex）',
  `surname`              VARCHAR(20)   NOT NULL COMMENT '姓氏（1-4汉字或1-20非空白字符，兼容单姓/复姓/少数民族）',
  `founder`              VARCHAR(60)   NOT NULL COMMENT '始祖/支系名（1-20汉字）',
  `generation_sequence`  JSON          NOT NULL COMMENT '字辈序列JSON：字符串数组，每代为1-20个汉字，同代多字可用空格或逗号分隔（诗句模式）',
  `common_regions`       JSON          NOT NULL COMMENT '常见区域JSON数组（≥1项）',
  `create_by`            VARCHAR(50)   DEFAULT '' COMMENT '创建人',
  `status`               TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
  `create_time`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_surname_founder` (`surname`, `founder`),
  INDEX `idx_surname` (`surname`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字辈表';

-- ------------------------------------------------------------
-- 3. 字辈管理权限码（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('字辈查询', 'system:generation-table:list', 1),
('字辈新增', 'system:generation-table:create', 1),
('字辈编辑', 'system:generation-table:update', 1),
('字辈删除', 'system:generation-table:delete', 1),
('字辈批量导入', 'system:generation-table:import', 1),
('字辈状态切换', 'system:generation-table:status', 1);

-- 将字辈权限授予超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:generation-table:%';

-- ------------------------------------------------------------
-- 4. 清理历史遗留的孤儿菜单（幂等）
--    旧版可能存在 route_name='mini-program_genealogy' 的菜单，
--    其对应前端视图从未实现，点击会触发 vue-router "No match" 错误。
--    此处统一清理该菜单及其角色关联，避免运行时报错。
-- ------------------------------------------------------------
DELETE FROM `sys_role_menu`
WHERE `menu_id` IN (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program_genealogy');
DELETE FROM `sys_menu` WHERE `route_name` = 'mini-program_genealogy';

-- ------------------------------------------------------------
-- 5. 字辈管理菜单（幂等：按 route_name 去重）
-- ------------------------------------------------------------
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);

-- 若旧 family_generation 相关菜单存在则无需保留（旧表已删除）
INSERT IGNORE INTO `sys_menu`
  (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
VALUES
  (@mini_program_dir, '字辈管理', 'menu', '/mini-program/generation-table', 'view.mini-program_generation-table', 'mini-program_generation-table', '', 'system:generation-table:list', 7, 1, 1, 1);

-- 将字辈菜单授权给超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'mini-program_generation-table';
