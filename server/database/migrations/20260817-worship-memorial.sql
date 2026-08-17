-- ------------------------------------------------------------
-- 祭祀纪念对象表（纪念堂）：为家族已故成员创建线上纪念
-- 创建纪念消耗 worship_pro 额度；唯一约束防重复创建
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_worship_memorial` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`       INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `member_id`       VARCHAR(32)   NOT NULL COMMENT '成员ID（已故成员，family_member.id）',
  `member_name`     VARCHAR(50)   NOT NULL COMMENT '成员姓名（冗余快照）',
  `avatar_url`      VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '遗像URL',
  `epitaph`         VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '碑文/纪念寄语',
  `creator_user_id` VARCHAR(32)   NOT NULL COMMENT '创建人用户ID',
  `status`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_member` (`family_id`, `member_id`),
  INDEX `idx_family` (`family_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='祭祀纪念对象表';
