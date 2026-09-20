-- 家谱成书输出制作模块表结构
-- 用于存储家谱成书配置与辅助文案

CREATE TABLE IF NOT EXISTS `genealogy_book` (
  `id`                    INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `family_id`             INT UNSIGNED  NOT NULL COMMENT '所属家族ID',
  `title`                 VARCHAR(100)  NOT NULL COMMENT '家谱书名',
  `subtitle`              VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '副标题',
  `template`              VARCHAR(20)   NOT NULL DEFAULT 'european' COMMENT '模板类型：european-欧式 su_style-苏式 modern-现代 classical-古典',
  `preface`               TEXT          COMMENT '序言',
  `introduction`          TEXT          COMMENT '家族简介',
  `clan_rules`            TEXT          COMMENT '家训',
  `generation_poem`       TEXT          COMMENT '字辈诗',
  `appendix`              TEXT          COMMENT '附录',
  `cover_style`           VARCHAR(20)   NOT NULL DEFAULT 'default' COMMENT '封面样式',
  `font_family`           VARCHAR(20)   NOT NULL DEFAULT 'serif' COMMENT '正文字体：serif-宋体 sans-黑体 kai-楷体',
  `paper_size`            VARCHAR(10)   NOT NULL DEFAULT 'A4' COMMENT '纸张大小：A4 A3 16K',
  `include_generation_table` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否包含字辈表 1-是 0-否',
  `include_member_bio`    TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否包含成员简介 1-是 0-否',
  `include_tree_chart`    TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否包含世系图 1-是 0-否',
  `include_index`         TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否包含索引目录 1-是 0-否',
  `sort_order`            INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '排序号',
  `status`                TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-启用 0-停用',
  `create_by`             VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '创建人',
  `create_time`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family_id` (`family_id`),
  INDEX `idx_status` (`status`),
  UNIQUE KEY `uk_family_title` (`family_id`, `title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家谱成书配置表';

-- ------------------------------------------------------------
-- ② 家谱成书模块权限码（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('家谱成书查询', 'system:genealogy-book:list', 1),
('家谱成书新增', 'system:genealogy-book:create', 1),
('家谱成书编辑', 'system:genealogy-book:update', 1),
('家谱成书删除', 'system:genealogy-book:delete', 1),
('家谱成书导出', 'system:genealogy-book:export', 1);

-- ------------------------------------------------------------
-- ③ 将家谱成书权限授予 super 角色（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:genealogy-book:%';

-- ------------------------------------------------------------
-- ④ 家谱成书菜单（挂在「小程序管理」目录下，幂等）
--    注意：sys_menu.route_name 无唯一索引，INSERT IGNORE 无法防重，
--    故采用「先修正已有行 → 不存在才插入」的方式，重复执行不会产生副作用
-- ------------------------------------------------------------
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);

-- 修正已有行的父目录（防止误挂到其他目录）
UPDATE `sys_menu`
SET `parent_id` = @mini_program_dir
WHERE `route_name` = 'mini-program_genealogy-book';

-- 菜单不存在时才插入（sort_order 取 13，排在宗亲聚会之后）
INSERT INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
SELECT @mini_program_dir, '家谱成书', 'menu', '/mini-program/genealogy-book', 'view.mini-program_genealogy-book', 'mini-program_genealogy-book', 'mdi:book-open-page-variant', 'system:genealogy-book:list', 13, 1, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `sys_menu` WHERE `route_name` = 'mini-program_genealogy-book');

-- ------------------------------------------------------------
-- ⑤ 将家谱成书菜单授予 super 角色（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super'
  AND m.`route_name` = 'mini-program_genealogy-book';

-- ============================================================
-- 验证（以下 SELECT 结果供核对，可安全执行）
-- ============================================================

-- ① 家谱成书菜单应显示 1 条（route_name = mini-program_genealogy-book）
SELECT `id`, `name`, `path`, `component`, `route_name`
FROM `sys_menu`
WHERE `route_name` = 'mini-program_genealogy-book';

-- ② 权限码应显示 5 条
SELECT `id`, `name`, `code`, `status`
FROM `sys_permission`
WHERE `code` LIKE 'system:genealogy-book:%';

-- ③ super 角色授权数应为 5
SELECT r.`code` AS role_code, COUNT(*) AS granted
FROM `sys_role_permission` rp
JOIN `sys_role` r ON r.`id` = rp.`role_id`
JOIN `sys_permission` p ON p.`id` = rp.`permission_id`
WHERE r.`code` = 'super'
  AND p.`code` LIKE 'system:genealogy-book:%'
GROUP BY r.`code`;
