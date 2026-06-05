# 咨询师助手 App 产品与技术设计

## 1. 设计目标

咨询师助手 App 面向心理咨询师、督导师、实习咨询师等个人用户，覆盖“录音记录、转写纪要、档案归档、报告生成、日程提醒、数据与隐私、智能督导”这一核心工作流。MVP 应优先打通高频工作闭环：

1. 咨询或督导现场录音，或手动上传外部音频，先保存录音再异步生成转写与纪要。
2. 将录音归档到来访者、督导师或受督者档案。
3. 基于录音、量表、作业、附件生成咨询记录、督导反馈或督导记录。
4. 维护下一次咨询/督导/受督时间，并同步到 App 日程、首页提醒和手机系统日历。
5. 通过档案访问密码、用户授权长期保存和 14 天销毁机制保护敏感资料。

整体风格要求温馨柔和，但不能牺牲专业性。界面应减少强刺激色彩，使用低饱和暖色、清晰留白、圆角卡片和稳定的信息层级，让咨询师在记录、归档、复盘时感到轻松、可信、可控。

## 2. 推荐技术架构

### 2.1 移动端

采用 React Native + Expo 作为 iOS/Android 通用前端方案。

- 框架：React Native、Expo、TypeScript。
- 导航：React Navigation，底部 Tab + 堆栈导航。
- 状态管理：Zustand 或 Redux Toolkit。MVP 推荐 Zustand，轻量且足够维护录音、档案、日程、用户设置状态。
- 数据请求：TanStack Query，负责缓存、重试、分页和刷新。
- 表单：React Hook Form + Zod，统一字段校验。
- 本地缓存：Expo SecureStore 存储 token 和敏感设置，SQLite/MMKV 存储非长期敏感的 UI 状态、离线草稿索引、临时录音索引。
- 音频能力：expo-av 或 react-native-audio-recorder-player；正式生产需验证后台录音、权限弹窗、音频中断恢复。
- 文件上传：expo-document-picker、expo-image-picker、expo-file-system。

### 2.2 后端

采用 Python FastAPI + PostgreSQL。

- API 框架：FastAPI。
- ORM：SQLAlchemy 2.x。
- 数据迁移：Alembic。
- 鉴权：JWT access token + refresh token。
- 异步任务：Celery 或 RQ，处理转写、摘要、报告生成、PDF 文本解析、资料销毁等耗时任务。
- 对象存储：S3 兼容存储或本地 MinIO，保存录音、PDF、图片和导出文件。
- 实时能力：Server-Sent Events 用于 AI 任务进度和报告生成状态，WebSocket 或 SSE 用于智能督导流式输出。
- 部署：Docker Compose 起步，后续拆分 API、Worker、PostgreSQL、Redis、对象存储。

### 2.3 AI 与语音服务

MVP 可将 AI 能力封装为独立服务层：

- `AIProviderAdapter`：封装模型 URL、key、模型参数和供应商差异，前端不接触任何密钥。
- `TranscriptionService`：录音结束或上传完成后异步转写、发言人识别、时间戳切片。
- `SummaryService`：生成主要内容摘要和章节速览。
- `ReportService`：按系统内置模板生成咨询记录、督导反馈、督导记录、个案报告。
- `SupervisionChatService`：智能督导聊天、资料引用、流式输出和停止生成。
- `RiskPromptService`：识别自伤、自杀、严重伤害、危机干预等关键词并给出基础风险提示。
- `PdfTextExtractionService`：提取可解析 PDF 文本，供报告和智能督导按用户授权使用。

这样可以替换不同 AI/语音供应商，而不影响核心业务表结构和前端页面。

## 3. 信息架构与页面设计

### 3.1 底部导航

底部固定四个 Tab：

- 首页：工作概览和高频入口。
- 文档：档案库首页。
- 资讯：课程、活动、图文资讯。
- 我的：账号、安全、日程、数据与隐私、系统设置和预留功能。

### 3.2 首页

首页以“今天要做什么”为中心，而不是做营销型首页。

顶部为三个入口：

- 录音记录：进入录音列表，可开始录音。
- 档案库：进入来访者、督导师、受督者档案。
- 智能督导：进入大模型聊天助手，默认不读取档案资料，用户手动添加资料后才作为上下文。

