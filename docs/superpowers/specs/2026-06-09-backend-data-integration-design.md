# PostgreSQL 与 MinIO 前后端联调设计

日期：2026-06-09

## 目标

把当前移动端原型中的档案、单次记录和附件演示数据迁移到 FastAPI 后端，使 PostgreSQL 成为结构化业务数据的事实来源，MinIO 成为上传文件原始字节的事实来源。

第一批联调覆盖：

- 档案列表和档案详情。
- 单次咨询、受督或督导记录列表。
- 单次记录所属附件列表。
- 文件预签名上传、上传完成确认和原文件下载。

本批不实现 AI 转写、报告生成、智能督导、隐私授权和自动销毁 Worker，但数据库与服务边界应为这些后续能力保留扩展空间。

## 基础设施

项目根目录使用 Docker Compose 管理独立开发环境：

- PostgreSQL：存储用户、档案、单次记录、文件元数据和附件关系。
- MinIO：私有 bucket，存储录音、PDF 和图片等原始文件。
- MinIO 初始化容器：创建私有 bucket。

Compose 使用具名数据卷持久化 PostgreSQL 和 MinIO 数据。账号和端口通过 `.env` 配置，仓库只提交 `.env.example`。

## 后端结构

FastAPI 从当前单文件内存实现演进为分层结构：

```text
backend/app/
  api/
    dependencies.py
    routes/
      profiles.py
      sessions.py
      files.py
      attachments.py
  core/
    config.py
    errors.py
  db/
    base.py
    session.py
    migrations/
  models/
    profile.py
    session.py
    file.py
    attachment.py
  repositories/
  schemas/
  services/
    storage.py
    files.py
    attachments.py
  main.py
```

路由负责 HTTP 输入输出；服务负责业务规则；仓储负责数据库访问；MinIO 只通过存储适配器调用。

## 数据归属

### PostgreSQL

存储：

- 用户与用户隔离字段。
- 档案及身份类型。
- 单次记录、固定次数编号和发生时间。
- 咨询卡片摘要与标签。
- 文件元数据、生命周期字段和 MinIO `storage_key`。
- 附件所属对象、类别、当前版本和分析状态。

### MinIO

存储：

- 原始录音。
- PDF。
- 图片。
- 其他上传文件的原始字节。

MinIO bucket 不公开。前端不持有 MinIO 密钥、永久 URL 或 `storage_key`。

### 前端

只保留：

- 当前路由和选中资源 ID。
- 表单输入与未提交草稿。
- 加载、错误、确认框和上传进度。
- 后端返回数据的短期展示缓存。

刷新后仍需存在、跨设备可见、涉及权限或生命周期的数据均以后端为事实来源。

## 第一批数据库模型

### `profiles`

- `id`
- `user_id`
- `type`
- `name`
- `code`
- `status`
- `crisis_level`
- `initial_session_count`
- `next_session_at`
- `metadata`
- `created_at`
- `updated_at`

### `sessions`

- `id`
- `user_id`
- `profile_id`
- `session_type`
- `sequence_no`
- `occurred_at`
- `summary`
- `tags`
- `record_status`
- `created_at`
- `updated_at`

`sequence_no` 由后端生成并固定。视觉列表按 `occurred_at` 倒序展示。

### `files`

- `id`
- `user_id`
- `storage_key`
- `filename`
- `mime_type`
- `size_bytes`
- `upload_status`
- `expires_at`
- `can_long_term_preserve`
- `destroyed_at`
- `created_at`

### `attachments`

- `id`
- `user_id`
- `owner_type`
- `owner_id`
- `category`
- `file_id`
- `replace_group_key`
- `is_current`
- `analysis_status`
- `created_at`
- `updated_at`

## 种子数据

后端提供幂等种子脚本，写入当前移动原型使用的演示用户和主要业务数据：

- 来访者陈雨及第 5、6 次咨询。
- 档案库中的督导师与受督者示例。
- 第 6 次咨询的录音、量表、作业和其他附件元数据。
- 法律及伦理文件元数据。

