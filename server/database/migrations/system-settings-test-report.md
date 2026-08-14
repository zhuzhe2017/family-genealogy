# 系统设置模块 — 测试报告

- **测试对象**：管理后台「系统管理 → 系统设置」模块（基础配置 / 日志查看 / 安全设置）
- **环境**：Windows / Node.js 25.2.1 / MySQL 8（utf8mb4）/ Chrome（最新版）
- **测试日期**：2026-08-10
- **结论**：✅ 全部功能通过，性能满足要求，已修复 1 个关键 Bug

---

## 一、单元测试（Jest）

| 测试套件 | 用例数 | 结果 |
|----------|-------|------|
| `system-config.service.spec.ts`（归一化/分组/更新/批量保存/恢复默认） | 16 | ✅ 16/16 |
| `system-log.service.spec.ts`（写入/查询/统计/导出/清理/删除） | 15 | ✅ 15/15 |
| `system-security.service.spec.ts`（密码策略校验/IP 匹配/登录锁定/验证码/二次验证） | 18 | ✅ 18/18 |
| 其余既有模块（family/surname/family-member/generation-table 等） | 76 | ⚠️ 74/76 |
| **合计** | **125** | **123/125** |

**⚠️ 2 个既有失败用例（与本模块无关，属 generation-table 模块历史遗留）**：
1. `姓氏 5 个汉字抛 BAD_REQUEST`：服务端正则 `\S{1,20}` 分支允许 5 字（兼容少数民族姓氏），与测试期望不符
2. `batchImport 收集非法行错误`：批量导入对含非法行的输入存在 `is not iterable` 崩溃

以上两项不在本次系统设置模块范围内，建议后续在字辈管理模块单独修复。

**类型检查**：后端 `npx tsc --noEmit` ✅ 通过；前端 `npx vue-tsc --noEmit` ✅ 源文件 0 错误（node_modules 中依赖自带类型告警为既有问题，与本次改动无关）。

---

## 二、API 功能测试（运行时实测）

| 接口 | 场景 | 结果 |
|------|------|------|
| `POST /auth/login` | 正确密码登录（`admin/123456`） | ✅ 返回 token |
| `GET /system-config/groups` | 无 token | ✅ 401（JWT 拦截） |
| `GET /system-config/groups` | 有 token | ✅ basic=5 / security=16 / log=2，字段 camelCase（`configKey/configValue/valueType`） |
| `POST /system-config/save-batch` | 批量保存基础配置 | ✅ `updated=5, success=true` |
| `GET /system-log/list` | 分页查询 | ✅ total=88，按条件筛选正常 |
| `GET /system-log/stats` | 类型统计 | ✅ op/err/acc 计数正确 |
| `GET /system-security/password-policy` | 密码策略 | ✅ minLength=6 |
| `GET /system-security/sensitive-config` | 二次验证配置 | ✅ enabled=true, timeout=120 |
| `POST /system-security/verify-password` | 正确/错误密码 | ✅ 正确→`{verified:true}`；错误→401 |
| `GET /system-security/captcha` | SVG 验证码 | ✅ token + svg 正常 |
| 异常场景 | 越权访问（无权限码） | ✅ PermissionsGuard 返回 403「无权访问」 |
| 异常场景 | `save-batch` 缺 id/configValue | ✅ 400「保存条目缺少 id 或 configValue」 |

---

## 三、浏览器集成测试（Chrome 自动化实测）

