# 后端 API 规格

版本：v0.1  
日期：2026-06-05  
适用范围：咨询师助手 App MVP 后端  
风格：REST + SSE/WebSocket

## 1. 通用约定

### 1.1 基础路径

```text
/api/v1
```

### 1.2 鉴权

除注册、登录、刷新 token、忘记密码相关接口外，所有接口都需要：

```http
Authorization: Bearer <access_token>
```

后端必须从 token 中得到 `user_id`，所有业务查询都按 `user_id` 强隔离。

### 1.3 时间、分页与错误

- 时间字段使用 ISO 8601 带时区字符串。
- 列表接口默认分页参数：`page`, `page_size`。
- `page_size` 默认 20，最大 100。

错误响应：

```json
{
  "error": {
    "code": "recording_audio_destroyed",
    "message": "原始录音已销毁，无法重新生成。",
    "details": {}
  }
}
```

建议 HTTP 状态：

- `400`：请求参数或业务前置条件不满足。
- `401`：未登录或 token 失效。
- `403`：无权限或档案访问密码未验证。
- `404`：资源不存在或不属于当前用户。
- `409`：状态冲突，例如已有生成中任务。
- `422`：字段校验失败。
- `500`：服务端错误。

### 1.4 常用资源摘要

`ProfileSummary`：

```json
{
  "id": "uuid",
  "type": "client",
  "name": "陈雨",
  "status": "active",
  "crisis_level": "mild",
  "initial_session_count": 5,
  "next_session_at": "2026-06-08T10:00:00+08:00"
}
```

`SensitiveResourceSummary`：

```json
{
  "id": "uuid",
  "resource_type": "report",
  "resource_id": "uuid",
  "display_name": "陈雨_第6次咨询记录",
  "owner_type": "session",
  "owner_id": "uuid",
  "expires_at": "2026-06-19T10:00:00+08:00",
  "can_long_term_preserve": true,
  "long_term_authorized_at": null,
  "destroyed_at": null
}
```

## 2. 认证与账号

### 2.1 注册

```http
POST /api/v1/auth/register
```

请求：

```json
{
  "email": "user@example.com",
  "password": "A-strong-password",
  "display_name": "林咨询师"
}
```

