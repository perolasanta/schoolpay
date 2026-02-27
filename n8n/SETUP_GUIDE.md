# SchoolPay — Session 3: n8n Setup Guide

## What Was Built

Three n8n workflows that handle ALL messaging in SchoolPay:

| File | Trigger | What It Does |
|------|---------|--------------|
| `01_payment_success.json` | FastAPI webhook (`payment-success`) | Sends SMS + WhatsApp receipt after every payment |
| `02_fee_reminder_blast.json` | FastAPI webhook (`fee-reminder`) | Bursar-triggered bulk debtor SMS |
| `03_daily_overdue_reminder.json` | Cron (8AM Mon-Fri) | Auto-sends escalating reminders to overdue parents |

One FastAPI file with 4 internal endpoints that n8n calls:

| Endpoint | Called By | Purpose |
|----------|-----------|---------|
| `GET /internal/student-contact/{id}` | Workflow 1 | Get student name, phone, balance |
| `GET /internal/debtors` | Workflow 2 | List all debtors for a school/term |
| `GET /internal/overdue-invoices` | Workflow 3 | Cross-school overdue list |
| `POST /internal/notification-log` | All 3 workflows | Write delivery status to DB |

---

## Step 1 — Add Internal Key to FastAPI `.env`

Open `backend/.env` and add:

```
INTERNAL_SECRET_KEY=generate_a_random_string_here
```

Generate one:
```bash
openssl rand -hex 32
```

---

## Step 2 — Register the Internal Router in FastAPI

Open `backend/app/api/v1/router.py` and add the internal router:

```python
from app.api.v1.endpoints import auth, students, academic, fees, payments, internal

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(students.router)
api_router.include_router(academic.router)
api_router.include_router(fees.router)
api_router.include_router(payments.router)
api_router.include_router(internal.router)   # ← Add this line
```

---

## Step 3 — Add `INTERNAL_SECRET_KEY` to Config

Open `backend/app/core/config.py` and add to the Settings class:

```python
# ── n8n Internal Communication ───────────────────────────────
INTERNAL_SECRET_KEY: str    # Shared secret for n8n → FastAPI /internal/* endpoints
```

---

## Step 4 — Import Workflows Into n8n

Once n8n is running (Session 8 handles Docker setup):

1. Open n8n at `http://localhost:5678` (or via SSH tunnel on VPS)
2. Go to **Workflows → Import from File**
3. Import in order:
   - `n8n/workflows/01_payment_success.json`
   - `n8n/workflows/02_fee_reminder_blast.json`  
   - `n8n/workflows/03_daily_overdue_reminder.json`
4. **Activate** each workflow using the toggle (top right in the workflow editor)

---

## Step 5 — Set n8n Environment Variables

Copy the example and fill it in:

```bash
cp n8n/.env.example n8n/.env
```

Minimum required values:
```
SCHOOLPAY_INTERNAL_KEY=   # Must match FastAPI INTERNAL_SECRET_KEY exactly
TERMII_API_KEY=           # From Termii dashboard
PAYMENT_PAGE_URL=         # https://pay.schoolpay.ng (or localhost for dev)
```

---

## Step 6 — Test Each Workflow

### Test Workflow 1 (Payment Success)

After recording a cash payment in the dashboard, check:
1. n8n Executions tab — should show a successful run
2. SMS received on the guardian's phone
3. `notification_logs` table in Supabase — should have a new row

### Test Workflow 2 (Bulk Blast)

From the React dashboard (Session 6), click "Send Fee Reminder" on the debtor report.
Or test manually via curl:

```bash
curl -X POST http://localhost:5678/webhook/fee-reminder \
  -H "Content-Type: application/json" \
  -d '{
    "school_id": "your-school-uuid",
    "term_id": "your-term-uuid",
    "message_template": null
  }'
```

### Test Workflow 3 (Daily Cron)

Trigger it manually in n8n:
1. Open the workflow
2. Click **Test Workflow** (top right)
3. Check executions tab for results

---

## How the Data Flows

```
Bursar records cash payment
        ↓
FastAPI: POST /api/v1/payments/cash
        ↓
notify_payment_to_n8n() fires (non-blocking, 5s timeout)
        ↓
n8n: POST /webhook/payment-success
        ↓
n8n → FastAPI: GET /internal/student-contact/{id}
        ↓
n8n builds SMS + WhatsApp messages
        ↓
n8n → Termii: sends SMS
n8n → Termii: sends WhatsApp   (both in parallel)
        ↓
n8n → FastAPI: POST /internal/notification-log
```

---

## Message Examples

### Payment Receipt (Workflow 1)

**SMS:**
```
Dear Ngozi, payment of ₦50,000.00 received via Cash for Chukwuemeka Obi 
at Greenfield Academy. Receipt: RCP/2025/000047. 
Outstanding balance: ₦20,000.00 - SchoolPay
```

**WhatsApp:**
```
✅ Payment Confirmed

Dear Ngozi,

We have received a payment for Chukwuemeka Obi at Greenfield Academy.

💰 Amount Paid: ₦50,000.00
🧾 Receipt No: RCP/2025/000047
💳 Method: Cash

📋 Outstanding Balance: ₦20,000.00

This is an automated receipt from SchoolPay.
```

### Overdue Reminder — Gentle (1-7 days)
```
Dear Ngozi, a friendly reminder that Chukwuemeka Obi has an 
outstanding fee of ₦70,000.00 at Greenfield Academy. 
Pay: https://pay.schoolpay.ng/pay/abc123 - SchoolPay
```

### Overdue Reminder — Urgent (22+ days)
```
URGENT: Chukwuemeka Obi's fees at Greenfield Academy 
(₦70,000.00) are 28 days overdue. 
Immediate payment required: https://pay.schoolpay.ng/pay/abc123 - SchoolPay
```

---

## Important Design Decisions

**SMS never blocks payment confirmation.**  
`notify_payment_to_n8n()` has a 5-second timeout and catches all exceptions. If n8n is down, the payment still records. The parent just doesn't get an SMS immediately — n8n will retry when it's back up.

**n8n never queries Supabase directly.**  
All DB access goes through FastAPI `/internal/*` endpoints. This keeps RLS and school isolation logic in one place.

**WhatsApp runs in parallel with SMS, not after.**  
Both channels fire simultaneously. A parent may receive WhatsApp before SMS depending on network. That's fine.

**Urgency escalates automatically.**  
No school admin needs to remember to send "stronger" messages. The daily cron handles it: gentle at 3-7 days, firm at 8-21 days, urgent at 22+ days.

---

## What's Next

**Session 4 — Payment Engine:**
- Paystack initialize + webhook (payments.py already has this — Session 4 adds the parent payment page)
- PDF receipt generation
- Bank transfer proof upload

**Session 5 — (now complete as part of this session)**

**Session 6 — React Dashboard:**
- Bulk SMS blast button on debtor report
- Notification log view ("SMS sent to 47 parents")