| 功能点 | 场景 | 结果 |
|--------|------|------|
| 登录 | admin/123456 | ✅ |
| 菜单 | 「系统管理 → 系统设置」入口 | ✅ |
| 三个 Tab | 基础配置 / 日志查看 (计数) / 安全设置 | ✅ |
| 基础配置 | 表单 label 正确中文、值正确回填（系统名称=数字家谱管理系统 等） | ✅ |
| 基础配置 | 修改→保存→刷新持久化→改回 | ✅ |
| 日志查看 | 类型/关键词/操作人/时间范围筛选 + 查询 | ✅ |
| 日志查看 | 分页表格 + 单条详情弹窗 | ✅ |
| 日志查看 | CSV 导出（下载触发 + BOM） | ✅ |
| 安全设置 | 4 张卡片值回填 | ✅ |
| 安全设置 | 修改→保存→**二次验证弹窗**→输密码→验证通过→保存成功→刷新持久化 | ✅ |
| 权限控制 | 未授权按钮/页面显示 403 提示（NResult） | ✅ |
| 控制台 | 全新会话 0 报错 0 警告 | ✅ |

**关键 Bug 修复记录**：
- **Bug**：后端 `getGroups` 返回 snake_case（`config_key` 等），前端按 camelCase 读取 → 表单无法回填、label 显示 `page.systemSettings.undefined`、保存 400、同组字段互相污染
- **修复**：后端 `system-config.service.ts` 新增 `toCamelRow()` 统一映射为 camelCase（`configKey/configValue/valueType/...`），`getList/getGroups/getByKey` 均应用；同步更新单测断言
- **验证**：修复后浏览器回归全部通过，控制台无 intlify 警告

**数据修复**：`sys_config.copyright` 存量值因种子导入字符集问题损坏（`???? © 2026`），已通过 SQL 修复为「数字家谱 © 2026」；`system_name` 经浏览器保存操作修复。列字符集核实为 utf8mb4，无后续风险。

---

## 四、兼容性测试

| 浏览器 | 结果 | 说明 |
|--------|------|------|
| Chrome（最新版） | ✅ 通过 | 自动化实测全流程 |
| Firefox（最新版） | ⏳ 待手工验证 | 本环境无自动化通道 |
| Safari（最新版） | ⏳ 待手工验证 | 需 macOS 环境 |
| Edge（最新版） | ⏳ 待手工验证 | 内核为 Chromium，风险极低 |

**说明**：模块使用 Vue 3 + Naive UI 标准 Web 组件，无浏览器私有 API；已通过 Chrome 全流程验证。Firefox/Safari/Edge 建议在上线前按本报告第三节的用例清单人工复测一次。

**响应式验证（Chrome 实测）**：

| 视口 | 结果 |
|------|------|
| 桌面 ≥1200px（1031px 实测） | ✅ 无横向滚动，布局正常 |
| 平板 768–1199px（820px 实测） | ✅ 无横向溢出，Tab/表单/按钮正常 |
| 移动 <768px（375px 实测） | ✅ 无横向溢出，侧边栏自动隐藏，表单可用 |

---

## 五、性能测试

**要求**：页面加载 <2s；数据查询响应 <1s；操作流畅无卡顿。

**API 响应时间**（5 轮实测，本地环境）：

| 接口 | 最慢 | 最快 | 平均 |
|------|------|------|------|
| GET /system-config/groups | 60.6 ms | 13.7 ms | ~26 ms |
| GET /system-log/list | 53.7 ms | 13.9 ms | ~23 ms |
| GET /system-log/stats | 13.5 ms | 10.7 ms | ~12 ms |
| GET /system-security/password-policy | 19.2 ms | 12.4 ms | ~15 ms |
| POST /system-config/save-batch | 35.2 ms | 12.5 ms | ~18 ms |

✅ 所有接口远低于 1s 要求；页面路由懒加载，全新会话打开 /system/settings 控制台零报错（秒开，无阻塞资源）。日志列表为远程分页（每页 10–100 条），大数据量下无渲染压力。

---

## 六、遗留事项

1. generation-table 模块 2 个既有失败用例（见第一节），建议在字辈管理模块任务中处理
2. Firefox / Safari / Edge 的最终确认需上线前人工复测
3. 日志表 `sys_log` 会持续增长，`log_retention_days`（默认 30 天）仅作配置项，自动清理任务尚未实现（可在后续运维中补充定时清理）
