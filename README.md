# Valora / Brewway

**Status:** Valora v1 is closed as **Soft Launch Ready**.

Valora is a lightweight cafe operation and profit-planning system designed for small coffee shops and SME-style operations. The v1 scope focuses on making real order handling, payment review, cost awareness, stock intake, and LINE OA customer communication work together around one core engine: **Profit Planning**.

---

## Status

Valora v1 is closed as **Soft Launch Ready**.

- Feature Complete
- Ready for real-world controlled use by the owner/staff workflow

---

## Overview

Valora / Brewway is a lightweight cafe operation and profit-planning system. It is built for a small coffee shop / SME use case and is **not intended to become a full ERP in v1**.

The product helps an owner understand whether the shop is actually profitable by connecting daily orders, ingredient costs, recipes, and stock intake into a single planning view.

---

## Core Principle: Profit Planning First

The core product engine is **Profit Planning**. All supporting features exist only to make Profit Planning trustworthy and usable in real operations:

- Customer order flow
- Staff order/payment operation
- Owner dashboard
- Recipe/cost coverage
- Stock intake / purchase-derived cost baseline
- LINE OA order binding and notifications
- Basic reporting
- Storage and operational readiness

---

## v1 Feature Scope

| Feature | Status |
|---|---|
| Customer web ordering | Included |
| Pickup order flow | Included |
| Payment slip upload | Included |
| Staff payment review | Included |
| Staff order queue | Included |
| Order status management | Included |
| Owner dashboard | Included |
| Revenue KPI | Included |
| Profit Planning baseline | Included |
| Recipe completeness / cost coverage guard | Included |
| Stock Intake MVP | Included |
| Purchase-derived moving average cost support | Included |
| LINE OA webhook | Included |
| LINE link-token order binding | Included |
| LINE customer profile name sync | Included |
| LINE push notifications for important customer-value events | Included |
| Reject slip / cancel notification with customer-safe reason | Included |
| Customer display-name protection against mock/test placeholder names | Included |
| Supabase Storage for payment slips, menu images, and purchase receipts | Included |
| Health readiness endpoints | Included |
| Local and cloud smoke/e2e verification workflow | Included |

---

## What v1 Does Not Include

- Full POS workflow
- Full CRM
- LIFF / LINE Login
- Rich Menu automation
- Advanced analytics/reporting
- Automated database cleanup/export job
- Mobile polish for every page
- Production user manual with screenshots
- Advanced notification preferences
- Supabase Pro upgrade

---

## User Roles

| Role | Responsibilities |
|---|---|
| **Owner** | Management overview, dashboard, reports, planning, system readiness, oversight |
| **Staff** | Daily operations, order queue, payment review, order status updates, customer-facing fulfillment |
| **Customer** | Public ordering flow, slip upload, order status tracking |
| **System/Admin oversight** | Guarded system checks, audit logs, storage/health readiness |

---

## Main Workflows

1. **Customer places an order** via the public web ordering page.
2. **Customer uploads a payment slip** for staff verification.
3. **Staff reviews the payment slip** in the staff queue and approves or rejects it.
4. **Staff manages order status** through the queue (accepted, preparing, ready for pickup, completed).
5. **Owner reviews** the dashboard, revenue KPI, and profit planning baseline.
6. **Stock intake** records are added to keep purchase-derived moving average costs current.
7. **Recipe completeness guard** warns when a product cannot calculate its cost because ingredients or recipes are missing.

---

## LINE OA Integration

### LINE Notification Policy

LINE push notifications are sent **only** for:

- Payment approved / slip verified
- Ready for pickup
- Payment rejected
- Cancelled

LINE push notifications are **not** sent for:

- Accepted
- Preparing
- Completed
- Internal status syncs

### Message Content Rules

**For payment rejected and cancelled:**

- Do not include status URL
- Include customer-safe reason
- Include chat guidance
- Include urgent contact phone: `0847371089`

**For payment approved and ready for pickup:**

- Do not repeat total amount unnecessarily
- Keep message calm and customer-friendly

### LINE OA Scope

- LINE OA Messaging API only
- Rich Menu may link or trigger order flow depending on setup
- No LIFF in v1
- No LINE Login in v1
- No full CRM in v1

### Known LINE Limitation

If a customer opens `/order` directly from a URL or Rich Menu URI action, the system treats it as an anonymous web order and cannot know the LINE identity.

If the customer starts from a LINE webhook-generated link (`/order?line_link_token=...`), the order is bound to LINE identity and can sync the LINE display name.

---

## Storage Buckets

| Bucket | Visibility | Purpose |
|---|---|---|
| `payment-slips` | Private (signed URLs) | Customer payment slip images |
| `menu-images` | Public | Menu item images |
| `purchase-receipts` | Private (signed URLs) | Stock purchase receipt images |

