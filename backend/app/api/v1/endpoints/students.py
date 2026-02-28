# app/api/v1/endpoints/students.py
# ============================================================
# Students endpoints:
#   GET  /students/class-summary   → class cards
#   GET  /students/arms            → arms for a class
#   GET  /students                 → paginated list with fee status
#   POST /students                 → create student (+ optional enroll)
#   GET  /students/{id}            → single student detail
#   PATCH /students/{id}           → update student info
#   PATCH /students/{id}/enrollment → update arm
#   POST /students/{id}/enroll     → enroll in a class/session
#   POST /students/bulk-enroll     → enroll many students at once
# ============================================================

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.database import SchoolDB, make_query_client
from app.core.security import TokenData, get_current_user, CurrentUser, require_roles, get_active_user
from app.schemas.students import (
    StudentCreate, StudentUpdate,
    EnrollmentCreate, BulkEnrollRequest,
)
from app.schemas.common import APIResponse
from app.services.activity_service import log_activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/students", tags=["Students"])


# ── Class Summary ──────────────────────────────────────────────────────────

@router.get("/class-summary")
async def get_class_summary(
    session_id: Optional[str] = Query(None),
    current_user: TokenData = Depends(get_current_user),
):
    try:
        db = make_query_client()
        query = (
            db.table("v_class_summary")
            .select("*")
            .eq("school_id", current_user.school_id)
        )
        if session_id:
            query = query.eq("session_id", session_id)

        result = query.order("class_name").order("arm").execute()
        rows = getattr(result, "data", None) or []

        classes: dict = {}
        for row in rows:
            class_id = row["class_id"]
            if class_id not in classes:
                classes[class_id] = {
                    "class_id":          class_id,
                    "class_name":        row["class_name"],
                    "session_id":        row["session_id"],
                    "student_count":     0,
                    "total_invoiced":    0,
                    "total_collected":   0,
                    "total_outstanding": 0,
                    "paid_count":        0,
                    "partial_count":     0,
                    "unpaid_count":      0,
                    "collection_rate":   0,
                    "arms":              [],
                }
            cls = classes[class_id]
            cls["student_count"]     += row["student_count"]
            cls["total_invoiced"]    += float(row["total_invoiced"] or 0)
            cls["total_collected"]   += float(row["total_collected"] or 0)
            cls["total_outstanding"] += float(row["total_outstanding"] or 0)
            cls["paid_count"]        += row["paid_count"]
            cls["partial_count"]     += row["partial_count"]
            cls["unpaid_count"]      += row["unpaid_count"]
            if row["arm"]:
                cls["arms"].append({
                    "arm":               row["arm"],
                    "class_arm_name":    row["class_arm_name"],
                    "student_count":     row["student_count"],
                    "total_invoiced":    float(row["total_invoiced"] or 0),
                    "total_collected":   float(row["total_collected"] or 0),
                    "total_outstanding": float(row["total_outstanding"] or 0),
                    "paid_count":        row["paid_count"],
                    "partial_count":     row["partial_count"],
                    "unpaid_count":      row["unpaid_count"],
                    "collection_rate":   float(row["collection_rate"] or 0),
                })

        result_list = []
        for cls in classes.values():
            if cls["total_invoiced"] > 0:
                cls["collection_rate"] = round(
                    (cls["total_collected"] / cls["total_invoiced"]) * 100, 1
                )
            result_list.append(cls)

        return {"success": True, "data": result_list}

    except Exception as e:
        logger.error(f"class_summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load class summary")


# ── Arms for a class ───────────────────────────────────────────────────────

@router.get("/arms")
async def get_arms_for_class(
    class_id: str = Query(...),
    session_id: Optional[str] = Query(None),
    current_user: TokenData = Depends(get_current_user),
):
    try:
        db = make_query_client()
        query = (
            db.table("student_enrollments")
            .select("arm")
            .eq("school_id", current_user.school_id)
            .eq("class_id", class_id)
            .not_.is_("arm", "null")
            .neq("arm", "")
        )
        if session_id:
            query = query.eq("session_id", session_id)
        result = query.execute()
        rows = getattr(result, "data", None) or []
        arms = sorted(set(r["arm"] for r in rows if r.get("arm")))
        return {"success": True, "data": arms}
    except Exception as e:
        logger.error(f"get_arms error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load arms")


