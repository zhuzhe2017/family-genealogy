-- ============================================================
-- 数字家谱 · 文化内容域（识典古籍对标）
-- 说明：幂等脚本，可重复执行。
--       覆盖：文化文档 / 原页图片 / 章节 / AI对话 / 字典 + 权限码
-- 关联模块：server/src/cultural-document / ai-assistant / cultural-dict
-- 关联能力点：Capability.AiChat / AiSummary / Annotate / ReaderPro / TtsListen / OcrImport / CulturalDoc
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. 文化文档表（统一容器：家族族谱 + 公共古籍 + 手写稿）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cultural_document` (
  `id`               VARCHAR(32)   NOT NULL COMMENT '文档ID(32位hex)',
  `family_id`        INT UNSIGNED  DEFAULT NULL COMMENT '所属家族ID，NULL=公共古籍',
  `type`             VARCHAR(20)   NOT NULL COMMENT 'genealogy=家族谱 / ancient=公共古籍 / handwritten=手写稿',
  `title`            VARCHAR(200)  NOT NULL COMMENT '书名/文档名',
  `subtitle`         VARCHAR(200)  DEFAULT '' COMMENT '副标题',
  `author`           VARCHAR(100)  DEFAULT '' COMMENT '作者/编者',
  `dynasty`          VARCHAR(50)   DEFAULT '' COMMENT '朝代/年代',
  `cover_url`        VARCHAR(500)  DEFAULT '' COMMENT '封面图URL',
  `original_text`    MEDIUMTEXT    DEFAULT NULL COMMENT '原始文本(未断句)',
  `annotated_text`   MEDIUMTEXT    DEFAULT NULL COMMENT '注释整理版(断句+注释)',
  `translated_text`  MEDIUMTEXT    DEFAULT NULL COMMENT '白话译文',
  `summary`          TEXT          DEFAULT NULL COMMENT '内容摘要',
  `tag_json`         JSON          DEFAULT NULL COMMENT '标签: 朝代/主题/姓氏/地区',
  `view_count`       INT UNSIGNED  DEFAULT 0 COMMENT '阅读次数',
  `sort_order`       INT UNSIGNED  DEFAULT 0,
  `status`           TINYINT(1)    DEFAULT 1 COMMENT '1=启用 0=停用',
  `audit_status`     TINYINT(1)    DEFAULT 1 COMMENT '0=待审核 1=已通过 2=已下架',
  `create_by`        VARCHAR(50)   DEFAULT '',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_family` (`family_id`),
  INDEX `idx_type` (`type`),
  INDEX `idx_status` (`status`),
  INDEX `idx_audit` (`audit_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文化文档表';

-- ------------------------------------------------------------
-- 2. 文档原页图片表（扫描件/拍照件）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cultural_document_page` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id`      VARCHAR(32)   NOT NULL,
  `page_no`          INT UNSIGNED  NOT NULL COMMENT '页码(从1开始)',
  `image_url`        VARCHAR(500)  NOT NULL COMMENT '原图URL',
  `thumbnail_url`    VARCHAR(500)  DEFAULT '' COMMENT '缩略图URL',
  `width`            INT UNSIGNED  DEFAULT 0,
  `height`           INT UNSIGNED  DEFAULT 0,
  `ocr_text`         MEDIUMTEXT    DEFAULT NULL COMMENT 'OCR识别文本',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_page` (`document_id`, `page_no`),
  INDEX `idx_doc` (`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档原页图片表';

-- ------------------------------------------------------------
-- 3. 文档章节表（结构化章节，支持树形嵌套）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cultural_document_chapter` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `document_id`      VARCHAR(32)   NOT NULL,
  `parent_id`        INT UNSIGNED  DEFAULT 0 COMMENT '0=顶级章节',
  `title`            VARCHAR(200)  NOT NULL,
  `content`          MEDIUMTEXT    DEFAULT NULL COMMENT '本章正文(注释版)',
  `translated`       MEDIUMTEXT    DEFAULT NULL COMMENT '本章白话译文',
  `page_start`       INT UNSIGNED  DEFAULT 0,
  `page_end`         INT UNSIGNED  DEFAULT 0,
  `sort_order`       INT UNSIGNED  DEFAULT 0,
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_doc` (`document_id`),
  INDEX `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档章节表';

-- ------------------------------------------------------------
-- 4. AI 对话会话表（家族级隔离，支持多轮对话）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_chat_session` (
  `id`               VARCHAR(32)   NOT NULL COMMENT '会话ID(32位hex)',
  `family_id`        INT UNSIGNED  NOT NULL COMMENT '所属家族',
  `user_id`          VARCHAR(32)   NOT NULL COMMENT '发起用户',
  `title`            VARCHAR(200)  DEFAULT '' COMMENT '会话标题(自动生成或手动)',
  `context_type`     VARCHAR(20)   DEFAULT 'general' COMMENT 'general=通用 / genealogy=族谱 / ancient=古籍',
  `message_count`    INT UNSIGNED  DEFAULT 0,
  `last_message_at`  DATETIME      DEFAULT NULL,
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_family_user` (`family_id`, `user_id`),
  INDEX `idx_last_msg` (`family_id`, `last_message_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI对话会话表';

-- ------------------------------------------------------------
-- 5. AI 对话消息表（存储每轮 user/assistant 消息 + Token 用量）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_chat_message` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id`       VARCHAR(32)   NOT NULL,
  `role`             VARCHAR(10)   NOT NULL COMMENT 'user / assistant',
  `content`          MEDIUMTEXT    NOT NULL,
  `model`            VARCHAR(50)   DEFAULT '' COMMENT 'LLM模型名(如 doubao-pro-32k)',
  `prompt_tokens`    INT UNSIGNED  DEFAULT 0,
  `completion_tokens` INT UNSIGNED DEFAULT 0,
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_session` (`session_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI对话消息表';

-- ------------------------------------------------------------
-- 6. 文化字典表（字辈/堂号/家谱术语/溯源）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cultural_dictionary` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `category`         VARCHAR(30)   NOT NULL COMMENT 'zibei=字辈 / tanghao=堂号 / terminology=家谱术语 / suyuan=溯源',
  `dict_key`         VARCHAR(100)  NOT NULL COMMENT '词条关键(字辈字/堂号名/术语)',
  `surname`          VARCHAR(20)   DEFAULT '' COMMENT '关联姓氏(字辈专用)',
  `content`          TEXT          NOT NULL COMMENT '释义/说明',
  `source`           VARCHAR(200)  DEFAULT '' COMMENT '出处',
  `tags`             JSON          DEFAULT NULL,
  `sort_order`       INT UNSIGNED  DEFAULT 0,
  `status`           TINYINT(1)    DEFAULT 1,
  `create_by`        VARCHAR(50)   DEFAULT '',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_category` (`category`),
  INDEX `idx_surname` (`surname`),
  INDEX `idx_key` (`category`, `dict_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文化字典表';

-- ============================================================
-- 权限码（INSERT IGNORE 幂等）
-- 与 sys_permission.code 保持一致的命名风格
-- ============================================================
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('文化内容查询',   'system:cultural-doc:list',   1),
('文化内容新增',   'system:cultural-doc:create', 1),
('文化内容编辑',   'system:cultural-doc:update', 1),
('文化内容删除',   'system:cultural-doc:delete', 1),
('原页图片管理',   'system:cultural-doc:page',   1),
('字典词条查询',   'system:cultural-dict:list',  1),
('字典词条管理',   'system:cultural-dict:manage',1);

-- 超级管理员自动授权（INSERT IGNORE 幂等）
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super' AND p.`code` LIKE 'system:cultural-%';

-- ============================================================
-- LLM / AI 相关系统配置项（默认值，生产环境需在管理端修改）
-- api_key 默认留空，管理端修改时用 ConfigCryptoService 加密存储
-- ============================================================
INSERT IGNORE INTO `sys_config`
(`config_key`, `config_name`, `config_value`, `value_type`, `group`, `remark`, `sort_order`, `is_system`) VALUES
('llm_provider',  'LLM服务提供商', 'doubao',         'string', 'ai', 'LLM Provider：doubao(豆包) / deepseek / qwen(通义千问)', 1, 1),
('llm_api_key',   'LLM API Key',   '',               'string', 'ai', 'API Key，生产环境建议加密存储（管理端修改自动加密）',      2, 1),
('llm_model',     'LLM默认模型',   'doubao-pro-32k', 'string', 'ai', '默认模型名（留空则用 Provider 默认模型）',                3, 1);

-- ============================================================
-- Part 5：TTS 音频缓存表（识典古籍对标 · 阶段 4）
-- ============================================================
CREATE TABLE IF NOT EXISTS `tts_audio_cache` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `text_hash`        VARCHAR(32)   NOT NULL COMMENT 'MD5(text+voice)',
  `audio_url`        VARCHAR(500)  NOT NULL COMMENT '合成后音频 URL',
  `file_name`        VARCHAR(200)  DEFAULT '' COMMENT '对象存储路径',
  `duration_sec`     INT UNSIGNED  DEFAULT 0,
  `segments`         INT UNSIGNED  DEFAULT 1,
  `chapter_id`       INT UNSIGNED  DEFAULT NULL COMMENT '关联章节（可选）',
  `provider`         VARCHAR(30)   DEFAULT 'edge-tts',
  `status`           TINYINT(1)    DEFAULT 1,
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_text_hash` (`text_hash`),
  INDEX `idx_chapter` (`chapter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='TTS 音频缓存表';

-- TTS Provider 默认配置（与 LLM 分开，加密存储密钥）
INSERT IGNORE INTO `sys_config`
(`config_key`, `config_name`, `config_value`, `value_type`, `group`, `remark`, `sort_order`, `is_system`) VALUES
('tts_provider',  'TTS Provider',    'edge-tts',  'string', 'ai', '可选：edge-tts（免费） / tencent（规模化）', 4, 1),
('tts_api_key',   'TTS API Key',     '',         'string', 'ai', 'edge-tts 不需要；腾讯云 TTS 需填 SecretId/SecretKey', 5, 1),
('tts_app_id',    'TTS AppID',       '',         'string', 'ai', '腾讯云 TTS AppID（可选）',                         6, 1);

-- ============================================================
-- Part 6：OCR 结果缓存表（识典古籍对标 · 阶段 5）
-- 一张表存 OCR 文本缓存 + AI 结构化缓存（cache_type 区分）
-- ============================================================
CREATE TABLE IF NOT EXISTS `ocr_result_cache` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `content_hash`     VARCHAR(32)   NOT NULL COMMENT 'MD5(图片或OCR文本)',
  `cache_type`       VARCHAR(20)   NOT NULL COMMENT 'ocr=OCR文本 / structure=AI结构化',
  `ocr_text`         MEDIUMTEXT    DEFAULT NULL COMMENT 'OCR 原始文本（ocr 类型）',
  `lines_json`       JSON          DEFAULT NULL COMMENT 'OCR 分行（ocr 类型）',
  `structured_json`  JSON          DEFAULT NULL COMMENT 'AI 结构化成员数组（structure 类型）',
  `provider`         VARCHAR(30)   DEFAULT 'mock',
  `expire_time`      DATETIME      NOT NULL COMMENT '过期时间（默认 7 天）',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hash_type` (`content_hash`, `cache_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OCR 结果缓存表（ocr + structure 共用）';

-- OCR Provider 默认配置
INSERT IGNORE INTO `sys_config`
(`config_key`, `config_name`, `config_value`, `value_type`, `group`, `remark`, `sort_order`, `is_system`) VALUES
('ocr_provider',  'OCR Provider',    'mock',  'string', 'ai', '可选：mock（开发）/ tencent（腾讯云手写体推荐）/ baidu / aliyun', 7, 1),
('ocr_api_key',   'OCR API Key',     '',      'string', 'ai', 'Provider 的 API Key（加密存储）',                                  8, 1);

-- ============================================================
-- 验证 SQL（部署后执行确认）
-- ============================================================
-- 表结构：
--   SHOW TABLES LIKE 'cultural_%';
--   预期: 6 张表（cultural_document / _page / _chapter / _dictionary + ai_chat_session / _message）
--
--   SHOW TABLES LIKE '%cache%';
--   预期: 2 张表（tts_audio_cache + ocr_result_cache）
--
-- 权限码：
--   SELECT * FROM sys_permission WHERE code LIKE 'system:cultural-%';
--   预期: 7 条
--
-- 超级管理员授权：
--   SELECT COUNT(*) FROM sys_role_permission rp
--   JOIN sys_role r ON r.id = rp.role_id
--   JOIN sys_permission p ON p.id = rp.permission_id
--   WHERE r.code = 'super' AND p.code LIKE 'system:cultural-%';
--   预期: 7