响应：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "林咨询师"
  },
  "access_token": "jwt",
  "refresh_token": "opaque"
}
```

规则：

- 密码只保存 hash。
- 注册后创建默认 `calendar_settings`。

### 2.2 登录

```http
POST /api/v1/auth/login
```

请求：

```json
{
  "email": "user@example.com",
  "password": "A-strong-password"
}
```

响应同注册。

### 2.3 刷新 token

```http
POST /api/v1/auth/refresh
```

请求：

```json
{
  "refresh_token": "opaque"
}
```

### 2.4 当前用户

```http
GET /api/v1/me
PATCH /api/v1/me
```

`PATCH` 请求：

```json
{
  "display_name": "林咨询师",
  "professional_identity": "心理咨询师",
  "avatar_file_id": "uuid"
}
```

### 2.5 注销账号

```http
POST /api/v1/account/deletion
```

请求：

```json
{
  "password": "current-password",
  "confirmation_text": "注销账号"
}
```

响应：

```json
{
  "deleted": true
}
```

规则：

- 必须校验登录密码和确认文本。
- 删除账号、所有档案、所有云端资料、所有授权记录、所有 App 内日程。
- 令当前用户所有 token 失效。
- 已下载到本地或已同步到系统日历的内容不由后端自动删除。

## 3. 档案访问密码

### 3.1 查看设置状态

```http
GET /api/v1/profile-access-passwords
```

响应：

```json
{
  "items": [
    { "profile_type": "client", "is_set": true, "updated_at": "2026-06-05T10:00:00+08:00" },
    { "profile_type": "supervisor", "is_set": false, "updated_at": null },
    { "profile_type": "supervisee", "is_set": false, "updated_at": null }
  ]
}
```

### 3.2 设置或重置密码

```http
PUT /api/v1/profile-access-passwords/{profile_type}
```

请求：

```json
{
  "new_password": "six-or-more-chars"
}
```

规则：

- 登录后可直接重置，不要求旧档案密码。
- 写入安全审计。

### 3.3 验证档案密码

```http
POST /api/v1/profile-access-passwords/{profile_type}/verify
```

请求：

```json
{
  "password": "profile-password"
}
```

响应：

```json
{
  "verified": true,
  "profile_type": "client",
  "profile_access_grant": "one-time-grant"
}
```

规则：

- 每次进入档案详情都要调用。
- 后端只发放一次性进入凭证，不发放长期免输 token。
- 前端离开档案详情后必须丢弃凭证；再次进入详情必须重新验证密码。

## 4. 档案与单次记录

### 4.1 档案列表

```http
GET /api/v1/profiles?type=client&keyword=陈&status=active&page=1&page_size=20
```

响应：

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "client",
      "name": "陈雨",
      "code": "C-001",
      "status": "active",
      "crisis_level": "mild",
      "initial_session_count": 5,
      "session_count": 1,
      "next_session_at": "2026-06-08T10:00:00+08:00"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

### 4.2 创建档案

```http
POST /api/v1/profiles
```

请求：

```json
{
  "type": "client",
  "name": "陈雨",
  "code": "C-001",
  "status": "active",
  "crisis_level": "mild",
  "initial_session_count": 5,
  "next_session_at": "2026-06-08T10:00:00+08:00",
  "metadata": {
    "gender": "female",
    "first_visit_complaint": "睡眠问题",
    "consulting_time_note": "每周一上午"
  },
  "notes": "非敏感提醒"
}
```

规则：

- 若 `next_session_at` 存在，后端创建或更新关联 App 日程。

### 4.3 档案详情

```http
GET /api/v1/profiles/{profile_id}
```

前置规则：

- 前端必须先验证该类型档案密码，并在请求头携带 `X-Profile-Access-Grant`。
- 后端仍需校验资源属于当前用户。

### 4.4 更新档案

```http
PATCH /api/v1/profiles/{profile_id}
```

规则：

- 更新 `next_session_at` 时，同步创建或更新 App 日程。

### 4.5 删除档案

```http
DELETE /api/v1/profiles/{profile_id}
```

请求：

```json
{
  "confirmation_text": "删除档案"
}
```

规则：

- 删除基础档案和所有关联云端资料。
- 对象存储删除失败时，记录失败并进入重试任务。
- 不做软删除或回收站。

### 4.6 单次记录列表

```http
GET /api/v1/profiles/{profile_id}/sessions
```

请求头：

```http
X-Profile-Access-Grant: one-time-grant
```

### 4.7 创建单次记录

```http
POST /api/v1/profiles/{profile_id}/sessions
```

请求：

```json
{
  "session_type": "counseling",
  "title": "第6次咨询",
  "started_at": "2026-06-08T10:00:00+08:00",
  "ended_at": "2026-06-08T10:50:00+08:00",
  "mode": "offline",
  "notes": ""
}
```

规则：

- `sequence_no` 由后端生成，使用固定编号。
- 来访者档案只能创建 `counseling`。
- 督导师档案创建 `supervision_received`。
- 受督者档案创建 `supervision_given`。

### 4.8 更新/删除单次记录

```http
PATCH /api/v1/sessions/{session_id}
DELETE /api/v1/sessions/{session_id}
```

删除规则：

- 删除该次记录下的录音、转写、纪要、报告、附件和日程关联。
- 不重排其他记录的 `sequence_no`。

## 5. 录音、转写与纪要

### 5.1 录音列表

```http
GET /api/v1/recordings?archive_status=unarchived&ai_status=completed&keyword=陈&page=1&page_size=20
```

响应字段包含：

- 标题、时长、AI 状态、归档状态。
- `audio_expires_at`、`audio_destroyed_at`。
- 关联档案和记录摘要。

### 5.2 创建录音占位

```http
POST /api/v1/recordings
```

请求：

```json
{
  "title": "未归档录音",
  "source_type": "in_app_recording"
}
```

响应：

```json
{
  "id": "uuid",
  "title": "未归档录音",
  "upload_url": "short-lived-upload-url",
  "upload_headers": {}
}
```

规则：

- 移动端可先创建记录，再使用短期 URL 上传音频。
- 后端不直接暴露长期对象存储 URL。

### 5.3 完成音频上传

```http
POST /api/v1/recordings/{recording_id}/audio
```

请求：

```json
{
  "file_id": "uuid",
  "duration_seconds": 3180
}
```

响应：

```json
{
  "audio_expires_at": "2026-06-19T10:00:00+08:00",
  "can_long_term_preserve_audio": false
}
```

规则：

- 设置原始音频 14 天销毁时间。
- 创建 `sensitive_resources` 记录，`can_long_term_preserve=false`。

### 5.4 启动 AI 处理

```http
POST /api/v1/recordings/{recording_id}/processing
```

请求：

```json
{
  "mode": "generic",
  "session_id": null
}
```

`mode` 可选：

- `generic`：稍后归档，先生成通用转写和摘要。
- `archived_context`：已归档，带场景上下文。

响应：

```json
{
  "job_id": "uuid",
  "status": "queued"
}
```

规则：

- 若原始录音已销毁，返回 `400 recording_audio_destroyed`。
- 同一录音已有运行中处理任务时，返回 `409 job_already_running`。

### 5.5 重试 AI 处理

```http
POST /api/v1/recordings/{recording_id}/processing/retry
```

规则：

- 只允许原始录音未销毁、未过 14 天、AI 服务可用时重试。

### 5.6 归档录音

```http
POST /api/v1/recordings/{recording_id}/archive
```

请求：

```json
{
  "profile_type": "client",
  "profile_id": "uuid",
  "create_profile": null,
  "session_id": null,
  "create_session": {
    "started_at": "2026-06-08T10:00:00+08:00",
    "mode": "offline"
  }
}
```

规则：

- 归档必须经过中间页确认。
- 可归入已有档案或新建档案。
- 可归入已有记录或新建记录。
- 归档后推荐发言人角色名。

### 5.7 获取转写

```http
GET /api/v1/recordings/{recording_id}/transcript
```

响应：

```json
{
  "transcript_id": "uuid",
  "expires_at": "2026-06-19T10:00:00+08:00",
  "long_term_authorized_at": null,
  "segments": [
    {
      "id": "uuid",
      "start_ms": 0,
      "end_ms": 12000,
      "speaker_key": "speaker_1",
      "speaker_label": "咨询师",
      "text": "我们今天先从近一周的睡眠说起。"
    }
  ]
}
```

### 5.8 编辑发言人与转写

```http
PATCH /api/v1/recordings/{recording_id}/speakers
PATCH /api/v1/transcript-segments/{segment_id}
```

发言人请求：

```json
{
  "speaker_key": "speaker_1",
  "speaker_label": "咨询师"
}
```

分段请求：

```json
{
  "text": "修订后的分段文本"
}
```

### 5.9 获取纪要

```http
GET /api/v1/recordings/{recording_id}/summary
```

### 5.10 更新纪要

```http
PATCH /api/v1/recordings/{recording_id}/summary
```

请求：

```json
{
  "main_summary": "修订后的摘要",
  "chapter_overview": [
    {
      "title": "睡眠近况",
      "summary": "讨论了入睡困难和夜醒。",
      "start_ms": 0,
      "end_ms": 600000
    }
  ]
}
```

### 5.11 重新生成录音纪要

```http
POST /api/v1/recordings/{recording_id}/summary/regenerate
```

请求：

```json
{
  "confirm_overwrite": true
}
```

规则：

- 会覆盖当前转写、发言人识别、摘要和章节速览。
- 如果生成失败，保留旧内容。

### 5.12 删除录音或敏感内容

```http
DELETE /api/v1/recordings/{recording_id}
DELETE /api/v1/recording-transcripts/{transcript_id}
DELETE /api/v1/recording-summaries/{summary_id}
```

规则：

- 删除原始录音只删除音频文件，不必删除已生成且未销毁的转写/纪要。
- 删除转写会让依赖该转写的后续报告重新生成不可用。

## 6. 文件与附件

### 6.1 创建上传文件

```http
POST /api/v1/files
```

请求：

```json
{
  "filename": "量表.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 204800,
  "purpose": "attachment"
}
```

响应：

```json
{
  "file_id": "uuid",
  "upload_url": "short-lived-upload-url",
  "upload_headers": {}
}
```

### 6.2 下载文件

```http
GET /api/v1/files/{file_id}/download-url
```

响应：

```json
{
  "download_url": "short-lived-download-url",
  "expires_in_seconds": 300
}
```

### 6.3 附件列表

```http
GET /api/v1/attachments?owner_type=session&owner_id=uuid&category=scale
```

### 6.4 创建附件

```http
POST /api/v1/attachments
```

请求：

```json
{
  "owner_type": "session",
  "owner_id": "uuid",
  "category": "scale",
  "file_id": "uuid"
}
```

规则：

- PDF 入队文本提取任务。
- 图片 `analysis_status=not_applicable`。
- 创建生命周期记录，默认 14 天销毁。

### 6.5 替换覆盖型附件

```http
POST /api/v1/attachments/{attachment_id}/replace
```

请求：

```json
{
  "file_id": "uuid",
  "confirm_replace": true
}
```

规则：

- 仅覆盖型附件可替换。
- 旧附件和旧文件立即删除或清空敏感内容。

### 6.6 删除附件

```http
DELETE /api/v1/attachments/{attachment_id}
```

## 7. 报告

### 7.1 获取可用资料清单

```http
GET /api/v1/reports/generation-sources?report_type=case_report&profile_id=uuid
GET /api/v1/reports/generation-sources?report_type=counseling_note&session_id=uuid
```

响应：

```json
{
  "items": [
    {
      "resource_type": "transcript",
      "resource_id": "uuid",
      "label": "第6次咨询转写",
      "analysis_status": "available",
      "default_selected": true
    }
  ]
}
```

规则：

- 已销毁资料不返回。
- 图片和无法解析 PDF 不作为可分析资料返回，或返回 `analysis_status=not_applicable` 且不可选。

### 7.2 生成报告

```http
POST /api/v1/reports/generate
```

请求：

```json
{
  "report_type": "counseling_note",
  "profile_id": "uuid",
  "session_id": "uuid",
  "selected_sources": [
    { "resource_type": "transcript", "resource_id": "uuid" },
    { "resource_type": "recording_summary", "resource_id": "uuid" }
  ]
}
```

响应：

```json
{
  "job_id": "uuid",
  "draft_report_id": "uuid"
}
```

规则：

- 报告使用系统内置模板。
- 咨询记录、督导反馈、督导记录生成后进入草稿。
- 个案报告生成前必须由用户选择资料。
- 已有草稿时，重新生成或生成新草稿需要明确覆盖。

### 7.3 报告详情与编辑

```http
GET /api/v1/reports/{report_id}
PATCH /api/v1/reports/{report_id}
```

`PATCH` 请求：

```json
{
  "title": "陈雨 第6次咨询记录",
  "content_json": {
    "blocks": []
  }
}
```

规则：

- 正式版不能直接编辑。
- 若 `report_state=formal`，返回 `409 formal_report_readonly`。

### 7.4 保存为正式版

```http
POST /api/v1/reports/{report_id}/save-formal
```

规则：

- 只允许从草稿保存正式版。
- 如果已有正式版，由用户确认后替换。
- 首发不保留历史正式版。

### 7.5 从正式版复制草稿

```http
POST /api/v1/reports/{report_id}/copy-formal-to-draft
```

### 7.6 重新生成报告

```http
POST /api/v1/reports/{report_id}/regenerate
```

请求：

```json
{
  "selected_sources": [
    { "resource_type": "transcript", "resource_id": "uuid" }
  ],
  "confirm_overwrite_draft": true
}
```

规则：

- 重新生成只影响草稿。
- 正式版存在时不覆盖正式版。
- 重新生成失败保留旧草稿。

### 7.7 导出报告

```http
POST /api/v1/reports/{report_id}/export
```

请求：

```json
{
  "format": "pdf"
}
```

响应：

```json
{
  "job_id": "uuid",
  "export_file_id": "uuid"
}
```

支持：

- `pdf`
- `docx`

智能督导会话首发不支持导出。

## 8. 智能督导

### 8.1 会话列表

```http
GET /api/v1/supervision/conversations?page=1&page_size=20
```

### 8.2 创建会话

```http
POST /api/v1/supervision/conversations
```

请求：

```json
{
  "title": "陈雨个案复盘"
}
```

规则：

- 默认无上下文。
- 创建后 14 天销毁，可授权长期保存。

### 8.3 会话详情

```http
GET /api/v1/supervision/conversations/{conversation_id}
```

响应包含：

- messages。
- context refs。
- lifecycle status。

### 8.4 添加上下文资料

```http
POST /api/v1/supervision/conversations/{conversation_id}/context
```

请求：

```json
{
  "items": [
    { "resource_type": "profile", "resource_id": "uuid" },
    { "resource_type": "report", "resource_id": "uuid" }
  ]
}
```

规则：

- 仅允许添加当前用户资源。
- 已销毁资料不可添加。
- 图片附件不可作为 AI 分析上下文。

### 8.5 移除上下文

```http
DELETE /api/v1/supervision/conversations/{conversation_id}/context/{context_id}
```

### 8.6 发送消息

```http
POST /api/v1/supervision/conversations/{conversation_id}/messages
```

请求：

```json
{
  "content": "请帮我整理这个个案适合带去督导的问题。"
}
```

响应：

```json
{
  "user_message_id": "uuid",
  "assistant_message_id": "uuid",
  "job_id": "uuid",
  "risk_prompt": null
}
```

规则：

- 如果触发危机关键词，返回 `risk_prompt` 并仍可继续生成辅助回复。
- AI 只能读取当前会话上下文资料。
- 回答需要引用来源；未引用资料时标记未引用档案资料。

### 8.7 流式读取

推荐 SSE：

```http
GET /api/v1/supervision/conversations/{conversation_id}/messages/{message_id}/events
```

事件：

```text
event: delta
data: {"text":"这段材料可以从三个督导问题展开："}

