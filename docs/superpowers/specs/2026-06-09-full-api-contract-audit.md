# 全量 API 契约与用户流程审计

日期：2026-06-09

## 1. 目标与原则

本审计同时约束移动端、FastAPI、PostgreSQL、MinIO 和后续 AI Worker，避免页面先做成一套、后端再被动拼字段。

核心原则：

- PostgreSQL 是结构化业务数据的事实来源，MinIO 是原始文件字节的事实来源。
- 前端只保存路由、选中 ID、未提交表单和短期展示缓存。
- 所有跨设备可见、刷新后仍存在、涉及权限、生命周期和级联删除的数据必须由后端负责。
- 每个页面动作都必须对应明确的查询、命令、后台任务或本地设备能力。
- 查询接口支持稳定排序、分页、筛选；命令接口校验状态转换并返回最新资源。
- 删除和替换必须先处理对象存储，再提交数据库最终状态；失败时不能伪装成功。
- 任何敏感资源都必须带用户归属、生命周期、销毁状态和长期保存资格。

## 2. 通用契约

### 2.1 时间、ID 与枚举

- ID：服务端生成 UUID；演示种子可使用固定字符串 ID。
- 时间：API 一律 ISO 8601，必须包含时区；数据库使用 `timestamptz`。
- 列表默认稳定排序：业务时间倒序，再按 `id` 倒序。
- 枚举由后端校验，前端不得上传任意字符串。

### 2.2 分页

请求：

```text
page=1&page_size=20
```

响应：

```json
{
  "items": [],
  "page": 1,
  "page_size": 20,
  "total": 0
}
```

`page_size` 范围为 1 至 100。数据量和实时性增加后可迁移游标分页，MVP 先统一页码分页。

