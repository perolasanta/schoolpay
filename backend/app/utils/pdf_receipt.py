# ============================================================
# app/utils/pdf_receipt.py
#
# Generates a professional PDF payment receipt.
# Called by: GET /api/v1/payments/receipt/{payment_id}/pdf
#
# Library: ReportLab (already in requirements.txt)
# Output:  BytesIO buffer — streamed directly to the client,
#          never written to disk.
#
# Design decisions:
#   - A5 size (148 x 210mm) — fits on half an A4 page if printed.
#     Bursars often print two receipts per page and cut them.
#   - No images/logo in V1 — avoids font/image path issues on VPS.
#     School name renders large in the header instead.
#   - Naira symbol: use canvas.drawString with the unicode character.
#     ReportLab's built-in Helvetica handles ₦ correctly.
#   - All amounts formatted as Nigerian locale: 1,000,000.00
# ============================================================

from io import BytesIO
from datetime import datetime
from decimal import Decimal

from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT


# ── Colour palette ────────────────────────────────────────────
# Clean, professional. Works in greyscale (common on Nigerian printers).
BRAND_GREEN  = colors.HexColor("#1B6B3A")   # SchoolPay brand green
DARK_TEXT    = colors.HexColor("#1A1A1A")
MUTED_TEXT   = colors.HexColor("#6B7280")
LIGHT_BG     = colors.HexColor("#F3F4F6")
BORDER_COLOR = colors.HexColor("#D1D5DB")
SUCCESS_GREEN = colors.HexColor("#D1FAE5")
WHITE        = colors.white


def _format_amount(amount) -> str:
    """Format as ₦1,234,567.89"""
    n = Decimal(str(amount))
    return f"\u20A6{n:,.2f}"


def _format_date(dt) -> str:
    """Format datetime or ISO string → 'Mon DD, YYYY HH:MM'"""
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return str(dt)
    if isinstance(dt, datetime):
        return dt.strftime("%-d %B %Y, %I:%M %p")
    return str(dt)


