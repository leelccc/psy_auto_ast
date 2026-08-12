"""微信开放平台 OAuth：换取 access_token、拉取用户信息、按 openid 建号或绑定现有账号。

Web 扫码登录（snsapi_login）与原生 SDK 登录共用本服务，区别仅在 AppID/Secret：
- Web 用「网站应用」的 AppID/Secret（wechat_web_app_*）。
- 原生用「移动应用」的 AppID/Secret（wechat_mobile_app_*），由客户端 SDK 拿到 code 后 POST 给后端。
"""
from typing import Literal
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.core.config import Settings
from app.models import ExternalAccount, User
from app.services.auth import utc_now

WECHAT_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token"
WECHAT_USERINFO_URL = "https://api.weixin.qq.com/sns/userinfo"

AppType = Literal["web", "mobile"]


def _credentials(app_type: AppType, settings: Settings) -> tuple[str, str]:
    if app_type == "web":
        return settings.wechat_web_app_id, settings.wechat_web_app_secret
    return settings.wechat_mobile_app_id, settings.wechat_mobile_app_secret


def _ensure_configured(app_id: str, app_secret: str) -> None:
    if not app_id or not app_secret:
        raise ApiError(
            503,
            "wechat_not_configured",
            "微信登录未配置 AppID/Secret，请在 backend/.env 填写并重启后端。",
        )


def exchange_code(code: str, app_type: AppType, settings: Settings) -> dict:
    """用授权 code 换 access_token + openid（+ unionid 若有）。"""
    app_id, app_secret = _credentials(app_type, settings)
    _ensure_configured(app_id, app_secret)
    try:
        response = httpx.get(
            WECHAT_TOKEN_URL,
            params={
                "appid": app_id,
                "secret": app_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=settings.bailian_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise ApiError(502, "wechat_unreachable", "无法连接微信服务，请稍后重试。") from exc
    data = response.json()
    if data.get("errcode"):
        raise ApiError(
            401,
            "wechat_code_invalid",
            f"微信授权失败：{data.get('errmsg') or 'code 无效或已过期'}。",
        )
    if not data.get("openid") or not data.get("access_token"):
        raise ApiError(401, "wechat_code_invalid", "微信授权失败，未返回 openid。")
    return data


def fetch_userinfo(access_token: str, openid: str, settings: Settings) -> dict:
    """拉取用户资料（snsapi_login / snsapi_userinfo 可用）。失败则仅返回 openid。"""
    try:
        response = httpx.get(
            WECHAT_USERINFO_URL,
            params={"access_token": access_token, "openid": openid},
            timeout=settings.bailian_timeout_seconds,
        )
    except httpx.HTTPError:
        return {"openid": openid, "nickname": None, "headimgurl": None, "unionid": None}
    data = response.json()
    if data.get("errcode") or not data.get("openid"):
        return {"openid": openid, "nickname": None, "headimgurl": None, "unionid": None}
    return data


def upsert_wechat_user(
    database: Session,
    token_data: dict,
    userinfo: dict,
) -> str:
    """按 openid 查找外部账号；没有则创建占位邮箱用户 + 绑定。返回 user_id。"""
    openid = token_data["openid"]
    unionid = token_data.get("unionid") or userinfo.get("unionid")
    nickname = (userinfo.get("nickname") or "微信用户")
    nickname = nickname.strip()[:80] or "微信用户"
    avatar_url = userinfo.get("headimgurl") or userinfo.get("avatar") or None

    existing = database.scalar(
        select(ExternalAccount).where(
            ExternalAccount.provider == "wechat",
            ExternalAccount.provider_user_id == openid,
        )
    )
    if existing is not None:
        existing.nickname = nickname
        existing.avatar_url = avatar_url
        if unionid:
            existing.unionid = unionid
        existing.updated_at = utc_now()
        database.flush()
        return existing.user_id

    now = utc_now()
    user = User(
        id=str(uuid4()),
        # 微信用户无邮箱，用占位邮箱满足唯一约束（不用于登录）。
        email=f"wx_{openid}@wechat.local",
        display_name=nickname,
        password_hash=None,
        role="user",
        status="active",
        plan_code="free",
        entitlements_json={},
        usage_json={},
        created_at=now,
        updated_at=now,
    )
    database.add(user)
    database.flush()
    database.add(
        ExternalAccount(
            id=str(uuid4()),
            user_id=user.id,
            provider="wechat",
            provider_user_id=openid,
            unionid=unionid,
            nickname=nickname,
            avatar_url=avatar_url,
            created_at=now,
            updated_at=now,
        )
    )
    database.flush()
    return user.id