中部展示：

- 今日提醒：来自日程与下一次咨询/督导/受督时间。
- 本周统计：本周咨询小时数、受督小时数、督导小时数。
- 近期任务：默认近七天，可在设置中配置时间范围。

视觉上建议使用柔和米白背景、暖杏色高亮、浅绿或雾蓝作为辅助色。卡片边框使用浅色描边和轻阴影，避免大片高饱和渐变。

### 3.3 录音记录与异步处理

录音记录列表页包含：

- 顶部 Tab：全部、待归档、已归档。
- 主按钮：开始录音。
- 搜索框：支持标题、内容、时间、归档对象搜索。
- 列表：显示标题、时长、转写状态、归档状态、创建时间。

录音页包含：

- 左上角读秒计时。
- 可编辑标题。
- 底部按钮：取消、暂停/继续、保存录音。
- 录音权限、音频中断、后台切换提示。

保存后弹出确认：

- 稍后归档：保存为待归档录音，AI 可先生成通用转写、摘要和章节速览。
- 立即归档并生成纪要：进入归档中间页，选择身份类型、档案和具体次数后带场景上下文发起 AI 处理。

录音纪要详情页包含：

- 播放器和完整转写文本。
- 发言人名称编辑，修改后全文同步展示。
- 主要内容摘要。
- 章节速览：每段展示主题、摘要和时间戳，点击跳转播放。
- 重新生成入口，若用户已编辑内容，必须提示重新生成会覆盖当前转写、摘要和章节速览。

### 3.4 档案库

档案库首页有三个 Tab：

- 来访者。
- 督导师。
- 受督者。

每个 Tab 下有搜索框、新增按钮、档案列表。归档录音时不直接在列表内完成，而是进入归档中间页：

1. 选择身份类型。
2. 选择归入已有档案或新建档案。
3. 选择具体咨询/督导次数，或自动创建下一次记录。
4. 确认归档。

档案详情页进入前需要输入对应身份的访问密码。三类身份可配置独立密码。

## 4. 核心业务模块

### 4.1 来访者档案

字段：

- 姓名，必填。
- 来访者编号。
- 性别：男、女、其他。
- 咨询次数。
- 咨询时间。
- 首访主诉。
- 危机评估：不严重、轻度、中度、重度。
- 个案状态：进行中、结案、脱落、暂停、转介。
- 下一次咨询时间。
- 备注。

文件入口：

- 知情同意书，支持 PDF/图片，重新上传覆盖旧文件。
- 咨询协议，支持 PDF/图片，重新上传覆盖旧文件。

每次咨询记录包含：

- 录音：一次咨询仅一条录音，支持 App 录制或手动上传。
- 咨询记录：未生成时显示“生成咨询记录”。
- 量表：支持多个 PDF/图片。
- 作业：支持多个 PDF/图片。
- 其他：支持多个附件。

页面底部提供“生成个案报告”，基于所有历史咨询记录按系统内置模板生成。

### 4.2 督导师档案

字段：

- 姓名，必填。
- 督导次数。
- 督导时间。
- 督导形式：线上、线下。
- 下一次督导时间。
- 备注。

文件入口：

- 督导协议。
- 督导评价。

每次督导记录包含：

- 录音。
- 督导反馈：可基于录音自动生成。
- 其他。

### 4.3 受督者档案

字段：

- 姓名，必填。
- 受督次数。
- 受督时间。
- 督导形式：线上、线下。
- 下一次督导时间。
- 备注。

文件入口：

- 督导协议。
- 受督者评估。

每次督导记录包含：

- 录音。
- 督导记录：可基于录音自动生成。
- 其他。

### 4.4 日程管理

日程在“我的 > 管理 > 日程管理”中维护。

能力：

- 月历视图，支持年月切换。
- 有安排的日期显示标记点。
- 点击日期查看当天事项。
- 新增日程：开始时间、结束时间、事项类别、对方姓名/角色、次数。
- 标记已完成。
- 删除日程。

档案详情页设置的下一次咨询/督导时间应自动创建或更新日程，并在首页“今日提醒”显示。

### 4.5 智能督导

