# app/api/v1/endpoints/academic.py
#
# Sessions, terms, and classes are all school admin operations.
# Every query goes through SchoolDB — never supabase_admin.

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException

from app.core.security import CurrentUser, get_active_user, require_roles
from app.core.database import SchoolDB
from app.schemas.academic import (
    SessionCreate, SessionUpdate, SessionResponse,
    TermCreate, TermUpdate, TermResponse,
    ClassCreate, ClassUpdate, ClassResponse,
)
from app.schemas.common import APIResponse
from app.services.activity_service import log_activity

router = APIRouter(tags=["Academic Structure"])


# ═══════════════════════════════════════════════════════════
# SESSIONS
# ═══════════════════════════════════════════════════════════

@router.post("/sessions", response_model=APIResponse[SessionResponse], status_code=201)
async def create_session(
    body: SessionCreate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))
    row = db.insert("academic_sessions", {
        "name":       body.name,
        "start_date": body.start_date.isoformat() if body.start_date else None,
        "end_date":   body.end_date.isoformat() if body.end_date else None,
        "is_active":  body.is_active,
    })
    await log_activity(
        school_id=str(user.school_id), user_id=str(user.user_id),
        action="session.created", entity_type="academic_session", entity_id=row["id"],
        metadata={"name": body.name},
    )
    return APIResponse(data=row, message=f"Session '{body.name}' created")


@router.get("/sessions", response_model=APIResponse[List[SessionResponse]])
async def list_sessions(user: CurrentUser = Depends(get_active_user)):
    db = SchoolDB(str(user.school_id))
    result = db.select("academic_sessions").order("name", desc=True).execute()
    return APIResponse(data=result.data or [])


@router.patch("/sessions/{session_id}", response_model=APIResponse[SessionResponse])
async def update_session(
    session_id: str,
    body: SessionUpdate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    """Setting is_active=True triggers the DB to deactivate all other sessions automatically."""
    db = SchoolDB(str(user.school_id))
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.update("academic_sessions", payload, record_id=session_id)
    return APIResponse(data=row, message="Session updated")


# ═══════════════════════════════════════════════════════════
# TERMS
# ═══════════════════════════════════════════════════════════

@router.post("/terms", response_model=APIResponse[TermResponse], status_code=201)
async def create_term(
    body: TermCreate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))

    # Verify the session belongs to this school before creating a term inside it
    db.require_one("academic_sessions", str(body.session_id))

    row = db.insert("terms", {
        "session_id": str(body.session_id),
        "name":       body.name,
        "start_date": body.start_date.isoformat() if body.start_date else None,
        "end_date":   body.end_date.isoformat() if body.end_date else None,
        "is_active":  body.is_active,
    })
    return APIResponse(data=row, message=f"Term '{body.name}' created")


@router.get("/terms", response_model=APIResponse[List[TermResponse]])
async def list_terms(
    user: CurrentUser = Depends(get_active_user),
    session_id: Optional[str] = None,
):
    db = SchoolDB(str(user.school_id))
    query = db.select("terms", "*, academic_sessions(name)").order("start_date", desc=False)
    if session_id:
        query = query.eq("session_id", session_id)
    result = query.execute()

    terms = []
    for t in (result.data or []):
        t["session_name"] = (t.get("academic_sessions") or {}).get("name")
        terms.append(t)
    return APIResponse(data=terms)


@router.get("/terms/active", response_model=APIResponse[TermResponse])
async def get_active_term(user: CurrentUser = Depends(get_active_user)):
    db = SchoolDB(str(user.school_id))
    result = (
        db.select("terms", "*, academic_sessions(name)")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No active term. Please set one.")
    term = result.data
    term["session_name"] = (term.get("academic_sessions") or {}).get("name")
    return APIResponse(data=term)


@router.patch("/terms/{term_id}", response_model=APIResponse[TermResponse])
async def update_term(
    term_id: str,
    body: TermUpdate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.update("terms", payload, record_id=term_id)
    return APIResponse(data=row, message="Term updated")


# ═══════════════════════════════════════════════════════════
# CLASSES
# ═══════════════════════════════════════════════════════════

@router.post("/classes", response_model=APIResponse[ClassResponse], status_code=201)
async def create_class(
    body: ClassCreate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))
    row = db.insert("classes", {
        "name":     body.name,
        "level":    body.level,
        "capacity": body.capacity,
    })
    return APIResponse(data=row, message=f"Class '{body.name}' created")


@router.get("/classes", response_model=APIResponse[List[ClassResponse]])
async def list_classes(
    user: CurrentUser = Depends(get_active_user),
    include_count: bool = False,
):
    db = SchoolDB(str(user.school_id))
    result = (
        db.select("classes")
        .eq("is_active", True)
        .order("name")
        .execute()
    )
    classes = result.data or []

    if include_count and classes:
        active_session_result = (
            db.select("academic_sessions", "id")
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        if active_session_result.data:
            session_id = active_session_result.data["id"]
            for cls in classes:
                count = (
                    db.select("student_enrollments", "id")
                    .eq("class_id", cls["id"])
                    .eq("session_id", session_id)
                    .eq("is_active", True)
                    .execute()
                )
                cls["student_count"] = len(count.data or [])

    return APIResponse(data=classes)


@router.patch("/classes/{class_id}", response_model=APIResponse[ClassResponse])
async def update_class(
    class_id: str,
    body: ClassUpdate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.update("classes", payload, record_id=class_id)
    return APIResponse(data=row, message="Class updated")