event: citation
data: {"label":"陈雨 第6次咨询记录","resource_type":"report","resource_id":"uuid"}

event: done
data: {"message_id":"uuid"}
```

### 8.8 停止生成

```http
POST /api/v1/supervision/conversations/{conversation_id}/messages/{message_id}/stop
```

规则：

- 停止后保留已生成部分。

### 8.9 删除会话

```http
DELETE /api/v1/supervision/conversations/{conversation_id}
```

## 9. 数据与隐私

### 9.1 即将销毁资料

```http
GET /api/v1/privacy/expiring-resources?days=14&page=1&page_size=20
```

规则：

- 返回临时保存且未授权长期保存的敏感资料。
- 原始录音可出现在列表中，但不能授权长期保存。

### 9.2 已长期保存资料

```http
GET /api/v1/privacy/long-term-resources?page=1&page_size=20
```

规则：

- 不返回原始录音。

### 9.3 授权长期保存

```http
POST /api/v1/privacy/resources/{sensitive_resource_id}/authorize-long-term
```

请求：

```json
{
  "confirm_understanding": true
}
```

规则：

- `confirm_understanding=true` 表示用户已看过保存内容、原因、期限、风险和撤回方式。
- 原始录音返回 `400 long_term_not_allowed`。

### 9.4 取消长期保存

```http
POST /api/v1/privacy/resources/{sensitive_resource_id}/revoke-long-term
```

规则：

- 若当前时间未超过原始 `expires_at`，恢复临时资料。
- 若当前时间已超过原始 `expires_at`，立即销毁。

### 9.5 删除敏感资料

```http
DELETE /api/v1/privacy/resources/{sensitive_resource_id}
```

请求：

```json
{
  "confirmation_text": "删除资料"
}
```

规则：

- 删除后立即彻底删除，不可恢复。

## 10. 日程与手机系统日历

### 10.1 日程列表

```http
GET /api/v1/calendar/events?from=2026-06-01&to=2026-06-30
```

### 10.2 创建日程

```http
POST /api/v1/calendar/events
```

请求：

```json
{
  "title": "陈雨 · 第6次咨询",
  "privacy_title": "咨询提醒",
  "category": "counseling",
  "start_at": "2026-06-08T10:00:00+08:00",
  "end_at": "2026-06-08T10:50:00+08:00",
  "profile_id": "uuid",
  "session_id": "uuid",
  "sync_to_system_calendar": true
}
```

### 10.3 更新/完成/删除日程

```http
PATCH /api/v1/calendar/events/{event_id}
DELETE /api/v1/calendar/events/{event_id}
```

完成请求：

```json
{
  "status": "completed"
}
```

删除规则：

- 若已同步到手机系统日历，前端需要提示用户是否同步删除系统日历事件。

### 10.4 日历设置

```http
GET /api/v1/calendar/settings
PATCH /api/v1/calendar/settings
```

请求：

```json
{
  "system_calendar_enabled": true,
  "privacy_title_mode_enabled": false
}
```

规则：

- 首次开启系统日历同步时，前端必须展示隐私提示。
- 后端保存全局设置；真正系统日历写入由移动端完成并回传 `system_calendar_event_id`。

## 11. AI 任务

### 11.1 任务详情

```http
GET /api/v1/ai-jobs/{job_id}
```

### 11.2 任务事件

```http
GET /api/v1/ai-jobs/{job_id}/events
```

SSE 事件：

```text
event: progress
data: {"progress":40,"status":"running"}

