# 上生产流程（咨询师助手 MVP）

> 适用范围：当前仓库的 `backend/`（FastAPI + PostgreSQL + 私有 MinIO）与 `apps/mobile/`（Expo iOS / Android / Web）。
> 目标：把 MVP 从本机开发态推进到可对外服务的生产态。
> 文档基于仓库现状编写，凡涉及改代码的位置都标注了文件路径。
>
> 📌 **改完代码怎么上服务器（可照抄的命令）**：见仓库根 `README.md` 的「生产部署」章节。本文件侧重上线前清单、架构与配置约定；README 的「生产部署」是实际操作手册，二者以 README 为准。当前生产服务器 `47.96.89.215` 已落地：backend 走镜像构建、web 走 nginx 卷挂载、nginx 已代理 `/api` → backend。

---

## 0. 生产架构（推荐拓扑）

```
                        ┌─────────────────────────────┐
   手机 App / Web ────▶ │  反向代理 (Nginx/Caddy)     │  TLS 终止 + 域名
                        │  - /api/*  → 后端          │
                        │  - /       → Web 静态 (可选) │
                        └──────────────┬──────────────┘
                                       │ https://api.yourdomain.com
                        ┌──────────────┴──────────────┐
                        │  FastAPI (gunicorn+uvicorn) │  多 worker
                        │  - Alembic 迁移            │
                        │  - 百炼 ASR/纪要           │
                        └───┬───────────────┬────────┘
                            │               │
                    ┌───────┴────┐   ┌────┴────────┐
                    │ PostgreSQL  │   │  MinIO (私有桶)│
                    │ (托管/自建) │   │  prod: 公网可达│
                    └─────────────┘   └──────────────┘
```

最小可用生产要素：**HTTPS 域名 + 反向代理 + 后端多进程 + 托管/自建数据库 + 私有 MinIO（生产用 `minio_url` 模式需公网可达）+ EAS 生产构建**。

---

## 1. 上线前必改清单（阻塞项）

| # | 项 | 现状 | 生产必须 |
|---|---|---|---|
| 1 | **CORS 白名单** | ✅ 已改为读取 `CORS_ALLOW_ORIGINS`（逗号分隔，`backend/app/core/config.py` 定义、`main.py` 拆分）；默认保留开发域名 | 部署时设置 `CORS_ALLOW_ORIGINS=https://web.yourdomain.com`，加入生产 Web 域名；原生 App 不走 CORS，仅 Web 受影响 |
| 2 | **JWT 密钥** | `config.py` 默认 `psy-auto-ast-local-development-secret-change-me` | 设强随机 `JWT_SECRET_KEY`（≥32 字节）；用 `openssl rand -hex 32` 生成 |
| 3 | **生产进程服务器** | ✅ `requirements.txt` 已加入 `gunicorn==23.0.0` | 用 `gunicorn -k uvicorn.workers.UvicornWorker -w <n>` 起多 worker（Dockerfile 已配置 `-w 4`） |
| 4 | **后端容器化** | ✅ 已新增 `backend/Dockerfile` 与 `backend/.dockerignore` | 接入 compose / k8s / 云容器；生产 `DATABASE_URL`/`MINIO_ENDPOINT` 用服务名或公网地址 |
| 5 | **MinIO 公网可达 + TLS** | 开发用 `base64` 模式 + `minio_secure=false` | 生产 `RECORDING_AUDIO_INPUT_MODE=minio_url` 需要 MinIO 能被阿里云 `fun-asr` 拉取，故 MinIO 须有公网 HTTPS 域名、`minio_secure=true` |
| 6 | **密钥管理** | 开发把 `BAILIAN_API_KEY` 写进 `backend/.env` | 生产用密钥管理服务 / 环境变量注入，禁止写进镜像层 |
| 7 | **清理开发库** | 开发库含审计产生的测试档案/录音/演示账号 | 上线前重置或用干净库；演示账号 `admin@163.com / 123456` 必须改密或移除 |

> 第 1、3、4 项需要改代码/加文件；其余为配置与运维动作。

---

## 2. 后端生产准备

### 2.1 改 CORS（必做）
编辑 `backend/app/main.py`，把 `allow_origins=[...]` 改为从设置读取：

```python
from pydantic import field_validator
# 在 Settings 增加：
cors_allow_origins: list[str] = ["http://localhost:8081"]

# main.py 中：
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

对应 `.env`：`CORS_ALLOW_ORIGINS=https://web.yourdomain.com,https://yourdomain.com`

