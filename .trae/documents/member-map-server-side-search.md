# 位置导航页成员检索：服务端检索改造

## Context（背景与目标）

当前 [member-map.js](file:///e:/family-genealogy/mini-program/pages/member-map/member-map.js) 的成员检索是**纯客户端本地匹配**（`applySearch` 里 `base.filter(name.indexOf(kw))`），数据源 `this._members` 只包含「已加载且有有效经纬度」的成员（最多前 1000 位）。因此存在两类检索盲区：

1. **未录入坐标的成员**：被 `isValidCoord` 过滤，既不在列表也不参与匹配；
2. **超出 1000 条未加载的成员**：不在内存中，检索不到。

本次改造目标：

- 检索改为**服务端检索**，覆盖**全部家族成员**，不受本地缓存与分页上限影响；
- 引入**查询键配置**（可检索字段维度清单）；
- 检索结果含无坐标成员时给出**明确提示**；
- **无重名时直接展示详情**，仅在多名命中（重名场景）时用列表展示；
- 满足既有性能标准（检索 ≤500ms），不破坏原有「点击标记 → 路线规划」流程。

## 已确认的前提（用户选择）

- 查询维度：**仅「姓名（模糊）」**；
- 查询键形态：**代码内固定配置项**（不暴露 UI 切换入口）；
- 后端：**不改后端**。后端 `keyword` 参数已是 `name LIKE ?`，完全满足姓名模糊检索，无需重新构建部署。

## 可复用的既有实现（关键事实）

| 事实 | 位置 |
| --- | --- |
| 成员列表接口 `/user/family/:familyId/members`，前端包装 `familyMember.getAll(familyId, params)` | [api.js#L96-L100](file:///e:/family-genealogy/mini-program/utils/api.js#L96-L100) |
| 服务端 keyword + 分页参考实现（`page/pageSize/keyword` → `res.list/total/hasMore`，list 经 `normalizeMember` 归一化） | [member-list.js#L117-L162](file:///e:/family-genealogy/mini-program/pages/member-list/member-list.js#L117-L162) |
| 后端 keyword = `` `name` LIKE ? ``，`pageSize` 上限 100 | [family-member.service.ts#L181-L234](file:///e:/family-genealogy/server/src/family-member/family-member.service.ts#L181-L234) |
| 成员字段归一化（含 `generationName/birthPlace/deathPlace/longitude/latitude/bio/avatar`） | [format.js#L87-L115](file:///e:/family-genealogy/mini-program/utils/format.js#L87-L115) |
| 现有 `fetchMembers` 分页拉取（先取 page1 拿 total，再并发补齐） | [member-map.js#L235-L265](file:///e:/family-genealogy/mini-program/pages/member-map/member-map.js#L235-L265) |
| markers 下标映射（`markers[i].id = i` ↔ 成员数组下标） | [member-map.js#L314-L344](file:///e:/family-genealogy/mini-program/pages/member-map/member-map.js#L314-L344) |
| 增量高亮 patch | [member-map.js#L352-L370](file:///e:/family-genealogy/mini-program/pages/member-map/member-map.js#L352-L370) |

## 实现方案

### 1. 查询键配置（代码内常量，新增在 member-map.js 顶部）

```js
/** 查询键配置：可检索字段维度白名单（当前仅开放姓名；扩展维度时在此追加，并与后端参数映射同步） */
const SEARCH_KEYS = [
  { key: 'name', label: '姓名', param: 'keyword', mode: 'fuzzy' }
];
const DEFAULT_SEARCH_KEY = 'name';
const SEARCH_MIN_LENGTH = 2;     // 关键字最小长度（沿用用户已确认的 2 字符门槛）
const SEARCH_FETCH_LIMIT = 500;  // 单次检索最多拉取条数，避免超大结果集拖慢渲染
```

新增 `buildSearchParams(keyword, searchKeyKey)`：按白名单把关键字映射为后端参数（本期返回 `{ keyword }`），未知维度直接忽略，保证后续扩展只改这一处。检索入口统一走该函数，不硬编码 `keyword`。

### 2. 服务端检索（替换本地匹配）

- **泛化 `fetchMembers(familyId, options)`**：增加 `keyword` / `limit` 入参，复用现有「先取第 1 页拿 `total` → 按 100 分页并发补齐」逻辑（上限由 `MEMBER_FETCH_LIMIT` 改为可传入的 `limit`）。
- **`applySearch(keyword)` 重写为异步服务端检索**：
  - 仍保留 `SEARCH_MIN_LENGTH = 2` 门槛（不足 2 字符 → 回到初始状态，不请求）；
  - 防抖沿用 `SEARCH_DEBOUNCE = 120`；新增 `searching` 状态用于侧栏 loading；
  - 调 `fetchMembers(familyId, { keyword: kw, limit: SEARCH_FETCH_LIMIT })` → 归一化 → `this._results`；
  - 失败（网络异常）→ 保留原结果、Toast 提示，不破坏当前视图；
  - 保留现有 `console.log('[member-map] 查询耗时 Xms，命中 N 位')` 便于验证 ≤500ms。

### 3. 标记点与检索结果的对齐（含无坐标成员）

检索结果现在可能包含**没有坐标**或**不在初始 1000 条内**的成员，因此标记点不能再固定基于 `this._members`：

- 新增 `this._markerMembers` 作为「当前 markers 数据源」，`markers[i]` ↔ `this._markerMembers[i]`；`onMarkerTap` 改读 `this._markerMembers[markerId]`。
- `decorate()` 增加 `hasCoord` 字段（`isValidCoord(latitude, longitude)`）。
- 检索命中后：`this._markerMembers = 命中且有坐标的成员`，用 `buildMarkers` 直接以「命中高亮图标」重建 markers，并 `includePoints = buildFitPoints(坐标命中)`；若坐标命中为 0 → **不动视野**。
- 清空关键字 / 不足 2 字符 → `this._markerMembers = this._baseMembers`，用默认图标重建 markers（恢复初始地图）。
- 初始加载逻辑（≤1000 条带坐标成员）保持不变，存入 `this._baseMembers`，仅变量改名，行为不变。

### 4. 检索结果展示逻辑（需求 4）

侧栏在检索态下按命中条数分流，新增 `detailMember` 状态：

- **命中 0 条** → 空态文案「未找到匹配的成员」；
- **命中 1 条** → 直接展示**详情卡片** `detailMember`（不走列表），复用现有 `.panel-head` 结构，补充性别/代次/字辈/生卒/籍贯/安葬地/简介等字段；
- **命中 ≥2 条** → 以列表展示全部匹配项（沿用现有 `.member-item` 列表 + 增量渲染）。

> 注：需求中的「重名」按**命中条数**判定（1 条 → 详情；≥2 条 → 列表），比按「姓名完全重复」更实用；如你要求严格同名判定，请告知，我再调整。

### 5. 无坐标场景的提示（需求 3）

- **列表项**：`hasCoord === false` 的成员在条目内追加标签「无定位坐标」；
- **单命中详情卡**：显示提示行「该成员未录入位置坐标，无法在地图上定位或规划路线」，且「规划导航路线」按钮置灰不可点；
- **列表汇总**：当 `noCoordCount > 0` 时，在列表标题下追加一行「其中 N 位未录入位置坐标，无法在地图上定位」。

### 6. 兼容与性能

- **不动原有流程**：点击地图标记 / 列表项仍走 `selectMember` → `planRoute`（既有逻辑不变）；单命中详情卡的「规划导航路线」按钮显式触发同一 `selectMember`，避免检索即自动规划路线的副作用。
- **卫星切换修复保持有效**：`toggleSatellite` 回填的仍是 `this.data.markers`（检索态即检索态 markers），逻辑无需改动。
- **性能**：2 字符门槛 + 防抖降低请求次数；单次检索最多 `SEARCH_FETCH_LIMIT` 条、按 100 分页并发；markers 数量只与「有坐标命中数」相关；列表沿用 `LIST_RENDER_STEP` 增量渲染。

## 涉及文件

- [member-map.js](file:///e:/family-genealogy/mini-program/pages/member-map/member-map.js)：查询键常量、`buildSearchParams`、`fetchMembers` 泛化、`applySearch` 服务端化、`_baseMembers/_results/_markerMembers`、`decorate` 增 `hasCoord`、`onMarkerTap` 改数据源
- [member-map.wxml](file:///e:/family-genealogy/mini-program/pages/member-map/member-map.wxml)：单命中详情卡、列表项「无定位坐标」标签、无坐标汇总提示、searching loading 态
- [member-map.wxss](file:///e:/family-genealogy/mini-program/pages/member-map/member-map.wxss)：详情卡字段行、坐标缺失标签/提示行样式

**不改后端**，无需重新构建部署。

## 验证方式

1. `node --check member-map.js`；WXML 标签闭合与 WXSS 花括号平衡自查。
2. 微信开发者工具（需你实测）：
   - **覆盖性**：检索一个未录入坐标的成员姓名 → 能命中（证明走了服务端，而非仅本地有坐标子集）；
   - **重名/单条**：命中 1 条 → 显示详情卡；命中 ≥2 条 → 显示列表；点击列表项 → 详情 + 路线规划；
   - **无坐标提示**：命中无坐标成员时标签/提示行/汇总文案正确，导航按钮不可用；
   - **性能**：控制台 `[member-map] 查询耗时` 记录 ≤500ms；输入 1 字符不触发请求、2 字符触发；
   - **不破坏既有流程**：点标记 → 路线规划正常；卫星切换标记点保留；清除关键字后恢复完整成员列表与初始标记。
3. 边界：网络失败（保留原视图 + Toast）、结果为空、未登录/未选家族态不变。
