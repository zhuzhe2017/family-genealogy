-- ============================================================
-- 迁移脚本：系统设置模块（基础配置 + 日志查看 + 安全设置）
-- 适用：已存在的 family_genealogy 数据库
-- 内容：1) 新建 sys_config(32)、sys_log(33) 表
--       2) 初始化基础配置/安全设置/日志配置默认值
--       3) 新增权限标识与系统设置菜单，并授权给超级管理员
-- 幂等：可重复执行
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 32. 系统配置表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sys_config` (
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
CREATE TABLE IF NOT EXISTS `sys_log` (
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

-- ------------------------------------------------------------
-- 初始化系统配置（幂等：已存在的键跳过）
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
-- 新增权限标识（幂等）
-- ------------------------------------------------------------
INSERT IGNORE INTO `sys_permission` (`name`, `code`, `status`) VALUES
('系统设置查询', 'system:settings:list', 1),
('系统设置编辑', 'system:settings:update', 1),
('安全设置查看', 'system:settings:security:list', 1),
('日志查询',     'system:settings:log:list', 1),
('日志删除',     'system:settings:log:delete', 1),
('日志导出',     'system:settings:log:export', 1),
('敏感操作验证', 'system:settings:verify', 1);

-- 将新权限授予超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `sys_role` r, `sys_permission` p
WHERE r.`code` = 'super'
  AND p.`code` IN ('system:settings:list', 'system:settings:update', 'system:settings:security:list',
                   'system:settings:log:list', 'system:settings:log:delete', 'system:settings:log:export',
                   'system:settings:verify');

-- ------------------------------------------------------------
-- 新增菜单：系统管理 -> 系统设置
-- ------------------------------------------------------------
SET @settings_parent = (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'system' LIMIT 1);

INSERT IGNORE INTO `sys_menu`
(`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`) VALUES
(@settings_parent, '系统设置', 'menu', '/system/settings', 'view.system_settings', 'system_settings', 'mdi:application-cog-outline', 'system:settings:list', 4, 1, 1, 1);

-- 将系统设置菜单授权给超级管理员角色（幂等）
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`)
SELECT r.`id`, m.`id` FROM `sys_role` r, `sys_menu` m
WHERE r.`code` = 'super' AND m.`route_name` = 'system_settings';