def generate_receipt_pdf(
    *,
    receipt_number: str,
    school_name: str,
    student_name: str,
    student_admission: str,
    class_name: str,
    term_name: str,
    session_name: str,
    payment_method: str,
    payment_date,
    amount_paid: Decimal,
    total_amount: Decimal,
    amount_paid_before: Decimal,      # balance BEFORE this payment
    outstanding_after: Decimal,       # balance AFTER this payment
    line_items: list[dict],           # [{name, amount, category}]
    recorded_by: str = "",
    reference: str = "",
    narration: str = "",
    school_address: str = "",
    school_phone: str = "",
) -> BytesIO:
    """
    Returns a BytesIO buffer containing the PDF receipt.
    Caller streams this directly to the HTTP response.

    Example:
        buf = generate_receipt_pdf(...)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={receipt_number}.pdf"})
    """
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A5,
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title=f"Receipt {receipt_number}",
        author="SchoolPay",
    )

    # ── Paragraph styles ──────────────────────────────────────
    def style(name, **kwargs):
        defaults = dict(fontName="Helvetica", fontSize=9, leading=12,
                        textColor=DARK_TEXT)
        defaults.update(kwargs)
        return ParagraphStyle(name, **defaults)

    S = {
        "school_name": style("sn", fontName="Helvetica-Bold", fontSize=16,
                             leading=20, textColor=WHITE, alignment=TA_CENTER),
        "school_sub":  style("ss", fontSize=8, textColor=WHITE, alignment=TA_CENTER,
                             leading=11),
        "receipt_label": style("rl", fontName="Helvetica-Bold", fontSize=11,
                               textColor=WHITE, alignment=TA_CENTER),
        "receipt_num": style("rn", fontSize=9, textColor=WHITE,
                             alignment=TA_CENTER),
        "section_head": style("sh", fontName="Helvetica-Bold", fontSize=8,
                              textColor=MUTED_TEXT, spaceAfter=2),
        "field_label": style("fl", fontSize=8, textColor=MUTED_TEXT),
        "field_value": style("fv", fontName="Helvetica-Bold", fontSize=9),
        "table_head":  style("th", fontName="Helvetica-Bold", fontSize=8,
                             textColor=WHITE),
        "table_cell":  style("tc", fontSize=8),
        "table_right": style("tr", fontSize=8, alignment=TA_RIGHT),
        "total_label": style("tl", fontName="Helvetica-Bold", fontSize=10),
        "total_value": style("tv", fontName="Helvetica-Bold", fontSize=10,
                             alignment=TA_RIGHT, textColor=BRAND_GREEN),
        "footer":      style("ft", fontSize=7, textColor=MUTED_TEXT,
                             alignment=TA_CENTER),
        "paid_stamp":  style("ps", fontName="Helvetica-Bold", fontSize=13,
                             textColor=BRAND_GREEN, alignment=TA_CENTER),
        "balance_ok":  style("bo", fontSize=8, textColor=BRAND_GREEN,
                             alignment=TA_CENTER),
        "balance_due": style("bd", fontSize=8, textColor=colors.HexColor("#DC2626"),
                             alignment=TA_CENTER),
    }

    story = []
    page_w = A5[0] - 24 * mm   # usable width

    # ── HEADER BANNER ─────────────────────────────────────────
    header_data = [[
        Paragraph(school_name.upper(), S["school_name"])
    ]]
    if school_address or school_phone:
        contact = " | ".join(filter(None, [school_address, school_phone]))
        header_data.append([Paragraph(contact, S["school_sub"])])

    header_data.append([Paragraph("OFFICIAL PAYMENT RECEIPT", S["receipt_label"])])
    header_data.append([Paragraph(receipt_number, S["receipt_num"])])

    header_table = Table(header_data, colWidths=[page_w])
    header_table.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), BRAND_GREEN),
        ("TOPPADDING",  (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 5 * mm))

    # ── STUDENT & TERM DETAILS (2-column grid) ────────────────
    def field_row(label, value):
        return [
            Paragraph(label, S["field_label"]),
            Paragraph(str(value) if value else "—", S["field_value"]),
        ]

    col_w = page_w / 2 - 2 * mm

    detail_data = [
        field_row("Student Name",   student_name),
        field_row("Admission No.",  student_admission or "—"),
        field_row("Class",          class_name or "—"),
        field_row("Term",           f"{term_name} — {session_name}"),
        field_row("Payment Date",   _format_date(payment_date)),
        field_row("Payment Method", payment_method.replace("_", " ").title()),
    ]
    if reference:
        detail_data.append(field_row("Bank Reference", reference))
    if recorded_by:
        detail_data.append(field_row("Received By", recorded_by))

    detail_table = Table(
        detail_data,
        colWidths=[col_w * 0.45, col_w * 1.55],
    )
    detail_table.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("LINEBELOW",     (0, -1), (-1, -1), 0.5, BORDER_COLOR),
    ]))
    story.append(detail_table)
    story.append(Spacer(1, 4 * mm))

    # ── FEE BREAKDOWN TABLE ───────────────────────────────────
    story.append(Paragraph("FEE BREAKDOWN", S["section_head"]))

    fee_rows = [[
        Paragraph("Description", S["table_head"]),
        Paragraph("Category", S["table_head"]),
        Paragraph("Amount", S["table_head"]),
    ]]

    for item in line_items:
        fee_rows.append([
            Paragraph(item.get("name", ""), S["table_cell"]),
            Paragraph(item.get("category", "").replace("_", " ").title(), S["table_cell"]),
            Paragraph(_format_amount(item.get("amount", 0)), S["table_right"]),
        ])

    # Totals section
    fee_rows.append(["", "", ""])   # spacer row

    if total_amount != amount_paid:
        fee_rows.append([
            Paragraph("Total Invoice Amount", S["field_label"]),
            "",
            Paragraph(_format_amount(total_amount), S["table_right"]),
        ])
        fee_rows.append([
            Paragraph("Previously Paid", S["field_label"]),
            "",
            Paragraph(_format_amount(amount_paid_before), S["table_right"]),
        ])

    fee_rows.append([
        Paragraph("THIS PAYMENT", S["total_label"]),
        "",
        Paragraph(_format_amount(amount_paid), S["total_value"]),
    ])

    col_widths = [page_w * 0.48, page_w * 0.24, page_w * 0.28]
    fee_table = Table(fee_rows, colWidths=col_widths)
    n_data = len(fee_rows)
    n_items = len(line_items)

    fee_table.setStyle(TableStyle([
        # Header row
        ("BACKGROUND",    (0, 0), (-1, 0), BRAND_GREEN),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        # Alternating row shading for items
        *[
            ("BACKGROUND", (0, i + 1), (-1, i + 1), LIGHT_BG)
            for i in range(n_items) if i % 2 == 0
        ],
        # Grid on item rows
        ("LINEBELOW",     (0, 0), (-1, n_items), 0.3, BORDER_COLOR),
        # Total row highlight
        ("BACKGROUND",    (0, n_data - 1), (-1, n_data - 1), SUCCESS_GREEN),
        ("LINEABOVE",     (0, n_data - 1), (-1, n_data - 1), 1, BRAND_GREEN),
    ]))
    story.append(fee_table)
    story.append(Spacer(1, 4 * mm))

    # ── OUTSTANDING BALANCE BADGE ─────────────────────────────
    is_fully_paid = outstanding_after <= Decimal("0")

    if is_fully_paid:
        badge_text = "✓  ACCOUNT FULLY PAID — THANK YOU"
        badge_style = S["paid_stamp"]
        badge_bg = SUCCESS_GREEN
        badge_border = BRAND_GREEN
    else:
        badge_text = f"Outstanding Balance: {_format_amount(outstanding_after)}"
        badge_style = S["balance_due"]
        badge_bg = colors.HexColor("#FEF2F2")
        badge_border = colors.HexColor("#DC2626")

    badge_table = Table([[Paragraph(badge_text, badge_style)]], colWidths=[page_w])
    badge_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), badge_bg),
        ("BOX",           (0, 0), (-1, -1), 1, badge_border),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    story.append(badge_table)
    story.append(Spacer(1, 3 * mm))

    # ── NARRATION (if present) ────────────────────────────────
    if narration:
        story.append(Paragraph(f"Note: {narration}", S["footer"]))
        story.append(Spacer(1, 2 * mm))

    # ── FOOTER ────────────────────────────────────────────────
    story.append(HRFlowable(width=page_w, color=BORDER_COLOR, thickness=0.5))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        f"Generated by SchoolPay  •  {_format_date(datetime.now())}  •  "
        f"This is a computer-generated receipt and requires no signature.",
        S["footer"]
    ))
    story.append(Paragraph(
        "Payments powered by SchoolPay — schoolpay.ng",
        S["footer"]
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer
