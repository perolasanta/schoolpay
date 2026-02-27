# app/services/student_service.py
#
# All queries use SchoolDB(school_id) — never supabase_admin.
# school_id is stamped on every insert and enforced on every
# select/update automatically by the SchoolDB wrapper.
# The school admin is doing all of this, not the platform owner.

from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.core.database import SchoolDB
from app.schemas.students import (
    StudentCreate, StudentUpdate, StudentResponse,
    StudentListItem, BulkEnrollRequest,
)
from app.schemas.common import PaginationParams
from app.services.activity_service import log_activity
import logging

logger = logging.getLogger(__name__)


async def create_student(school_id: str, data: StudentCreate, created_by: str) -> StudentResponse:
    db = SchoolDB(school_id)

    # Admission number must be unique within this school
    existing = (
        db.select("students", "id")
        .eq("admission_number", data.admission_number)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Admission number '{data.admission_number}' already exists.",
        )

    student = db.insert("students", {
        "admission_number":      data.admission_number,
        "first_name":            data.first_name.strip(),
        "last_name":             data.last_name.strip(),
        "middle_name":           data.middle_name,
        "date_of_birth":         data.date_of_birth.isoformat() if data.date_of_birth else None,
        "gender":                data.gender,
        "guardian_name":         data.guardian_name,
        "guardian_phone":        data.guardian_phone,
        "guardian_email":        data.guardian_email,
        "guardian_relationship": data.guardian_relationship,
        "alt_guardian_name":     data.alt_guardian_name,
        "alt_guardian_phone":    data.alt_guardian_phone,
        "scholarship_percent":   float(data.scholarship_percent),
        "has_sibling_discount":  data.has_sibling_discount,
        "state_of_origin":       data.state_of_origin,
        "lga":                   data.lga,
        "religion":              data.religion,
        "blood_group":           data.blood_group,
        "genotype":              data.genotype,
        "admission_date":        data.admission_date.isoformat() if data.admission_date else None,
        "status":                "active",
        "created_by":            created_by,
    })

    current_class, current_class_id, current_session = None, None, None

    if data.class_id and data.session_id:
        await enroll_student(school_id, student["id"], str(data.session_id), str(data.class_id))
        cls = db.select("classes", "name").eq("id", str(data.class_id)).maybe_single().execute()
        if cls.data:
            current_class    = cls.data["name"]
            current_class_id = str(data.class_id)

    await log_activity(
        school_id=school_id, user_id=created_by,
        action="student.created", entity_type="student", entity_id=student["id"],
        metadata={"admission_number": data.admission_number,
                  "name": f"{data.first_name} {data.last_name}"},
    )
    return _to_response(student, current_class, current_class_id, current_session)


