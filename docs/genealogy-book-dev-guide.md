# 家谱成书输出制作模块 · 开发文档

> 模块版本：v1.0
> 技术栈：NestJS 10 + TypeORM (DataSource) + MySQL | Vue 3 + TypeScript + NaiveUI + UnoCSS
> 最后更新：2026-09-20

---

## 一、模块架构设计

### 1.1 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                    web-admin (Vue 3)                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  views/mini-program/genealogy-book/index.vue        │ │
│  │  · 家族选择 / 数据表格 / 新增编辑弹窗 / 预览弹窗      │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │  service/api/genealogy-book.ts                      │ │
│  │  · axios 封装（含 blob 下载导出）                     │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP / JWT
┌──────────────────────────▼──────────────────────────────┐
│                  server (NestJS 10)                      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  GenealogyBookController                             │ │
│  │  · REST 端点 + @Permissions 权限守卫                  │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │  GenealogyBookService                                │ │
│  │  · CRUD / preview / exportHtml                       │ │
│  │  · ensureFamilyExists / ensureMemberTable            │ │
│  │  · getMembersGrouped / getGenerationTable            │ │
│  │  · HTML 构建器（封面/章节/世系/关系/成员明细）        │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │  common/utils/family-member-table.ts                 │ │
│  │  · getSafeMemberTableName(familyId)                  │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │  common/guards / decorators / interceptors           │ │
│  │  · JwtAuthGuard → RolesGuard → PermissionsGuard      │ │
│  │  · ResponseInterceptor（统一响应包装）                │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │ SQL (DataSource.query)
┌──────────────────────────▼──────────────────────────────┐
│                       MySQL                              │
│  · genealogy_book           — 成书配置表                  │
│  · family                   — 家族主表（existence check） │
│  · family_members_{familyId} — 分表：家族成员数据         │
│  · generation_table         — 字辈表                     │
│  · sys_permission / sys_role_permission / sys_menu      │
│    / sys_role_menu          — 权限与菜单                 │
└─────────────────────────────────────────────────────────┘
```

### 1.2 模块文件结构

```
server/src/genealogy-book/
├── genealogy-book.module.ts        # NestJS 模块定义
├── genealogy-book.controller.ts    # REST 控制器（权限守卫 + 端点定义）
├── genealogy-book.service.ts       # 核心业务逻辑
├── genealogy-book.service.spec.ts  # 单元测试（14 用例）
└── types/
    └── genealogy-book.types.ts     # 类型定义

server/test/
└── genealogy-book.e2e-spec.ts      # e2e 集成测试（10 用例）

server/database/
└── genealogy-book.sql              # 建表 DDL + 权限/菜单 SQL（幂等）