智能督导是大模型聊天助手，用于辅助咨询师整理思路、复盘个案、梳理督导议题。

首发能力：

- 默认不读取任何档案资料。
- 页面顶部提供“添加资料”入口，用户可选择档案、单次记录、报告、附件等资料作为上下文。
- AI 只能读取用户当前选择的资料。
- 聊天支持流式输出和停止生成。
- 回答需要展示引用来源；未引用资料时显示未引用档案资料。
- 会话保存到智能督导会话列表，但不自动进入正式档案。
- 会话默认 14 天销毁，可由用户主动授权长期保存。
- 当输入或资料涉及自伤、自杀、严重伤害、危机干预等内容时，显示基础风险提示。

不做：

- 不替代专业督导、伦理判断或危机干预。
- 不自动修改档案中的危机评估等级。
- 不自动保存聊天结果为咨询记录、督导记录或其他正式资料。
- 首发不支持智能督导会话导出 PDF/Word。

### 4.6 数据与隐私

数据与隐私页面入口放在“我的 > 设置 > 数据与隐私”。

页面需要提供：

- 云端敏感资料默认 14 天销毁的说明。
- 原始录音不支持长期云端保存的说明。
- 可授权长期保存的资料类型说明。
- “即将销毁资料”集中列表。
- “已长期保存资料”集中列表。
- 删除资料不可恢复的提醒。
- 手机系统日历同步可能暴露姓名和事项的提醒。
- 智能督导只读取用户手动选择资料的说明。

授权长期保存规则：

- 必须用户主动授权，不能默认勾选。
- 授权弹窗说明保存内容、原因、期限、风险和撤回方式。
- 长期保存直到用户主动删除或取消授权。
- 取消长期保存时，如果资料已超过原始 14 天期限，则立即销毁。

## 5. 数据库设计

推荐核心表如下。

### 5.1 用户与安全

`users`

- `id`
- `phone`
- `email`
- `password_hash`
- `display_name`
- `avatar_url`
- `professional_identity`
- `created_at`
- `updated_at`

`profile_access_passwords`

- `id`
- `user_id`
- `profile_type`：client、supervisor、supervisee。
- `password_hash`
- `updated_at`

### 5.2 档案

`profiles`

- `id`
- `user_id`
- `type`：client、supervisor、supervisee。
- `name`
- `avatar_url`
- `status`
- `initial_session_count`
- `metadata`：JSONB，保存不同身份的扩展字段。
- `next_session_at`
- `created_at`
- `updated_at`

说明：三类档案字段相似但不完全一致，MVP 可用 `metadata` 承载差异字段，降低迁移频率。若后续字段稳定，可拆成 `client_profiles`、`supervisor_profiles`、`supervisee_profiles`。

### 5.3 会谈/督导记录

`sessions`

- `id`
- `profile_id`
- `session_type`：counseling、supervision_given、supervision_received。
- `sequence_no`
- `title`
- `started_at`
- `ended_at`
- `duration_seconds`
- `mode`：online、offline。
- `status`
- `created_at`
- `updated_at`

### 5.4 录音与转写

`recordings`

- `id`
- `user_id`
- `session_id`，可为空，未归档时为空。
- `title`
- `source_type`：in_app_recording、uploaded_audio。
- `audio_file_id`
- `duration_seconds`
- `archive_status`：unarchived、archived。
- `ai_status`：pending、processing、completed、failed。
- `processing_error`
- `uploaded_at`
- `audio_expires_at`
- `audio_destroyed_at`
- `created_at`
- `updated_at`

说明：原始录音云端只保存 14 天，不支持长期保存。`audio_expires_at` 从上传成功时间开始计算，超过期限由销毁任务清理对象存储文件并标记 `audio_destroyed_at`。

`recording_transcripts`

- `id`
- `recording_id`
- `generated_at`
- `expires_at`
- `long_term_authorized_at`
- `long_term_revoked_at`
- `destroyed_at`
- `created_at`
- `updated_at`

说明：完整转写从生成完成时间开始计算 14 天保存期。若被销毁，需清空转写正文和分段内容，但可保留最小状态记录用于审计和列表展示。

`transcript_segments`