### 2.2 加 gunicorn（必做）
编辑 `backend/requirements.txt`，增加一行：

```
gunicorn==23.0.0
```

### 2.3 后端 Dockerfile（推荐，复制即用）
新建 `backend/Dockerfile`：

```dockerfile
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# 健康检查走后端 /health（代码中已实现组件健康与 503）
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').status==200 else 1)"

EXPOSE 8000
CMD ["gunicorn", "app.main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "4", "-b", "0.0.0.0:8000", \
     "--timeout", "120"]
```

### 2.4 生产环境变量（backend/.env）
基于 `.env.example`，关键覆盖：

```bash
# 数据库（建议用托管 PostgreSQL 的连接串）
DATABASE_URL=postgresql+psycopg://<user>:<pass>@<db-host>:5432/psy_auto_ast

# 认证
JWT_SECRET_KEY=<openssl rand -hex 32 生成的强密钥>
ACCESS_TOKEN_MINUTES=30
REFRESH_TOKEN_DAYS=30
PROFILE_ACCESS_GRANT_MINUTES=60

# MinIO（生产：公网域名 + TLS）
MINIO_ENDPOINT=minio.yourdomain.com:443
MINIO_ROOT_USER=<强账号>
MINIO_ROOT_PASSWORD=<强密码>
MINIO_BUCKET=psy-auto-ast
MINIO_SECURE=true

# 百炼（生产用 URL 模式，长录音异步）
RECORDING_AI_PROVIDER=bailian
RECORDING_AUDIO_INPUT_MODE=minio_url
BAILIAN_API_KEY=<从密钥管理注入>
BAILIAN_ASR_MODEL=fun-asr
BAILIAN_LOCAL_ASR_MODEL=qwen3-asr-flash
BAILIAN_SUMMARY_MODEL=qwen-plus
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com
BAILIAN_TIMEOUT_SECONDS=120
BAILIAN_POLL_INTERVAL_SECONDS=1
BAILIAN_MAX_POLL_ATTEMPTS=120

# CORS（仅 Web 端需要；本服务器 Web 走 nginx 同源代理，实际不需要放通）
CORS_ALLOW_ORIGINS=https://web.yourdomain.com

# 报告生成（Q6 修复）：bailian=真实百炼模型；deterministic=结构化草稿（默认，免额度）
REPORT_AI_PROVIDER=bailian
BAILIAN_REPORT_MODEL=qwen-plus
```

> 注意大小写：`config.py` 字段为 `database_url` / `jwt_secret_key` / `minio_secure`，但 pydantic-settings 大小写不敏感，`DATABASE_URL` / `JWT_SECRET_KEY` / `MINIO_SECURE` 均可正确映射。

### 2.5 数据库迁移与启动
```bash
# 进入后端容器/目录后：
alembic upgrade head            # 应用所有迁移
# 仅在需要演示/初始管理员时执行，生产慎用：
# python -m app.seed
gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000
```

### 2.6 反向代理 + TLS（Nginx 示例）
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    ssl_certificate     /etc/ssl/api/fullchain.pem;
    ssl_certificate_key /etc/ssl/api/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;   # 录音上传
    }
}
```
健康检查：`GET /api/v1/health` 应返回 200；MinIO 不可用时返回 503（代码中已实现）。

---

## 3. 移动端 / Web 上生产

### 3.1 构建前设定 API 地址（必做）
`apps/mobile/src/api/apiConfig.ts` 在构建时读取 `EXPO_PUBLIC_API_BASE_URL`，且会被打包进产物。生产构建必须指向 HTTPS 域名：

```bash
cd apps/mobile
export EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v1
```

> 当前服务器 `47.96.89.215` 用 nginx 把 `/api/` 反代到 backend，Web 端与 API **同源**，所以 Web 构建直接填：
> `EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1`（无需 HTTPS 域名、不触发 CORS）。移动端原生 App 同样填这个地址即可连上后端。

### 3.2 EAS 生产构建
`apps/mobile/eas.json` 已有 `production` / `preview` profile：

```bash
# 登录 EAS（首次）
npx eas login

# 双端生产构建（自动版本号自增）
npx eas build --profile production --platform all

# 仅出 Android / iOS
npx eas build --profile production --platform android
npx eas build --profile production --platform ios
```

> 生产签名依赖你自己的 **Apple Developer** 与 **Google Play** 账号/证书；EAS 会引导 `eas credentials` 配置。

### 3.3 提交应用商店
```bash
npx eas submit --profile production
```
- iOS → App Store Connect
- Android → Google Play（需先建应用与合规信息）

### 3.4 Web（可选）
```bash
cd apps/mobile
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v1 \
  npx expo export --platform web --output-dir dist
# 把 dist/ 部署到静态托管 / 反向代理的 / 路径
```
> Web 端才受 CORS 限制，务必保证 §2.1 的 `CORS_ALLOW_ORIGINS` 包含 Web 域名。
> **本服务器特例**：nginx 已 `location /api/ { proxy_pass http://backend:8000; }`，Web 用同源 `http://47.96.89.215/api/v1` 时浏览器不发跨域请求，故不需要在 `CORS_ALLOW_ORIGINS` 加 Web 域名。仅当 Web 改用独立域名（如 `https://web.yourdomain.com`）时才需放通 CORS 并重建 backend。

---

## 4. 上线前数据与密钥处理

1. **重置开发库**：`docker compose down -v` 清掉 Postgres/MinIO 卷，或用干净托管库后跑 `alembic upgrade head`。
2. **改/删演示账号**：`admin@163.com / 123456`、`user@163.com / 123456` 必须改强密码，或移除。
3. **百炼 Key 不入库**：通过环境变量/密钥管理注入，镜像层与 Git 均不含明文（`.env` 已被 gitignore）。
4. **MinIO 桶策略**：生产桶保持私有（`mc anonymous set none`），仅通过后端短期预签名 URL 暴露。

---

## 5. 上线后运维

| 项 | 做法 |
|---|---|
| 监控 | 定时探活 `GET /health`；反向代理与容器编排（k8s/Docker Swarm/systemd）做重启 |
| 数据库备份 | 每日 `pg_dump` 到对象存储；托管库开启自动快照 |
| 文件备份 | `mc mirror` 把 MinIO 桶同步到异地/另一桶 |
| 日志 | 后端 stdout + 反向代理访问日志，集中到日志服务 |
| 回滚 | 后端镜像打 tag（如 `psy-api:v1.2.3`），出问题切回旧 tag；DB 迁移遵循"可向前"原则，重大变更先做备份 |
| 长录音 | 当前录音处理在请求内完成；生产长录音建议后续迁移到独立 Worker（见 §6） |

---

## 6. 已知风险与待办

| 风险 | 说明 | 建议 |
|---|---|---|
| CORS 硬编码 | 已改为读取 `CORS_ALLOW_ORIGINS` 环境变量（§2.1 已落地） | ✅ 已解决；本服务器 Web 走 nginx 同源代理，生产无需额外放通 |
| 无多 worker | 已用 `gunicorn -w 2`（compose `command`）/ `-w 4`（Dockerfile `CMD`） | ✅ 已解决 |
| 后端无容器 | 已有 `backend/Dockerfile` + compose `backend` 服务（镜像构建自 `./backend`） | ✅ 已解决 |
| MinIO 公网 | 当前服务器用 `RECORDING_AUDIO_INPUT_MODE=base64`（后端读 MinIO 字节转 base64 送 ASR），MinIO 只需后端容器可达，不强制公网 HTTPS；仅切 `minio_url`（长录音异步 fun-asr）才需公网 HTTPS + `minio_secure=true` | 现状可用；长录音异步化时再配公网 HTTPS |
| 长录音阻塞请求 | 请求内完成 ASR/纪要 | 后续抽独立 Worker + 队列 |
| Android 仅模拟器验证 | 此前未打 APK（Google Maven TLS 失败） | EAS 云端构建规避本机 Gradle 问题 |
| 演示账号弱密码 | 开发默认 `123456` | 上线前改/删 |

---

## 7. 一键上线检查清单

- [ ] 后端 `main.py` CORS 改为读取环境变量并包含生产域名
- [ ] `requirements.txt` 增加 `gunicorn`
- [ ] 构建后端镜像并加 compose 服务（或 systemd）
- [ ] 生产 `.env`：`JWT_SECRET_KEY` 强随机、`DATABASE_URL` 指向托管库、`MINIO_SECURE=true`、`RECORDING_AUDIO_INPUT_MODE=minio_url`
- [ ] `alembic upgrade head` 成功，容器 `/health` 返回 200
- [ ] 反向代理配置 TLS，转发 `/api/` 到后端
- [ ] 移动端构建前设 `EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v1`
- [ ] `eas build --profile production --platform all` 成功
- [ ] 应用商店签名/提交就绪（Apple/Google 证书）
- [ ] 开发库已重置，演示账号已改/删
- [ ] 数据库 + MinIO 备份策略就位
- [ ] Web 端（如发布）CORS 域名已放通
