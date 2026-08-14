# 系统设置模块 — 接口文档

## 概述

系统设置模块位于管理后台「系统管理 → 系统设置」，包含三部分功能：

1. **基础配置管理**（`system-config`）：系统名称、Logo、默认语言、时区、版权等基础参数
2. **日志查看**（`system-log`）：操作日志、错误日志、访问日志的查询/筛选/导出/清理
3. **安全设置**（`system-security`）：密码策略、登录安全、IP 访问限制、敏感操作二次验证

**统一约定：**

- Base URL：`/api`
- 鉴权：除标注 `@Public` 的接口外，均需请求头 `Authorization: Bearer <token>`
- 响应格式：`{ code: "0000", data: {...}, msg: "success" }`；失败时 `code` 为 4 位错误码（如 `"401"`），`msg` 为错误信息
- 数据库字段为 snake_case，API 输出统一为 camelCase（`config_key` → `configKey`）

---

## 一、基础配置管理（`/system-config`）

### 1. 按分组获取全部配置

- **`GET /system-config/groups`**
- **权限**：`system:settings:list` 或 `system:settings:security:list`
- **响应 `data`**：按分组返回

```json
{
  "basic":    [{ "id": 1, "configKey": "system_name", "configName": "系统名称", "configValue": "数字家谱管理系统", "valueType": "string", "group": "basic", "remark": "", "sortOrder": 1, "status": 1, "isSystem": 1, "operator": "", "createTime": "...", "updateTime": "..." }],
  "security": [],
  "log":      []
}
```

- `configValue` 已按 `valueType` 归一化：`string`→字符串、`number`→数字、`boolean`→布尔、`json`→数组/对象
- `valueType` 取值：`string | number | boolean | json`

### 2. 分页列表

- **`GET /system-config/list?page=1&pageSize=10&keyword=&group=&status=`**
- **权限**：`system:settings:list`
- 参数：`keyword`（按配置键/名称/说明模糊搜索）、`group`（`basic|security|log`）、`status`（0/1）
- **响应 `data`**：`{ list: SysConfigItem[], total, page, pageSize }`

### 3. 获取单条配置

- **`GET /system-config/:key`**（`key` 为 `configKey`，如 `system_name`）
- **权限**：`system:settings:list`

### 4. 更新单条配置

- **`PUT /system-config/update/:id`**
- **权限**：`system:settings:update`
- **请求体**（均可选，至少一项）：

```json
{ "configValue": "新值", "configName": "新名称", "remark": "说明", "sortOrder": 1, "status": 1 }
```

### 5. 批量保存

- **`POST /system-config/save-batch`**
- **权限**：`system:settings:update`
- **请求体**：`{ "items": [{ "id": 1, "configValue": "值" }] }`
- 使用事务批量更新，全部成功或全部回滚
- **响应 `data`**：`{ success: true, updated: n }`

### 6. 恢复默认值

- **`POST /system-config/reset/:id`**
- **权限**：`system:settings:update`
- 仅系统内置配置（`is_system = 1`）支持恢复默认值

### sys_config 内置配置项（23 条）

| 分组 | configKey | valueType | 默认值 | 说明 |
|------|-----------|-----------|--------|------|
| basic | `system_name` | string | 数字家谱管理系统 | 系统名称 |
| basic | `system_logo` | string | （空） | 系统 LOGO 图片地址 |
| basic | `default_language` | string | zh-CN | 默认语言 |
| basic | `timezone` | string | Asia/Shanghai | 时区 |
| basic | `copyright` | string | 数字家谱 © 2026 | 版权信息 |
| security | `password_min_length` | number | 6 | 密码最小长度 |
| security | `password_require_upper` | boolean | false | 必须包含大写字母 |
| security | `password_require_lower` | boolean | false | 必须包含小写字母 |
| security | `password_require_number` | boolean | false | 必须包含数字 |
| security | `password_require_special` | boolean | false | 必须包含特殊字符 |
| security | `password_expire_days` | number | 0 | 密码有效期（天），0=不强制修改 |
| security | `login_max_attempts` | number | 5 | 登录失败锁定阈值（次） |
| security | `login_lockout_minutes` | number | 15 | 锁定时长（分钟） |
| security | `login_captcha_enabled` | boolean | false | 启用登录图形验证码 |
| security | `login_token_expire_days` | number | 7 | 登录 access token 有效期（天），后端签发时实时读取（refreshToken 固定 30 天） |
| security | `ip_restriction_enabled` | boolean | false | 启用 IP 访问限制 |
| security | `ip_restriction_mode` | string | blacklist | 限制模式：blacklist/whitelist |
| security | `ip_blacklist` | json | [] | IP 黑名单（支持通配符 `*` 与 CIDR） |
| security | `ip_whitelist` | json | [] | IP 白名单（同上） |
| security | `sensitive_op_verify_enabled` | boolean | true | 启用敏感操作二次验证 |
| security | `sensitive_op_verify_timeout` | number | 120 | 验证有效期（秒） |
| log | `log_access_enabled` | boolean | true | 记录访问日志 |
| log | `log_retention_days` | number | 30 | 日志保留天数 |

