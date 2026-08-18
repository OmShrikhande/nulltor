from typing import Optional, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from core.database import get_db
from core.deps import get_current_user, get_client_ip
from models.user import User, UserRole
from models.project import Project
from models.directory import Directory, NodeType
from models.branch import Branch
from models.audit_log import AuditAction, ResourceType
from services.audit_service import log_action

router = APIRouter(prefix="/tools", tags=["AI Tools"])


class ToolRequest(BaseModel):
    action: str  # 'write_file', 'read_file', 'create_file', 'delete_file', 'modify_file', 'list_files'
    project_id: UUID
    branch_id: Optional[UUID] = None
    file_path: Optional[str] = None  # e.g. 'index.js' or 'src/App.tsx'
    content: Optional[str] = None
    target_content: Optional[str] = None
    replacement_content: Optional[str] = None


class ToolResponse(BaseModel):
    success: bool
    action: str
    message: str
    data: Optional[Any] = None


async def _resolve_branch_id(db: AsyncSession, project_id: UUID, branch_id: Optional[UUID]) -> UUID:
    if branch_id:
        return branch_id
    q = select(Branch.id).where(Branch.project_id == project_id, Branch.name == "main")
    res = (await db.execute(q)).scalar_one_or_none()
    if res:
        return res
    # Fallback to any branch
    q2 = select(Branch.id).where(Branch.project_id == project_id).limit(1)
    res2 = (await db.execute(q2)).scalar_one_or_none()
    if res2:
        return res2
    raise HTTPException(status_code=404, detail="No branch found for project")


async def _resolve_parent_id(
    db: AsyncSession,
    project_id: UUID,
    branch_id: UUID,
    file_path: str,
) -> tuple[str, Optional[UUID]]:
    """
    Given a path like 'src/components/Button.py', walks each directory segment
    and returns (filename, parent_dir_id). If a folder doesn't exist it creates it.
    Returns (filename, None) for root-level files.
    """
    parts = [p for p in file_path.replace("\\", "/").split("/") if p]
    if len(parts) == 1:
        return parts[0], None

    filename = parts[-1]
    folder_segments = parts[:-1]
    parent_id: Optional[UUID] = None

    for segment in folder_segments:
        q = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == segment,
            Directory.type == NodeType.dir,
            Directory.parent_id == parent_id,
        )
        folder = (await db.execute(q)).scalar_one_or_none()
        if not folder:
            # Auto-create missing intermediate folder
            folder = Directory(
                project_id=project_id,
                branch_id=branch_id,
                parent_id=parent_id,
                name=segment,
                type=NodeType.dir,
            )
            db.add(folder)
            await db.flush()
        parent_id = folder.id

    return filename, parent_id


