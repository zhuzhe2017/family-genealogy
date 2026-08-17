-- ============================================================
-- 迁移: 家族会员邀请功能
-- 幂等: INSERT IGNORE / IF NOT EXISTS / DROP IF EXISTS 谨慎使用
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 家族邀请记录表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_invitation` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '邀请ID',
  `family_id`       INT UNSIGNED  NOT NULL COMMENT '目标家族ID',
  `inviter_user_id` VARCHAR(32)   NOT NULL COMMENT '邀请人用户ID',
  `invitee_user_id` VARCHAR(32)   DEFAULT NULL COMMENT '被邀请人用户ID（已注册用户）',
  `invitee_phone`   VARCHAR(20)   DEFAULT '' COMMENT '被邀请人手机号（可选）',
  `invitee_email`   VARCHAR(100)  DEFAULT '' COMMENT '被邀请人邮箱（可选）',
  `invite_code`     VARCHAR(16)   NOT NULL COMMENT '邀请码（全局唯一，8-16位）',
  `invite_link`     VARCHAR(500)  DEFAULT '' COMMENT '邀请链接（小程序路径/URL）',
  `role`            VARCHAR(20)   DEFAULT 'member' COMMENT '邀请角色 member-普通会员 admin-家族管理员',
  `status`          TINYINT(1)    DEFAULT 1 COMMENT '状态 0-已失效 1-待接受 2-已接受 3-已拒绝 4-已过期',
  `expires_at`      DATETIME      NOT NULL COMMENT '过期时间',
  `accepted_at`     DATETIME      DEFAULT NULL COMMENT '接受时间',
  `rejected_at`     DATETIME      DEFAULT NULL COMMENT '拒绝时间',
  `processed_by`    VARCHAR(32)   DEFAULT NULL COMMENT '处理人用户ID',
  `remark`          VARCHAR(200)  DEFAULT '' COMMENT '备注/拒绝原因',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_code` (`invite_code`),
  INDEX `idx_family_id` (`family_id`),
  INDEX `idx_inviter_user_id` (`inviter_user_id`),
  INDEX `idx_invitee_user_id` (`invitee_user_id`),
  INDEX `idx_invitee_phone` (`invitee_phone`),
  INDEX `idx_status_expires` (`status`, `expires_at`),
  INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族邀请记录表';

-- ------------------------------------------------------------
-- 2. 家族成员角色等级表（用于邀请权限控制）
-- 扩展 user.family_id，增加当前用户在家族中的角色
-- ------------------------------------------------------------
ALTER TABLE `user`
  ADD COLUMN IF NOT EXISTS `family_role` VARCHAR(20) DEFAULT 'member' COMMENT '家族角色 member-普通会员 admin-家族管理员 creator-家族创建者' AFTER `member_id`;

-- ------------------------------------------------------------
-- 3. 后台管理权限与菜单
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('家族邀请查询', 'system:family-invitation:list', 1),
('家族邀请删除', 'system:family-invitation:delete', 1);

-- 将新增权限授予超级管理员角色
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:family-invitation:%';

-- 邀请管理菜单（挂在"小程序管理"目录下）
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);
INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
VALUES (@mini_program_dir, '家族邀请', 'menu', '/mini-program/family-invitation', 'view.mini-program_family-invitation', 'mini-program_family-invitation', 'mdi:email-send', 'system:family-invitation:list', 10, 1, 1, 1);

-- 将菜单授予超级管理员角色
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'mini-program_family-invitation';