web-admin/src/
├── service/api/genealogy-book.ts   # 前端 API 封装
├── views/mini-program/genealogy-book/
│   └── index.vue                   # 管理页面
└── router/elegant/                 # elegant-router 路由配置
```

---

## 二、接口设计规范

### 2.1 路由约定

- 控制器前缀：`@Controller('genealogy-book/:familyId')`
- 所有端点（除 `templates`）需要 JWT 认证 + 权限校验
- `familyId` 和 `id` 均经 `ParseIntPipe` 转为 `number`

### 2.2 端点一览

| 方法 | 路径 | 权限标识 | 说明 |
|------|------|---------|------|
| GET | `/genealogy-book/:familyId/templates` | — | 获取可用模板列表（无需鉴权） |
| GET | `/genealogy-book/:familyId/list` | `system:genealogy-book:list` | 分页列表 |
| GET | `/genealogy-book/:familyId/:id` | `system:genealogy-book:list` | 获取单条 |
| POST | `/genealogy-book/:familyId/create` | `system:genealogy-book:create` | 创建 |
| PUT | `/genealogy-book/:familyId/update/:id` | `system:genealogy-book:update` | 更新 |
| DELETE | `/genealogy-book/:familyId/delete/:id` | `system:genealogy-book:delete` | 删除 |
| POST | `/genealogy-book/:familyId/toggle-status/:id` | `system:genealogy-book:update` | 切换启停 |
| GET | `/genealogy-book/:familyId/preview/:id` | `system:genealogy-book:list` | 预览数据 |
| GET | `/genealogy-book/:familyId/export/:id` | `system:genealogy-book:export` | 导出 HTML |

### 2.3 统一响应格式

除 `export/:id` 外，所有端点经 `ResponseInterceptor` 包装：

```json
{ "code": "0000", "data": { ... }, "msg": "success" }
```

`export/:id` 使用 `@Res()` 直接发送 `text/html` 文件流，绕过拦截器包装。

### 2.4 请求参数

**创建（POST /create）**

```json
{
  "title": "张氏族谱",
  "subtitle": "2026年修订版",
  "template": "european",
  "preface": "序言内容...",
  "introduction": "家族简介...",
  "clanRules": "家训内容...",
  "generationPoem": "字辈诗...",
  "appendix": "附录内容...",
  "coverStyle": "default",
  "fontFamily": "serif",
  "paperSize": "A4",
  "includeGenerationTable": 1,
  "includeMemberBio": 1,
  "includeTreeChart": 1,
  "includeIndex": 1,
  "sortOrder": 0
}
```

**更新（PUT /update/:id）**：字段同创建，全部可选。至少需包含一个字段，否则返回 400。

**预览响应（GET /preview/:id）**

```json
{
  "bookTitle": "张氏家族家谱",
  "familyName": "张氏家族",
  "template": "european",
  "generationCount": 5,
  "memberCount": 42,
  "generationLabels": [
    {
      "generation": 1,
      "label": "文字辈（第1代）",
      "members": [
        {
          "id": "uuid-xxx",
          "name": "张文明",
          "gender": "male",
          "generation": 1,
          "generationName": "文",
          "birthDate": "1950-01-01",
          "birthPlace": "河南商丘",
          "isAlive": 1,
          "deathDate": "",
          "bio": "",
          "fatherId": "",
          "motherId": "",
          "spouseNames": ["李氏"],
          "sortOrder": 0,
          "childrenIds": ["uuid-yyy"]
        }
      ]
    }
  ]
}
```

---

## 三、数据模型定义

### 3.1 `genealogy_book` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK AI | 主键 |
| `family_id` | INT UNSIGNED | 所属家族 ID |
| `title` | VARCHAR(100) | 书名（同家族唯一，`uk_family_title`） |
| `subtitle` | VARCHAR(200) | 副标题 |
| `template` | VARCHAR(20) | 模板：`european`/`su_style`/`modern`/`classical` |
| `preface` | TEXT | 序言 |
| `introduction` | TEXT | 家族简介 |
| `clan_rules` | TEXT | 家训 |
| `generation_poem` | TEXT | 字辈诗 |
| `appendix` | TEXT | 附录 |
| `cover_style` | VARCHAR(20) | 封面样式：`default`/`classical`/`minimal` |
| `font_family` | VARCHAR(20) | 字体：`serif`/`sans`/`kai` |
| `paper_size` | VARCHAR(10) | 纸张：`A4`/`A3`/`16K` |
| `include_generation_table` | TINYINT(1) | 含字辈表 |
| `include_member_bio` | TINYINT(1) | 含成员简介 |
| `include_tree_chart` | TINYINT(1) | 含世系图 |
| `include_index` | TINYINT(1) | 含索引目录 |
| `sort_order` | INT UNSIGNED | 排序号 |
| `status` | TINYINT(1) | 状态：1-启用 0-停用 |
| `create_by` | VARCHAR(50) | 创建人 |
| `create_time` / `update_time` | DATETIME | 时间戳 |

### 3.2 关键类型（TypeScript）

```typescript
// 模板联合类型
type BookTemplate = 'european' | 'su_style' | 'modern' | 'classical';

// 成书记录行（对应 genealogy_book 表）
interface GenealogyBookRow extends DataRow {
  id: number;
  family_id: number;
  title: string;
  template: BookTemplate;
  // ... 其余字段
}

