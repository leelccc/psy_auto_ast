# 手机号登录方案（已实现并部署）

> 状态：前后端闭环、数据库迁移和生产部署均已完成。当前因短信资质与密钥尚未配置，发码接口返回友好的服务不可用提示；配置真实短信参数并重启后端后即可启用。
> 关联：邮箱验证码登录（0901 已落地，`services/verification.py` + `email_service.py`）。

## 一、已确认的设计决策
1. **短信服务商**：阿里云短信（与现有百炼/DashScope 同云账号体系）。
2. **验证码登录不存在的手机号**：自动注册（登录即注册，主流 App 做法）。
3. **手机号账号 vs 邮箱账号**：各自独立、互不相通（改动最小，不做绑定合并）。
4. **功能范围**：完整闭环 = 手机号注册 + 验证码登录 + 密码登录 + 重置密码。

## 二、数据模型变更
- `users.email`：`NOT NULL` → **可空 + unique**（历史邮箱账号不受影响）。
- `users.phone`：新增 `String(20)`，**可空 + unique + 索引**（手机号账号 `email` 为 null）。
- 新表 `phone_verification_codes`：
  `id` / `phone` / `purpose`(register|login|reset_password) / `code_hash` / `expires_at` / `consumed_at` / `attempts` / `created_at`。

## 三、新增服务
- `services/sms_service.py`
  - `is_sms_configured()`：检测 AK/SK/签名/模板是否齐备。
  - `send_verification_sms(phone, template_code, code)`：阿里云 Dysmsapi SDK 懒加载。
  - **未配置时**：开发环境回传 `dev_code`（响应里带回验证码联调）；生产环境报 503（不泄露验证码）。
- `services/phone_verification.py`：镜像 `verification.py`，针对 `phone` 做签发/校验并调用短信服务。

## 四、API 端点（统一前缀 `/api/v1/auth/phone/`）
| 方法+路径 | 作用 | 关键校验 |
|---|---|---|
| `POST /verification-code` | 发码，purpose=`register`/`login`/`reset_password` | 格式 `^1[3-9]\d{9}$`（否则 422）；60s 冷却（429）；register 时手机号已存在→409；reset 时未注册→404 |
| `POST /register` | 手机号+验证码+密码+昵称注册 | 验证码校验；手机号唯一 |
| `POST /login` | 手机号+密码登录 | 密码错误 401；账号停用 403 |
| `POST /login-code` | 验证码登录（**不存在自动注册**） | 验证码校验；未知手机号自动建号 |
| `POST /reset-password` | 验证码重置密码 | 校验后改密、旧 token 失效 |

## 五、安全规则（与邮箱体系一致）
- 验证码 10 分钟有效、最多 5 次尝试、库里只存哈希。
- cooldown 按 `purpose` 隔离（register/login/reset 互不影响冷却）。
- 自动注册账号默认 `status=active`，`email=null`，`display_name` 取注册时填入值。

## 六、前端改造（App.tsx + apps/mobile/src/api/authService.ts）
- `AuthScreen` 顶部「邮箱 / 手机号」切换 Tab。
- 手机号下四态：注册、验证码登录、密码登录、重置密码。
- `CurrentUser.email` 改可选 + 加 `phone` 字段。
- 「我的」页 `email` 为 null 时显示手机号；账号安全区按是否有邮箱动态显示登录方式。
- Android 红线：弹层用 RN `<Modal>`，发请求即跳页显示加载态，禁 `URLSearchParams.size`。

## 七、依赖与配置
- `requirements.txt`：新增 `alibabacloud_dysmsapi20170525` + `alibabacloud_tea_openapi`。
- `backend/.env` 与 `.env.example` 新增：`SMS_ACCESS_KEY_ID` / `SMS_ACCESS_KEY_SECRET` / `SMS_SIGN_NAME` / `SMS_TEMPLATE_REGISTER` / `SMS_TEMPLATE_LOGIN` / `SMS_TEMPLATE_RESET_PASSWORD` / `SMS_ENDPOINT`。

## 八、Alembic 迁移
- 新迁移：`users.email` 改可空、`users.phone` 加唯一索引列、新建 `phone_verification_codes` 表。`down_revision` 接当前 head。

## 九、生产前置条件（重要）
真实短信当前无法发送，需 owner 提供：
- 阿里云 `ACCESS_KEY_ID` / `ACCESS_KEY_SECRET`
- 已审核通过的**短信签名** + 三个**模板 ID**（注册/登录/重置，模板审核周期 1~3 天）

在此之前用 `dev_code` 回退联调，**不影响上线后切换真实短信**。

## 十、建议执行顺序（评审通过后再做）
1. 后端：模型 + 迁移 + 两个服务 + config + 5 端点 + 自动化测试（隔离测试间手机号，确认全绿）。
2. 前端：AuthScreen + authService + 「我的」页兼容 + `tsc --noEmit` 通过。
3. 补 `README.md` 更新日志 → `git add -A` + commit(中文) + push（绕本机代理）。
4. **不自动部署/打包**，等 owner 确认后再上线。

## 十一、风险与待确认
- 短信模板审核有 1~3 天周期，需尽早提交，否则阻塞真实发码验证。
-「手机号账号」与「邮箱账号」严格独立：同一人若想两类登录互通，需后续做绑定功能（本期不做）。
- 自动注册可能产生「只有手机号、无邮箱」的账号，下游依赖 `email` 非空的逻辑需排查兼容（如通知/找回）。
