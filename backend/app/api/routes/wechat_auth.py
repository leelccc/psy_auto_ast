"""微信登录路由。

- GET /auth/wechat/web/authorize：Web 端入口，浏览器跳转到微信扫码页。
- GET /auth/wechat/web/callback：微信回调后端，换 token、建号/绑定、签发 JWT，再跳回前端（token 放 URL fragment）。
- POST /auth/wechat/mobile：原生 SDK 拿到 code 后由 App 提交，后端换 token 并返回 JWT+用户。
"""
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.api.routes.auth import serialize_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import User
from app.services.auth import issue_token_pair
from app.services.wechat_oauth import (
    exchange_code,
    fetch_userinfo,
    upsert_wechat_user,
)

router = APIRouter(prefix="/api/v1", tags=["auth"])

STATE_COOKIE = "wechat_oauth_state"
RETURN_COOKIE = "wechat_return_to"


@router.get("/auth/wechat/web/authorize")
def wechat_web_authorize(
    request: Request,
    redirect: Annotated[str | None, Query(description="登录完成后前端要回到的路径")] = None,
) -> RedirectResponse:
    settings = get_settings()
    if not settings.wechat_web_app_id or not settings.wechat_web_app_secret:
        raise ApiError(503, "wechat_not_configured", "微信网页登录未配置 AppID/Secret。")
    if not settings.wechat_web_redirect_uri:
        raise ApiError(503, "wechat_not_configured", "未配置微信回调地址 wechat_web_redirect_uri。")
    from secrets import token_urlsafe

    state = token_urlsafe(16)
    params = urlencode(
        {
            "appid": settings.wechat_web_app_id,
            "redirect_uri": settings.wechat_web_redirect_uri,
            "response_type": "code",
            "scope": "snsapi_login",
            "state": state,
        }
    )
    # #wechat_redirect 是微信要求的锚点
    response = RedirectResponse(url=f"https://open.weixin.qq.com/connect/qrconnect?{params}#wechat_redirect")
    response.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax")
    if redirect:
        response.set_cookie(RETURN_COOKIE, redirect, max_age=600, httponly=True, samesite="lax")
    return response


@router.get("/auth/wechat/web/callback")
def wechat_web_callback(
    request: Request,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    database: Annotated[Session, Depends(get_db)],
) -> RedirectResponse:
    settings = get_settings()
    saved_state = request.cookies.get(STATE_COOKIE)
    if not saved_state or saved_state != state:
        raise ApiError(400, "wechat_state_mismatch", "登录状态校验失败，请重新发起微信登录。")
    token_data = exchange_code(code, "web", settings)
    userinfo = fetch_userinfo(token_data["access_token"], token_data["openid"], settings)
    user_id = upsert_wechat_user(database, token_data, userinfo)
    pair = issue_token_pair(database, user_id)

    base = settings.wechat_frontend_redirect_uri or "/"
    # 用 fragment 而非 query，避免 token 进入服务器日志。
    fragment = f"access_token={pair['access_token']}&refresh_token={pair['refresh_token']}"
    redirect_to = base.split("#")[0]
    response = RedirectResponse(url=f"{redirect_to}#{fragment}")
    response.delete_cookie(STATE_COOKIE)
    response.delete_cookie(RETURN_COOKIE)
    return response


class WechatMobileRequest(BaseModel):
    code: str = Field(min_length=1, max_length=256)


@router.post("/auth/wechat/mobile")
def wechat_mobile_login(
    payload: WechatMobileRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    settings = get_settings()
    token_data = exchange_code(payload.code, "mobile", settings)
    userinfo = fetch_userinfo(token_data["access_token"], token_data["openid"], settings)
    user_id = upsert_wechat_user(database, token_data, userinfo)
    pair = issue_token_pair(database, user_id)
    user = database.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise ApiError(500, "user_not_found", "登录后未找到用户。")
    return {**pair, "user": serialize_user(user)}


@router.get("/auth/wechat/status")
def wechat_status() -> dict[str, bool]:
    """前端探测微信登录是否已配置（不泄露凭据）。"""
    settings = get_settings()
    return {
        "web": bool(settings.wechat_web_app_id and settings.wechat_web_app_secret and settings.wechat_web_redirect_uri),
        "mobile": bool(settings.wechat_mobile_app_id and settings.wechat_mobile_app_secret),
    }


# 复用 current_user_id 以便未来加「绑定已有账号到微信」接口
__all__ = ["router", "current_user_id"]
