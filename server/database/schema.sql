-- ============================================================
-- 数字家谱 - 数据库结构定义
-- 数据库类型: MySQL / MariaDB
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
  `status`      TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-禁用',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_openid` (`openid`),
  INDEX `idx_phone` (`phone`)
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
  `mother_id`     VARCHAR(32)   DEFAULT '' COMMENT '母亲成员ID',
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
('系统设置查询', 'system:settings:list', 1),
('系统设置编辑', 'system:settings:update', 1),
('安全设置查看', 'system:settings:security:list', 1),
('日志查询',     'system:settings:log:list', 1),
('日志删除',     'system:settings:log:delete', 1),
('日志导出',     'system:settings:log:export', 1),
('敏感操作验证', 'system:settings:verify', 1);

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
(@mini_program_dir, '成员管理', 'menu', '/mini-program/members', 'mini-program_members', 'members', '', '', 3, 1, 1, 1),
(@mini_program_dir, '数据概览', 'menu', '/mini-program/overview', 'view.mini-program_overview', 'mini-program_overview', '', '', 4, 1, 1, 1),
(@mini_program_dir, '家族管理', 'menu', '/mini-program/family', 'view.mini-program_family', 'mini-program_family', 'mdi:account-group-outline', 'system:family:list', 5, 1, 1, 1),
(@mini_program_dir, '姓氏管理', 'menu', '/mini-program/surname', 'view.mini-program_surname', 'mini-program_surname', '', 'system:surname:list', 6, 1, 1, 1),
(@mini_program_dir, '字辈管理', 'menu', '/mini-program/generation-table', 'view.mini-program_generation-table', 'mini-program_generation-table', '', 'system:generation-table:list', 7, 1, 1, 1),
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