---

## Environment Variables

### Storage

```bash
PAYMENT_SLIP_BUCKET=payment-slips
PAYMENT_SLIP_MAX_MB=5
MENU_IMAGE_BUCKET=menu-images
MENU_IMAGE_MAX_MB=5
PURCHASE_RECEIPT_BUCKET=purchase-receipts
PURCHASE_RECEIPT_MAX_MB=5
```

### LINE OA

```bash
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_SEND_MODE=live
LINE_WEBHOOK_ENABLED=true
LINE_PUSH_ENABLED=true
LINE_ORDER_URL=
LINE_STATUS_URL=
LINE_LINK_TOKEN_TTL_MINUTES=30
LINE_STORE_ID=
LINE_WEBHOOK_URL=
```

> Do not commit real secret values. Copy from `.env.example` and fill in locally.

### Supabase (required)

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Local Development

### Prerequisites

- Node.js v18+ and npm (frontend)
- Python 3.10+ (backend)
- Supabase project credentials

### Frontend

```bash
cd frontend
npm install

# Create frontend/.env from .env.example
npm run dev
# http://localhost:8080/
```

### Backend

```bash
cd backend
python -m venv .venv
./.venv/Scripts/Activate.ps1  # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt

# Create backend/.env from .env.example
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# http://127.0.0.1:8000
```

### Database Assets

- Active schema: `database/supabase.sql`
- Legacy archives: `database/archive/`
- `database/supabase.sql` is the single source of truth

### Utility Scripts

- `scripts/seed-owner-user.mjs` — seed owner profile (requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_PASSWORD`, `OWNER_EMAIL`)

---

## Testing

### Backend

```bash
cd backend
python -m compileall app
python -m pytest app/tests/test_line_notifications.py app/tests/test_customer_line_binding.py app/tests/test_store_admin_order_display.py
```

### Frontend

```bash
cd frontend
npm run build
```

### Local-First Testing Rule

All development and verification should run locally first:

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://localhost:8080/`

Cloud testing is deployment verification **after** local pass.

---

## Deployment

| Environment | URL |
|---|---|
| Backend local | `http://127.0.0.1:8000` |
| Frontend local | `http://localhost:8080/` |
| Backend production | `https://valora-prototype-hub-production.up.railway.app` |
| Frontend production | `https://valora-system-hub.vercel.app` |

- Frontend deploys from `frontend/` (Vercel or static hosting)
- Backend runs via `uvicorn app.main:app` from `backend/` (Railway / container)

---

## Health Checks

```powershell
Invoke-RestMethod https://valora-prototype-hub-production.up.railway.app/health/line-ready | ConvertTo-Json -Depth 10
Invoke-RestMethod https://valora-prototype-hub-production.up.railway.app/health/storage | ConvertTo-Json -Depth 10
```

---

## Database Cleanup and Retention Policy

### Do Not Clear Master Data

- products
- product_categories
- ingredients
- recipes
- product_addons
- product_addon_recipes
- ingredient_purchases
- sales_channels
- channel_prices
- customers (unless explicitly cleaning test/demo users)

### Clean Only Sales Transaction Data After Export

- orders
- order_items
- payments
- order_status_logs
- payment_status_logs
- line_notification_logs
- stock_movements (only where linked to order usage)
- payment slip files already exported

### Schedule

- Start with monthly export.
- If storage grows too fast, move to every 15 days.
- Target usage estimate: around 300 cups/month.
- Main Free Plan risk is storage from slip/receipt images, not database rows.
- Avoid auto-delete in v1; use manual export + cleanup.

---

## Known Limitations

Deferred to v1.1 or later:

- LIFF / LINE Login
- Rich Menu automation
- Full POS workflow
- Full CRM
- Advanced notification preferences
- Automated database cleanup/export job
- Full production user manual with screenshots
- Advanced analytics/reporting
- Mobile polish for every page
- Supabase Pro upgrade decision

---

## v1 Closure Statement

Valora v1 is closed. The system is **Soft Launch Ready** for real-world controlled use by the owner and staff workflow. It is not claimed to be perfect or fully enterprise production-ready.

Only blocker bugs should be fixed in v1. New features go to the v1.1 backlog.

---

## v1.1 Backlog / Suggested Next Phase

**v1 Stabilization / Soft Launch Monitoring**

- Monitor real order flow during soft launch
- Fix blocker bugs only
- Collect owner/staff feedback for v1.1 prioritization
- Evaluate Supabase Pro upgrade when storage or row limits approach
- Plan LIFF or LINE Login if customer binding friction is confirmed
- Rich Menu automation if staff request faster order triggers

---

## License

Copyright © 2026 Valora Hub. All rights reserved.