event: failed
data: {"code":"provider_timeout","message":"AI 服务暂时不可用"}

event: done
data: {"status":"succeeded"}
```

### 11.3 取消任务

```http
POST /api/v1/ai-jobs/{job_id}/cancel
```

规则：

- 运行中 AI 任务可请求取消。
- 已完成任务返回当前状态。

## 12. 资讯

### 12.1 首页内容

```http
GET /api/v1/content/home
```

响应：

```json
{
  "banners": [],
  "posters": [],
  "articles": []
}
```

### 12.2 图文资讯

```http
GET /api/v1/content/articles?page=1&page_size=20
GET /api/v1/content/articles/{article_id}
```

首发说明：

- 资讯内容使用静态配置或后台预置数据。
- 不做搜索、评论、收藏、付费课程。

## 13. 权限与安全检查清单

每个业务接口必须检查：

1. Access token 有效。
2. 资源 `user_id` 等于当前用户。
3. 敏感资源未销毁。
4. 报告/智能督导资料选择只包含当前用户可访问且未销毁的资源。
5. 文件下载 URL 使用短期签名。
6. 错误信息不包含敏感正文。

需要业务确认的危险操作：

- 删除档案。
- 删除原始录音。
- 删除转写、纪要、报告、附件、智能督导会话。
- 账号注销。
- 重新生成并覆盖已编辑内容。
- 保存草稿替换正式版。
- 授权长期保存。
- 取消长期保存且会立即销毁。
