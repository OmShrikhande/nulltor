"""
Nulltor FastAPI Application
===========================
Run:  uvicorn main:app --reload --port 8000
API:  http://localhost:8000/api
Docs: http://localhost:8000/docs
"""
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from core.config import settings
from core.database import engine, AsyncSessionLocal, Base
from core.security import get_password_hash

# ── Import all models so Base.metadata knows about every table ────────────────
from models import User, Project, Membership, Directory, AuditLog, Branch, BranchMember, MergeRequest  # noqa: F401
from models.user import UserRole
from models.audit_log import AuditAction, ResourceType

# ── Routers ───────────────────────────────────────────────────────────────────
from routers import (
    auth_router,
    users_router,
    projects_router,
    directories_router,
    memberships_router,
    logs_router,
    branches_router,
    merges_router,
)
from services.audit_service import log_action

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nulltor")


async def _seed_superadmin(session):
    """Create the default superadmin account if none exists."""
    result = await session.execute(
        select(User).where(User.role == UserRole.superadmin)
    )
    if result.scalar_one_or_none():
        return  # Already seeded

    superadmin = User(
        email=settings.SUPERADMIN_EMAIL,
        username=settings.SUPERADMIN_USERNAME,
        hashed_password=get_password_hash(settings.SUPERADMIN_PASSWORD),
        role=UserRole.superadmin,
        is_active=True,
    )
    session.add(superadmin)
    await session.flush()

    # Log the seed action (actor = system = None)
    await log_action(
        session,
        actor_id=None,
        action=AuditAction.create,
        resource_type=ResourceType.user,
        resource_id=superadmin.id,
        detail={
            "seeded": True,
            "email": superadmin.email,
            "username": superadmin.username,
        },
    )

    await session.commit()
    logger.info(
        f"✅ Superadmin seeded — email: {settings.SUPERADMIN_EMAIL}  "
        f"password: {settings.SUPERADMIN_PASSWORD}"
    )
    logger.warning(
        "⚠️  Change the default superadmin password immediately!"
    )


async def _ensure_snapshot_dir():
    """Create the snapshot storage directory if it doesn't exist."""
    snapshot_dir = os.path.join(os.path.dirname(__file__), settings.SNAPSHOT_DIR)
    os.makedirs(snapshot_dir, exist_ok=True)
    logger.info(f"Snapshot directory: {snapshot_dir}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    logger.info("Starting Nulltor API…")

    # Ensure snapshot storage directory exists
    await _ensure_snapshot_dir()

    # Create all tables (idempotent — safe to run every startup)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified ✅")

    # Seed superadmin
    async with AsyncSessionLocal() as session:
        await _seed_superadmin(session)

    logger.info(
        f"Nulltor API ready → http://0.0.0.0:8000  "
        f"| Docs: http://localhost:8000/docs"
    )

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await engine.dispose()
    logger.info("Nulltor API stopped.")


# ── Application ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Nulltor API",
    description="GitHub × VSCode collaborative platform — auth, projects, directories, members, and audit logs.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — allow the Node.js frontend server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Route registration ─────────────────────────────────────────────────────────

app.include_router(auth_router,        prefix="/api/auth",                   tags=["Auth"])
app.include_router(users_router,       prefix="/api/users",                  tags=["Users"])
app.include_router(projects_router,    prefix="/api/projects",               tags=["Projects"])
app.include_router(directories_router, prefix="/api/projects",               tags=["Directories"])
app.include_router(memberships_router, prefix="/api/projects",               tags=["Members"])
app.include_router(branches_router,    prefix="/api/projects",               tags=["Branches"])
app.include_router(merges_router,      prefix="/api/projects",               tags=["Merges"])
app.include_router(logs_router,        prefix="/api/logs",                   tags=["Audit Logs"])


@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0", "app": settings.APP_NAME}
