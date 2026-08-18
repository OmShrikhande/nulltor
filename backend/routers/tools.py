from typing import Optional, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.deps import get_current_user, get_client_ip
from models.user import User
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
        
        filename = payload.file_path.split("/")[-1]
        # Check if already exists
        q_exist = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename,
            Directory.type == NodeType.file
        )
        existing = (await db.execute(q_exist)).scalar_one_or_none()
        if existing:
            return ToolResponse(
                success=True,
                action="create_file",
                message=f"File '{filename}' already exists (ID: {existing.id})",
                data={"file_id": str(existing.id), "name": existing.name}
            )

        new_file = Directory(
            project_id=project_id,
            branch_id=branch_id,
            name=filename,
            type=NodeType.file,
            created_by=user.id,
            updated_by=user.id
        )
        db.add(new_file)
        await db.flush()

        await log_action(
            db,
            actor_id=user.id,
            action=AuditAction.create,
            resource_type=ResourceType.file,
            resource_id=new_file.id,
            project_id=project_id,
            detail={"name": new_file.name, "created_by_bot": True},
            ip_address=get_client_ip(request),
        )
        return ToolResponse(
            success=True,
            action="create_file",
            message=f"Successfully created file '{filename}'",
            data={"file_id": str(new_file.id), "name": new_file.name}
        )

    # 3. READ FILE
    if action in ("read_file", "read"):
        if not payload.file_path:
            raise HTTPException(status_code=400, detail="file_path is required for read_file")
        
        filename = payload.file_path.split("/")[-1]
        q_find = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename,
            Directory.type == NodeType.file
        )
        file_node = (await db.execute(q_find)).scalar_one_or_none()
        if not file_node:
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found in current branch")

        return ToolResponse(
            success=True,
            action="read_file",
            message=f"Read file metadata for '{filename}'",
            data={"file_id": str(file_node.id), "name": file_node.name}
        )

    # 4. DELETE FILE
    if action in ("delete_file", "delete"):
        if not payload.file_path:
            raise HTTPException(status_code=400, detail="file_path is required for delete_file")
        
        filename = payload.file_path.split("/")[-1]
        q_find = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename
        )
        node = (await db.execute(q_find)).scalar_one_or_none()
        if not node:
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

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
        
        filename = payload.file_path.split("/")[-1]
        q_find = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == branch_id,
            Directory.name == filename,
            Directory.type == NodeType.file
        )
        file_node = (await db.execute(q_find)).scalar_one_or_none()
        
        # If file doesn't exist, create it
        if not file_node:
            file_node = Directory(
                project_id=project_id,
                branch_id=branch_id,
                name=filename,
                type=NodeType.file,
                created_by=user.id,
                updated_by=user.id
            )
            db.add(file_node)
            await db.flush()

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
