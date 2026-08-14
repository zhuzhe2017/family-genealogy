-- ============================================================
-- 迁移脚本：重建 family 表为「新设计」结构（对齐 schema.sql）
-- 背景：运行库 family 表停留在旧设计：
--   - id          varchar(32)（32位hex）  →  INT UNSIGNED AUTO_INCREMENT
--   - creator_id  varchar(32) NOT NULL    →  INT UNSIGNED DEFAULT NULL
--   - genealogy_ids json（新设计已废弃）    →  删除
--   - generation_table_id（新设计新增）     →  保留（由 add-family-generation-table-id.sql 添加）
-- 安全前提（已核实）：
--   - 现有 14 条 family 记录全部为 status=0 的软删除测试数据
--   - 所有关联表（family_member 等）均为空，无外键引用 family
-- 执行前请先备份数据库；本脚本为一次性重建，勿在生产库无备份时执行
-- ============================================================

USE `family_genealogy`;

-- 1. 重建 family 表
DROP TABLE IF EXISTS `family`;

CREATE TABLE `family` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '家族ID（自增整数）',
  `surname_id`    INT UNSIGNED  DEFAULT NULL COMMENT '姓氏ID（关联 surname 表）',
  `name`          VARCHAR(100)  NOT NULL COMMENT '家族名称',
  `logo`          VARCHAR(500)  DEFAULT '' COMMENT '家族LOGO',
  `founder`       VARCHAR(50)   DEFAULT '' COMMENT '始祖姓名',
  `origin`        VARCHAR(200)  DEFAULT '' COMMENT '发源地',
  `description`   TEXT          COMMENT '家族简介',
  `is_public`     TINYINT(1)    DEFAULT 1 COMMENT '是否公开 1-公开 0-私密',
  `allow_join`    TINYINT(1)    DEFAULT 1 COMMENT '是否允许加入 1-允许 0-禁止',
  `member_count`  INT UNSIGNED  DEFAULT 0 COMMENT '成员数量',
  `gen_count`     INT UNSIGNED  DEFAULT 0 COMMENT '代数',
  `generation_table_id` VARCHAR(32) DEFAULT NULL COMMENT '关联字辈表ID',
  `creator_id`    INT UNSIGNED  DEFAULT NULL COMMENT '创建者管理员ID',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_creator` (`creator_id`),
  INDEX `idx_name` (`name`),
  INDEX `idx_surname` (`surname_id`),
  CONSTRAINT `fk_family_surname` FOREIGN KEY (`surname_id`) REFERENCES `surname` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族表';