// 预览节点（对应 family_members_{familyId} 行）
interface BookPreviewNode {
  id: string;
  name: string;
  generation: number;
  generationName: string;
  fatherId: string;
  motherId: string;
  spouseNames: string[];
  childrenIds: string[];
  // ...
}
```

---

## 四、核心功能实现细节

### 4.1 分表数据访问模式

所有成员查询遵循项目统一分表模式：

```typescript
// 1. 生成安全表名
const tableName = getSafeMemberTableName(familyId); // family_members_{familyId}

// 2. 存在性校验（information_schema）
const [rows] = await this.dataSource.query<{ exists: 0 | 1 }[]>(
  `SELECT EXISTS (SELECT 1 FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = ?) AS \`exists\``,
  [tableName]
);

// 3. 查询时表名不可参数化，使用模板字符串插入（已校验存在）
const members = await this.dataSource.query(`SELECT ... FROM \`${tableName}\` WHERE ...`);
```

### 4.2 成员关系构建

`getMembersGrouped()` 核心逻辑：

1. 一次性查询全部成员（`status = 1`，按 `generation ASC, sort_order ASC, create_time ASC`）
2. 建立 `childrenMap`：以 `father_id` 为键聚合子女 ID 列表
3. 按 `generation` 分组生成 `BookPreviewNode[]`
4. 使用 `generation_name`（字辈名）生成展示标签：`"文字辈（第1代）"`

### 4.3 HTML 导出构建

`exportHtml()` 按以下顺序拼接章节：

```
封面 → 序言 → 家族简介 → 字辈表 → 家训
     → 世系说明 → 成员关系 → 世代成员明细 → 附录
```

- 每个 HTML 构建器为独立私有方法，返回 HTML 字符串片段
- `wrapHtmlDocument()` 注入完整 CSS（含 `@media print` 打印样式）
- 所有动态内容经 `escapeHtml()` 转义，防 XSS
- `Content-Disposition` 使用 `filename*=UTF-8''...` 编码，确保中文文件名正确

### 4.4 校验链

```
create() 调用顺序：
  normalizeTitle()        → 标题非空、≤100 字符
  ensureFamilyExists()    → family 表存在且 status = 1
  validateTemplate()      → template ∈ VALID_TEMPLATES
  书名唯一性检查           → 同 family_id 下 title 不重复
  INSERT
```

---

## 五、测试策略及测试用例

### 5.1 测试分层

| 层级 | 文件 | 说明 |
|------|------|------|
| 单元测试 | `server/src/genealogy-book/genealogy-book.service.spec.ts` | mock DataSource，隔离数据库 |
| e2e 测试 | `server/test/genealogy-book.e2e-spec.ts` | mock DataSource + overrideGuard 绕过鉴权 |

### 5.2 单元测试用例（14 个）

| 用例 | 验证点 |
|------|--------|
| `getTemplates` 应返回 4 个模板 | 模板列表完整性 |
| `validateTemplate` 接受合法模板 | 正常路径 |
| `validateTemplate` 拒绝非法模板 | 400 异常 |
| `normalizeTitle` 处理空白标题 | 400 异常 |
| `normalizeTitle` 处理超长标题 | 400 异常 |
| `create` 缺少标题时抛出异常 | 校验链顺序 |
| `create` 成功创建 | INSERT 参数正确性 |
| `create` 家族不存在时抛 404 | ensureFamilyExists |
| `getById` 返回记录 | 正常路径 |
| `getById` 记录不存在时抛 404 | 异常路径 |
| `update` 成功更新 | UPDATE 语句构建 |
| `update` 无字段时抛 400 | 空更新保护 |
| `toggleStatus` 切换状态 | 状态翻转逻辑 |
| `toggleStatus` 记录不存在时抛 404 | 异常路径 |

### 5.3 e2e 测试用例（10 个）

| 用例 | 端点 | 验证点 |
|------|------|--------|
| `GET /templates` | 公开 | 返回模板数组 |
| `GET /list` | 需权限 | 分页数据结构 |
| `GET /:id` | 需权限 | 单条记录返回 |
| `POST /create` | 需权限 | 创建成功 + 返回 id |
| `POST /create`（无效模板） | 需权限 | 400 错误 |
| `PUT /update/:id` | 需权限 | 更新成功 |
| `DELETE /delete/:id` | 需权限 | 删除成功 |
| `POST /toggle-status/:id` | 需权限 | 状态翻转 |
| `GET /preview/:id` | 需权限 | 返回世代分组数据 |
| `GET /export/:id` | 需权限 | 返回 text/html 流 |

### 5.4 e2e Mock 说明

`preview` 和 `export` 的 mock 调用链较复杂，关键计数：

```typescript
// preview 共 7 次 query 调用：
// [0] ensureFamilyExists
// [1] getFamilyName
// [2] ensureMemberTable (information_schema)
// [3] members 查询
// [4] getGenerationTable
// [5] ensureFamilyExists（preview 内部再次调用）
// [6] getById 内部 ensureFamilyExists

