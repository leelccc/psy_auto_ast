# 后端数据库 Schema 规格

版本：v0.1  
日期：2026-06-05  
适用范围：咨询师助手 App MVP 后端  
数据库：PostgreSQL

## 1. 设计原则

1. 所有业务数据必须通过 `user_id` 做强隔离。
2. 基础档案信息长期保存；敏感资料默认 14 天销毁。
3. 原始录音只保存 14 天，不支持长期云端保存。
4. 转写、纪要、报告、附件、智能督导会话可由用户主动授权长期保存。
5. 删除档案、删除资料、账号注销均为立即彻底删除，不做回收站。
6. 可保留最小化审计记录，但不得包含录音 URL、正文、附件内容、转写文本、报告正文等敏感内容。
7. `created_at`、`updated_at` 使用带时区时间 `timestamptz`。
8. 主键推荐使用 UUID，方便移动端离线草稿和服务端对象解耦。

## 2. 枚举约定

推荐用 PostgreSQL enum 或 SQLAlchemy enum 映射。MVP 阶段也可先用 `varchar` + check constraint，便于调整。

| 枚举 | 值 |
|---|---|
| `profile_type` | `client`, `supervisor`, `supervisee` |
| `session_type` | `counseling`, `supervision_given`, `supervision_received` |
| `session_mode` | `online`, `offline`, `unknown` |
| `profile_status` | `active`, `paused`, `closed`, `dropped`, `referred` |
| `crisis_level` | `none`, `mild`, `moderate`, `severe` |
| `recording_source_type` | `in_app_recording`, `uploaded_audio` |
| `archive_status` | `unarchived`, `archived` |
| `ai_status` | `pending`, `processing`, `completed`, `failed`, `cancelled` |
| `speaker_key` | `speaker_1`, `speaker_2`, `speaker_3`, custom string |
| `attachment_owner_type` | `profile`, `session`, `report` |
| `attachment_category` | `consent`, `counseling_agreement`, `supervision_agreement`, `supervision_evaluation`, `supervisee_evaluation`, `scale`, `homework`, `other` |
| `analysis_status` | `not_applicable`, `pending`, `available`, `failed` |
| `report_type` | `recording_note`, `counseling_note`, `supervision_feedback`, `supervision_note`, `case_report` |
| `report_state` | `single`, `draft`, `formal` |
| `job_type` | `audio_upload`, `transcription`, `summary`, `recording_note_regeneration`, `report_generation`, `pdf_text_extraction`, `export`, `supervision_chat`, `retention_cleanup` |
| `job_status` | `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| `sensitive_resource_type` | `audio`, `transcript`, `recording_summary`, `report`, `attachment`, `supervision_conversation` |
| `calendar_category` | `counseling`, `supervision_given`, `supervision_received`, `personal` |
| `calendar_status` | `pending`, `completed`, `cancelled` |
| `message_role` | `user`, `assistant`, `system` |

## 3. 用户与安全

### 3.1 `users`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 用户 ID |
| `email` | varchar(255) | unique, not null | 首发账号 |
| `password_hash` | text | not null | Argon2 或 bcrypt |
| `display_name` | varchar(80) | nullable | 昵称 |
| `avatar_file_id` | uuid | fk `files.id`, nullable | 头像文件 |
| `professional_identity` | varchar(80) | nullable | 用户展示身份，不限制功能 |
| `is_active` | boolean | default true | 注销后可删除或置 false |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `unique users_email_unique (lower(email))`

### 3.2 `refresh_tokens`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | Token 记录 |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `token_hash` | text | unique, not null | 只存 hash |
| `expires_at` | timestamptz | not null | 过期时间 |
| `revoked_at` | timestamptz | nullable | 主动失效 |
| `created_at` | timestamptz | not null | 创建时间 |

### 3.3 `profile_access_passwords`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 密码记录 |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `profile_type` | profile_type | not null | 档案类型 |
| `password_hash` | text | not null | 单独哈希 |
| `updated_at` | timestamptz | not null | 重置时间 |

索引：

- `unique profile_access_passwords_user_type_unique (user_id, profile_type)`

规则：

- 进入任一档案详情都必须验证该类型访问密码。
- 用户登录后可直接重置档案访问密码，不要求旧密码。
- 重置行为写入 `audit_logs`，但不记录明文或 hash。

### 3.4 `profile_access_grants`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 一次性访问凭证 |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `profile_type` | profile_type | not null | 档案类型 |
| `grant_hash` | text | unique, not null | 只存 hash |
| `expires_at` | timestamptz | not null | 短期过期，用于本次进入 |
| `used_at` | timestamptz | nullable | 使用时间 |
| `created_at` | timestamptz | not null | 创建时间 |

规则：

- 验证档案密码成功后生成一次性 grant。
- 档案详情、档案记录列表等敏感读取接口必须携带 grant。
- grant 只能用于一次进入流程，不作为短时间免输入机制；前端离开详情页后必须丢弃。
- grant 过期或已使用后，用户再次进入档案详情必须重新输入密码。

## 4. 档案与记录

### 4.1 `profiles`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 档案 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `type` | profile_type | not null | client/supervisor/supervisee |
| `name` | varchar(80) | not null | 姓名 |
| `code` | varchar(80) | nullable | 来访者编号等 |
| `status` | profile_status | nullable | 状态 |
| `crisis_level` | crisis_level | nullable | 来访者危机评估，其他类型可空 |
| `initial_session_count` | integer | default 0 | 历史次数 |
| `next_session_at` | timestamptz | nullable | 下次咨询/督导/受督时间 |
| `metadata` | jsonb | default `{}` | 扩展字段：性别、主诉、督导形式等 |
| `notes` | text | nullable | 非报告类备注 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `profiles_user_type_idx (user_id, type)`
- `profiles_user_next_session_idx (user_id, next_session_at)`
- `profiles_user_name_trgm_idx`，可选，用于姓名搜索。

规则：

- 基础档案信息长期保存。
- 删除档案时，关联记录和敏感资料立即彻底删除。

### 4.2 `sessions`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 单次记录 ID |
| `user_id` | uuid | fk `users.id`, not null | 冗余隔离字段 |
| `profile_id` | uuid | fk `profiles.id`, not null | 所属档案 |
| `session_type` | session_type | not null | 咨询/督导/受督 |
| `sequence_no` | integer | not null | 固定次数编号 |
| `title` | varchar(160) | nullable | 展示标题 |
| `started_at` | timestamptz | nullable | 开始时间 |
| `ended_at` | timestamptz | nullable | 结束时间 |
| `duration_seconds` | integer | nullable | 时长 |
| `mode` | session_mode | default `unknown` | 线上/线下 |
| `notes` | text | nullable | 普通备注 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `unique sessions_profile_sequence_unique (profile_id, sequence_no)`
- `sessions_user_profile_idx (user_id, profile_id)`

规则：

- `sequence_no` 创建后不随删除重排。
- 新建记录默认 `max(sequence_no) + 1`，若没有记录则 `initial_session_count + 1`。

## 5. 录音、转写与纪要

### 5.1 `files`

`files` 既保存对象存储元数据，也承载文件级生命周期。头像等非敏感文件可将 `expires_at` 设为空。

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 文件 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `storage_key` | text | nullable | 对象存储 key；销毁后清空 |
| `filename` | varchar(255) | not null | 原文件名 |
| `mime_type` | varchar(120) | not null | MIME |
| `size_bytes` | bigint | not null | 文件大小 |
| `checksum_sha256` | char(64) | nullable | 文件校验 |
| `expires_at` | timestamptz | nullable | 默认销毁时间 |
| `can_long_term_preserve` | boolean | default false | 是否可长期保存 |
| `long_term_authorized_at` | timestamptz | nullable | 授权时间 |
| `long_term_revoked_at` | timestamptz | nullable | 撤回时间 |
| `destroyed_at` | timestamptz | nullable | 销毁时间 |
| `created_at` | timestamptz | not null | 上传时间 |

索引：

- `files_user_expires_idx (user_id, expires_at) where destroyed_at is null`
- `files_user_long_term_idx (user_id, long_term_authorized_at) where long_term_authorized_at is not null`

### 5.2 `recordings`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 录音 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `session_id` | uuid | fk `sessions.id`, nullable | 未归档时为空 |
| `title` | varchar(160) | not null | 录音标题 |
| `source_type` | recording_source_type | not null | App 录音或外部上传 |
| `audio_file_id` | uuid | fk `files.id`, nullable | 原始音频；销毁后可空 |
| `duration_seconds` | integer | nullable | 音频时长 |
| `archive_status` | archive_status | default `unarchived` | 归档状态 |
| `ai_status` | ai_status | default `pending` | AI 处理状态 |
| `processing_error` | text | nullable | 最近失败原因，脱敏 |
| `uploaded_at` | timestamptz | nullable | 上传成功时间 |
| `audio_expires_at` | timestamptz | nullable | 上传成功后 14 天 |
| `audio_destroyed_at` | timestamptz | nullable | 原始录音销毁时间 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `recordings_user_status_idx (user_id, archive_status, ai_status)`
- `recordings_session_unique`：`unique(session_id) where session_id is not null`，保证一次记录一条录音。
- `recordings_audio_expiry_idx (audio_expires_at) where audio_destroyed_at is null`

规则：

- 原始录音只能保存 14 天，`files.can_long_term_preserve=false`。
- AI 重试要求音频未销毁、仍在 14 天保存期内、AI 服务可用。
- 归档时设置 `session_id`、`archive_status=archived`，并可触发带场景上下文的 AI 处理。

### 5.3 `recording_transcripts`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 转写 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `recording_id` | uuid | fk `recordings.id`, not null | 所属录音 |
| `generated_at` | timestamptz | not null | 生成完成时间 |
| `expires_at` | timestamptz | not null | 生成后 14 天 |
| `long_term_authorized_at` | timestamptz | nullable | 长期保存授权 |
| `long_term_revoked_at` | timestamptz | nullable | 授权撤回 |
| `destroyed_at` | timestamptz | nullable | 销毁时间 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `unique recording_transcripts_recording_unique (recording_id)`
- `recording_transcripts_expiry_idx (expires_at) where destroyed_at is null and long_term_authorized_at is null`

### 5.4 `transcript_segments`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 分段 ID |
| `transcript_id` | uuid | fk `recording_transcripts.id`, not null | 所属转写 |
| `start_ms` | integer | not null | 开始时间 |
| `end_ms` | integer | not null | 结束时间 |
| `speaker_key` | varchar(40) | not null | speaker_1 等 |
| `speaker_label` | varchar(80) | not null | 用户可编辑名 |
| `text` | text | not null | 分段文字 |
| `edited_at` | timestamptz | nullable | 用户编辑时间 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `transcript_segments_transcript_time_idx (transcript_id, start_ms)`

规则：

- 用户修改发言人名称时，同一 `transcript_id + speaker_key` 的 `speaker_label` 批量更新。
- 用户不直接编辑时间戳。

### 5.5 `recording_summaries`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 纪要摘要 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `recording_id` | uuid | fk `recordings.id`, not null | 所属录音 |
| `main_summary` | text | not null | 主要内容摘要 |
| `chapter_overview` | jsonb | not null | 章节标题、摘要、时间点 |
| `generated_at` | timestamptz | not null | 生成完成时间 |
| `expires_at` | timestamptz | not null | 生成后 14 天 |
| `long_term_authorized_at` | timestamptz | nullable | 长期保存授权 |
| `long_term_revoked_at` | timestamptz | nullable | 授权撤回 |
| `destroyed_at` | timestamptz | nullable | 销毁时间 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `unique recording_summaries_recording_unique (recording_id)`

## 6. 附件与 PDF 文本

### 6.1 `attachments`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 附件 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `owner_type` | attachment_owner_type | not null | profile/session/report |
| `owner_id` | uuid | not null | 所属对象 ID |
| `category` | attachment_category | not null | 附件类别 |
| `file_id` | uuid | fk `files.id`, not null | 文件 |
| `replace_group_key` | varchar(120) | nullable | 覆盖型附件组 |
| `is_current` | boolean | default true | 是否当前有效 |
| `analysis_status` | analysis_status | default `pending` | PDF 提取状态 |
| `extracted_text` | text | nullable | 可解析 PDF 文本 |
| `created_at` | timestamptz | not null | 上传时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `attachments_owner_idx (user_id, owner_type, owner_id)`
- `attachments_current_replace_unique`：`unique(user_id, owner_type, owner_id, replace_group_key) where is_current = true and replace_group_key is not null`

规则：

- 覆盖型附件：上传新文件时，旧附件立即删除或清空敏感内容，不保留多版本。
- 列表型附件：`replace_group_key` 为空，可保留多个。
- 图片 `analysis_status=not_applicable`。
- 扫描 PDF 提取失败时 `analysis_status=failed`，首发不做 OCR。

## 7. 报告与导出

### 7.1 `reports`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 报告 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `profile_id` | uuid | fk `profiles.id`, nullable | 个案/档案 |
| `session_id` | uuid | fk `sessions.id`, nullable | 单次记录报告 |
| `recording_id` | uuid | fk `recordings.id`, nullable | 录音纪要 |
| `report_type` | report_type | not null | 报告类型 |
| `report_state` | report_state | not null | single/draft/formal |
| `generation_status` | ai_status | default `completed` | 生成状态 |
| `system_template_key` | varchar(120) | not null | 内置模板 key |
| `title` | varchar(160) | not null | 标题 |
| `content_json` | jsonb | not null | 富文本/结构化内容 |
| `generated_at` | timestamptz | nullable | 生成完成时间 |
| `expires_at` | timestamptz | not null | 默认 14 天 |
| `long_term_authorized_at` | timestamptz | nullable | 长期保存授权 |
| `long_term_revoked_at` | timestamptz | nullable | 授权撤回 |
| `destroyed_at` | timestamptz | nullable | 销毁时间 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `reports_user_profile_idx (user_id, profile_id)`
- `reports_user_session_idx (user_id, session_id)`
- `reports_scope_state_unique`：`unique(user_id, profile_id, session_id, recording_id, report_type, report_state) where destroyed_at is null`

规则：

- `recording_note` 使用 `report_state=single`，不分草稿/正式版。
- 咨询记录、督导反馈、督导记录、个案报告使用 `draft`/`formal`。
- 重新生成草稿只覆盖草稿，不覆盖正式版。
- 编辑正式版时，先复制正式版为草稿，再用草稿替换正式版。

### 7.2 `report_source_refs`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 资料引用 ID |
| `report_id` | uuid | fk `reports.id`, not null | 报告 |
| `resource_type` | varchar(60) | not null | transcript/summary/attachment/report/profile |
| `resource_id` | uuid | not null | 资源 ID |
| `label` | varchar(180) | not null | 展示标签 |
| `created_at` | timestamptz | not null | 创建时间 |

规则：

- 生成报告前由用户确认资料清单。
- 已销毁资料和未勾选资料不能进入引用表。

### 7.3 `export_files`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 导出记录 |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `source_type` | varchar(60) | not null | report/recording/audio |
| `source_id` | uuid | not null | 来源 ID |
| `file_id` | uuid | fk `files.id`, nullable | 导出文件 |
| `format` | varchar(20) | not null | pdf/docx/m4a 等 |
| `status` | job_status | not null | 状态 |
| `created_at` | timestamptz | not null | 创建时间 |
| `completed_at` | timestamptz | nullable | 完成时间 |

## 8. 智能督导

### 8.1 `supervision_conversations`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 会话 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `title` | varchar(160) | not null | 会话标题 |
| `risk_prompt_shown_at` | timestamptz | nullable | 最近风险提示时间 |
| `expires_at` | timestamptz | not null | 创建后 14 天 |
| `long_term_authorized_at` | timestamptz | nullable | 长期保存授权 |
| `long_term_revoked_at` | timestamptz | nullable | 授权撤回 |
| `destroyed_at` | timestamptz | nullable | 销毁时间 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

### 8.2 `supervision_messages`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 消息 ID |
| `conversation_id` | uuid | fk `supervision_conversations.id`, not null | 会话 |
| `role` | message_role | not null | user/assistant/system |
| `content` | text | not null | 消息正文 |
| `generation_status` | job_status | nullable | assistant 消息生成状态 |
| `created_at` | timestamptz | not null | 创建时间 |

### 8.3 `supervision_context_refs`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 上下文引用 |
| `conversation_id` | uuid | fk `supervision_conversations.id`, not null | 会话 |
| `resource_type` | varchar(60) | not null | profile/session/report/attachment/transcript/summary |
| `resource_id` | uuid | not null | 资源 ID |
| `label` | varchar(180) | not null | 非敏感展示标签 |
| `created_at` | timestamptz | not null | 创建时间 |

规则：

- 智能督导默认无上下文。
- AI 只能读取 `supervision_context_refs` 中仍存在、未销毁、用户有权限的资源。
- 源资料销毁后，不保留敏感正文，只保留非敏感 label 和资源 ID。

## 9. AI 任务与生命周期

### 9.1 `ai_jobs`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 任务 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `job_type` | job_type | not null | 任务类型 |
| `target_type` | varchar(60) | not null | 目标类型 |
| `target_id` | uuid | not null | 目标 ID |
| `status` | job_status | not null | 任务状态 |
| `progress` | integer | default 0 | 0-100 |
| `input_snapshot` | jsonb | nullable | 脱敏输入摘要，不存敏感正文 |
| `result_summary` | jsonb | nullable | 脱敏结果摘要 |
| `error_code` | varchar(80) | nullable | 错误码 |
| `error_message` | text | nullable | 脱敏错误信息 |
| `cancel_requested_at` | timestamptz | nullable | 用户停止/取消 |
| `created_at` | timestamptz | not null | 入队时间 |
| `started_at` | timestamptz | nullable | 开始时间 |
| `finished_at` | timestamptz | nullable | 结束时间 |

索引：

- `ai_jobs_user_status_idx (user_id, status, created_at desc)`
- `ai_jobs_target_idx (target_type, target_id)`

### 9.2 `sensitive_resources`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 生命周期记录 |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `resource_type` | sensitive_resource_type | not null | 资源类型 |
| `resource_id` | uuid | not null | 资源 ID |
| `display_name` | varchar(180) | not null | 列表展示名 |
| `owner_type` | varchar(60) | nullable | profile/session/conversation |
| `owner_id` | uuid | nullable | 所属对象 |
| `expires_at` | timestamptz | not null | 销毁时间 |
| `can_long_term_preserve` | boolean | not null | 是否可授权长期保存 |
| `long_term_authorized_at` | timestamptz | nullable | 授权时间 |
| `long_term_revoked_at` | timestamptz | nullable | 撤回时间 |
| `destroyed_at` | timestamptz | nullable | 销毁时间 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `sensitive_resources_user_expiring_idx (user_id, expires_at) where destroyed_at is null and long_term_authorized_at is null`
- `sensitive_resources_user_long_term_idx (user_id, long_term_authorized_at) where destroyed_at is null and long_term_authorized_at is not null`
- `unique sensitive_resources_resource_unique (resource_type, resource_id)`

规则：

- 原始录音 `can_long_term_preserve=false`。
- 授权长期保存只更新允许类型。
- 取消长期保存时，若 `now() > expires_at`，立即销毁。

## 10. 日程与资讯

### 10.1 `calendar_events`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 日程 ID |
| `user_id` | uuid | fk `users.id`, not null | 所属用户 |
| `profile_id` | uuid | fk `profiles.id`, nullable | 可关联档案 |
| `session_id` | uuid | fk `sessions.id`, nullable | 可关联记录 |
| `title` | varchar(160) | not null | 默认标题 |
| `privacy_title` | varchar(80) | nullable | 隐私标题 |
| `category` | calendar_category | not null | 日程类别 |
| `start_at` | timestamptz | not null | 开始时间 |
| `end_at` | timestamptz | nullable | 结束时间 |
| `status` | calendar_status | default `pending` | 状态 |
| `sync_to_system_calendar` | boolean | default false | 单条同步开关 |
| `system_calendar_event_id` | varchar(255) | nullable | 移动端系统日历事件 ID |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

索引：

- `calendar_events_user_time_idx (user_id, start_at)`

### 10.2 `calendar_settings`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 设置 ID |
| `user_id` | uuid | fk `users.id`, unique | 所属用户 |
| `system_calendar_enabled` | boolean | default false | 全局同步开关 |
| `privacy_title_mode_enabled` | boolean | default false | 隐私标题模式 |
| `created_at` | timestamptz | not null | 创建时间 |
| `updated_at` | timestamptz | not null | 更新时间 |

### 10.3 `content_banners` / `content_articles`

资讯首发为静态配置内容，可用简单表维护，也可先用配置文件。

`content_banners`：

- `id`
- `title`
- `image_file_id`
- `link_url`
- `position`
- `enabled`
- `created_at`
- `updated_at`

`content_articles`：

- `id`
- `title`
- `cover_file_id`
- `summary`
- `content`
- `link_url`
- `enabled`
- `published_at`
- `created_at`
- `updated_at`

## 11. 审计与删除

### 11.1 `audit_logs`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | pk | 审计 ID |
| `user_id` | uuid | nullable | 注销后可空 |
| `action` | varchar(120) | not null | 操作 |
| `target_type` | varchar(60) | nullable | 目标类型 |
| `target_id` | uuid | nullable | 目标 ID |
| `metadata` | jsonb | default `{}` | 仅最小非敏感信息 |
| `created_at` | timestamptz | not null | 创建时间 |

禁止写入：

- 录音 URL 或 storage key。
- 转写文本、摘要、报告正文。
- 附件正文、PDF 提取文本。
- 密码 hash、token hash。

## 12. 关键一致性约束

1. 所有业务表的服务层查询必须带 `user_id`。
2. `recordings.session_id` 非空时，一个 `session` 只能绑定一条录音。
3. 覆盖型附件用唯一索引保证同一 owner/category 只有一个当前文件。
4. 报告用唯一索引保证同一范围、同一类型、同一状态最多一份。
5. `sensitive_resources` 和真实资源表的生命周期字段必须由同一个服务事务同步写入。
6. 销毁任务成功后，应清空对象存储 key 和敏感正文字段，并设置 `destroyed_at`。
7. 删除档案、删除资料、账号注销要先删除对象存储文件，再清空/删除数据库敏感内容；失败需进入重试队列。