演示数据从前端 `mockData.ts` 和 `App.tsx` 迁移到后端种子脚本。前端可以保留纯展示内容，例如静态资讯文章，但不再新增业务 Mock。

## API

第一批接口：

```text
GET    /api/v1/profiles
POST   /api/v1/profiles
GET    /api/v1/profiles/{profile_id}
GET    /api/v1/profiles/{profile_id}/sessions
POST   /api/v1/profiles/{profile_id}/sessions
PATCH  /api/v1/sessions/{session_id}
DELETE /api/v1/sessions/{session_id}

GET    /api/v1/attachments
POST   /api/v1/attachments
POST   /api/v1/attachments/{attachment_id}/replace
DELETE /api/v1/attachments/{attachment_id}

POST   /api/v1/files
POST   /api/v1/files/{file_id}/complete
GET    /api/v1/files/{file_id}/download-url
DELETE /api/v1/files/{file_id}
```

所有接口从认证上下文获得 `user_id` 并强制按用户隔离。开发阶段继续使用 `Bearer demo-token`，但数据库中存在真实演示用户记录。

## 文件上传

```text
前端选择本地文件
-> POST /files 创建文件元数据
-> 后端生成用户隔离 storage_key 和预签名 PUT URL
-> 前端直传 MinIO
-> POST /files/{id}/complete
-> 后端 stat_object 校验对象存在、大小匹配
-> 创建或替换附件关系
```

上传未完成的文件不能创建附件，也不能生成下载 URL。

## 文件下载

```text
前端传 file_id
-> 后端校验登录用户和文件归属
-> 后端生成短期预签名 GET URL
-> 前端下载或打开原始文件
```

前端不根据元数据生成附件替代文件。

## 删除与替换

- 删除单次记录由后端事务处理其附件关系；真实文件删除通过文件服务执行。
- 覆盖型附件采用先上传新文件、再切换引用、最后删除旧对象。
- 文件对象删除失败时，数据库不能伪装为已彻底销毁。
- 第一批实现同步删除；后续生命周期 Worker 复用相同文件服务。

## 前端改造

新增：

```text
apps/mobile/src/api/apiClient.ts
apps/mobile/src/api/profileService.ts
apps/mobile/src/api/sessionService.ts
apps/mobile/src/api/fileService.ts
apps/mobile/src/api/attachmentService.ts
```

第一批页面从 API 加载：

- 档案库。
- 档案详情。
- 单次记录卡。
- 量表、作业、其他附件列表。
- 文件上传和原文件下载。

前端不得计算最终 `sequence_no`、执行可信级联删除、决定长期保存状态或伪造上传成功。

## 错误与状态

- API 错误统一映射为 `{ code, message, details }`。
- 前端显示加载、空状态、失败重试和提交中状态。
- 创建、更新和删除成功后重新获取服务端数据，避免仅修改本地数组造成状态漂移。
- 上传失败保留重试入口；替换失败保留旧附件。
- PostgreSQL 或 MinIO 不可用时，后端返回明确错误，不回退到内存业务数据。

## 测试

后端：

- 数据库模型和 Alembic 迁移测试。
- 种子脚本幂等测试。
- 用户隔离测试。
- 固定次数编号和时间排序测试。
- 会话删除与附件关系测试。
- MinIO 存储适配器单元测试和本地集成测试。
- 上传完成前不可下载、跨用户不可下载、删除后不可下载测试。

前端：

- API 响应映射测试。
- 加载、错误和空状态测试。
- 创建、编辑、删除后重新获取数据测试。
- 上传流程状态测试。
- 现有交互回归测试。

联调：

- Compose 一键启动。
- 迁移和种子脚本成功。
- 前端读取后端档案与单次记录。
- 上传真实文件到 MinIO，并通过前端下载原始字节。

## 实施顺序

1. Docker Compose、环境配置和健康检查。
2. SQLAlchemy、Alembic、数据库模型和种子数据。
3. 档案与单次记录 API。
4. MinIO 文件与附件 API。
5. 前端 API Client 和领域服务。
6. 替换档案、单次记录和附件 Mock。
7. 浏览器联调、自动化测试和交接记录。