- `id`
- `transcript_id`
- `start_ms`
- `end_ms`
- `speaker_key`：speaker_1、speaker_2。
- `speaker_label`：用户可编辑，例如咨询师、来访者。
- `text`
- `edited_at`
- `created_at`

`recording_summaries`

- `id`
- `recording_id`
- `main_summary`
- `chapter_overview`：JSONB，含标题、摘要、开始时间、结束时间。
- `expires_at`
- `long_term_authorized_at`
- `long_term_revoked_at`
- `destroyed_at`
- `created_at`

### 5.5 附件与报告

`files`

- `id`
- `user_id`
- `storage_key`
- `filename`
- `mime_type`
- `size_bytes`
- `checksum`
- `expires_at`
- `can_long_term_preserve`
- `long_term_authorized_at`
- `long_term_revoked_at`
- `destroyed_at`
- `created_at`

`attachments`

- `id`
- `owner_type`：profile、session、report。
- `owner_id`
- `category`：consent、agreement、scale、homework、evaluation、other。
- `file_id`
- `replace_group_key`，覆盖型附件用于定位同一类当前文件。
- `is_current`
- `analysis_status`：not_applicable、pending、available、failed。
- `extracted_text`
- `created_at`

说明：覆盖型附件重新上传时，新文件成为 `is_current=true`，旧文件立即删除或清空敏感内容，不做多版本管理。列表型附件可保留多个当前文件。

`reports`

- `id`
- `user_id`
- `profile_id`
- `session_id`
- `report_type`：recording_note、counseling_note、supervision_feedback、supervision_note、case_report。
- `report_state`：draft、formal。
- `generation_status`：idle、generating、completed、failed。
- `system_template_key`
- `title`
- `content_json`
- `expires_at`
- `long_term_authorized_at`
- `long_term_revoked_at`
- `destroyed_at`
- `created_at`
- `updated_at`

说明：录音纪要不区分草稿和正式版。咨询记录、督导反馈、督导记录、个案报告每种类型最多保留一个草稿和一个正式版，可通过唯一索引约束 `user_id + profile_id + session_id + report_type + report_state`。

`ai_jobs`

- `id`
- `user_id`
- `job_type`：transcription、summary、report_generation、pdf_text_extraction、supervision_chat。
- `target_type`
- `target_id`
- `status`：queued、running、succeeded、failed、cancelled。
- `progress`
- `error_message`
- `created_at`
- `started_at`
- `finished_at`

`supervision_conversations`

- `id`
- `user_id`
- `name`
- `expires_at`
- `long_term_authorized_at`
- `long_term_revoked_at`
- `destroyed_at`
- `created_at`
- `updated_at`

`supervision_messages`

- `id`
- `conversation_id`
- `role`：user、assistant、system。
- `content`
- `generation_status`：streaming、completed、stopped、failed。
- `created_at`

`supervision_context_refs`

- `id`
- `conversation_id`
- `resource_type`：profile、session、report、attachment、recording_summary。
- `resource_id`
- `label`
- `created_at`

说明：智能督导引用已删除或已销毁资料时，只保留引用标签和最小元数据，不因为聊天引用而保留敏感正文。

### 5.6 数据生命周期

`sensitive_resources`

- `id`
- `user_id`
- `resource_type`：audio、transcript、recording_summary、report、attachment、supervision_conversation。
- `resource_id`
- `display_name`
- `expires_at`
- `can_long_term_preserve`
- `long_term_authorized_at`
- `long_term_revoked_at`
- `destroyed_at`
- `created_at`
- `updated_at`

说明：该表用于驱动“即将销毁资料”和“已长期保存资料”列表，也让销毁任务可以统一扫描。原始录音可进入即将销毁列表，但 `can_long_term_preserve=false`。

### 5.7 日程与资讯

`calendar_events`

- `id`
- `user_id`
- `profile_id`
- `session_id`
- `title`
- `privacy_title`
- `category`
- `start_at`
- `end_at`
- `status`：pending、completed、cancelled。
- `sync_to_system_calendar`
- `system_calendar_event_id`
- `created_at`
- `updated_at`

`calendar_settings`

- `id`
- `user_id`
- `system_calendar_enabled`
- `privacy_title_mode_enabled`
- `created_at`
- `updated_at`

`content_banners`