async def get_student(school_id: str, student_id: str) -> StudentResponse:
    db = SchoolDB(school_id)
    student = db.require_one("students", student_id)

    active_session = _get_active_session(db)
    current_class, current_class_id, current_session = None, None, None

    if active_session:
        enroll = (
            db.select("student_enrollments",
                      "class_id, classes(name), academic_sessions(name)")
            .eq("student_id", student_id)
            .eq("session_id", active_session["id"])
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        if enroll.data:
            current_class    = (enroll.data.get("classes") or {}).get("name")
            current_class_id = enroll.data.get("class_id")
            current_session  = (enroll.data.get("academic_sessions") or {}).get("name")

    return _to_response(student, current_class, current_class_id, current_session)


async def list_students(
    school_id: str,
    params: PaginationParams,
    class_id: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> tuple[List[StudentListItem], int]:
    db = SchoolDB(school_id)

    query = (
        db.select(
            "students",
            "id, admission_number, first_name, last_name, guardian_phone, status, scholarship_percent",
        )
        .order("last_name", desc=False)
    )

    if status_filter:
        query = query.eq("status", status_filter)
    else:
        query = query.neq("status", "deceased")

    if params.search:
        s = params.search.strip()
        query = query.or_(
            f"first_name.ilike.%{s}%,last_name.ilike.%{s}%,admission_number.ilike.%{s}%"
        )

    result = (
        query
        .range(params.offset, params.offset + params.page_size - 1)
        .execute()
    )
    students = result.data or []
    total    = result.count or len(students)

    # Attach current class from active session
    class_map: dict[str, Optional[str]] = {}
    if students:
        active_session = _get_active_session(db)
        if active_session:
            ids = [s["id"] for s in students]
            enrollments = (
                db.select("student_enrollments", "student_id, classes(name)")
                .eq("session_id", active_session["id"])
                .in_("student_id", ids)
                .eq("is_active", True)
                .execute()
            )
            for e in (enrollments.data or []):
                class_map[e["student_id"]] = (e.get("classes") or {}).get("name")

    items = [
        StudentListItem(
            id=s["id"],
            admission_number=s["admission_number"],
            full_name=f"{s['first_name']} {s['last_name']}",
            guardian_phone=s["guardian_phone"],
            status=s["status"],
            current_class=class_map.get(s["id"]),
            scholarship_percent=s.get("scholarship_percent", 0),
        )
        for s in students
    ]
    return items, total


async def update_student(
    school_id: str, student_id: str, data: StudentUpdate, updated_by: str
) -> StudentResponse:
    db = SchoolDB(school_id)
    payload = data.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "date_of_birth" in payload and payload["date_of_birth"]:
        payload["date_of_birth"] = payload["date_of_birth"].isoformat()

    db.update("students", payload, record_id=student_id)

    await log_activity(
        school_id=school_id, user_id=updated_by,
        action="student.updated", entity_type="student", entity_id=student_id,
        metadata={"fields_changed": list(payload.keys())},
    )
    return await get_student(school_id, student_id)


async def enroll_student(
    school_id: str, student_id: str, session_id: str, class_id: str
) -> dict:
    """
    Enroll a student in a class for a given session.
    Handles class transfers: deactivates previous enrollment in the same session first.
    """
    db = SchoolDB(school_id)

    # Deactivate any existing active enrollment in this session (for transfers)
    db.update_where(
        "student_enrollments",
        {"is_active": False},
        student_id=student_id,
        session_id=session_id,
        is_active=True,
    )

    try:
        return db.insert("student_enrollments", {
            "student_id": student_id,
            "session_id": session_id,
            "class_id":   class_id,
            "is_active":  True,
        })
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student is already enrolled in this session.",
            )
        raise HTTPException(status_code=500, detail=str(e))


async def bulk_enroll(school_id: str, data: BulkEnrollRequest, enrolled_by: str) -> dict:
    success, failed = 0, 0
    for student_id in data.student_ids:
        try:
            await enroll_student(school_id, str(student_id),
                                 str(data.session_id), str(data.class_id))
            success += 1
        except Exception:
            failed += 1

    await log_activity(
        school_id=school_id, user_id=enrolled_by,
        action="student.bulk_enrolled",
        metadata={"session_id": str(data.session_id), "class_id": str(data.class_id),
                  "success": success, "failed": failed},
    )
    return {"enrolled": success, "failed": failed}


# ── Helpers ──────────────────────────────────────────────────

def _get_active_session(db: SchoolDB) -> Optional[dict]:
    result = (
        db.select("academic_sessions", "id, name")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    return result.data


def _to_response(
    student: dict,
    current_class: Optional[str],
    current_class_id: Optional[str],
    current_session: Optional[str],
) -> StudentResponse:
    return StudentResponse(
        id=student["id"],
        school_id=student["school_id"],
        admission_number=student["admission_number"],
        first_name=student["first_name"],
        last_name=student["last_name"],
        middle_name=student.get("middle_name"),
        full_name=f"{student['first_name']} {student['last_name']}",
        date_of_birth=student.get("date_of_birth"),
        gender=student.get("gender"),
        guardian_name=student["guardian_name"],
        guardian_phone=student["guardian_phone"],
        guardian_email=student.get("guardian_email"),
        guardian_relationship=student.get("guardian_relationship", "parent"),
        status=student["status"],
        scholarship_percent=float(student.get("scholarship_percent", 0)),
        has_sibling_discount=student.get("has_sibling_discount", False),
        state_of_origin=student.get("state_of_origin"),
        admission_date=student.get("admission_date"),
        created_at=student["created_at"],
        current_class=current_class,
        current_class_id=UUID(current_class_id) if current_class_id else None,
        current_session=current_session,
    )