# ── List Students ──────────────────────────────────────────────────────────

@router.get("")
async def list_students(
    page:           int = Query(1, ge=1),
    page_size:      int = Query(50, ge=1, le=200),
    search:         Optional[str] = Query(None),
    class_id:       Optional[str] = Query(None),
    arm:            Optional[str] = Query(None),
    session_id:     Optional[str] = Query(None),
    status:         Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    current_user:   TokenData = Depends(get_current_user),
):
    try:
        db = make_query_client()
        query = (
            db.table("v_student_fee_status")
            .select(
                "student_id, admission_number, first_name, last_name, "
                "full_name, guardian_name, guardian_phone, student_status, "
                "class_id, class_name, arm, class_arm_name, "
                "scholarship_percent, payment_status, total_amount, "
                "amount_paid, balance, is_overdue, invoice_id"
            )
            .eq("school_id", current_user.school_id)
        )
        if session_id:
            query = query.eq("session_id", session_id)
        if class_id:
            query = query.eq("class_id", class_id)
        if arm:
            query = query.eq("arm", arm.upper())
        if status:
            query = query.eq("student_status", status)
        if payment_status:
            query = query.eq("payment_status", payment_status)
        if search:
            query = query.or_(
                f"full_name.ilike.%{search}%,"
                f"admission_number.ilike.%{search}%,"
                f"guardian_name.ilike.%{search}%"
            )

        count_result = query.execute()
        all_rows = getattr(count_result, "data", None) or []
        total = len(all_rows)

        offset = (page - 1) * page_size
        paginated = all_rows[offset: offset + page_size]

        items = []
        for s in paginated:
            items.append({
                "id":                  s.get("student_id"),
                "admission_number":    s.get("admission_number"),
                "first_name":          s.get("first_name"),
                "last_name":           s.get("last_name"),
                "full_name":           s.get("full_name"),
                "guardian_name":       s.get("guardian_name"),
                "guardian_phone":      s.get("guardian_phone"),
                "status":              s.get("student_status"),
                "class_name":          s.get("class_name"),
                "arm":                 s.get("arm"),
                "class_arm_name":      s.get("class_arm_name"),
                "scholarship_percent": s.get("scholarship_percent", 0),
                "payment_status":      s.get("payment_status"),
                "total_amount":        s.get("total_amount"),
                "amount_paid":         s.get("amount_paid"),
                "balance":             s.get("balance"),
                "is_overdue":          s.get("is_overdue"),
                "invoice_id":          s.get("invoice_id"),
            })

        return {
            "success": True,
            "data": {
                "items":       items,
                "total":       total,
                "page":        page,
                "page_size":   page_size,
                "total_pages": max(1, -(-total // page_size)),
            }
        }

    except Exception as e:
        logger.error(f"list_students error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load students")


# ── Create Student ─────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_student(
    body: StudentCreate,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    db = SchoolDB(str(user.school_id))

    existing = (
        db.select("students", "id")
        .eq("admission_number", body.admission_number)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=f"Admission number '{body.admission_number}' already exists in this school."
        )

    student_data = {
        "admission_number":      body.admission_number,
        "first_name":            body.first_name,
        "last_name":             body.last_name,
        "middle_name":           body.middle_name,
        "date_of_birth":         body.date_of_birth.isoformat() if body.date_of_birth else None,
        "gender":                body.gender.value if body.gender else None,
        "guardian_name":         body.guardian_name,
        "guardian_phone":        body.guardian_phone,
        "guardian_email":        body.guardian_email,
        "guardian_relationship": body.guardian_relationship,
        "alt_guardian_name":     body.alt_guardian_name,
        "alt_guardian_phone":    body.alt_guardian_phone,
        "scholarship_percent":   body.scholarship_percent,
        "has_sibling_discount":  body.has_sibling_discount,
        "state_of_origin":       body.state_of_origin,
        "lga":                   body.lga,
        "religion":              body.religion,
        "blood_group":           body.blood_group,
        "genotype":              body.genotype,
        "admission_date":        body.admission_date.isoformat() if body.admission_date else None,
        "created_by":            str(user.user_id),
    }

    student = db.insert("students", student_data)
    student_id = student["id"]
    student["full_name"] = f"{body.first_name} {body.last_name}"

    # Optional auto-enroll
    enrollment = None
    if body.class_id and body.session_id:
        db.require_one("classes",           str(body.class_id))
        db.require_one("academic_sessions", str(body.session_id))
        try:
            enrollment = db.insert("student_enrollments", {
                "student_id": student_id,
                "session_id": str(body.session_id),
                "class_id":   str(body.class_id),
            })
        except Exception as e:
            logger.warning(f"Auto-enrollment failed for {student_id}: {e}")

    await log_activity(
        school_id=str(user.school_id),
        user_id=str(user.user_id),
        action="student.created",
        entity_type="student",
        entity_id=student_id,
        metadata={
            "name":             student["full_name"],
            "admission_number": body.admission_number,
            "enrolled":         enrollment is not None,
        },
    )

    return APIResponse(
        data=student,
        message=f"Student '{student['full_name']}' created."
        + (" Enrolled in class." if enrollment else ""),
    )


# ── Get Single Student ─────────────────────────────────────────────────────

@router.get("/{student_id}")
async def get_student(
    student_id: UUID,
    user: CurrentUser = Depends(get_active_user),
):
    db = SchoolDB(str(user.school_id))
    result = (
        db.select("students", "*")
        .eq("id", str(student_id))
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Student not found")

    student = result.data
    student["full_name"] = f"{student['first_name']} {student['last_name']}"

    # Attach current enrollment
    session_res = (
        db.select("academic_sessions", "id")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if session_res.data:
        enroll_res = (
            db.select("student_enrollments", "class_id, arm, classes(name)")
            .eq("student_id", str(student_id))
            .eq("session_id", session_res.data["id"])
            .maybe_single()
            .execute()
        )
        if enroll_res.data:
            e = enroll_res.data
            student["current_class_id"] = e["class_id"]
            student["current_class"]    = (e.get("classes") or {}).get("name")
            student["current_arm"]      = e.get("arm")

    return APIResponse(data=student)


# ── Update Student ─────────────────────────────────────────────────────────

@router.patch("/{student_id}")
async def update_student(
    student_id: UUID,
    body: StudentUpdate,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    db = SchoolDB(str(user.school_id))
    db.require_one("students", str(student_id))

    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to update")

    if "gender" in payload and hasattr(payload["gender"], "value"):
        payload["gender"] = payload["gender"].value
    if "status" in payload and hasattr(payload["status"], "value"):
        payload["status"] = payload["status"].value
    if "date_of_birth" in payload and payload["date_of_birth"]:
        payload["date_of_birth"] = payload["date_of_birth"].isoformat()

    updated = db.update("students", payload, record_id=str(student_id))
    updated["full_name"] = f"{updated['first_name']} {updated['last_name']}"

    await log_activity(
        school_id=str(user.school_id),
        user_id=str(user.user_id),
        action="student.updated",
        entity_type="student",
        entity_id=str(student_id),
        metadata={"fields_changed": list(payload.keys())},
    )

    return APIResponse(data=updated, message="Student updated successfully")


# ── Enroll Student ─────────────────────────────────────────────────────────

@router.post("/bulk-enroll", status_code=201)
async def bulk_enroll_students(
    body: BulkEnrollRequest,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))
    db.require_one("classes",           str(body.class_id))
    db.require_one("academic_sessions", str(body.session_id))

    enrolled_count = 0
    skipped_count  = 0
    errors         = []

    for student_id in body.student_ids:
        try:
            existing = (
                db.select("student_enrollments", "id")
                .eq("student_id", str(student_id))
                .eq("session_id", str(body.session_id))
                .maybe_single()
                .execute()
            )
            if existing.data:
                skipped_count += 1
                continue
            db.insert("student_enrollments", {
                "student_id": str(student_id),
                "session_id": str(body.session_id),
                "class_id":   str(body.class_id),
            })
            enrolled_count += 1
        except Exception as e:
            errors.append({"student_id": str(student_id), "error": str(e)})

    await log_activity(
        school_id=str(user.school_id),
        user_id=str(user.user_id),
        action="student.bulk_enrolled",
        entity_type="class",
        entity_id=str(body.class_id),
        metadata={"enrolled": enrolled_count, "skipped": skipped_count},
    )

    return APIResponse(
        data={"enrolled_count": enrolled_count, "skipped_count": skipped_count, "errors": errors},
        message=f"Enrolled {enrolled_count} students. {skipped_count} already enrolled.",
    )


# ── Update Enrollment arm ──────────────────────────────────────────────────

class UpdateEnrollmentRequest(BaseModel):
    arm: Optional[str] = None


@router.post("/{student_id}/enroll", status_code=201)
async def enroll_student(
    student_id: UUID,
    body: EnrollmentCreate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))
    db.require_one("students",          str(student_id))
    db.require_one("classes",           str(body.class_id))
    db.require_one("academic_sessions", str(body.session_id))

    existing = (
        db.select("student_enrollments", "id, class_id")
        .eq("student_id", str(student_id))
        .eq("session_id", str(body.session_id))
        .maybe_single()
        .execute()
    )

    if existing.data:
        updated = db.update(
            "student_enrollments",
            {"class_id": str(body.class_id)},
            record_id=existing.data["id"],
        )
        msg = "Enrollment updated to new class"
        enrollment = updated
    else:
        enrollment = db.insert("student_enrollments", {
            "student_id": str(student_id),
            "session_id": str(body.session_id),
            "class_id":   str(body.class_id),
        })
        msg = "Student enrolled successfully"

    cls = db.require_one("classes", str(body.class_id), "id, name")
    enrollment["class_name"] = cls["name"]

    await log_activity(
        school_id=str(user.school_id),
        user_id=str(user.user_id),
        action="student.enrolled",
        entity_type="student",
        entity_id=str(student_id),
        metadata={"class_id": str(body.class_id), "session_id": str(body.session_id)},
    )

    return APIResponse(data=enrollment, message=msg)


# ── Bulk Enroll ────────────────────────────────────────────────────────────

@router.patch("/{student_id}/enrollment")
async def update_enrollment(
    student_id: UUID,
    body: UpdateEnrollmentRequest,
    current_user: TokenData = Depends(get_current_user),
):
    db = make_query_client()
    student_check = (
        db.table("students")
        .select("id, school_id")
        .eq("id", str(student_id))
        .eq("school_id", current_user.school_id)
        .limit(1)
        .execute()
    )
    if not (getattr(student_check, "data", None) or []):
        raise HTTPException(status_code=404, detail="Student not found")

    arm_value = None
    if body.arm is not None:
        arm_value = body.arm.strip().upper() or None

    try:
        session_result = (
            db.table("academic_sessions")
            .select("id")
            .eq("school_id", current_user.school_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        sessions = getattr(session_result, "data", None) or []
        if not sessions:
            raise HTTPException(status_code=400, detail="No active academic session found")

        session_id = sessions[0]["id"]
        db.table("student_enrollments") \
            .update({"arm": arm_value}) \
            .eq("student_id", str(student_id)) \
            .eq("session_id", session_id) \
            .execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_enrollment error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update arm")

    await log_activity(
        school_id=current_user.school_id,
        user_id=current_user.user_id,
        action="students.update_arm",
        entity_type="student",
        entity_id=str(student_id),
        metadata={"arm": arm_value},
    )

    return {"success": True, "data": {"arm": arm_value}}
