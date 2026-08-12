# 微信登录接入说明

后端已实现微信开放平台 OAuth（Web 扫码 + 原生 SDK 共用），前端 Web 已打通，原生侧已留好调用入口与文档。要让它真正跑通，只需在微信开放平台注册应用并把 AppID/Secret 填进 `backend/.env`。

## 一、后端接口（已实现）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/auth/wechat/web/authorize` | Web 入口：浏览器跳转到微信扫码页，state 存 httponly cookie 防 CSRF |
| GET | `/api/v1/auth/wechat/web/callback` | 微信回调后端：换 token、建号/绑定、签发 JWT，再跳回前端（token 放 URL fragment） |
| POST | `/api/v1/auth/wechat/mobile` | 原生 SDK 拿到 code 后由 App 提交，返回 JWT + user |
| GET | `/api/v1/auth/wechat/status` | 探测微信登录是否已配置（不泄露凭据） |

- 首次微信登录会自动创建用户（占位邮箱 `wx_{openid}@wechat.local`，无密码），并写入 `external_accounts` 表绑定 openid。
- 复用现有 JWT 体系（`issue_token_pair`），前端拿到 token 后流程与邮箱登录一致。

## 二、配置（backend/.env）

在微信开放平台注册后，把以下字段填入 `backend/.env`（或 `.env.example` 复制后改）：

```bash
# Web 扫码登录（网站应用）
WECHAT_WEB_APP_ID=wx你的网站AppID
WECHAT_WEB_APP_SECRET=你的网站AppSecret
WECHAT_WEB_REDIRECT_URI=http://127.0.0.1:8000/api/v1/auth/wechat/web/callback
WECHAT_FRONTEND_REDIRECT_URI=http://localhost:19000

# 原生 SDK 登录（移动应用）
WECHAT_MOBILE_APP_ID=wx你的移动AppID
WECHAT_MOBILE_APP_SECRET=你的移动AppSecret
```

> Web 与原生用的是**两个不同的应用**（网站应用 vs 移动应用），AppID/Secret 各自独立。

填完**重启后端**生效（uvicorn 若带 `--reload` 会自动重载）。未配置时接口返回 `503 wechat_not_configured`，不影响其它功能。

## 三、微信开放平台注册

1. 登录 https://open.weixin.qq.com → 管理中心。
2. **网站应用**：创建网站应用 → 审核 → 拿到 AppID/AppSecret → 「授权回调域」填你的后端域名（本地开发填 `127.0.0.1`，生产填正式域名）。
3. **移动应用**：创建移动应用 → 填 iOS Bundle ID / Android 包名 → 拿到 AppID/AppSecret；iOS 需配置 Universal Links。
4. （可选）若要 Web 与原生共享同一用户身份，把两个应用挂到同一开放平台主体下以拿到相同的 `unionid`。

## 四、Web 端测试

1. 启动后端（填好 WECHAT_* 后）+ `npx expo start --web --port 19000`。
2. 浏览器打开登录页 → 点「微信登录」→ 跳转微信扫码。
3. 扫码确认后微信回调后端 → 后端跳回 `http://localhost:19000#access_token=...&refresh_token=...`。
4. 前端自动读取 URL fragment 完成登录（`App.tsx` 会话恢复逻辑已处理），随后进入主界面。

> token 放在 URL fragment（`#`）而非 query，不会进入服务器访问日志。

## 五、原生端（iOS / Android）接入

原生登录需要 WeChat SDK，属于原生模块，**必须 `expo prebuild` 生成原生工程后才能用**（Expo Go 不支持）。推荐方案：

- 安装社区库 `react-native-wechat-lib`（或自建 Expo Module 封装微信 SDK）。
- iOS 配置 Universal Links、URL Scheme `wx<AppID>`；Android 配置 `<application>` 的 `wxapi`。
- 调用 SDK 拿到 `code` 后，调用前端已就绪的方法：

```ts
import { createAuthService } from "./src/api/authService";
// authService 已由 App 注入 apiClient
const { user } = await authService.loginWithWechatMobile(code);
// 之后走与邮箱登录相同的已登录流程
```

- 登录按钮当前在原生端点击会提示「需先接入微信 SDK」，SDK 接好后替换 `App.tsx` 中 `AuthScreen` 的 `handleWechat` 原生分支即可。

## 六、安全要点

- `state` 参数 + httponly cookie 防 CSRF。
- AppSecret 只在后端使用，绝不下发到前端。
- 用 `external_accounts` 表解耦身份，未来可扩展其它第三方登录（provider 字段）。