### 2.3 错误

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "可直接展示给用户的中文提示",
    "details": {}
  }
}
```

常见状态：

- `400`：业务状态不允许。
- `401`：未登录或 token 失效。
- `403`：已登录但无权访问。
- `404`：资源不存在或不属于当前用户。
- `409`：重复提交、状态冲突、替换确认缺失。
- `422`：字段格式或枚举不合法。
- `503`：数据库、对象存储或 AI 服务暂不可用。

### 2.4 幂等与并发

- 上传完成、删除、取消任务应可安全重试。
- 创建录音、创建文件、归档、报告生成支持 `Idempotency-Key`。
- `profiles`、`sessions`、报告草稿等可编辑资源返回 `updated_at`；后续 PATCH 支持 `If-Unmodified-Since` 或版本号，防止多设备覆盖。
- 单次记录编号必须在数据库事务中分配，并使用唯一约束防并发重复。

## 3. 用户流程与接口矩阵

状态：`已实现`、`部分实现`、`待实现`。

| 用户流程 | 接口 | 关键字段 | 状态 |
|---|---|---|---|
| 健康检查 | `GET /health` | API、DB、MinIO 分项状态 | 部分实现 |
| 注册登录 | `/auth/register`、`/auth/login`、`/auth/refresh` | email、password、token、expires_at | 待实现 |
| 当前用户 | `GET/PATCH /me` | display_name、role_label、security_settings | 待实现 |
| 档案密码设置 | `GET/PUT /profile-access-passwords` | profile_type、is_set | 部分实现 |
| 进入档案验证 | `POST /profile-access-passwords/{type}/verify` | password、profile_access_grant | 部分实现 |
| 档案列表 | `GET /profiles` | type、keyword、status、page、session_count、latest_sequence | 部分实现 |
| 创建档案 | `POST /profiles` | 公共字段和类型特有 metadata | 部分实现 |
| 档案详情 | `GET /profiles/{id}` | 完整字段、汇总计数、下一次安排 | 部分实现 |
| 编辑档案 | `PATCH /profiles/{id}` | 可编辑字段、updated_at | 待实现 |
| 删除档案 | `DELETE /profiles/{id}` | confirmation_text、级联删除结果 | 待实现 |
| 单次记录列表 | `GET /profiles/{id}/sessions` | 时间、固定序号、材料计数、记录状态 | 部分实现 |
| 新增记录 | `POST /profiles/{id}/sessions` | 类型、开始结束时间、形式、摘要 | 部分实现 |
| 编辑记录 | `PATCH /sessions/{id}` | 时间、形式、摘要、标签 | 部分实现 |
| 删除记录 | `DELETE /sessions/{id}` | confirmation_text、级联对象数量 | 部分实现 |
| 录音列表 | `GET /recordings` | archive_status、ai_status、expiry、profile/session summary | 待实现 |
| 创建录音 | `POST /recordings` | title、source_type、file upload | 原型内存实现 |
| 完成音频 | `POST /recordings/{id}/audio` | file_id、duration_seconds、audio_expires_at | 原型内存实现 |
| 归档录音 | `POST /recordings/{id}/archive` | existing/new profile、existing/new session | 待实现 |
| AI 处理 | `/recordings/{id}/processing` | job_id、mode、status | 待实现 |
| 转写与发言人 | transcript、speaker、segment API | 时间戳、speaker_key、人工编辑状态 | 待实现 |
| 录音纪要 | summary 获取、编辑、重新生成 | summary、chapters、overwrite confirmation | 待实现 |
| 创建文件上传 | `POST /files` | filename、mime_type、size、purpose | 已实现 |
| 完成上传 | `POST /files/{id}/complete` | 对象存在、大小、最终状态 | 已实现 |
| 原文件下载 | `GET /files/{id}/download-url` | 短期 URL、过期秒数 | 已实现 |
| 删除文件 | `DELETE /files/{id}` | 状态、引用检查 | 部分实现 |
| 附件列表 | `GET /attachments` | owner、category、file、analysis、lifecycle | 部分实现 |
| 创建附件 | `POST /attachments` | owner、category、file_id、replace_group | 部分实现 |
| 替换附件 | `POST /attachments/{id}/replace` | 新文件、确认 | 已实现 |
| 删除附件 | `DELETE /attachments/{id}` | 立即销毁文件 | 已实现 |
| 报告资料清单 | `GET /reports/generation-sources` | 可用、不可用原因、默认选择 | 待实现 |
| 报告生成与任务 | `POST /reports/generate` | report_type、source_ids、job_id | 待实现 |
| 报告草稿/正式版 | report GET/PATCH/save/copy/regenerate | sections、draft、formal、updated_at | 待实现 |
| 报告导出 | `POST /reports/{id}/export` | PDF/Word、job/file_id | 待实现 |
| 即将销毁资料 | `GET /privacy/expiring-resources` | resource_type、expires_at、preservable | 原型内存实现 |
| 长期保存资料 | `GET /privacy/long-term-resources` | authorized_at、original_expires_at | 待实现 |
| 授权/撤回/删除 | privacy resource commands | 主动确认、撤回后是否立即销毁 | 待实现 |
| 日程列表与维护 | calendar event CRUD | start/end、category、profile/session、sync | 待实现 |
| 日历设置 | `GET/PATCH /calendar/settings` | global sync、privacy title | 待实现 |
| 智能督导会话 | conversation/context/message/stream/stop | 用户选择上下文、引用、风险提示 | 待实现 |
| AI 任务状态 | job detail/events/cancel | progress、error、retryable | 待实现 |
| 资讯 | home/articles | 静态配置、展示字段 | 前端静态，可后置 |
| 注销账号 | `POST /account/deletion` | password、confirmation_text、job/status | 待实现 |

## 4. 核心字段

### 4.1 Profile

公共字段：

- `id`, `type`, `name`, `code`
- `initial_session_count`, `latest_sequence`, `session_count`
- `status`, `next_session_at`, `notes`
- `metadata`
- `created_at`, `updated_at`

类型 metadata：

- client：`gender`, `regular_time_note`, `first_visit_complaint`
- supervisor：`regular_time_note`, `supervision_mode`
- supervisee：`regular_time_note`, `supervision_mode`

`crisis_level` 只适用于 client：`none`, `mild`, `moderate`, `severe`。

档案状态：

- client：`active`, `closed`, `dropped`, `paused`, `referred`
- supervisor/supervisee：`active`, `paused`, `closed`

### 4.2 Session

- `id`, `profile_id`, `session_type`, `sequence_no`
- `started_at`, `ended_at`, `mode`
- `summary`, `tags`, `record_status`
- `recording_status`
- `attachment_counts`: recording、scale、homework、other
- `created_at`, `updated_at`

类型映射必须由后端校验：

- client -> `counseling`
- supervisor -> `supervision_received`
- supervisee -> `supervision_given`

### 4.3 File

- `file_id`, `filename`, `mime_type`, `size_bytes`
- `upload_status`: pending、uploaded、failed、destroyed
- `purpose`: attachment、recording、export
- `expires_at`, `can_long_term_preserve`
- `destroyed_at`, `created_at`, `uploaded_at`

前端永远不接收 `storage_key`、bucket、access key 或 secret key。

### 4.4 Attachment

- `id`, `owner_type`, `owner_id`, `category`
- `file`
- `replace_group_key`, `is_current`
- `analysis_status`: pending、available、failed、not_applicable
- `lifecycle_status`: temporary、long_term、expired、destroyed
- `created_at`, `updated_at`

合法组合：

- profile + consent/counseling_agreement/supervision_agreement/supervision_evaluation/supervisee_assessment：覆盖型。
- session + scale/homework/other：列表型。
- session + recording：一次记录最多一个，由 recording 领域维护，不作为普通附件任意新增。

## 5. 关键状态机

### 5.1 文件

```text
pending -> uploaded -> destroyed
pending -> failed
```

- `pending` 不可下载、不可绑定附件。
- `uploaded` 才能绑定和下载。
- `destroyed` 不返回 URL，且 `storage_key` 必须清空。

### 5.2 覆盖型附件替换

```text
上传新文件成功
-> 在事务中将附件引用切换到新文件
-> 删除旧对象
-> 旧文件标记 destroyed
```

任一步失败都必须保留旧附件可用，不得出现页面显示新附件但字节不存在。

### 5.3 单次记录删除

```text
确认删除
-> 收集该记录的录音、附件、报告和日程关联
-> 删除 MinIO 对象
-> 删除/清空敏感内容
-> 删除数据库关系
-> 返回删除摘要
```

其他记录的 `sequence_no` 不变。

## 6. 自动化测试矩阵

### 档案与记录

- 三种档案类型创建、字段校验和类型特有字段。
- 姓名/编号搜索，状态/类型筛选，分页边界和稳定排序。
- 初始次数为 0、已有历史次数、删除中间记录后继续递增。
- 三种档案只接受匹配的 session type。
- 修改发生时间只改变排序，不改变固定序号。
- 标签去重、空标签、超过 4 个。
- 跨用户列表、详情、更新、删除全部不可见。
- 并发创建记录不产生重复序号。

### 文件与附件

- 空文件、超限文件、不允许 MIME、伪造路径文件名。
- 未 PUT、大小不符、重复 complete、完成后下载。
- 未完成文件不可绑定，跨用户文件不可绑定或下载。
- profile/session owner 不存在或属于其他用户。
- 覆盖型类别只能存在一个当前附件。
- 列表型类别允许多个，不能走覆盖接口。
- 替换失败保留旧文件；成功后旧字节不可下载。
- 删除附件和删除记录后原始字节不可下载。
- 原始录音不可长期保存。

### 前端

- API 成功、401、403、404、409、422、503 和非 JSON 网络错误。
- 加载、空、失败、重试、提交中、防重复点击。
- 新增/编辑/删除成功后以服务端响应或重新查询为准。
- 上传状态：选择、创建、PUT 进度、完成、绑定、失败重试。
- 页面退出丢弃未提交草稿，但不丢弃服务端已完成上传。
- 列表型与覆盖型附件交互不同。

## 7. 当前发现与处理

立即修正：

1. 自动化测试直接写开发库，造成重复档案；改为独立测试数据库。
2. 档案列表缺分页、搜索、总数、完整字段。
3. 档案缺更新和带级联结果的删除接口。
4. session type 未按档案类型校验。
5. 删除记录未删除附件 MinIO 对象。
6. 附件类别和 MIME 未按 PRD 限制。
7. 前端“其他”仍允许文字备注，与已确认需求冲突。
8. 种子文件为 `metadata_only`，应明确为不可下载的展示数据，或写入真实 MinIO 测试对象。
9. API Client 假设所有响应都是 JSON，网络错误和空响应处理不完整。

待集中讨论：

1. 档案访问密码“每次进入验证”与详情页多个 API 请求的授权范围。建议发放页面会话级、前端离开即丢弃的短期 grant，而不是每个请求消耗一次。
2. 删除 MinIO 对象失败时，MVP 是阻止数据库删除并提示重试，还是引入删除任务和 `deletion_pending` 状态。建议先阻止并保持原数据可见，后续接 Worker。
3. 上传后长期未 complete 的孤儿文件清理时长。建议 24 小时。
4. 文字备注不属于附件；如果未来需要，应建 session note 字段/资源，不能伪装成文件。
