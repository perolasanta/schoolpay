# SchoolPay — Session 6: React Dashboard Setup Guide

## Prerequisites
- Node.js 18+ installed on your machine
- Your FastAPI backend running on port 8000

---

## Setup (One Time)

```bash
# 1. Extract the zip, enter the project folder
cd school-dashboard

# 2. Install dependencies (takes ~1 minute)
npm install

# 3. Start the dev server
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Project Structure

```
school-dashboard/
├── src/
│   ├── main.jsx              ← Entry point (don't touch)
│   ├── App.jsx               ← All routes defined here
│   ├── index.css             ← Design system (colours, fonts, tables)
│   │
│   ├── lib/
│   │   ├── api.js            ← Axios client + helper functions
│   │   └── auth.jsx          ← Login state management
│   │
│   ├── components/
│   │   ├── ui/index.jsx      ← Button, Input, Modal, StatCard, etc.
│   │   └── layout/AppLayout.jsx  ← Sidebar + topbar shell
│   │
│   └── pages/
│       ├── Login.jsx         ← /login
│       ├── Dashboard.jsx     ← /dashboard
│       ├── Students.jsx      ← /students
│       ├── Invoices.jsx      ← /invoices
│       ├── Payments.jsx      ← /payments  (cash + bank transfer)
│       ├── Debtors.jsx       ← /debtors   (bulk SMS blast)
│       ├── Approvals.jsx     ← /approvals (bank transfer queue)
│       └── PayPage.jsx       ← /pay/:token  (PUBLIC — no login)
│
├── index.html
├── vite.config.js
└── package.json
```

---

## Two Apps in One

This project serves **two different audiences**:

### Staff Dashboard (requires login)
URL: `app.schoolpay.ng`
- Login → Dashboard → Students → Invoices → Payments → Debtors → Approvals
- Protected routes — redirect to /login if not authenticated
- JWT token stored in localStorage, auto-attached to every API call

### Parent Payment Page (no login)
URL: `pay.schoolpay.ng/pay/{token}`
- Parent clicks their SMS link → opens this page
- Shows their child's invoice and fee breakdown
- Can pay online (Paystack) or submit bank transfer proof
- No account, no password — the token in the URL is the credential

In production, both URLs point to the same React build.
NGINX routes them to the same app, React Router handles the rest.

---

## How the Proxy Works

`vite.config.js` proxies `/api` requests to your FastAPI backend:

```
React (port 3000) → /api/v1/... → FastAPI (port 8000)
```

This means you don't need CORS configured during development.
In production, NGINX does the same proxying.

---

## For Each Page — What API Endpoints It Calls

| Page | Endpoints Used |
|------|----------------|
| Login | `POST /auth/login` |
| Dashboard | `GET /fees/invoices/summary`, `GET /payments/recent` |
| Students | `GET /students` |
| Invoices | `GET /academic/terms`, `GET /academic/classes`, `GET /fees/invoices`, `POST /fees/generate-invoices` |
| Payments | `GET /fees/invoices` (search), `POST /payments/cash`, `POST /payments/transfer`, `POST /uploads/payment-proof-staff/{id}` |
| Debtors | `GET /academic/terms`, `GET /fees/invoices`, `POST /sms/blast` |
| Approvals | `GET /payments/transfer/pending`, `POST /payments/transfer/approve`, `GET /uploads/payment-proof/{id}/signed-url` |
| PayPage | `GET /pay/{token}`, `POST /pay/{token}/paystack`, `GET /pay/{token}/status`, `POST /payments/transfer` (public), `POST /uploads/payment-proof/{id}` (public) |

---

## Build for Production

```bash
npm run build
```

This creates a `dist/` folder. Copy it to your VPS.
Session 8 (Docker + NGINX) will configure NGINX to serve it.

---

## Design System Quick Reference

### Colours (CSS variables in index.css)
| Variable | Value | Used For |
|----------|-------|----------|
| `--navy-950` | `#080e1a` | Page background |
| `--navy-900` | `#0d1526` | Cards, sidebar |
| `--navy-800` | `#121e36` | Inputs, elevated surfaces |
| `--gold-500` | `#d4a843` | Primary accent, amounts |
| `--gold-400` | `#e8c97a` | Lighter gold, links |
| `--success`  | `#22c55e` | Paid status, confirmations |
| `--danger`   | `#ef4444` | Unpaid, errors |
| `--warning`  | `#f59e0b` | Partial, cautions |

### Fonts
- **Headings:** Playfair Display (loaded from Google Fonts)
- **Body/UI:** DM Sans (loaded from Google Fonts)

### Reusable components (from `src/components/ui/index.jsx`)
```jsx
<Button variant="primary|secondary|danger|ghost|success" size="sm|md|lg" loading={bool}>
<Input label="..." error="..." />
<Select label="...">
<Modal title="..." onClose={fn} width={480}>
<StatCard label="..." value="..." icon={LucideIcon} />
<PageHeader title="..." subtitle="..." action={<Button>} />
<EmptyState icon="emoji" title="..." description="..." />
<Spinner size={20} />
```
