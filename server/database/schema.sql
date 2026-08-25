-- ============================================================
-- 数字家谱 - 数据库结构定义
-- 数据库类型: MySQL / MariaDB（5.7.22+ / 8.0）
-- 说明: 2026-08-21 起为完整主库升级脚本，已合并原 migrations/*.sql
--       全部内容，原迁移文件已删除，合并明细见 MIGRATIONS.md / MERGE_LOG.md
-- ============================================================

CREATE DATABASE IF NOT EXISTS `family_genealogy`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 用户表
-- ------------------------------------------------------------
CREATE TABLE `user` (
  `id`          VARCHAR(32)   NOT NULL COMMENT '用户ID',
  `nickname`    VARCHAR(50)   NOT NULL COMMENT '昵称',
  `avatar_url`  VARCHAR(500)  DEFAULT '' COMMENT '头像URL',
  `phone`       VARCHAR(20)   DEFAULT '' COMMENT '手机号',
  `password`    VARCHAR(200)  DEFAULT '' COMMENT '密码hash',
  `gender`      TINYINT(1)    DEFAULT 0 COMMENT '性别 0-未知 1-男 2-女',
  `openid`      VARCHAR(64)   DEFAULT '' COMMENT '微信openid',
  `unionid`     VARCHAR(64)   DEFAULT '' COMMENT '微信unionid',
  `family_id`   INT UNSIGNED  DEFAULT NULL COMMENT '关联家族支系ID（会员所属家族支系，family.id）',
  `member_id`   VARCHAR(32)   DEFAULT '' COMMENT '关联成员ID（会员与家族成员的绑定关系，family_members_{familyId}.id）',
  `family_role` VARCHAR(20)   DEFAULT 'member' COMMENT '家族角色 member-普通会员 admin-家族管理员 creator-家族创建者',
  `share_code`  VARCHAR(16)   DEFAULT NULL COMMENT '分享码（家族邀请/加入，全局唯一，仅已入族会员持有）',
  `status`      TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-禁用',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_openid` (`openid`),
  INDEX `idx_phone` (`phone`),
  INDEX `idx_user_family_id` (`family_id`),
  INDEX `idx_user_member_id` (`member_id`),
  UNIQUE INDEX `uk_user_share_code` (`share_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ------------------------------------------------------------
-- 1.1 用户认证绑定表（多端账号统一：一个账户可绑定多种登录凭证）
-- provider: wechat(微信)/phone(手机号)/email/apple/google...
-- 跨端互通: 微信小程序与APP通过 unionid 合并到同一 user_id
-- ------------------------------------------------------------
CREATE TABLE `user_auth_identity` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `user_id`      VARCHAR(32)   NOT NULL COMMENT '账户ID(业务数据统一归属)',
  `provider`     VARCHAR(32)   NOT NULL COMMENT '认证提供方: wechat/phone/email/apple/google',
  `provider_uid` VARCHAR(64)   NOT NULL COMMENT '提供方唯一标识: 微信openid/手机号/邮箱/第三方sub',
  `unionid`      VARCHAR(64)   DEFAULT '' COMMENT '微信unionid(仅provider=wechat,用于跨appid合并)',
  `extra`        JSON          DEFAULT NULL COMMENT '扩展信息(JSON)',
  `status`       TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已解绑(解绑建议直接删除)',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_uid` (`provider`, `provider_uid`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_unionid` (`unionid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户认证绑定表';

-- ------------------------------------------------------------
-- 1.2 用户短信验证码表（手机号验证码登录/绑定）
-- 验证码存 SHA-256 哈希,短时效一次性;attempts 控制暴力尝试
-- ------------------------------------------------------------
CREATE TABLE `user_sms_code` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `phone`       VARCHAR(20)   NOT NULL COMMENT '手机号',
  `scene`       VARCHAR(20)   NOT NULL DEFAULT 'login' COMMENT '场景: login-登录 bind-绑定',
  `code_hash`   VARCHAR(64)   NOT NULL COMMENT '验证码SHA-256哈希',
  `expires_at`  DATETIME      NOT NULL COMMENT '过期时间',
  `attempts`    TINYINT(2)    DEFAULT 0 COMMENT '已尝试次数(>=5 自动作废)',
  `used`        TINYINT(1)    DEFAULT 0 COMMENT '是否已使用 1-是 0-否',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_phone_scene` (`phone`, `scene`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户短信验证码表';

-- ------------------------------------------------------------
-- 2. 姓氏表（在 family 表之前创建,供 fk_family_surname 引用）
-- ------------------------------------------------------------
CREATE TABLE `surname` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `surname`       VARCHAR(10)   NOT NULL COMMENT '姓氏',
  `pinyin`        VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '拼音',
  `initial`       VARCHAR(1)    NOT NULL DEFAULT '' COMMENT '拼音首字母',
  `ranking`       INT UNSIGNED  DEFAULT 0 COMMENT '百家姓排名',
  `totem`         VARCHAR(500)  DEFAULT '' COMMENT '姓氏图腾图片URL',
  `origin`        VARCHAR(500)  DEFAULT '' COMMENT '姓氏起源',
  `population`    INT UNSIGNED  DEFAULT 0 COMMENT '人口数量',
  `description`   TEXT          DEFAULT NULL COMMENT '详细描述',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
  `create_by`     VARCHAR(50)   DEFAULT '' COMMENT '创建人',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_surname` (`surname`),
  INDEX `idx_initial` (`initial`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='姓氏表';

-- ------------------------------------------------------------
-- 3. 家族表
-- ------------------------------------------------------------
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
  `seed_share_code` VARCHAR(16) DEFAULT NULL COMMENT '家族种子分享码（全局唯一，创建家族时自动生成，用于新成员加入）',
  `member_count`  INT UNSIGNED  DEFAULT 0 COMMENT '成员数量',
  `gen_count`     INT UNSIGNED  DEFAULT 0 COMMENT '代数',
  `generation_table_id` VARCHAR(32) DEFAULT NULL COMMENT '关联字辈表ID',
  `creator_id`    INT UNSIGNED  DEFAULT NULL COMMENT '创建者管理员ID',
  `creator_user_id` VARCHAR(32) DEFAULT NULL COMMENT '创建者用户ID（小程序用户，32位hex）',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_creator` (`creator_id`),
  INDEX `idx_creator_user` (`creator_user_id`),
  INDEX `idx_name` (`name`),
  INDEX `idx_surname` (`surname_id`),
  UNIQUE INDEX `uk_family_seed_share_code` (`seed_share_code`),
  CONSTRAINT `fk_family_surname` FOREIGN KEY (`surname_id`) REFERENCES `surname` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族表';

-- ------------------------------------------------------------
-- 3. 字辈表（姓氏级字辈序列参考，按 姓氏+始祖/支系 唯一）
-- ------------------------------------------------------------
CREATE TABLE `generation_table` (
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
-- 4. 家族成员表
-- ------------------------------------------------------------
CREATE TABLE `family_member` (
  `id`            VARCHAR(32)   NOT NULL COMMENT '成员ID',
  `family_id`     INT UNSIGNED  NOT NULL COMMENT '所属家族ID',
  `name`          VARCHAR(50)   NOT NULL COMMENT '姓名',
  `gender`        VARCHAR(10)   NOT NULL DEFAULT 'male' COMMENT '性别 male-男 female-女',
  `generation`    INT UNSIGNED  NOT NULL DEFAULT 1 COMMENT '辈分/代数',
  `generation_name` VARCHAR(10)  DEFAULT '' COMMENT '字辈（如国、运、登、朝）',
  `birth_date`    VARCHAR(30)   DEFAULT '' COMMENT '出生日期',
  `birth_place`   VARCHAR(200)  DEFAULT '' COMMENT '出生地',
  `is_alive`      TINYINT(1)    DEFAULT 1 COMMENT '是否在世 1-在世 0-已故',
  `death_date`    VARCHAR(30)   DEFAULT '' COMMENT '逝世日期',
  `death_place`   VARCHAR(200)  DEFAULT '' COMMENT '墓茔/安葬地点',
  `longitude`     DECIMAL(10, 7) DEFAULT NULL COMMENT '墓茔经度',
  `latitude`      DECIMAL(10, 7) DEFAULT NULL COMMENT '墓茔纬度',
  `bio`           TEXT          COMMENT '生平简介',
  `avatar_url`    VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '头像URL（/uploads/xxx 或 http(s) 完整地址，最多500字符）',
  `father_id`     VARCHAR(32)   DEFAULT '' COMMENT '父亲成员ID',
  `mother_id`     INT           NOT NULL DEFAULT 0 COMMENT '母亲在父亲配偶信息数组中的序号（rank）',
  `spouse_info`   JSON          DEFAULT NULL COMMENT '配偶信息JSON数组：[{name,birthDate,rank,bio,deathDate,deathPlace,longitude,latitude}]',
  `sort_order`    INT UNSIGNED  DEFAULT 0 COMMENT '排序(同辈中长幼)',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family_id` (`family_id`),
  INDEX `idx_father` (`father_id`),
  INDEX `idx_mother` (`mother_id`),
  INDEX `idx_generation` (`family_id`, `generation`),
  INDEX `idx_name` (`family_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族成员表';

-- ------------------------------------------------------------
-- 5. 成员照片关联表
-- ------------------------------------------------------------
CREATE TABLE `family_member_photo` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `member_id`   VARCHAR(32)   NOT NULL COMMENT '成员ID',
  `photo_url`   VARCHAR(500)  NOT NULL COMMENT '照片URL',
  `sort_order`  INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成员照片关联表';

-- ------------------------------------------------------------
-- 6. 相册分类表
-- ------------------------------------------------------------
CREATE TABLE `family_album_category` (
  `id`          VARCHAR(32)   NOT NULL COMMENT '分类ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `name`        VARCHAR(50)   NOT NULL COMMENT '分类名称',
  `icon`        VARCHAR(20)   DEFAULT '' COMMENT '图标',
  `sort_order`  INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='相册分类表';

-- ------------------------------------------------------------
-- 7. 照片表
-- ------------------------------------------------------------
CREATE TABLE `family_photo` (
  `id`           VARCHAR(32)   NOT NULL COMMENT '照片ID',
  `family_id`    INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `category_id`  VARCHAR(32)   DEFAULT '' COMMENT '分类ID',
  `url`          VARCHAR(500)  NOT NULL COMMENT '照片URL',
  `title`        VARCHAR(100)  DEFAULT '' COMMENT '照片标题',
  `description`  TEXT          COMMENT '照片描述',
  `year`         VARCHAR(10)   DEFAULT '' COMMENT '拍摄年份',
  `uploader_id`  VARCHAR(32)   DEFAULT '' COMMENT '上传者用户ID',
  `uploader_name` VARCHAR(50)  DEFAULT '' COMMENT '上传者姓名',
  `status`       TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_category` (`category_id`),
  INDEX `idx_year` (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='照片表';

-- ------------------------------------------------------------
-- 8. 文档分类表
-- ------------------------------------------------------------
CREATE TABLE `family_document_category` (
  `id`          VARCHAR(32)   NOT NULL COMMENT '分类ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `name`        VARCHAR(50)   NOT NULL COMMENT '分类名称',
  `sort_order`  INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档分类表';

-- ------------------------------------------------------------
-- 9. 文档表
-- ------------------------------------------------------------
CREATE TABLE `family_document` (
  `id`            VARCHAR(32)   NOT NULL COMMENT '文档ID',
  `family_id`     INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `category_id`   VARCHAR(32)   DEFAULT '' COMMENT '分类ID',
  `name`          VARCHAR(200)  NOT NULL COMMENT '文档名称',
  `volume`        VARCHAR(50)   DEFAULT '' COMMENT '卷册',
  `description`   TEXT          COMMENT '文档简介',
  `page_count`    INT UNSIGNED  DEFAULT 0 COMMENT '总页数',
  `file_url`      VARCHAR(500)  DEFAULT '' COMMENT '文件URL',
  `cover_url`     VARCHAR(500)  DEFAULT '' COMMENT '封面URL',
  `uploader_id`   VARCHAR(32)   DEFAULT '' COMMENT '上传者用户ID',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档表';

-- ------------------------------------------------------------
-- 10. 文档章节表
-- ------------------------------------------------------------
CREATE TABLE `family_document_chapter` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '章节ID',
  `document_id`   VARCHAR(32)   NOT NULL COMMENT '文档ID',
  `number`        VARCHAR(10)   NOT NULL COMMENT '章节编号',
  `title`         VARCHAR(200)  NOT NULL COMMENT '章节标题',
  `start_page`    INT UNSIGNED  DEFAULT 0 COMMENT '起始页',
  `end_page`      INT UNSIGNED  DEFAULT 0 COMMENT '结束页',
  `sort_order`    INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_document` (`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档章节表';

-- ------------------------------------------------------------
-- 11. 家族事件表
-- ------------------------------------------------------------
CREATE TABLE `family_event` (
  `id`            VARCHAR(32)   NOT NULL COMMENT '事件ID',
  `family_id`     INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `year`          INT UNSIGNED  NOT NULL COMMENT '年份',
  `month`         INT UNSIGNED  DEFAULT 0 COMMENT '月份',
  `day`           INT UNSIGNED  DEFAULT 0 COMMENT '日',
  `title`         VARCHAR(200)  NOT NULL COMMENT '事件标题',
  `description`   TEXT          COMMENT '事件描述',
  `type`          VARCHAR(20)   NOT NULL DEFAULT 'other' COMMENT '事件类型 birth-出生 marriage-婚嫁 death-逝世 other-其他',
  `type_name`     VARCHAR(20)   DEFAULT '' COMMENT '类型名称',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_year` (`family_id`, `year`),
  INDEX `idx_type` (`family_id`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族事件表';

-- ------------------------------------------------------------
-- 12. 事件详情表（扩展属性）
-- ------------------------------------------------------------
CREATE TABLE `family_event_detail` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `event_id`    VARCHAR(32)   NOT NULL COMMENT '事件ID',
  `label`       VARCHAR(50)   NOT NULL COMMENT '标签',
  `value`       VARCHAR(500)  NOT NULL COMMENT '值',
  `sort_order`  INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_event` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='事件详情表';

-- ------------------------------------------------------------
-- 13. 事件关联成员表
-- ------------------------------------------------------------
CREATE TABLE `family_event_member` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `event_id`    VARCHAR(32)   NOT NULL COMMENT '事件ID',
  `member_id`   VARCHAR(32)   NOT NULL COMMENT '成员ID',
  `member_name` VARCHAR(50)   NOT NULL COMMENT '成员姓名',
  `member_gender` VARCHAR(10) DEFAULT '' COMMENT '成员性别',
  `relation`    VARCHAR(50)   DEFAULT '' COMMENT '与事件的关系（本人/配偶/子女等）',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_event` (`event_id`),
  INDEX `idx_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='事件关联成员表';

-- ------------------------------------------------------------
-- 14. 动态表
-- ------------------------------------------------------------
CREATE TABLE `family_dynamic` (
  `id`            VARCHAR(32)   NOT NULL COMMENT '动态ID',
  `family_id`     INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `user_id`       VARCHAR(32)   NOT NULL COMMENT '发布者用户ID',
  `user_name`     VARCHAR(50)   NOT NULL COMMENT '发布者姓名',
  `user_gender`   VARCHAR(10)   DEFAULT '' COMMENT '发布者性别',
  `content`       TEXT          NOT NULL COMMENT '动态内容',
  `like_count`    INT UNSIGNED  DEFAULT 0 COMMENT '点赞数',
  `comment_count` INT UNSIGNED  DEFAULT 0 COMMENT '评论数',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_user` (`user_id`),
  INDEX `idx_create_time` (`family_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态表';

-- ------------------------------------------------------------
-- 15. 动态图片表
-- ------------------------------------------------------------
CREATE TABLE `family_dynamic_image` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `dynamic_id`  VARCHAR(32)   NOT NULL COMMENT '动态ID',
  `image_url`   VARCHAR(500)  NOT NULL COMMENT '图片URL',
  `sort_order`  INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_dynamic` (`dynamic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态图片表';

-- ------------------------------------------------------------
-- 16. 动态评论表
-- ------------------------------------------------------------
CREATE TABLE `family_dynamic_comment` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '评论ID',
  `dynamic_id`  VARCHAR(32)   NOT NULL COMMENT '动态ID',
  `user_id`     VARCHAR(32)   NOT NULL COMMENT '评论者用户ID',
  `user_name`   VARCHAR(50)   NOT NULL COMMENT '评论者姓名',
  `content`     VARCHAR(500)  NOT NULL COMMENT '评论内容',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_dynamic` (`dynamic_id`),
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态评论表';

-- ------------------------------------------------------------
-- 17. 动态点赞表
-- ------------------------------------------------------------
CREATE TABLE `family_dynamic_like` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `dynamic_id`  VARCHAR(32)   NOT NULL COMMENT '动态ID',
  `user_id`     VARCHAR(32)   NOT NULL COMMENT '用户ID',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dynamic_user` (`dynamic_id`, `user_id`),
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态点赞表';

-- ------------------------------------------------------------
-- 18. 祭祀记录表
-- ------------------------------------------------------------
CREATE TABLE `family_worship_record` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `user_id`     VARCHAR(32)   NOT NULL COMMENT '用户ID',
  `user_name`   VARCHAR(50)   NOT NULL COMMENT '用户姓名',
  `type`        VARCHAR(20)   NOT NULL COMMENT '类型 incense-上香 pray-祈福 offer-献祭 wish-许愿',
  `content`     VARCHAR(500)  DEFAULT '' COMMENT '内容/心愿',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_user` (`user_id`),
  INDEX `idx_type` (`family_id`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='祭祀记录表';

-- ------------------------------------------------------------
-- 18.1 祭祀纪念对象表（纪念堂）
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

-- ------------------------------------------------------------
-- 19. 家族成员权限表
-- ------------------------------------------------------------
CREATE TABLE `family_permission` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `user_id`     VARCHAR(32)   NOT NULL COMMENT '用户ID',
  `member_name` VARCHAR(50)   DEFAULT '' COMMENT '成员备注名',
  `role`        VARCHAR(20)   NOT NULL DEFAULT 'member' COMMENT '角色 admin-管理员 member-普通成员',
  `status`      TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已移除',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_user` (`family_id`, `user_id`),
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族成员权限表';

-- ------------------------------------------------------------
-- 20. 备份记录表
-- ------------------------------------------------------------
CREATE TABLE `family_backup` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '备份ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `name`        VARCHAR(200)  NOT NULL COMMENT '备份名称',
  `file_url`    VARCHAR(500)  DEFAULT '' COMMENT '备份文件URL',
  `file_size`   BIGINT UNSIGNED DEFAULT 0 COMMENT '文件大小(字节)',
  `status`      VARCHAR(20)   NOT NULL DEFAULT 'success' COMMENT '状态 success-成功 fail-失败 processing-处理中',
  `operator_id` VARCHAR(32)   DEFAULT '' COMMENT '操作者用户ID',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='备份记录表';

-- ------------------------------------------------------------
-- 21. 用户设置表
-- ------------------------------------------------------------
CREATE TABLE `user_setting` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `user_id`       VARCHAR(32)   NOT NULL COMMENT '用户ID',
  `notification`  TINYINT(1)    DEFAULT 1 COMMENT '是否接收通知 1-开启 0-关闭',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户设置表';

-- ------------------------------------------------------------
-- 22. 事件照片关联表
-- ------------------------------------------------------------
CREATE TABLE `family_event_photo` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `event_id`    VARCHAR(32)   NOT NULL COMMENT '事件ID',
  `photo_url`   VARCHAR(500)  NOT NULL COMMENT '照片URL',
  `sort_order`  INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_event` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='事件照片关联表';

-- ------------------------------------------------------------
-- 23. 后台管理员表
-- ------------------------------------------------------------
CREATE TABLE `sys_admin` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '管理员ID',
  `username`      VARCHAR(50)   NOT NULL COMMENT '登录账号',
  `password`      VARCHAR(200)  NOT NULL COMMENT '密码hash',
  `nickname`      VARCHAR(50)   DEFAULT '' COMMENT '昵称',
  `avatar_url`    VARCHAR(500)  DEFAULT '' COMMENT '头像URL',
  `phone`         VARCHAR(20)   DEFAULT '' COMMENT '手机号',
  `email`         VARCHAR(100)  DEFAULT '' COMMENT '邮箱',
  `role`          VARCHAR(20)   NOT NULL DEFAULT 'admin' COMMENT '角色 super-超级管理员 admin-普通管理员',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
  `last_login_ip` VARCHAR(64)   DEFAULT '' COMMENT '最后登录IP',
  `last_login_time` DATETIME    DEFAULT NULL COMMENT '最后登录时间',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  INDEX `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台管理员表';

-- ------------------------------------------------------------
-- 24. 后台管理员-家族关联表（支持一个管理员管理多个家族）
-- ------------------------------------------------------------
CREATE TABLE `sys_admin_family` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `admin_id`    INT UNSIGNED  NOT NULL COMMENT '管理员ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_family` (`admin_id`, `family_id`),
  INDEX `idx_family` (`family_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台管理员-家族关联表';

-- ------------------------------------------------------------
-- 25. 系统菜单表
-- ------------------------------------------------------------
CREATE TABLE `sys_menu` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
  `parent_id`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '父菜单ID(0为顶级)',
  `name`          VARCHAR(50)   NOT NULL COMMENT '菜单名称',
  `type`          VARCHAR(10)   NOT NULL DEFAULT 'menu' COMMENT '类型 directory-目录 menu-菜单 button-按钮',
  `path`          VARCHAR(200)  DEFAULT '' COMMENT '路由路径',
  `component`     VARCHAR(200)  DEFAULT '' COMMENT '组件路径',
  `route_name`    VARCHAR(50)   DEFAULT '' COMMENT '路由名称（对应 elegant-router 的 route key）',
  `icon`          VARCHAR(50)   DEFAULT '' COMMENT '图标',
  `permission`    VARCHAR(100)  DEFAULT '' COMMENT '权限标识',
  `sort_order`    INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
  `visible`       TINYINT(1)    DEFAULT 1 COMMENT '是否显示 1-显示 0-隐藏',
  `keep_alive`    TINYINT(1)    DEFAULT 1 COMMENT '是否缓存 1-缓存 0-不缓存',
  `operator`      VARCHAR(50)   DEFAULT '' COMMENT '操作人',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_menu_route_name` (`route_name`),
  INDEX `idx_parent` (`parent_id`),
  INDEX `idx_sort` (`sort_order`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统菜单表';

-- 兼容已存在的数据库：补充 route_name 字段（全新导入时表定义已包含,跳过）
-- ALTER TABLE `sys_menu` ADD COLUMN `route_name` VARCHAR(50) DEFAULT '' COMMENT '路由名称（对应 elegant-router 的 route key）' AFTER `component`;

-- 兼容已存在的数据库：补充 operator 字段（操作人，操作日志用途）
-- ALTER TABLE `sys_menu` ADD COLUMN `operator` VARCHAR(50) DEFAULT '' COMMENT '操作人' AFTER `keep_alive`;

-- 兼容已存在的数据库：为内容表补充 audit_status 字段（审核状态 0-待审核 1-已通过 2-已下架）
ALTER TABLE `family_dynamic`  ADD COLUMN `audit_status` TINYINT(1) DEFAULT 1 COMMENT '审核状态 0-待审核 1-已通过 2-已下架' AFTER `status`;
ALTER TABLE `family_photo`    ADD COLUMN `audit_status` TINYINT(1) DEFAULT 1 COMMENT '审核状态 0-待审核 1-已通过 2-已下架' AFTER `status`;
ALTER TABLE `family_document` ADD COLUMN `audit_status` TINYINT(1) DEFAULT 1 COMMENT '审核状态 0-待审核 1-已通过 2-已下架' AFTER `status`;
ALTER TABLE `family_event`    ADD COLUMN `audit_status` TINYINT(1) DEFAULT 1 COMMENT '审核状态 0-待审核 1-已通过 2-已下架' AFTER `status`;

-- ------------------------------------------------------------
-- 26. 后台角色表
-- ------------------------------------------------------------
CREATE TABLE `sys_role` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  `name`          VARCHAR(50)   NOT NULL COMMENT '角色名称',
  `code`          VARCHAR(50)   NOT NULL COMMENT '角色编码',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_code` (`code`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台角色表';

-- ------------------------------------------------------------
-- 28. 后台权限表
-- ------------------------------------------------------------
CREATE TABLE `sys_permission` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '权限ID',
  `name`          VARCHAR(50)   NOT NULL COMMENT '权限名称',
  `code`          VARCHAR(100)  NOT NULL COMMENT '权限标识',
  `status`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permission_code` (`code`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台权限表';

-- ------------------------------------------------------------
-- 29. 角色-权限关联表
-- ------------------------------------------------------------
CREATE TABLE `sys_role_permission` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `role_id`       INT UNSIGNED  NOT NULL COMMENT '角色ID',
  `permission_id` INT UNSIGNED  NOT NULL COMMENT '权限ID',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`role_id`, `permission_id`),
  INDEX `idx_permission` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限关联表';

-- ------------------------------------------------------------
-- 30. 管理员-角色关联表
-- ------------------------------------------------------------
CREATE TABLE `sys_admin_role` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `admin_id`      INT UNSIGNED  NOT NULL COMMENT '管理员ID',
  `role_id`       INT UNSIGNED  NOT NULL COMMENT '角色ID',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_role` (`admin_id`, `role_id`),
  INDEX `idx_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员-角色关联表';

-- ------------------------------------------------------------
-- 31. 角色-菜单关联表
-- ------------------------------------------------------------
CREATE TABLE `sys_role_menu` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `role_id`       INT UNSIGNED  NOT NULL COMMENT '角色ID',
  `menu_id`       INT UNSIGNED  NOT NULL COMMENT '菜单ID',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_menu` (`role_id`, `menu_id`),
  INDEX `idx_menu` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-菜单关联表';

-- ------------------------------------------------------------
-- 32. 系统配置表
-- ------------------------------------------------------------
CREATE TABLE `sys_config` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '配置ID',
  `config_key`   VARCHAR(100)  NOT NULL COMMENT '配置键(全局唯一)',
  `config_name`  VARCHAR(100)  NOT NULL COMMENT '配置名称',
  `config_value` TEXT          COMMENT '配置值',
  `value_type`   VARCHAR(20)   NOT NULL DEFAULT 'string' COMMENT '值类型 string-字符串 number-数字 boolean-布尔 json-JSON',
  `group`        VARCHAR(50)   NOT NULL DEFAULT 'basic' COMMENT '分组 basic-基础配置 security-安全设置 log-日志配置',
  `remark`       VARCHAR(200)  DEFAULT '' COMMENT '备注说明',
  `sort_order`   INT UNSIGNED  DEFAULT 0 COMMENT '排序',
  `status`       TINYINT(1)    DEFAULT 1 COMMENT '状态 1-启用 0-禁用',
  `is_system`    TINYINT(1)    DEFAULT 0 COMMENT '是否系统内置(内置项不可删除) 1-是 0-否',
  `operator`     VARCHAR(50)   DEFAULT '' COMMENT '操作人',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`),
  INDEX `idx_group` (`group`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表';

-- ------------------------------------------------------------
-- 33. 系统日志表
-- ------------------------------------------------------------
CREATE TABLE `sys_log` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `log_type`     VARCHAR(20)  NOT NULL COMMENT '日志类型 operation-操作日志 error-错误日志 access-访问日志',
  `module`       VARCHAR(50)  DEFAULT '' COMMENT '所属模块(如 auth/admin/family)',
  `action`       VARCHAR(100) DEFAULT '' COMMENT '操作动作(如 登录/创建家族)',
  `method`       VARCHAR(10)  DEFAULT '' COMMENT 'HTTP方法',
  `path`         VARCHAR(200) DEFAULT '' COMMENT '请求路径',
  `operator`     VARCHAR(50)  DEFAULT '' COMMENT '操作人(管理员用户名,未登录为anonymous)',
  `operator_id`  INT UNSIGNED DEFAULT NULL COMMENT '操作人管理员ID',
  `ip`           VARCHAR(64)  DEFAULT '' COMMENT '请求IP',
  `user_agent`   VARCHAR(255) DEFAULT '' COMMENT '浏览器UA',
  `status`       INT          DEFAULT 200 COMMENT 'HTTP状态码',
  `success`      TINYINT(1)   DEFAULT 1 COMMENT '是否成功 1-成功 0-失败',
  `detail`       TEXT         COMMENT '详情(操作参数/错误信息/堆栈)',
  `cost_time`    INT UNSIGNED DEFAULT 0 COMMENT '耗时(毫秒)',
  `create_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_log_type` (`log_type`),
  INDEX `idx_operator` (`operator`),
  INDEX `idx_module` (`module`),
  INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统日志表';

-- ============================================================
-- 初始化基础数据（幂等，可重复执行）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 默认超级管理员账号（密码需自行生成 bcrypt hash 后替换 <password_hash>）
--    生成方式：node -e "console.log(require('bcrypt').hashSync('123456',10))"
--    注意：PowerShell 中执行上述命令时 $ 符号可能被解析，建议写入 .js 文件后运行
-- ------------------------------------------------------------
-- INSERT INTO `sys_admin` (`username`, `password`, `nickname`, `role`, `status`) VALUES
-- ('admin', '$2b$10$/qNDExOrgiH7Luum39A10ecWOEupxo9FBPYch6PFz3BQQBj8EKQ.K', '超级管理员', 'super', 1);

-- ------------------------------------------------------------
-- 2. 默认角色（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role` (`name`, `code`, `status`) VALUES
('超级管理员', 'super', 1),
('普通管理员', 'admin', 1);

-- ------------------------------------------------------------
-- 3. 菜单管理相关权限（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('菜单查询', 'system:menu:list', 1),
('菜单新增', 'system:menu:create', 1),
('菜单编辑', 'system:menu:update', 1),
('菜单删除', 'system:menu:delete', 1),
('菜单排序', 'system:menu:sort', 1),
('菜单状态切换', 'system:menu:status', 1),
('内容查询', 'system:content:list', 1),
('内容审核', 'system:content:audit', 1),
('内容下架', 'system:content:toggle', 1),
('内容删除', 'system:content:delete', 1),
('家族查询', 'system:family:list', 1),
('家族新增', 'system:family:create', 1),
('家族编辑', 'system:family:update', 1),
('家族删除', 'system:family:delete', 1),
('管理员查询', 'system:admin:list', 1),
('管理员新增', 'system:admin:create', 1),
('管理员编辑', 'system:admin:update', 1),
('管理员改密', 'system:admin:password', 1),
('管理员家族查询', 'system:admin:family', 1),
('管理员家族绑定', 'system:admin:bind-family', 1),
('管理员角色分配', 'system:admin:role', 1),
('角色查询', 'system:role:list', 1),
('角色新增', 'system:role:create', 1),
('角色编辑', 'system:role:update', 1),
('角色删除', 'system:role:delete', 1),
('权限查询', 'system:permission:list', 1),
('权限新增', 'system:permission:create', 1),
('权限编辑', 'system:permission:update', 1),
('权限删除', 'system:permission:delete', 1),
('姓氏查询', 'system:surname:list', 1),
('姓氏新增', 'system:surname:create', 1),
('姓氏编辑', 'system:surname:update', 1),
('姓氏删除', 'system:surname:delete', 1),
('姓氏批量导入', 'system:surname:import', 1),
('姓氏状态切换', 'system:surname:status', 1),
('字辈查询', 'system:generation-table:list', 1),
('字辈新增', 'system:generation-table:create', 1),
('字辈编辑', 'system:generation-table:update', 1),
('字辈删除', 'system:generation-table:delete', 1),
('字辈批量导入', 'system:generation-table:import', 1),
('字辈状态切换', 'system:generation-table:status', 1),
('家族成员查询', 'system:family-member:list', 1),
('家族成员新增', 'system:family-member:create', 1),
('家族成员编辑', 'system:family-member:update', 1),
('家族成员删除', 'system:family-member:delete', 1),
('家族成员导入', 'system:family-member:import', 1),
('系统设置查询', 'system:settings:list', 1),
('系统设置编辑', 'system:settings:update', 1),
('安全设置查看', 'system:settings:security:list', 1),
('日志查询',     'system:settings:log:list', 1),
('日志删除',     'system:settings:log:delete', 1),
('日志导出',     'system:settings:log:export', 1),
('敏感操作验证', 'system:settings:verify', 1),
('云存储配置查询', 'system:settings:cloud:list', 1),
('云存储配置编辑', 'system:settings:cloud:update', 1);

-- ------------------------------------------------------------
-- 4. 将全部权限授予超级管理员角色（幂等）
--    覆盖 menu/content/family/admin/role/permission/surname 所有权限码
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:%';

-- ------------------------------------------------------------
-- 4.1 初始化系统配置（幂等，已存在的键跳过）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_config`
(`config_key`, `config_name`, `config_value`, `value_type`, `group`, `remark`, `sort_order`, `is_system`) VALUES
-- 基础配置
('system_name',          '系统名称',     '数字家谱管理系统', 'string',  'basic',    '显示在后台登录页与标题栏的系统名称', 1, 1),
('system_logo',          '系统LOGO',     '',                'string',  'basic',    '系统LOGO图片URL，留空使用默认',        2, 1),
('default_language',     '默认语言',     'zh-CN',           'string',  'basic',    '系统默认语言，如 zh-CN / en-US',       3, 1),
('timezone',             '时区配置',     'Asia/Shanghai',   'string',  'basic',    '系统时区，如 Asia/Shanghai',           4, 1),
('copyright',            '版权信息',     '数字家谱 © 2026',  'string',  'basic',    '登录页与页脚版权文案',                 5, 1),
-- 安全设置
('password_min_length',        '密码最小长度',        '6',    'number', 'security', '新密码最少字符数(6-32)',             1, 1),
('password_require_upper',     '包含大写字母',        'false', 'boolean', 'security', '密码必须包含至少1个大写字母',         2, 1),
('password_require_lower',     '包含小写字母',        'false', 'boolean', 'security', '密码必须包含至少1个小写字母',         3, 1),
('password_require_number',    '包含数字',            'false', 'boolean', 'security', '密码必须包含至少1个数字',             4, 1),
('password_require_special',   '包含特殊字符',        'false', 'boolean', 'security', '密码必须包含至少1个特殊字符',         5, 1),
('password_expire_days',       '密码有效期(天)',      '0',     'number', 'security', '强制改密周期，0表示不强制过期',       6, 1),
('login_max_attempts',         '登录失败锁定阈值',    '5',     'number', 'security', '连续登录失败达到该次数后锁定',        7, 1),
('login_lockout_minutes',      '锁定时间(分钟)',      '15',    'number', 'security', '账号锁定持续时长',                    8, 1),
('login_captcha_enabled',      '启用登录验证码',      'false', 'boolean', 'security', '登录时要求输入图形验证码',            9, 1),
('login_token_expire_days',    '令牌有效期(天)',      '7',     'number', 'security', 'JWT 访问令牌有效期',                 10, 1),
('ip_restriction_enabled',     '启用IP访问限制',      'false', 'boolean', 'security', '按白名单/黑名单限制登录来源IP',       11, 1),
('ip_restriction_mode',        'IP限制模式',          'blacklist', 'string', 'security', 'blacklist-黑名单 whitelist-白名单', 12, 1),
('ip_blacklist',               'IP黑名单',            '[]',    'json',   'security', '禁止访问的IP列表(JSON数组)',          13, 1),
('ip_whitelist',               'IP白名单',            '[]',    'json',   'security', '仅允许访问的IP列表(JSON数组)',        14, 1),
('sensitive_op_verify_enabled','敏感操作二次验证',     'true',  'boolean', 'security', '删除/清理等高危操作前需验证登录密码', 15, 1),
('sensitive_op_verify_timeout','二次验证有效期(秒)',   '120',   'number', 'security', '密码验证通过后的有效时间',            16, 1),
-- 日志配置
('log_access_enabled',         '记录访问日志',        'true',  'boolean', 'log', '记录所有 API 请求的访问日志',          1, 1),
('log_retention_days',         '日志保留天数',        '30',    'number', 'log',   '超过该天数的日志可被自动清理',         2, 1);

-- ------------------------------------------------------------
-- 5. 将超级管理员角色绑定到默认 admin 账号（如已创建，幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_admin_role` (`admin_id`, `role_id`)
SELECT a.`id`, r.`id` FROM `sys_admin` a, `sys_role` r
WHERE a.`username` = 'admin' AND r.`code` = 'super';

-- ============================================================
-- 初始化默认菜单（用于动态路由模式）
-- 超级管理员默认可以看到所有启用菜单，非超级角色需通过角色管理绑定菜单
-- ============================================================
INSERT INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`) VALUES
(0, '首页', 'menu', '/home', 'layout.base$view.home', 'home', 'mdi:monitor-dashboard', '', 1, 1, 1, 1),
(0, '家谱管理', 'directory', '/mini-program', 'layout.base', 'mini-program', 'mdi:apps', '', 2, 1, 1, 1),
(0, '系统管理', 'directory', '/system', 'layout.base', 'system', 'mdi:cog-outline', '', 3, 1, 1, 1);

SET @mini_program_dir = (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);
SET @system_dir = (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'system' LIMIT 1);

INSERT INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`) VALUES
(@mini_program_dir, '内容管理', 'menu', '/mini-program/content', 'view.mini-program_content', 'mini-program_content', '', '', 1, 1, 1, 1),
(@mini_program_dir, '家族树', 'menu', '/mini-program/family-tree', 'view.mini-program_family-tree', 'mini-program_family-tree', '', '', 2, 1, 1, 1),
(@mini_program_dir, '成员管理', 'menu', '/mini-program/members', 'view.mini-program_members', 'mini-program_members', '', '', 3, 1, 1, 1),
(@mini_program_dir, '数据概览', 'menu', '/mini-program/overview', 'view.mini-program_overview', 'mini-program_overview', '', '', 4, 1, 1, 1),
(@mini_program_dir, '家族管理', 'menu', '/mini-program/family', 'view.mini-program_family', 'mini-program_family', 'mdi:account-group-outline', 'system:family:list', 5, 1, 1, 1),
(@mini_program_dir, '姓氏管理', 'menu', '/mini-program/surname', 'view.mini-program_surname', 'mini-program_surname', '', 'system:surname:list', 6, 1, 1, 1),
(@mini_program_dir, '字辈管理', 'menu', '/mini-program/generation-table', 'view.mini-program_generation-table', 'mini-program_generation-table', '', 'system:generation-table:list', 7, 1, 1, 1),
(@system_dir, '管理员管理', 'menu', '/system/admin', 'view.system_admin', 'system_admin', '', 'system:admin:list', 0, 1, 1, 1),
(@system_dir, '菜单管理', 'menu', '/system/menu', 'view.system_menu', 'system_menu', '', 'system:menu:list', 1, 1, 1, 1),
(@system_dir, '权限管理', 'menu', '/system/permission', 'view.system_permission', 'system_permission', '', 'system:permission:list', 2, 1, 1, 1),
(@system_dir, '角色管理', 'menu', '/system/role', 'view.system_role', 'system_role', '', 'system:role:list', 3, 1, 1, 1),
(@system_dir, '系统设置', 'menu', '/system/settings', 'view.system_settings', 'system_settings', 'mdi:application-cog-outline', 'system:settings:list', 4, 1, 1, 1);

-- 将默认菜单全部授权给超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m WHERE r.`code` = 'super';

-- 插入默认相册分类（请根据实际家族替换 <family_id> 后执行）
-- INSERT INTO `family_album_category` (`id`, `family_id`, `name`, `icon`, `sort_order`) VALUES
-- ('ancestor',  '<family_id>', '先祖',     '👴', 1),
-- ('family',    '<family_id>', '全家福',   '👨‍👩‍👧‍👦', 2),
-- ('events',    '<family_id>', '活动',     '🎉', 3),
-- ('buildings', '<family_id>', '建筑',     '🏛️', 4),
-- ('documents', '<family_id>', '文档',     '📄', 5);

-- 插入默认文档分类（请根据实际家族替换 <family_id> 后执行）
-- INSERT INTO `family_document_category` (`id`, `family_id`, `name`, `sort_order`) VALUES
-- ('genealogy', '<family_id>', '族谱',     1),
-- ('history',   '<family_id>', '家族史',   2),
-- ('rules',     '<family_id>', '家规家训', 3),
-- ('culture',   '<family_id>', '文化资料', 4),
-- ('other',     '<family_id>', '其他',     5);

-- ============================================================
-- 数据迁移：将旧 marriage_date / spouse_name 合并到 spouse_info
-- ============================================================
-- 说明：执行以下 UPDATE 可将旧字段数据无损迁移到 JSON 字段
-- 注意：MySQL 5.7.22+ / 8.0 支持 JSON_OBJECT
--
-- UPDATE `family_member`
-- SET `spouse_info` = JSON_OBJECT(
--   'name', IFNULL(`spouse_name`, ''),
--   'birthDate', '',
--   'rank', '',
--   'bio', '',
--   'deathDate', '',
--   'deathPlace', '',
--   'longitude', '',
--   'latitude', ''
-- )
-- WHERE (`spouse_name` IS NOT NULL AND `spouse_name` != '') OR `marriage_date` IS NOT NULL;
--
-- 如原表已删除 spouse_name / marriage_date，可在执行前先备份：
-- ALTER TABLE `family_member` ADD COLUMN `spouse_name_old` VARCHAR(50) AFTER `spouse_id`;
-- UPDATE `family_member` SET `spouse_name_old` = `spouse_name`;
-- 迁移完成后再执行 DROP COLUMN `spouse_name_old`; 和 DROP COLUMN `marriage_date`;

-- ============================================================
-- ============================================================
-- 以下内容合并自 server/database/migrations/*.sql（2026-08-21 整合）
-- 目的：schema.sql 作为唯一主库升级脚本；原迁移文件已删除。
--       各文件来源与删除清单见 MIGRATIONS.md / MERGE_LOG.md
-- 兼容性：MySQL 5.7.22+ / 8.0（JSON、PREPARE、information_schema 幂等判断、存储过程）
-- 全部语句幂等，可重复执行
-- ============================================================
-- ============================================================

-- ------------------------------------------------------------
-- 34. 家族广告轮播表（来源: 20260818-family-banner.sql + 20260819-banner-click-count.sql）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_banner` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`       INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '家族ID（0=全局广告，对所有家族展示）',
  `title`           VARCHAR(100)  NOT NULL COMMENT '广告标题',
  `image_url`       VARCHAR(500)  NOT NULL COMMENT '广告图片URL',
  `link_type`       VARCHAR(20)   NOT NULL DEFAULT 'none' COMMENT '跳转类型 none-无 page-小程序页面 url-外部链接',
  `link_url`        VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '跳转地址（小程序页面路径或外部链接）',
  `click_count`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '点击次数（运营统计用）',
  `sort_order`      INT           NOT NULL DEFAULT 0 COMMENT '排序值（小在前）',
  `status`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-启用 0-停用',
  `start_time`      DATETIME      DEFAULT NULL COMMENT '生效时间（空=立即生效）',
  `end_time`        DATETIME      DEFAULT NULL COMMENT '失效时间（空=永久有效）',
  `creator_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '创建人用户ID',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family_status` (`family_id`, `status`, `sort_order`),
  INDEX `idx_time_range` (`start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族广告轮播表';

-- 轮播切换时间全局配置（毫秒，默认 3000）
INSERT IGNORE INTO `sys_config` (`config_key`, `config_name`, `config_value`, `value_type`, `group`, `remark`, `sort_order`, `status`, `is_system`)
VALUES ('banner_interval', '轮播图切换时间(毫秒)', '3000', 'number', 'basic', '小程序首页广告轮播自动切换间隔，单位毫秒，默认 3000', 40, 1, 0);

-- ------------------------------------------------------------
-- 35. 家族邀请记录表（来源: 20260817-family-invitation.sql + 20260819-family-share.sql）
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
  `channel`         VARCHAR(20)   DEFAULT 'link' COMMENT '分享渠道 link-链接 sms-短信 email-邮件 wechat-微信 qrcode-扫码 poster-海报',
  `poster_url`      VARCHAR(500)  DEFAULT '' COMMENT '分享海报/小程序码图片URL（/uploads/xxx）',
  `share_count`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '分享次数',
  `joined_count`    INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '通过该邀请加入的人数',
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

-- 存量邀请默认视为 link 渠道（幂等）
UPDATE `family_invitation` SET `channel` = 'link' WHERE `channel` = '' OR `channel` IS NULL;

-- ------------------------------------------------------------
-- 36. 应用插件注册表（来源: 20260819-app-plugin.sql）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_plugin` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `code`            VARCHAR(64)   NOT NULL COMMENT '插件编码（唯一）',
  `name`            VARCHAR(64)   NOT NULL COMMENT '插件名称',
  `icon`            VARCHAR(255)  NOT NULL DEFAULT '' COMMENT '图标（emoji 或图片URL）',
  `description`     VARCHAR(255)  NOT NULL DEFAULT '' COMMENT '插件简介',
  `entry_type`      VARCHAR(16)   NOT NULL DEFAULT 'page' COMMENT '入口类型 page-小程序页面 url-外部H5链接',
  `entry_value`     VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '入口地址（小程序页面路径或H5链接）',
  `sort_order`      INT           NOT NULL DEFAULT 0 COMMENT '排序值（小在前）',
  `status`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-启用 0-停用',
  `creator_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '创建人用户ID',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  INDEX `idx_status_sort` (`status`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='应用插件注册表';

-- ------------------------------------------------------------
-- 37. 会员订阅系统 5 张表 + 套餐种子（来源: 20260815-membership-init.sql）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_plan` (
  `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '套餐ID',
  `code`           VARCHAR(30)    NOT NULL COMMENT '套餐编码 free/family/premium',
  `name`           VARCHAR(50)    NOT NULL COMMENT '套餐名称',
  `price_annual`   DECIMAL(10,2)  NOT NULL DEFAULT 0.00 COMMENT '年费（元）',
  `capabilities`   JSON           NOT NULL COMMENT '能力点集合 ["backup","export",...]',
  `storage_limit`  BIGINT UNSIGNED DEFAULT 0 COMMENT '存储上限(字节)，0=不限',
  `quota_rules`    JSON           DEFAULT NULL COMMENT '按次额度 {"ai_restore":10,"worship_pro":50}',
  `sort_order`     INT UNSIGNED   DEFAULT 0 COMMENT '排序',
  `status`         TINYINT(1)     DEFAULT 1 COMMENT '1-启用 0-停用',
  `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅套餐表';

-- 家族订阅表（订阅跟随家族，家族成员共享权益）
CREATE TABLE IF NOT EXISTS `family_subscription` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '订阅ID',
  `family_id`     INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `plan_code`     VARCHAR(30)   NOT NULL DEFAULT 'free' COMMENT '当前套餐',
  `status`        VARCHAR(20)   NOT NULL DEFAULT 'active' COMMENT 'active-有效 grace-宽限 frozen-冻结 expired-已过期',
  `owner_user_id` VARCHAR(32)   DEFAULT '' COMMENT '订阅支付人（小程序用户ID，32位hex）',
  `auto_renew`    TINYINT(1)    DEFAULT 0 COMMENT '自动续费开关（一期默认关）',
  `paid_at`       DATETIME      DEFAULT NULL COMMENT '最近一次付费时间',
  `expire_at`     DATETIME      DEFAULT NULL COMMENT '当前周期到期时间',
  `grace_until`   DATETIME      DEFAULT NULL COMMENT '宽限期截止',
  `cancel_reason` VARCHAR(200)  DEFAULT '' COMMENT '取消/冻结原因',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family` (`family_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_expire` (`expire_at`),
  CONSTRAINT `fk_subscription_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族订阅表';

-- 订阅订单表（微信支付）
CREATE TABLE IF NOT EXISTS `subscription_order` (
  `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `order_no`       VARCHAR(64)    NOT NULL COMMENT '平台订单号',
  `out_trade_no`   VARCHAR(64)    NOT NULL COMMENT '商户订单号（微信支付）',
  `family_id`      INT UNSIGNED   NOT NULL COMMENT '家族ID',
  `user_id`        VARCHAR(32)    NOT NULL COMMENT '支付人用户ID',
  `plan_code`      VARCHAR(30)    NOT NULL COMMENT '购买的套餐',
  `amount`         DECIMAL(10,2)  NOT NULL COMMENT '实付金额（元）',
  `period_months`  INT UNSIGNED   DEFAULT 12 COMMENT '订阅时长（月）',
  `status`         VARCHAR(20)    NOT NULL DEFAULT 'pending' COMMENT 'pending/paid/failed/refunded/closed',
  `transaction_id` VARCHAR(64)    DEFAULT '' COMMENT '微信支付单号',
  `pay_time`       DATETIME       DEFAULT NULL COMMENT '支付时间',
  `refund_time`    DATETIME       DEFAULT NULL COMMENT '退款时间',
  `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_out_trade_no` (`out_trade_no`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_user` (`user_id`),
  CONSTRAINT `fk_order_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅订单表';

-- 家族额度账户表（存储用量 + 按次额度）
CREATE TABLE IF NOT EXISTS `family_quota` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`          INT UNSIGNED NOT NULL COMMENT '家族ID',
  `storage_used`       BIGINT UNSIGNED DEFAULT 0 COMMENT '已用存储(字节)，冗余列+定时对账',
  `ai_restore_used`    INT UNSIGNED DEFAULT 0 COMMENT 'AI修复已用张数（当前订阅周期）',
  `worship_pro_used`   INT UNSIGNED DEFAULT 0 COMMENT '祭祀增值已用次数（当前订阅周期）',
  `quota_period_start` DATE DEFAULT NULL COMMENT '额度周期起点',
  `quota_period_end`   DATE DEFAULT NULL COMMENT '额度周期终点',
  `create_time`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family` (`family_id`),
  CONSTRAINT `fk_quota_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族额度账户表';

-- 存储占用明细表（支持「删除即释放」与精确对账）
CREATE TABLE IF NOT EXISTS `storage_usage_record` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`   INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `file_key`    VARCHAR(200)  NOT NULL COMMENT '文件标识（/uploads/xxx.png）',
  `file_size`   BIGINT UNSIGNED NOT NULL COMMENT '占用字节数',
  `biz_type`    VARCHAR(30)   NOT NULL COMMENT '业务类型 photo/document/dynamic/album/member_avatar',
  `biz_id`      VARCHAR(64)   DEFAULT '' COMMENT '业务记录ID',
  `user_id`     VARCHAR(32)   DEFAULT '' COMMENT '上传人（小程序用户ID）',
  `status`      TINYINT(1)    DEFAULT 1 COMMENT '1-占用 0-已释放',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_family_status` (`family_id`, `status`),
  INDEX `idx_file_key` (`file_key`),
  CONSTRAINT `fk_storage_family` FOREIGN KEY (`family_id`) REFERENCES `family` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='存储占用明细表';

-- 套餐种子数据（能力点模型，幂等更新）
INSERT INTO `subscription_plan`
  (`code`, `name`, `price_annual`, `capabilities`, `storage_limit`, `quota_rules`, `sort_order`, `status`)
VALUES
  ('free',    '免费版', 0.00,
   JSON_ARRAY(),
   524288000,  -- 500MB
   NULL,
   1, 1),
  ('family',  '家族版', 199.00,
   JSON_ARRAY('backup', 'export', 'permission', 'reminder', 'digest', 'theme', 'badge', 'ai_restore', 'worship_pro'),
   10737418240,  -- 10GB
   JSON_OBJECT('ai_restore', 10, 'worship_pro', 50),
   2, 1),
  ('premium', '尊享版', 599.00,
   JSON_ARRAY('backup', 'export', 'permission', 'reminder', 'digest', 'theme', 'badge', 'print', 'worship_pro', 'ai_restore', 'advisor', 'support', 'no_ads'),
   0,  -- 0=不限
   JSON_OBJECT('ai_restore', 100, 'worship_pro', 999),
   3, 1)
ON DUPLICATE KEY UPDATE
  `name`          = VALUES(`name`),
  `price_annual`  = VALUES(`price_annual`),
  `capabilities`  = VALUES(`capabilities`),
  `storage_limit` = VALUES(`storage_limit`),
  `quota_rules`   = VALUES(`quota_rules`),
  `sort_order`    = VALUES(`sort_order`),
  `status`        = VALUES(`status`);

-- ------------------------------------------------------------
-- 38. 家族基金模块 3 张表（来源: 20260820-family-fund.sql）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_fund` (
  `id`                       INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`                INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `name`                     VARCHAR(50)   NOT NULL COMMENT '基金名称',
  `logo_url`                 VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '图标URL',
  `description`              VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '基金简介',
  `total_amount`             DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '基金当前总额(元)',
  `single_deposit_limit`     DECIMAL(12,2) NOT NULL DEFAULT 1000.00 COMMENT '单次存入限额(元)',
  `single_withdraw_limit`    DECIMAL(12,2) NOT NULL DEFAULT 1000.00 COMMENT '单次取出限额(元)',
  `daily_deposit_limit`      DECIMAL(12,2) NOT NULL DEFAULT 2000.00 COMMENT '每日存入限额(元)',
  `daily_withdraw_limit`     DECIMAL(12,2) NOT NULL DEFAULT 2000.00 COMMENT '每日取出限额(元)',
  `monthly_deposit_limit`    DECIMAL(12,2) NOT NULL DEFAULT 5000.00 COMMENT '每月存入限额(元)',
  `monthly_withdraw_limit`   DECIMAL(12,2) NOT NULL DEFAULT 5000.00 COMMENT '每月取出限额(元)',
  `withdraw_approval_threshold` DECIMAL(12,2) NOT NULL DEFAULT 500.00 COMMENT '大额取出审批阈值(元),超过需审批',
  `need_approval`            TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否需要大额取出审批 1-是 0-否',
  `status`                   TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 2-已解散',
  `creator_user_id`          VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '创建人用户ID',
  `dissolved_at`             DATETIME      DEFAULT NULL COMMENT '解散时间',
  `dissolve_reason`          VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '解散原因',
  `create_time`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fund_family` (`family_id`),
  INDEX `idx_fund_creator` (`creator_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族基金主表';

-- 基金成员权限表(显式参与名单 + 角色 + 精细权限)
CREATE TABLE IF NOT EXISTS `family_fund_member` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `fund_id`      INT UNSIGNED  NOT NULL COMMENT '基金ID',
  `family_id`    INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `user_id`      VARCHAR(32)   NOT NULL COMMENT '用户ID',
  `member_id`    VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '关联家族成员ID(冗余展示)',
  `name`         VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '成员姓名(冗余展示)',
  `role`         VARCHAR(20)   NOT NULL DEFAULT 'member' COMMENT '角色 leader-族长 admin-管理员 member-普通成员',
  `permissions`  JSON          DEFAULT NULL COMMENT '权限码数组',
  `balance`      DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '个人净余额(元)',
  `status`       TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 0-已移除',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fund_user` (`fund_id`, `user_id`),
  INDEX `idx_fund_member` (`fund_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族基金成员权限表';

-- 资金交易流水表(所有资金变动的唯一事实来源)
CREATE TABLE IF NOT EXISTS `family_fund_transaction` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `fund_id`        INT UNSIGNED    NOT NULL COMMENT '基金ID',
  `family_id`      INT UNSIGNED    NOT NULL COMMENT '家族ID',
  `type`           VARCHAR(20)     NOT NULL COMMENT '类型 init/deposit/withdraw/transfer/adjust',
  `amount`         DECIMAL(12,2)   NOT NULL COMMENT '金额(正数)',
  `direction`      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '资金方向 1-流入 -1-流出',
  `operator_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '操作人用户ID',
  `target_user_id` VARCHAR(32)     NOT NULL DEFAULT '' COMMENT '对方用户ID(转账接收方/审批人)',
  `payment_method` VARCHAR(20)     NOT NULL DEFAULT '' COMMENT '资金渠道 cash-现金 wechat-微信 alipay-支付宝 bank-银行',
  `status`         TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态 1-成功 0-失败 2-待审批 3-已驳回',
  `remark`         VARCHAR(200)    NOT NULL DEFAULT '' COMMENT '备注',
  `balance_after`  DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '操作后基金余额(成功流水)',
  `approve_user_id` VARCHAR(32)    NOT NULL DEFAULT '' COMMENT '审批人用户ID',
  `approve_time`   DATETIME        DEFAULT NULL COMMENT '审批时间',
  `approve_remark` VARCHAR(200)    NOT NULL DEFAULT '' COMMENT '审批备注',
  `create_time`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_fund_time` (`fund_id`, `create_time`),
  INDEX `idx_fund_type` (`fund_id`, `type`),
  INDEX `idx_fund_user` (`fund_id`, `operator_user_id`),
  INDEX `idx_fund_target` (`fund_id`, `target_user_id`),
  INDEX `idx_fund_status` (`fund_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族基金资金交易流水表';

-- ------------------------------------------------------------
-- 39. 宗亲聚会模块 4 张表（来源: 20260820-family-gathering.sql）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_gathering` (
  `id`                INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`         INT UNSIGNED  NOT NULL COMMENT '家族ID',
  `title`             VARCHAR(100)  NOT NULL COMMENT '聚会名称',
  `description`       TEXT          COMMENT '聚会介绍',
  `cover_image`       VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '封面图URL',
  `location`          VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '聚会地点(简)',
  `address_detail`    VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '详细地址',
  `start_time`        DATETIME      DEFAULT NULL COMMENT '开始时间',
  `end_time`          DATETIME      DEFAULT NULL COMMENT '结束时间',
  `signup_deadline`   DATETIME      DEFAULT NULL COMMENT '报名截止时间(空=截止到开始前)',
  `agenda`            TEXT          COMMENT '议程(JSON数组 [{time,item,remark}])',
  `capacity`          INT           NOT NULL DEFAULT 0 COMMENT '总人数上限(0=不限)',
  `status`            TINYINT       NOT NULL DEFAULT 0 COMMENT '状态 0-草稿 1-已发布 2-进行中 3-已结束 4-已归档',
  `organizer_user_id` VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '组织者用户ID(创建人)',
  `create_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_family_status` (`family_id`, `status`, `start_time`),
  INDEX `idx_organizer` (`organizer_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会主表';

-- 聚会场次/时间段表
CREATE TABLE IF NOT EXISTS `family_gathering_session` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `gathering_id` INT UNSIGNED NOT NULL COMMENT '聚会ID',
  `name`         VARCHAR(100) NOT NULL DEFAULT '' COMMENT '场次/时间段名称(如:上午场)',
  `start_time`   DATETIME     DEFAULT NULL COMMENT '场次开始时间',
  `end_time`     DATETIME     DEFAULT NULL COMMENT '场次结束时间',
  `capacity`     INT          NOT NULL DEFAULT 0 COMMENT '本场人数上限(0=不限)',
  `signed_count` INT          NOT NULL DEFAULT 0 COMMENT '已报名人数',
  `create_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_gathering` (`gathering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会场次/时间段表';

-- 报名登记表
CREATE TABLE IF NOT EXISTS `family_gathering_registration` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `gathering_id`  INT UNSIGNED  NOT NULL COMMENT '聚会ID',
  `session_id`    INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '场次ID(0=不选场次)',
  `user_id`       VARCHAR(32)   NOT NULL COMMENT '报名用户ID',
  `member_id`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '关联家族成员ID(0=未关联)',
  `name`          VARCHAR(50)   NOT NULL COMMENT '参会人姓名',
  `phone`         VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '联系电话',
  `diet_type`     VARCHAR(20)   NOT NULL DEFAULT 'normal' COMMENT '饮食偏好 normal-无要求 vegetarian-素食 halal-清真 custom-其他',
  `diet_note`     VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '饮食备注',
  `special_need`  VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '特殊需求',
  `guest_count`   INT           NOT NULL DEFAULT 0 COMMENT '随行人数',
  `status`        TINYINT       NOT NULL DEFAULT 1 COMMENT '状态 1-已报名 2-已取消 3-已签到',
  `checkin_code`  VARCHAR(6)    NOT NULL DEFAULT '' COMMENT '签到码(6位数字)',
  `checkin_time`  DATETIME      DEFAULT NULL COMMENT '签到时间',
  `checkin_method` VARCHAR(10)  NOT NULL DEFAULT '' COMMENT '签到方式 qr-扫码 manual-手动输入',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_gathering_session` (`gathering_id`, `session_id`),
  INDEX `idx_user_gathering` (`user_id`, `gathering_id`),
  INDEX `idx_checkin_code` (`checkin_code`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会报名登记表';

-- 聚会资料归档表
CREATE TABLE IF NOT EXISTS `family_gathering_archive` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `gathering_id`     INT UNSIGNED  NOT NULL COMMENT '聚会ID',
  `title`            VARCHAR(200)  NOT NULL COMMENT '资料标题',
  `file_url`         VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '文件/图片URL',
  `file_type`        VARCHAR(20)   NOT NULL DEFAULT 'image' COMMENT '类型 image-图片 file-文件 link-链接',
  `description`      VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '说明',
  `creator_user_id`  VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '上传人用户ID',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_gathering` (`gathering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宗亲聚会资料归档表';

-- ------------------------------------------------------------
-- 40. 合并迁移：后台权限码（幂等）
-- 来源: add-subscription-admin-permissions.sql / 20260817-worship-admin.sql /
--       20260818-family-banner.sql / 20260817-family-invitation.sql /
--       20260819-app-plugin.sql / 20260820-family-gathering.sql
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('订阅查询', 'system:subscription:list', 1),
('套餐新增', 'system:subscription:create', 1),
('订阅更新', 'system:subscription:update', 1),
('订阅退款', 'system:subscription:refund', 1),
('祭祀记录查询', 'system:worship:list', 1),
('祭祀数据删除', 'system:worship:delete', 1),
('广告轮播查询', 'system:family-banner:list', 1),
('广告轮播新增', 'system:family-banner:create', 1),
('广告轮播编辑', 'system:family-banner:update', 1),
('广告轮播删除', 'system:family-banner:delete', 1),
('家族邀请查询', 'system:family-invitation:list', 1),
('家族邀请删除', 'system:family-invitation:delete', 1),
('应用插件查询', 'system:app-plugin:list', 1),
('应用插件新增', 'system:app-plugin:create', 1),
('应用插件编辑', 'system:app-plugin:update', 1),
('应用插件删除', 'system:app-plugin:delete', 1),
('宗亲聚会查询', 'system:gathering:list', 1),
('宗亲聚会新增', 'system:gathering:create', 1),
('宗亲聚会编辑', 'system:gathering:update', 1),
('宗亲聚会删除', 'system:gathering:delete', 1);

-- 将上述新增权限授予超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND (
  p.`code` LIKE 'system:subscription:%' OR p.`code` LIKE 'system:worship:%' OR
  p.`code` LIKE 'system:family-banner:%' OR p.`code` LIKE 'system:family-invitation:%' OR
  p.`code` LIKE 'system:app-plugin:%' OR p.`code` LIKE 'system:gathering:%'
);

-- ------------------------------------------------------------
-- 41. 合并迁移：后台菜单 + 应用中心升级
-- ------------------------------------------------------------
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);

INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`) VALUES
(@mini_program_dir, '订阅管理', 'menu', '/mini-program/subscription', 'view.mini-program_subscription', 'mini-program_subscription', 'mdi:crown-outline', 'system:subscription:list', 8, 1, 1, 1),
(@mini_program_dir, '祭祀管理', 'menu', '/mini-program/worship', 'view.mini-program_worship', 'mini-program_worship', 'mdi:incense', 'system:worship:list', 9, 1, 1, 1),
(@mini_program_dir, '家族邀请', 'menu', '/mini-program/family-invitation', 'view.mini-program_family-invitation', 'mini-program_family-invitation', 'mdi:email-send', 'system:family-invitation:list', 10, 1, 1, 1),
(@mini_program_dir, '广告轮播', 'menu', '/mini-program/banner', 'view.mini-program_banner', 'mini-program_banner', 'mdi:image-carousel', 'system:family-banner:list', 11, 1, 1, 1),
(@mini_program_dir, '应用插件', 'menu', '/mini-program/plugin', 'view.mini-program_plugin', 'mini-program_plugin', 'mdi:puzzle', 'system:app-plugin:list', 12, 1, 1, 1),
(@mini_program_dir, '宗亲聚会', 'menu', '/mini-program/gathering', 'view.mini-program_gathering', 'mini-program_gathering', 'mdi:account-group', 'system:gathering:list', 12, 1, 1, 1);

-- 将新增菜单授予超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` IN (
  'mini-program_subscription', 'mini-program_worship', 'mini-program_family-invitation',
  'mini-program_banner', 'mini-program_plugin', 'mini-program_gathering'
);

-- "应用插件"菜单升级为顶级"应用中心"（来源: 20260819-app-center-menu.sql，依赖上方应用插件菜单）
UPDATE `sys_menu`
SET `parent_id`  = 0,
    `name`       = '应用中心',
    `type`       = 'menu',
    `path`       = '/app-center',
    `component`  = 'layout.base$view.app-center',
    `route_name` = 'app-center',
    `icon`       = 'mdi:puzzle',
    `permission` = 'system:app-plugin:list',
    `sort_order` = 4,
    `status`     = 1,
    `visible`    = 1,
    `keep_alive` = 1
WHERE `route_name` = 'mini-program_plugin';

-- 兜底：若不存在旧"应用插件"菜单，直接创建顶级"应用中心"菜单
INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`)
SELECT 0, '应用中心', 'menu', '/app-center', 'layout.base$view.app-center', 'app-center', 'mdi:puzzle', 'system:app-plugin:list', 4, 1, 1, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sys_menu` WHERE `route_name` = 'app-center');

-- 清理残留旧嵌套"应用插件"菜单，防止新旧并存
DELETE FROM `sys_menu` WHERE `route_name` = 'mini-program_plugin';

-- 确保"应用中心"菜单已授权给超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'app-center';

-- ------------------------------------------------------------
-- 42. 数据回填与存量修复工具（幂等；新库无存量数据时自动跳过）
--   a) 存量微信绑定回填（来源: add-user-auth-identity.sql Step 3）
--   b) 存量家族种子分享码生成（来源: 20260819-family-seed-share-code.sql Step 3-4）
--   c) family.member_count 重算（来源: sync-family-member-count.sql）
-- ------------------------------------------------------------

-- a) 存量 user.openid / unionid → wechat 认证绑定回填（老用户无感迁移）
INSERT INTO `user_auth_identity` (`user_id`, `provider`, `provider_uid`, `unionid`)
SELECT `id`, 'wechat', `openid`, `unionid`
FROM `user`
WHERE `openid` <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `user_auth_identity` b
    WHERE b.`provider` = 'wechat' AND b.`provider_uid` = `user`.`openid`
  );

-- b) 为缺失种子分享码的存量家族生成 8 位唯一码（字符表去除 0/O/1/I）
DELIMITER //
DROP PROCEDURE IF EXISTS `sp_generate_family_seed_share_codes`//
CREATE PROCEDURE `sp_generate_family_seed_share_codes`()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_family_id INT UNSIGNED;
  DECLARE v_code VARCHAR(16);
  DECLARE v_dup INT;
  DECLARE cur CURSOR FOR
    SELECT `id` FROM `family`
    WHERE `status` = 1 AND (`seed_share_code` IS NULL OR `seed_share_code` = '');
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_family_id;
    IF done THEN LEAVE read_loop; END IF;

    SET v_code = '';
    gen_loop: LOOP
      SET v_code = UPPER(SUBSTRING(MD5(RAND()), 1, 8));
      -- 替换易混淆字符为安全字符
      SET v_code = REPLACE(REPLACE(REPLACE(REPLACE(v_code, '0', 'Z'), 'O', 'Y'), '1', 'X'), 'I', 'W');
      SELECT COUNT(*) INTO v_dup FROM `family` WHERE `seed_share_code` = v_code;
      IF v_dup = 0 THEN LEAVE gen_loop; END IF;
    END LOOP gen_loop;

    UPDATE `family` SET `seed_share_code` = v_code WHERE `id` = v_family_id;
  END LOOP read_loop;
  CLOSE cur;
END//
DELIMITER ;

CALL `sp_generate_family_seed_share_codes`();
DROP PROCEDURE IF EXISTS `sp_generate_family_seed_share_codes`;

-- 避免 NULL 值导致空字符串语义混淆
UPDATE `family` SET `seed_share_code` = NULL WHERE `seed_share_code` = '';

-- c) 一次性重算 family.member_count（按成员分表 status=1 数量，幂等）
DROP PROCEDURE IF EXISTS sp_sync_family_member_count;

DELIMITER //

CREATE PROCEDURE sp_sync_family_member_count()
BEGIN
  DECLARE v_id INT UNSIGNED DEFAULT 0;
  DECLARE v_cnt INT DEFAULT 0;
  DECLARE done INT DEFAULT 0;
  DECLARE cur CURSOR FOR SELECT `id` FROM `family`;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  -- 分表不存在等异常直接跳过该家族
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_cnt = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id;
    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET @tbl = CONCAT('family_members_', v_id);
    SET @cnt = NULL;
    SET @sql = CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @tbl, '` WHERE `status` = 1');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    SET v_cnt = IFNULL(@cnt, 0);

    UPDATE `family` SET `member_count` = v_cnt WHERE `id` = v_id;
  END LOOP;

  CLOSE cur;
END //

DELIMITER ;

CALL sp_sync_family_member_count();
DROP PROCEDURE sp_sync_family_member_count;

-- ------------------------------------------------------------
-- 43. 会员管理模块 5 张表 + 种子数据 + 权限菜单（幂等）
-- ------------------------------------------------------------

-- 会员等级表
CREATE TABLE IF NOT EXISTS `member_level` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '等级ID',
  `name`           VARCHAR(50)   NOT NULL COMMENT '等级名称',
  `code`           VARCHAR(30)   NOT NULL COMMENT '等级编码',
  `points_min`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '升级所需最低积分(含)',
  `points_max`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '积分上限(含)，0=不限',
  `discount_rate`  DECIMAL(5,2)  NOT NULL DEFAULT 1.00 COMMENT '消费折扣率(如 0.95 表示95折)',
  `sort_order`     INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '排序(越小越靠前)',
  `status`         TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-启用 0-停用',
  `remark`         VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_level_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员等级表';

-- 会员信息表
CREATE TABLE IF NOT EXISTS `member` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '会员ID',
  `member_no`       VARCHAR(32)   NOT NULL COMMENT '会员编号',
  `name`            VARCHAR(50)   NOT NULL COMMENT '会员姓名',
  `phone`           VARCHAR(20)   DEFAULT NULL COMMENT '手机号(空则不参与唯一校验)',
  `user_id`         VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '关联用户ID(user.id,小程序端绑定的账户)',
  `gender`          TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '性别 0-未知 1-男 2-女',
  `birthday`        DATE          DEFAULT NULL COMMENT '生日',
  `level_id`        INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '会员等级ID',
  `points`          INT           NOT NULL DEFAULT 0 COMMENT '当前积分',
  `total_consume`   DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计消费金额(元)',
  `consume_count`   INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '累计消费次数',
  `status`          TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 0-停用',
  `remark`          VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_no` (`member_no`),
  UNIQUE KEY `uk_member_phone` (`phone`),
  UNIQUE KEY `uk_member_user` (`user_id`),
  INDEX `idx_member_level` (`level_id`),
  INDEX `idx_member_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员信息表';

-- 积分规则表
CREATE TABLE IF NOT EXISTS `points_rule` (
  `id`                 INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  `name`               VARCHAR(50)   NOT NULL COMMENT '规则名称',
  `code`               VARCHAR(30)   NOT NULL COMMENT '规则编码',
  `points`             INT           NOT NULL DEFAULT 0 COMMENT '固定积分值(正奖励/负扣减)',
  `points_per_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '消费积分倍率(每消费1元得积分，仅消费规则使用)',
  `enabled`            TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用 1-是 0-否',
  `sort_order`         INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT '排序',
  `remark`             VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分规则表';

-- 积分变动记录表
CREATE TABLE IF NOT EXISTS `points_record` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `member_id`      INT UNSIGNED  NOT NULL COMMENT '会员ID',
  `change_points`  INT           NOT NULL COMMENT '变动积分(正增负减)',
  `balance_points` INT           NOT NULL DEFAULT 0 COMMENT '变动后积分余额',
  `biz_type`       VARCHAR(30)   NOT NULL DEFAULT '' COMMENT '业务类型 consume-消费 register-注册 signin-签到 adjust-人工调整 refund-退款退货',
  `source_id`      VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '来源业务ID(消费记录ID/订单号)',
  `remark`         VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '备注',
  `operator`       VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '操作人',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_points_member` (`member_id`, `create_time`),
  INDEX `idx_points_type` (`biz_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分变动记录表';

-- 会员消费记录表
CREATE TABLE IF NOT EXISTS `member_consume` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `order_no`       VARCHAR(64)   NOT NULL COMMENT '订单号',
  `member_id`      INT UNSIGNED  NOT NULL COMMENT '会员ID',
  `consume_type`   VARCHAR(30)   NOT NULL DEFAULT '' COMMENT '消费类型 goods-商品 service-服务 recharge-充值 membership-会员续费 other-其他',
  `amount`         DECIMAL(12,2) NOT NULL COMMENT '消费金额(元)',
  `points_gained`  INT           NOT NULL DEFAULT 0 COMMENT '本次获得积分',
  `pay_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '消费时间',
  `status`         TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '状态 1-正常 0-已作废(退货)',
  `operator`       VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '录入人',
  `remark`         VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_consume_order_no` (`order_no`),
  INDEX `idx_consume_member` (`member_id`, `create_time`),
  INDEX `idx_consume_type` (`consume_type`),
  INDEX `idx_consume_pay_time` (`pay_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员消费记录表';

-- 会员等级种子数据（幂等）
INSERT IGNORE INTO `member_level` (`name`, `code`, `points_min`, `points_max`, `discount_rate`, `sort_order`, `status`, `remark`) VALUES
('普通会员', 'normal',  0,      999,    1.00, 1, 1, '默认等级，0-999 积分'),
('银卡会员', 'silver',  1000,   4999,   0.98, 2, 1, '1000-4999 积分，98折'),
('金卡会员', 'gold',    5000,   19999,  0.95, 3, 1, '5000-19999 积分，95折'),
('钻石会员', 'diamond', 20000,  0,      0.90, 4, 1, '20000 积分及以上，9折');

-- 积分规则种子数据（幂等）
INSERT IGNORE INTO `points_rule` (`name`, `code`, `points`, `points_per_amount`, `enabled`, `sort_order`, `remark`) VALUES
('消费得积分', 'consume',  0,    1.00, 1, 1, '每消费 1 元得 1 积分'),
('注册送积分', 'register', 100,  0.00, 1, 2, '新会员注册赠送 100 积分'),
('签到得积分', 'signin',   5,    0.00, 1, 3, '每日签到得 5 积分'),
('退款扣积分', 'refund',   0,    0.00, 1, 4, '退款退货时按原获得积分回扣');

-- 会员管理权限码（幂等）
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('会员查询', 'system:member:list', 1),
('会员新增', 'system:member:create', 1),
('会员编辑', 'system:member:update', 1),
('会员删除', 'system:member:delete', 1),
('会员导出', 'system:member:export', 1);

-- 将会员权限授予超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:member:%';

-- 会员管理菜单（幂等，挂在「小程序管理」目录下）
SET @mini_program_dir := (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'mini-program' LIMIT 1);

INSERT IGNORE INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`) VALUES
(@mini_program_dir, '会员管理', 'menu', '/mini-program/member', 'view.mini-program_member', 'mini-program_member', 'mdi:card-account-details', 'system:member:list', 7, 1, 1, 1);

-- 将会员管理菜单授予超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'mini-program_member';
