# 后端实现说明

版本：v0.1  
日期：2026-06-05  
适用范围：咨询师助手 App MVP 后端

## 1. 推荐后端结构

```text
backend/
  app/
    api/
      routes/
        auth.py
        me.py
        profile_passwords.py
        profiles.py
        sessions.py
        recordings.py
        files.py
        attachments.py
        reports.py
        supervision.py
        privacy.py
        calendar.py
        ai_jobs.py
        content.py
      dependencies.py
    core/
      config.py
      security.py
      errors.py
      time.py
    db/
      session.py
      migrations/
    models/
    schemas/
    services/
      ai_adapter.py
      ai_jobs.py
      attachments.py
      audit.py
      calendar.py
      deletion.py
      exports.py
      files.py
      lifecycle.py
      pdf_text_extraction.py
      profiles.py
      recordings.py
      reports.py
      retention.py
      storage.py
      supervision.py
      transcription.py
    workers/
      celery_app.py
      jobs.py
      retention_cleanup.py
```

MVP 可以先保持单体 FastAPI 应用，Worker 单独进程部署。服务层按业务边界拆分，避免路由直接操作复杂生命周期。

## 2. 生命周期服务

### 2.1 统一入口

所有敏感资料创建时都必须通过 `LifecycleService` 写入资源表和 `sensitive_resources`。

推荐方法：

```python
class LifecycleService:
    def create_resource_index(
        self,
        *,
        user_id: UUID,
        resource_type: str,
        resource_id: UUID,
        display_name: str,
        owner_type: str | None,
        owner_id: UUID | None,
        expires_at: datetime,
        can_long_term_preserve: bool,
    ) -> SensitiveResource:
        ...

    def authorize_long_term(self, user_id: UUID, sensitive_resource_id: UUID) -> None:
        ...

    def revoke_long_term(self, user_id: UUID, sensitive_resource_id: UUID) -> RevokeResult:
        ...

    def destroy_resource(self, user_id: UUID, sensitive_resource_id: UUID, reason: str) -> None:
        ...
```

### 2.2 起算规则

| 资源 | 起算时间 | 默认销毁时间 |
|---|---|---|
| 原始录音/上传音频 | 上传成功时间 | 上传成功后 14 天 |
| 转写文本 | 转写生成完成时间 | 生成完成后 14 天 |
| 录音纪要/摘要/章节速览 | 纪要生成完成时间 | 生成完成后 14 天 |
| 报告 | 报告生成完成时间 | 生成完成后 14 天 |
| 附件 | 上传成功时间 | 上传成功后 14 天 |
| 智能督导会话 | 会话创建时间 | 创建后 14 天 |

### 2.3 长期保存

授权长期保存：

- 只允许 `can_long_term_preserve=true`。
- 原始录音必须拒绝，返回 `long_term_not_allowed`。
- 需要前端传入确认字段，表示用户已阅读授权弹窗。
- 同步更新真实资源表和 `sensitive_resources`。

取消长期保存：

- 若 `now() <= expires_at`：清空长期保存授权，恢复临时保存状态。
- 若 `now() > expires_at`：立即调用销毁流程。

## 3. 销毁与删除

### 3.1 到期销毁任务

Worker 每小时扫描：

```sql
select *
from sensitive_resources
where destroyed_at is null
  and long_term_authorized_at is null
  and expires_at <= now()
order by expires_at asc
limit 500;
```

每条资源调用 `DeletionService.destroy_sensitive_resource(...)`。

销毁必须做到：

1. 删除对象存储文件。
2. 清空数据库敏感正文。
3. 清空对象存储 key 或下载 URL。
4. 设置真实资源表 `destroyed_at`。
5. 设置 `sensitive_resources.destroyed_at`。
6. 写入最小化审计记录。

### 3.2 对象存储删除失败重试

对象存储删除失败不能静默吞掉。

推荐增加 `storage_deletion_attempts` 表，或在 `ai_jobs` 中使用 `job_type=retention_cleanup` 记录重试。

重试策略：

- 第 1 次失败：5 分钟后重试。
- 第 2 次失败：30 分钟后重试。
- 第 3 次失败：2 小时后重试。
- 第 4 次及以上：每天重试，并在管理日志中标记需要人工排查。

敏感数据库正文只有在对象存储删除成功后清空；如果对象存储失败，资源保持待销毁状态，避免数据库显示已销毁但文件仍存在。

### 3.3 删除档案

删除档案是级联危险操作，不建议完全依赖数据库 `ON DELETE CASCADE`。使用服务层事务编排：

1. 找到档案下 sessions。
2. 找到关联 recordings、transcripts、summaries、reports、attachments、files、supervision context refs、calendar events。
3. 删除对象存储文件。
4. 清空敏感正文。
5. 删除数据库业务行或设置销毁状态。
6. 删除 `sensitive_resources` 或标记 `destroyed_at`。
7. 删除 profile。
8. 写入最小化审计。