@router.post("/execute", response_model=ToolResponse, summary="Execute AI IDE Tools (create, read, write, modify, delete)")
async def execute_tool(
    payload: ToolRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    action = payload.action.lower().strip()
    project_id = payload.project_id
    branch_id = await _resolve_branch_id(db, project_id, payload.branch_id)

    # 1. LIST FILES
    if action in ("list_files", "list"):
        q = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id
        ).order_by(Directory.name)
        nodes = (await db.execute(q)).scalars().all()
        file_list = [
            {"id": str(n.id), "name": n.name, "type": n.type.value, "parent_id": str(n.parent_id) if n.parent_id else None}
            for n in nodes
        ]
        return ToolResponse(
            success=True,
            action="list_files",
            message=f"Found {len(file_list)} files and folders in workspace",
            data={"files": file_list}
        )

    # 2. CREATE FILE
    if action in ("create_file", "create"):
        if not payload.file_path:
            raise HTTPException(status_code=400, detail="file_path is required for create_file")

        filename, parent_id = await _resolve_parent_id(db, project_id, branch_id, payload.file_path)

        # Check if already exists in that folder
        q_exist = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename,
            Directory.type == NodeType.file,
            Directory.parent_id == parent_id,
        )
        existing = (await db.execute(q_exist)).scalar_one_or_none()
        if existing:
            return ToolResponse(
                success=True,
                action="create_file",
                message=f"File '{payload.file_path}' already exists (ID: {existing.id})",
                data={"file_id": str(existing.id), "name": existing.name, "parent_id": str(parent_id) if parent_id else None}
            )

        new_file = Directory(
            project_id=project_id,
            branch_id=branch_id,
            parent_id=parent_id,
            name=filename,
            type=NodeType.file,
            created_by=user.id,
            updated_by=user.id
        )
        db.add(new_file)
        await db.flush()

        if payload.content:
            stmt = text("""
                INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                VALUES (:file_id, :branch_id, :data, CURRENT_TIMESTAMP)
                ON CONFLICT(file_id, branch_id) DO UPDATE
                SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
            """)
            await db.execute(stmt, {
                "file_id": str(new_file.id),
                "branch_id": str(branch_id),
                "data": payload.content
            })

        await log_action(
            db,
            actor_id=user.id,
            action=AuditAction.create,
            resource_type=ResourceType.file,
            resource_id=new_file.id,
            project_id=project_id,
            detail={"name": new_file.name, "path": payload.file_path, "created_by_bot": True},
            ip_address=get_client_ip(request),
        )
        return ToolResponse(
            success=True,
            action="create_file",
            message=f"Successfully created file '{payload.file_path}'",
            data={"file_id": str(new_file.id), "name": new_file.name, "parent_id": str(parent_id) if parent_id else None}
        )

    # 3. READ FILE
    if action in ("read_file", "read"):
        if not payload.file_path:
            raise HTTPException(status_code=400, detail="file_path is required for read_file")

        filename, parent_id = await _resolve_parent_id(db, project_id, branch_id, payload.file_path)
        q_find = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename,
            Directory.type == NodeType.file,
            Directory.parent_id == parent_id,
        )
        file_node = (await db.execute(q_find)).scalar_one_or_none()
        if not file_node:
            raise HTTPException(status_code=404, detail=f"File '{payload.file_path}' not found in current branch")

        return ToolResponse(
            success=True,
            action="read_file",
            message=f"Read file metadata for '{payload.file_path}'",
            data={"file_id": str(file_node.id), "name": file_node.name, "parent_id": str(file_node.parent_id) if file_node.parent_id else None}
        )

    # 4. DELETE FILE
    if action in ("delete_file", "delete"):
        if not payload.file_path:
            raise HTTPException(status_code=400, detail="file_path is required for delete_file")

        filename, parent_id = await _resolve_parent_id(db, project_id, branch_id, payload.file_path)
        q_find = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename,
            Directory.parent_id == parent_id,
        )
        node = (await db.execute(q_find)).scalar_one_or_none()
        if not node:
            raise HTTPException(status_code=404, detail=f"File '{payload.file_path}' not found")

        file_id = node.id
        await log_action(
            db,
            actor_id=user.id,
            action=AuditAction.delete,
            resource_type=ResourceType.file if node.type == NodeType.file else ResourceType.directory,
            resource_id=file_id,
            project_id=project_id,
            detail={"name": node.name, "deleted_by_bot": True},
            ip_address=get_client_ip(request),
        )
        await db.delete(node)
        return ToolResponse(
            success=True,
            action="delete_file",
            message=f"Successfully deleted '{filename}'",
            data={"deleted_file_id": str(file_id), "name": filename}
        )

    # 5. WRITE / MODIFY FILE
    if action in ("write_file", "modify_file", "write", "modify"):
        if not payload.file_path:
            raise HTTPException(status_code=400, detail="file_path is required for write_file / modify_file")

        filename, parent_id = await _resolve_parent_id(db, project_id, branch_id, payload.file_path)
        q_find = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename,
            Directory.type == NodeType.file,
            Directory.parent_id == parent_id,
        )
        file_node = (await db.execute(q_find)).scalar_one_or_none()
        
        # If file doesn't exist, create it (with the correct parent)
        if not file_node:
            file_node = Directory(
                project_id=project_id,
                branch_id=branch_id,
                parent_id=parent_id,
                name=filename,
                type=NodeType.file,
                created_by=user.id,
                updated_by=user.id
            )
            db.add(file_node)
            await db.flush()

        if payload.content is not None:
            stmt = text("""
                INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                VALUES (:file_id, :branch_id, :data, CURRENT_TIMESTAMP)
                ON CONFLICT(file_id, branch_id) DO UPDATE
                SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
            """)
            await db.execute(stmt, {
                "file_id": str(file_node.id),
                "branch_id": str(branch_id),
                "data": payload.content
            })

        file_node.updated_by = user.id
        await log_action(
            db,
            actor_id=user.id,
            action=AuditAction.update,
            resource_type=ResourceType.file,
            resource_id=file_node.id,
            project_id=project_id,
            detail={"name": file_node.name, "modified_by_bot": True},
            ip_address=get_client_ip(request),
        )

        return ToolResponse(
            success=True,
            action=action,
            message=f"Successfully applied modifications to '{filename}'",
            data={"file_id": str(file_node.id), "name": file_node.name, "content_length": len(payload.content or "")}
        )

    raise HTTPException(status_code=400, detail=f"Unsupported tool action '{action}'. Available: write_file, read_file, create_file, delete_file, modify_file, list_files")