- `id`
- `title`
- `image_file_id`
- `link_url`
- `position`
- `enabled`
- `created_at`

`content_articles`

- `id`
- `title`
- `cover_file_id`
- `summary`
- `content`
- `link_url`
- `enabled`
- `published_at`

## 6. API 设计

建议采用 REST API，长任务状态使用 SSE，智能督导流式输出使用 WebSocket 或 SSE。

认证：

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /me`
- `PATCH /me`

录音：

- `GET /recordings`
- `POST /recordings`
- `GET /recordings/{id}`
- `PATCH /recordings/{id}`
- `POST /recordings/{id}/archive`
- `POST /recordings/{id}/upload-audio`
- `POST /recordings/{id}/start-processing`
- `POST /recordings/{id}/retry-processing`
- `POST /recordings/{id}/regenerate-note`
- `GET /recordings/{id}/transcript`
- `GET /recordings/{id}/summary`
- `PATCH /recordings/{id}/speakers`
- `PATCH /transcript-segments/{id}`

档案：

- `GET /profiles?type=client`
- `POST /profiles`
- `GET /profiles/{id}`
- `PATCH /profiles/{id}`
- `POST /profiles/{id}/verify-password`
- `GET /profiles/{id}/sessions`
- `POST /profiles/{id}/sessions`

附件：

- `POST /files/upload`
- `GET /attachments`
- `POST /attachments`
- `POST /attachments/{id}/replace`
- `DELETE /attachments/{id}`

报告：

- `POST /reports/generate`
- `GET /reports/{id}`
- `PATCH /reports/{id}`
- `POST /reports/{id}/save-formal`
- `POST /reports/{id}/copy-formal-to-draft`
- `POST /reports/{id}/export`
- `POST /reports/{id}/regenerate`

智能督导：

- `GET /supervision/conversations`
- `POST /supervision/conversations`
- `GET /supervision/conversations/{id}`
- `POST /supervision/conversations/{id}/context`
- `DELETE /supervision/conversations/{id}/context/{context_id}`
- `POST /supervision/conversations/{id}/messages`
- `POST /supervision/conversations/{id}/stop`

日程：

- `GET /calendar/events`
- `POST /calendar/events`
- `PATCH /calendar/events/{id}`
- `DELETE /calendar/events/{id}`
- `POST /calendar/events/{id}/sync`

数据与隐私：

- `GET /privacy/expiring-resources`
- `GET /privacy/long-term-resources`
- `POST /privacy/resources/{id}/authorize-long-term`
- `POST /privacy/resources/{id}/revoke-long-term`
- `DELETE /privacy/resources/{id}`

任务状态：

- `GET /ai-jobs/{id}`
- `GET /ai-jobs/{id}/events`

资讯：

- `GET /content/home`
- `GET /content/articles`

## 7. 前端目录建议

```text
apps/mobile/
  src/
    app/
      navigation/
      providers/
    features/
      home/
      recordings/
      profiles/
      calendar/
      reports/
      supervision/
      privacy/
      content/
      account/
    shared/
      api/
      components/
      theme/
      hooks/
      utils/
```

## 8. 后端目录建议

```text
backend/
  app/
    api/
      routes/
      dependencies.py
    core/
      config.py
      security.py
    models/
    schemas/
    services/
      ai_adapter.py
      transcription.py
      summaries.py
      reports.py
      supervision.py
      pdf_text_extraction.py
      storage.py
      retention.py
      calendar_sync.py
    workers/
      jobs.py
      retention_cleanup.py
    db/
      session.py
      migrations/
```

## 9. 视觉与交互风格

### 9.1 色彩

推荐色板：

- 背景：`#FFF9F3`，温暖米白。
- 主色：`#D98F7A`，柔和陶土粉。
- 辅助色：`#8FB7A5`，安静鼠尾草绿。
- 信息色：`#8FA8C8`，低饱和雾蓝。
- 正文：`#3E3A37`。
- 次级文字：`#7A726B`。
- 边框：`#EEE1D6`。

### 9.2 组件风格