> 修改安全/日志配置后，后端会立即失效 5 秒缓存，使新策略即时生效。

---

## 二、日志查看（`/system-log`）

`logType` 取值：`operation`（操作日志）| `error`（错误日志）| `access`（访问日志）

### 1. 分页查询

- **`GET /system-log/list?page=1&pageSize=10&logType=&module=&keyword=&operator=&startTime=&endTime=`**
- **权限**：`system:settings:log:list`
- `keyword`：模糊匹配操作/路径/详情；`startTime`/`endTime`：`yyyy-MM-dd HH:mm:ss`
- **响应 `data`**：

```json
{
  "list": [{ "id": 1, "logType": "operation", "module": "system-config", "action": "保存配置",
             "method": "POST", "path": "/api/system-config/save-batch", "operator": "admin",
             "ip": "::1", "status": 200, "success": 1, "detail": "{...}", "costTime": 35, "createTime": "..." }],
  "total": 134, "page": 1, "pageSize": 10
}
```

### 2. 日志统计

- **`GET /system-log/stats`**
- **权限**：`system:settings:log:list`
- **响应 `data`**：`{ operation: n, error: n, access: n }`

### 3. 导出 CSV

- **`GET /system-log/export?logType=&module=&keyword=&operator=&startTime=&endTime=`**
- **权限**：`system:settings:log:export`
- 响应为 `text/csv`，`Content-Disposition: attachment`，含 UTF-8 BOM（Excel 打开中文不乱码），最多导出 10000 条

### 4. 日志详情

- **`GET /system-log/:id`**
- **权限**：`system:settings:log:list`

### 5. 清理日志

- **`DELETE /system-log/clean?logType=&startTime=&endTime=`**
- **权限**：`system:settings:log:delete`（建议配合二次验证）
- **响应 `data`**：`{ success: true, deleted: n }`

### 6. 删除单条

- **`DELETE /system-log/:id`**
- **权限**：`system:settings:log:delete`

> **日志记录机制**：全局 `LogInterceptor` 自动拦截所有 API——所有请求写 access 日志，写操作（POST/PUT/DELETE）追加写 operation 日志；`AllExceptionsFilter` 对 5xx 异常写 error 日志。日志表 `sys_log` 可通过 `log_access_enabled` 关闭访问日志、`log_retention_days` 控制保留天数。

---

## 三、安全设置（`/system-security`）

### 1. 当前密码策略

- **`GET /system-security/password-policy`**
- **权限**：`system:settings:security:list`
- **响应 `data`**：`{ minLength, requireUpper, requireLower, requireNumber, requireSpecial, expireDays }`

### 2. 敏感操作二次验证配置

- **`GET /system-security/sensitive-config`**
- **权限**：`system:settings:security:list`
- **响应 `data`**：`{ enabled: boolean, timeout: number }`（timeout 单位秒）

### 3. 二次验证（校验当前管理员密码）

- **`POST /system-security/verify-password`**，请求体 `{ "password": "..." }`
- **权限**：`system:settings:verify`
- 二次验证未启用时返回 400；密码错误返回 401
- **响应 `data`**：`{ verified: true, expiresIn: 120 }`（expiresIn 为验证有效期秒数）

### 4. 登录页公开配置

- **`GET /system-security/login-config`**（`@Public`，无需登录）
- **响应 `data`**：`{ captchaEnabled: boolean }`

### 5. 图形验证码

- **`GET /system-security/captcha`**（`@Public`，无需登录）
- 服务端生成 SVG（含干扰线），token 一次性有效，TTL 10 分钟
- **响应 `data`**：`{ token: string, svg: string }`

### 6. 安全策略生效范围（登录链路）

登录时 `POST /auth/login` 依次执行：IP 白/黑名单检查 → 登录失败锁定检查 → 验证码校验（启用时）→ 密码校验。密码策略在创建管理员 / 修改密码时生效。

---

## 四、权限码清单（7 个）

| 权限码 | 说明 |
|--------|------|
| `system:settings:list` | 基础配置查看 |
| `system:settings:update` | 基础配置/安全设置编辑保存 |
| `system:settings:security:list` | 安全设置查看 |
| `system:settings:log:list` | 日志查询/详情 |
| `system:settings:log:delete` | 日志删除/清理 |
| `system:settings:log:export` | 日志导出 |
| `system:settings:verify` | 敏感操作二次验证 |

> 菜单「系统设置」对应 `sys_menu` id=17（`route_name=system_settings`），页面级路由由 elegant-router 自动生成（`/system/settings`）。
