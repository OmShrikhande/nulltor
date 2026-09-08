from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from core.database import get_db
from core.security import (
    verify_password, create_access_token, create_refresh_token,
    decode_refresh_token, get_password_hash
)
from core.deps import get_current_user, get_client_ip
from models.user import User
from models.audit_log import AuditAction, ResourceType
from schemas.user import LoginRequest, TokenResponse, UserRead, PasswordChangeRequest
from services.audit_service import log_action

from typing import Optional
from core.config import settings

router = APIRouter()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str, request: Optional[Request] = None):
    is_secure = False
    if request:
        proto = request.headers.get("x-forwarded-proto", "").lower()
        is_secure = (request.url.scheme == "https") or (proto == "https")
    if getattr(settings, "ENVIRONMENT", "development") == "production":
        is_secure = True

    response.set_cookie(
        key="nulltor_access_token",
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=30 * 60,  # 30 minutes
        path="/",
    )
    response.set_cookie(
        key="nulltor_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=7 * 24 * 3600,  # 7 days
        path="/",
    )


def _clear_auth_cookies(response: Response):
    response.delete_cookie(key="nulltor_access_token", path="/")
    response.delete_cookie(key="nulltor_refresh_token", path="/")


@router.post("/login", response_model=TokenResponse, summary="Authenticate and get JWT")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            or_(User.email == payload.email, User.username == payload.email)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        user.is_active = True
        await db.flush()

    token = create_access_token(
        subject=str(user.id),
        extra_claims={"role": user.role.value, "username": user.username},
    )
    refresh = create_refresh_token(
        subject=str(user.id),
        extra_claims={"role": user.role.value, "username": user.username},
    )

    _set_auth_cookies(response, token, refresh, request=request)

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.login,
        resource_type=ResourceType.session,
        resource_id=user.id,
        detail={"email": user.email},
        ip_address=get_client_ip(request),
    )

    return TokenResponse(
        access_token=token,
        refresh_token=refresh,
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=UserRead, summary="Get current authenticated user")
async def get_me(current_user: User = Depends(get_current_user)):
    return UserRead.model_validate(current_user)


@router.post("/refresh", response_model=TokenResponse, summary="Silently renew access token with token rotation")
async def refresh_access_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a valid refresh token (from cookie or Authorization header) for a new access + refresh token pair."""
    # 1. Try reading from HttpOnly cookie first
    refresh_tok = request.cookies.get("nulltor_refresh_token")

    # 2. Fallback to Authorization header if cookie not present
    if not refresh_tok:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            refresh_tok = auth_header.removeprefix("Bearer ").strip()

    if not refresh_tok:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    payload = decode_refresh_token(refresh_tok)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    from uuid import UUID
    user_id = payload.get("sub")
    user = (await db.execute(select(User).where(User.id == UUID(user_id)))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    extra = {"role": user.role.value, "username": user.username}
    new_access = create_access_token(subject=str(user.id), extra_claims=extra)
    new_refresh = create_refresh_token(subject=str(user.id), extra_claims=extra)

    _set_auth_cookies(response, new_access, new_refresh, request=request)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        user=UserRead.model_validate(user),
    )


@router.post("/logout", summary="Logout and clear authentication cookies")
async def logout(response: Response):
    _clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.post("/change-password", summary="Change user password")
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    if not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    user.hashed_password = get_password_hash(payload.new_password)
    user.requires_password_change = False
    await db.flush()
    
    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.update,
        resource_type=ResourceType.user,
        resource_id=user.id,
        detail={"field": "password"},
        ip_address=get_client_ip(request),
    )
    return {"message": "Password updated successfully"}