- 页面背景保持浅暖色。
- 内容卡片使用白色或近白色，圆角 8，工具按钮保持稳定尺寸。
- 主按钮使用陶土粉，文字白色。
- 危机评估使用明确但不刺眼的状态色：轻度黄、中度橙、重度红。
- 图标线条统一，首页三个入口可使用柔和面形图标。
- 列表项要突出时间、归档状态、生成状态，减少长段文字。

### 9.3 移动端交互

- 录音页底部操作必须大按钮，防误触。
- 保存、归档、删除都需要确认。
- 进入档案详情每次都需要输入对应身份类型的档案访问密码，不做短时间免输入。
- 附件上传应显示进度、失败重试、文件类型限制提示。
- 报告生成要显示任务进度，失败后允许重新生成。
- 授权长期保存必须使用单独弹窗，默认不勾选。

## 10. 安全与隐私

心理咨询资料高度敏感，MVP 也需要把安全作为基础能力。

- 所有 API 使用 HTTPS。
- 密码使用 Argon2 或 bcrypt 哈希。
- 档案访问密码单独哈希存储，不保存明文。
- 录音和附件使用对象存储私有桶，访问时签发短期 URL。
- 敏感日志脱敏，不记录完整转写内容。
- 删除档案、单个敏感资料或账号注销时立即彻底删除云端敏感内容，不做回收站。
- 原始录音上传成功后只保存 14 天，到期自动销毁，不支持长期云端保存。
- 转写、纪要、报告、附件、智能督导会话默认 14 天销毁，长期保存必须由用户主动授权。
- 后端按 `user_id` 做强隔离，所有查询必须带用户上下文。
- 移动端 token 存储在 SecureStore，不放普通 AsyncStorage。
- 后端保留最小化审计记录时，不得包含敏感正文或原始文件内容。

## 11. MVP 范围

第一阶段建议交付：

- 登录/注册、个人资料。
- 首页、底部四 Tab。
- 录音记录列表、App 内录音、外部音频上传、异步处理状态。
- 录音纪要详情：播放器、完整转写、发言人编辑、摘要、章节速览。
- 档案库：三类档案增删改查、密码访问。
- 归档中间页。
- 来访者/督导师/受督者详情与每次记录。
- 附件上传、PDF 文本解析、图片保存展示。
- 日程管理、首页今日提醒、手机系统日历同步。
- 数据与隐私页面、即将销毁资料列表、已长期保存资料列表。
- 智能督导聊天、手动添加资料、流式输出、停止生成、引用来源。
- 咨询记录、督导反馈、督导记录生成任务。

暂缓：

- 多语言、字体大小设置、系统权限页。
- 复杂后台 CMS。
- 用户自定义报告模板。
- 上传 Word 解析模板。
- 图片 OCR、扫描版 PDF OCR、量表自动计分。
- App 内本地资料库或本地保险箱。

## 12. 测试策略

前端：

- 单元测试：表单校验、状态管理、API hooks。
- 组件测试：首页卡片、录音列表、档案表单、日程列表。
- 端到端测试：登录、创建档案、录音保存、异步生成、归档、生成报告、授权长期保存。
- 设备测试：iOS/Android 权限弹窗、录音中断、后台切换、低网速上传。

后端：

- 单元测试：权限校验、密码验证、归档逻辑、资料选择规则、授权长期保存规则。
- API 测试：录音、档案、附件、报告、智能督导、日程、数据与隐私。
- 数据库测试：用户隔离、彻底删除、生命周期字段、JSONB 字段更新。
- Worker 测试：转写失败重试、报告生成状态流转、PDF 文本解析、14 天销毁任务。

## 13. 后续实施顺序

1. 建立 monorepo：`apps/mobile` 和 `backend`。
2. 搭建 FastAPI、PostgreSQL、Alembic、Docker Compose。
3. 搭建 Expo React Native、导航、主题、基础组件。
4. 实现认证和用户设置。
5. 实现档案库与访问密码。
6. 实现录音记录和归档中间页。
7. 实现对象存储、附件上传和 PDF 文本解析。
8. 实现数据生命周期、授权长期保存和销毁任务。
9. 实现日程管理、首页提醒和手机系统日历同步。
10. 接入转写、摘要、报告生成异步任务。
11. 实现智能督导聊天、资料引用和流式输出。
12. 完成 MVP 联调、测试和发布准备。