// export 共 8 次 query 调用（在 preview 基础上多一次）：
// 额外：[7] controller 再次调用 getById 获取文件名
```

### 5.5 运行测试

```bash
# 单元测试
cd server && npx jest src/genealogy-book/genealogy-book.service.spec.ts

# e2e 测试
cd server && npx jest test/genealogy-book.e2e-spec.ts

# 编译检查
cd server && npx tsc --noEmit
cd web-admin && npx vue-tsc --noEmit --skipLibCheck
```

---

## 六、数据库迁移

### 6.1 执行迁移脚本

```bash
mysql -u<user> -p<password> family_genealogy < server/database/genealogy-book.sql
```

脚本包含：
1. `genealogy_book` 建表 DDL（`IF NOT EXISTS`）
2. 5 个权限码插入（`INSERT IGNORE`）
3. `super` 角色权限授权（`INSERT IGNORE`）
4. `mini-program_genealogy-book` 菜单插入（防重复）
5. `super` 角色菜单授权（`INSERT IGNORE`）

所有语句幂等，可重复执行。

### 6.2 部署后验证

```sql
-- 菜单应存在
SELECT * FROM sys_menu WHERE route_name = 'mini-program_genealogy-book';

-- 权限应存在 5 条
SELECT * FROM sys_permission WHERE code LIKE 'system:genealogy-book:%';

-- super 角色应已授权
SELECT COUNT(*) FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id
JOIN sys_permission p ON p.id = rp.permission_id
WHERE r.code = 'super' AND p.code LIKE 'system:genealogy-book:%';
-- 预期结果：5
```

---

## 七、前端集成说明

### 7.1 路由配置

elegant-router 自动生成路由，需手动同步以下文件：

- `src/router/elegant/routes.ts` — 路由定义
- `src/router/elegant/imports.ts` — 组件导入
- `src/router/elegant/transform.ts` — 路由映射
- `src/typings/elegant-router.d.ts` — 类型声明
- `src/locales/langs/zh-cn.ts` / `en-us.ts` — 菜单名称

### 7.2 权限控制

```typescript
// 前端按钮级权限
const { hasAuth } = useAuth();
v-if="hasAuth('system:genealogy-book:create')"

// 后端路由级权限
@Permissions('system:genealogy-book:create')
```

### 7.3 导出实现

```typescript
// service/api/genealogy-book.ts
export function exportGenealogyBook(familyId: number, id: number) {
  return axios.get(`/genealogy-book/${familyId}/export/${id}`, {
    responseType: 'blob',
    headers: { Authorization: getAuthorization() }
  }).then(res => {
    const blob = new Blob([res.data], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${familyName}-${bookTitle}.html`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
```

---

## 八、已知限制与扩展方向

### 8.1 当前限制

- 导出仅支持 HTML 格式，PDF/DOCX 需通过浏览器打印间接实现
- 预览为近似渲染，与导出效果存在细微差异
- 世系图为数据表格形式，未实现可视化树状图
- 大数据量（>1000 成员）下导出为同步生成，可能响应较慢

### 8.2 建议扩展

| 方向 | 说明 |
|------|------|
| PDF 直接导出 | 集成 puppeteer 或 pdf-lib，服务端直接生成 PDF |
| 世系图可视化 | 用 D3.js / ECharts 在前端渲染树状世系图 |
| 异步导出 | 大数据量导出改为异步任务 + 下载中心 |
| 多语言 | 导出的 HTML 支持多语言切换 |
| 印刷规格 | 增加更多纸张规格和出血线设置 |
