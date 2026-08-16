from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from core.database import get_db
from core.security import get_password_hash
from core.deps import get_current_user, require_superadmin, require_admin_or_superadmin, get_client_ip
from models.user import User, UserRole
from models.audit_log import AuditAction, ResourceType
from schemas.user import UserCreate, UserRead, UserUpdate, UserList
from services.audit_service import log_action

router = APIRouter()


@router.get("/search", summary="Search users for dropdown (authenticated)")
async def search_users(
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _actor: User = Depends(get_current_user),
):
    stmt = select(User.email, User.username).where(User.is_active == True)
    if q:
        stmt = stmt.where((User.email.ilike(f"%{q}%")) | (User.username.ilike(f"%{q}%")))
    
    result = await db.execute(stmt.order_by(User.username).limit(50))
    users = result.all()
    return [{"email": u.email, "username": u.username} for u in users]


@router.get("", response_model=UserList, summary="List all users (admin/superadmin)")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _actor: User = Depends(require_admin_or_superadmin),
):
    q = select(User)
    if role:
        q = q.where(User.role == role)
    if is_active is not None:
        q = q.where(User.is_active == is_active)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    result = await db.execute(q.order_by(User.created_at.desc()).offset(skip).limit(limit))
    users = result.scalars().all()

    return UserList(total=total, items=[UserRead.model_validate(u) for u in users])


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED, summary="Create user (admin/superadmin)")
async def create_user(
    payload: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin_or_superadmin),
):
    if payload.role == UserRole.superadmin and actor.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Admins cannot create superadmins")

    # Check uniqueness
    dup = await db.execute(
        select(User).where(
            (User.email == payload.email) | (User.username == payload.username)
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email or username already exists")

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()  # get the generated ID before commit

    await log_action(
        db,
        actor_id=actor.id,
        action=AuditAction.create,
        resource_type=ResourceType.user,
        resource_id=user.id,
        detail={"email": user.email, "username": user.username, "role": user.role.value},
        ip_address=get_client_ip(request),
    )

    return UserRead.model_validate(user)


@router.get("/{user_id}", response_model=UserRead, summary="Get a single user (admin/superadmin)")
async def get_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _actor: User = Depends(require_admin_or_superadmin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead, summary="Update user (admin/superadmin)")
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin_or_superadmin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == UserRole.superadmin and actor.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Admins cannot modify superadmins")
    if payload.role is not None and payload.role == UserRole.superadmin and actor.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Admins cannot promote to superadmin")

    changes: dict = {}
    if payload.email is not None and payload.email != user.email:
        changes["email"] = {"from": user.email, "to": payload.email}
        user.email = payload.email
    if payload.username is not None and payload.username != user.username:
        changes["username"] = {"from": user.username, "to": payload.username}
        user.username = payload.username
    if payload.role is not None and payload.role != user.role:
        changes["role"] = {"from": user.role.value, "to": payload.role.value}
        user.role = payload.role
    if payload.password is not None:
        user.hashed_password = get_password_hash(payload.password)
        changes["password"] = "changed"
    if payload.is_active is not None and payload.is_active != user.is_active:
        action = AuditAction.reactivate_user if payload.is_active else AuditAction.deactivate_user
        changes["is_active"] = {"from": user.is_active, "to": payload.is_active}
        user.is_active = payload.is_active
    else:
        action = AuditAction.update
    if payload.requires_password_change is not None:
        user.requires_password_change = payload.requires_password_change

    await log_action(
        db,
        actor_id=actor.id,
        action=action,
        resource_type=ResourceType.user,
        resource_id=user.id,
        detail={"changes": changes},
        ip_address=get_client_ip(request),
    )

    return UserRead.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deactivate user (admin/superadmin)")
async def deactivate_user(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin_or_superadmin),
):
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == UserRole.superadmin and actor.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Admins cannot deactivate superadmins")

    user.is_active = False

    await log_action(
        db,
        actor_id=actor.id,
        action=AuditAction.deactivate_user,
        resource_type=ResourceType.user,
        resource_id=user.id,
        detail={"username": user.username, "email": user.email},
        ip_address=get_client_ip(request),
    )
