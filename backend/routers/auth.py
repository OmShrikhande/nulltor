from fastapi import APIRouter, Depends, HTTPException, status, Request
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

router = APIRouter()


@router.post("/login", response_model=TokenResponse, summary="Authenticate and get JWT")
async def login(
    payload: LoginRequest,
    request: Request,
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


@router.post("/refresh", response_model=TokenResponse, summary="Silently renew access token")
async def refresh_access_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a valid refresh token for a new access + refresh token pair."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing refresh token")

    refresh_tok = auth_header.removeprefix("Bearer ").strip()
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

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        user=UserRead.model_validate(user),
    )


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