已同步到手机系统日历的事件由移动端处理；后端返回 `system_calendar_event_id` 供前端提示和同步删除。

### 3.4 账号注销

账号注销复用删除档案和敏感资料销毁服务，并额外：

- 删除或失效 refresh tokens。
- 删除 calendar settings。
- 删除 supervision conversations。
- 删除 standalone unarchived recordings。
- 删除 content 不受影响。
- 将 access token 加入短期黑名单或提高 token 版本号，让旧 token 失效。

## 4. AI 任务队列

### 4.1 技术选型

MVP 推荐：

- FastAPI API 进程负责请求校验和入队。
- Redis 作为 Broker。
- Celery 作为 Worker。
- PostgreSQL 的 `ai_jobs` 表作为用户可见任务状态源。

RQ 也可行，但 Celery 对定时任务、重试、任务路由更成熟。

### 4.2 通用任务状态

创建任务时：

1. API 事务中创建 `ai_jobs(status=queued)`。
2. 提交事务后发送 Celery 任务，参数只传 `job_id`。
3. Worker 读取 `job_id`，重新从数据库取目标资源。
4. Worker 更新 `status=running`、`started_at`。
5. 成功后更新目标资源和 `ai_jobs(status=succeeded)`。
6. 失败后写入脱敏错误码和错误信息。

不要把敏感正文放进 Celery 参数、日志或 `ai_jobs.input_snapshot`。

### 4.3 录音处理任务

流程：

1. 校验原始录音未销毁。
2. 从对象存储获取短期读取 URL 或流式读取音频。
3. 调用语音模型生成分段、发言人、时间戳。
4. 如果录音已归档，根据场景推荐 `speaker_label`。
5. 生成摘要和章节速览。
6. 在事务中替换 transcript、segments、summary。
7. 创建或更新生命周期记录。
8. 更新 recording `ai_status=completed`。

重新生成规则：

- 开始前备份旧资源 ID 或在事务中延迟覆盖。
- 新内容生成成功后再替换旧内容。
- 失败时保留旧内容并设置任务失败。

### 4.4 报告生成任务

流程：

1. API 先返回可用资料清单。
2. 用户选择资料后创建任务。
3. Worker 再次校验每个资料仍未销毁且属于当前用户。
4. 使用系统内置模板 prompt。
5. 输出结构化 `content_json`。
6. 写入草稿报告。
7. 写入 `report_source_refs`。
8. 创建生命周期记录。

已销毁资料、图片附件、解析失败 PDF 不能进入模型上下文。

### 4.5 智能督导任务

智能督导默认不读取资料。Worker 构造上下文时只能读取 `supervision_context_refs` 中的可用资料。

输出要求：

- 支持流式 delta。
- 支持停止生成。
- 停止后保留已生成部分。
- 需要引用来源；未引用时在消息元数据中标记。
- 触发危机关键词时返回风险提示，但不自动修改档案危机等级。

SSE 事件可以来自 Redis pub/sub、数据库轮询或内存队列。MVP 推荐 Redis pub/sub。

## 5. AI Provider Adapter

### 5.0 Current recording provider

- Local development: read private MinIO audio bytes in FastAPI and send Base64 to `qwen3-asr-flash`.
- Production: generate a short-lived MinIO GET URL and submit it to asynchronous `fun-asr`; MinIO must be reachable from Alibaba Cloud.
- Both paths normalize into speaker labels, timestamped segments, a main summary, and chapter overview.
- `qwen-plus` generates the recording summary from transcript text only.
- Credentials and provider selection are server-side environment variables and are never returned to the mobile client.

后端不应把供应商写死在业务服务中。

推荐接口：

```python
class AIProviderAdapter:
    async def transcribe_audio(self, audio: AudioInput, context: TranscriptionContext) -> TranscriptionResult:
        ...

    async def generate_summary(self, transcript: TranscriptInput, context: SummaryContext) -> SummaryResult:
        ...

    async def generate_report(self, sources: list[ReportSource], template_key: str) -> ReportResult:
        ...

    async def stream_chat(self, messages: list[ChatMessage], sources: list[ContextSource]) -> AsyncIterator[ChatDelta]:
        ...
```

配置来自环境变量或服务端配置：

- `SPEECH_MODEL_BASE_URL`
- `SPEECH_MODEL_API_KEY`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `AI_REQUEST_TIMEOUT_SECONDS`

禁止：

- 前端传入任意模型 URL。
- 前端保存 API key。
- 日志记录 provider 原始请求全文。

## 6. 文件、附件与 PDF 提取

### 6.1 上传

上传流程：

1. API 创建 `files` 行。
2. API 返回短期上传 URL。
3. 前端上传到对象存储。
4. 前端通知 API 上传完成。
5. API 设置 `created_at`/`expires_at`，并按用途创建业务资源。

