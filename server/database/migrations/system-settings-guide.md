# 系统设置模块 — 使用说明

## 一、模块入口

登录管理后台 → 左侧菜单「系统管理」→「系统设置」，进入 `/system/settings` 页面。

页面包含三个 Tab：**基础配置**、**日志查看**、**安全设置**。

> 拥有 `system:settings:list` 及子权限的角色可见本菜单；无权限时页面显示 403 提示卡片，相关按钮自动隐藏/禁用。

---

## 二、基础配置

用于管理系统级基础参数。修改后点击「保存」立即生效，无需重启服务。

| 配置项 | 说明 |
|--------|------|
| 系统名称 | 显示在登录页/浏览器标题等位置的系统名称 |
| 系统 LOGO | LOGO 图片地址，留空使用默认 |
| 默认语言 | 系统默认界面语言（如 `zh-CN`） |
| 时区 | 系统时区（如 `Asia/Shanghai`） |
| 版权信息 | 页脚版权文本 |

---

## 三、日志查看

**日志分类**（全局拦截器自动记录，无需手工写入）：

- **操作日志**：所有写操作（POST/PUT/DELETE）的关键信息，含操作人、IP、耗时
- **错误日志**：服务端 5xx 异常堆栈（错误详情）
- **访问日志**：所有 API 请求（可通过 `log_access_enabled` 开关关闭）

**检索维度**：

1. 日志类型下拉（操作/错误/访问）
2. 关键词（匹配操作、路径、详情）
3. 操作人（按用户名筛选）
4. 时间范围（日期区间选择器）
5. 「查询」/「刷新」按钮执行检索与重置

**其他操作**：

- **查看详情**：点击行内「查看详情」弹窗展示完整字段与错误详情（`detail`）
- **导出**：按当前筛选条件导出 CSV（UTF-8 BOM，Excel 可直接打开），最多 1 万条
- **清理**：按当前筛选条件批量删除日志（**敏感操作，需二次验证**，不可恢复）
- **删除**：删除单条日志（**需二次验证**）

> 日志统计徽标（Tab 上的数字）实时显示三类日志数量。

---

## 四、安全设置

### 4.1 密码策略

| 配置项 | 说明 |
|--------|------|
| 密码最小长度 | 1–32，默认 6 |
| 必须包含大写/小写/数字/特殊字符 | 布尔开关 |
| 密码有效期（天） | 0 表示不强制改密；>0 时过期提醒 |

> 策略在**创建管理员**与**修改密码**时强制校验，不符合会直接拒绝。

### 4.2 登录安全

| 配置项 | 说明 |
|--------|------|
| 登录失败锁定阈值 | 同一账号连续失败 N 次后锁定 |
| 锁定时长 | 锁定分钟数 |
| 启用登录图形验证码 | 开启后登录页显示 SVG 验证码（点击刷新） |
| 令牌有效期（天） | 登录 access token 有效期，1–365，默认 7；由后端签发时实时读取，修改后即时生效（refreshToken 固定 30 天） |

### 4.3 IP 访问限制

- 开关启用后按「黑名单/白名单」模式生效：
  - **黑名单**：列表中的 IP 禁止登录
  - **白名单**：仅列表中 IP 允许登录
- 每行一个 IP，支持通配符 `192.168.1.*` 与 CIDR `10.0.0.0/8`

> ⚠️ 谨慎使用白名单模式，避免将自己锁在系统外。

### 4.4 敏感操作二次验证

- 开关启用后，执行**日志清理/删除**、**保存安全设置**等敏感操作前必须输入当前登录密码
- 验证通过后在**有效期**（默认 120 秒）内无需重复验证
- 验证接口：`POST /system-security/verify-password`

**保存**：修改任何安全配置后点击页面底部「保存」，会先弹出二次验证，验证通过后批量写入并即时生效（后端配置缓存自动失效）。

---

## 五、权限分配

模块共 7 个细粒度权限码，在「系统管理 → 角色管理」中为角色分配：

| 权限码 | 能力 |
|--------|------|
| `system:settings:list` | 查看基础配置（菜单可见性依赖） |
| `system:settings:update` | 编辑/保存基础配置与安全设置 |
| `system:settings:security:list` | 查看安全设置 Tab |
| `system:settings:log:list` | 查看日志、查询、详情 |
| `system:settings:log:delete` | 删除/清理日志 |
| `system:settings:log:export` | 导出日志 CSV |
| `system:settings:verify` | 二次验证密码校验 |

**权限行为**：
- 无 `security:list` → 安全设置 Tab 显示 403 卡片
- 无 `log:list` → 日志 Tab 显示 403 卡片
- 无 `update` → 输入框/开关全部禁用，保存按钮隐藏
- 无 `log:delete`/`log:export`/`verify` → 对应按钮隐藏

---

## 六、部署与集成

### 6.1 数据库迁移

执行 `server/database/migration-system-settings.sql`（幂等）：

- 新增表：`sys_config`（23 条内置配置种子）、`sys_log`
- 新增 7 个权限码、菜单「系统设置」（`sys_menu` id=17）
- 将权限绑定至 `super` 角色（其他角色需在角色管理手动分配）

### 6.2 后端

- 模块目录：`server/src/system-config/`、`server/src/system-log/`、`server/src/system-security/`
- 已在 `app.module.ts` 注册；`system-security`、`system-log` 为全局模块（`@Global()`）
- `LogInterceptor` 通过 `APP_INTERCEPTOR` 全局注册；`AllExceptionsFilter` 通过 `APP_FILTER` 注入（5xx 写错误日志）
- 登录链路已接入安全策略（`admin.service.ts` 调用 `checkLoginAllowed`）

### 6.3 前端

- 页面：`soybean-admin/src/views/system/settings/index.vue`
- API：`soybean-admin/src/service/api/system-settings.ts`（`/system-config`、`/system-log`、`/system-security`）
- 路由：elegant-router 自动生成 `system_settings`（无需手工注册）
- i18n：`zh-cn.ts` / `en-us.ts` 已含 `route.system_settings` 与 `page.systemSettings.*` 全量文案
- 登录页已接入图形验证码（`pwd-login.vue`，由 `login_captcha_enabled` 驱动）

### 6.4 验证清单

1. `server`：`npm run build` && `npx tsc --noEmit` && `npx jest`
2. `soybean-admin`：`npx vue-tsc --noEmit`
3. 登录后台 → 系统设置，按本说明第二~五节逐项验证