### 6.2 PDF 提取

Worker 只处理 MIME 为 `application/pdf` 的文件。

结果：

- 可提取文本：`attachments.analysis_status=available`，写入 `extracted_text`。
- 无文本或失败：`analysis_status=failed`。
- 图片：`analysis_status=not_applicable`。

扫描版 PDF OCR 后续再做，不在 MVP 实现。

## 7. 报告导出

支持：

- PDF。
- Word/DOCX。

建议：

- 报告正文以 `content_json` 保存，导出服务将其渲染到 PDF/DOCX。
- 导出文件可按临时文件处理，默认 14 天销毁，或下载后短期失效。
- 文件名由后端生成，使用 PRD 规则：
  - `陈雨_第6次咨询_录音纪要_2026-06-04.pdf`
  - `陈雨_个案报告_2026-06-04.pdf`

智能督导会话首发不支持导出。

## 8. 日历同步

系统日历写入由移动端完成，后端只保存：

- App 内日程。
- 全局同步开关。
- 隐私标题模式。
- 每条日程是否同步。
- 移动端回传的 `system_calendar_event_id`。

原因：

- iOS/Android 系统日历权限和事件写入需要在设备端完成。
- 后端无法直接删除用户手机系统日历事件。

删除已同步日程时，API 响应应带出 `system_calendar_event_id`，前端提示用户是否同步删除设备事件。

## 9. 安全与隐私

### 9.1 访问控制

每个服务层方法都要接收 `current_user_id`，禁止只按资源 ID 查询。

示例：

```python
recording = recording_repo.get_by_id(user_id=current_user_id, recording_id=recording_id)
if recording is None:
    raise NotFoundError()
```

档案详情类敏感读取还必须校验 `X-Profile-Access-Grant`：

- grant 必须属于当前用户。
- grant 的 `profile_type` 必须匹配档案类型。
- grant 未过期、未使用。
- 使用后设置 `used_at`，避免作为短时间免输机制。
- 前端离开档案详情后丢弃 grant；再次进入重新验证密码。

### 9.2 日志脱敏

日志允许：

- 用户 ID。
- 资源 ID。
- 状态码。
- 脱敏错误码。
- 耗时。

日志禁止：

- 转写内容。
- 摘要。
- 报告正文。
- 智能督导消息正文。
- 附件提取文本。
- 对象存储长期 URL。
- 密码 hash 和 token hash。

### 9.3 危险操作确认

后端必须校验确认字段，不能只依赖前端弹窗。

需要确认：

- 删除档案。
- 删除资料。
- 注销账号。
- 重新生成并覆盖编辑内容。
- 保存草稿替换正式版。
- 授权长期保存。
- 取消长期保存且立即销毁。

## 10. 测试重点

### 10.1 单元测试

- 档案访问密码设置、验证、重置。
- 档案访问 grant 只能使用一次，过期或已用后拒绝访问。
- `sequence_no` 生成和删除后不重排。
- 生命周期授权、撤回、过期销毁。
- 原始录音不可长期保存。
- 报告草稿/正式版唯一性规则。
- 智能督导上下文只读取手动选择资料。

### 10.2 API 测试

- 用户 A 不能访问用户 B 的任意资源。
- 未验证档案密码时前端不能进入详情；后端仍按 `user_id` 隔离。
- 音频销毁后重新生成返回业务错误。
- 删除档案级联清理敏感资料。
- 授权长期保存后资源不出现在即将销毁列表。
- 取消长期保存超过原期限后立即销毁。

### 10.3 Worker 测试

- 录音处理失败后可重试。
- 重新生成失败保留旧内容。
- PDF 解析成功/失败状态。
- 对象存储删除失败进入重试。
- AI 任务取消后状态正确。

### 10.4 录音 AI 已实现约束

- 首次处理：后端读取私有 MinIO 音频或生成短期下载 URL，完成 ASR 后再生成纪要。
- 重新生成纪要：只读取 PostgreSQL 中当前有效的转写分段，保留人工校对内容，不读取原始音频，也不再次调用 ASR。
- 录音处理失败：同时更新 `recordings.ai_status/processing_error` 和对应 `ai_jobs`。
- 纪要重新生成失败：记录独立的 `recording_summary_regeneration` 任务失败，保留现有转写和旧纪要。
- 原始音频未上传、已过期或已销毁时，后端拒绝 ASR；前端同步隐藏重试入口。

## 11. 首发不做

- 机构账号、多成员、团队权限、管理员后台。
- 来访者端、督导师端、受督者协作端。
- 实时转文字。
- 用户自定义报告模板。
- 上传 Word 解析模板结构。
- 图片 OCR 和扫描版 PDF OCR。
- 量表自动计分。
- App 内本地资料库或本地保险箱。
- 智能督导会话导出。
- 智能督导输出一键保存为正式资料。
- 报告历史版本。
