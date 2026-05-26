# Store Admin E2E Regression Scripts (Phase 4)

## Purpose
Phase 4 regression ensures the Store Admin order/payment flow is repeatable and self-diagnostic before any LINE OA/LIFF work.

## Ports (must match)
- Backend: http://127.0.0.1:8000
- Frontend (manual smoke): http://localhost:8080

## Setup
1) Copy `.env.e2e.example` → `.env.e2e.local` and fill values. Do **not** commit `.env.e2e.local`.
2) Required env:
   - E2E_BACKEND_URL (must be http://127.0.0.1:8000)
   - E2E_SUPABASE_URL
   - E2E_SUPABASE_ANON_KEY
   - E2E_EMAIL
   - E2E_PASSWORD
   - E2E_PRODUCT_ID (must exist for the E2E user/store via backend store-admin API)
   - Optional: E2E_PRODUCT_NAME, E2E_UNIT_PRICE (default 60), E2E_UNIT_COST (default 27)
3) Start backend:
   ```bash
   cd backend
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

## Scripts
- store-admin-order-flow.js — combined regression (health, auth, product precheck, create order/payment, slip submit, approve, transitions, log checks). Product preflight uses the backend store-admin menus endpoint with a bearer token (same path as the app) to avoid RLS false negatives from anon Supabase REST. Notification verification uses a service-role/admin-safe query for `line_notification_logs` (RLS-protected); anon/user REST can return empty arrays. It fails if `payment_approved` or `order_ready` logs are missing or if service-role env is unavailable.
- approve-payment.js — approve an existing payment (order/payment IDs required in env).
- status-transitions.js — advance order: preparing → ready → completed.
- check-logs.js — fetch status/notification logs via Supabase REST.
- mock-notify.js — create order/payment, approve, transitions (no items).
- mock-notify-with-item.js — create order with item, then approve and transition.

## Run combined regression
```bash
node scripts/e2e/store-admin-order-flow.js
```
The script outputs a JSON summary with preflight, flow, verification steps, and expectations.

## Failure codes (selected)
- PRECHECK_ENV_MISSING — required env missing
- PRECHECK_INVALID_BACKEND_URL — backend URL not http://127.0.0.1:8000
- PRECHECK_BACKEND_DOWN — backend not reachable
- PRECHECK_DB_DOWN — /health/db failed
- PRECHECK_AUTH_FAILED — Supabase auth failed
- PRECHECK_PRODUCT_NOT_FOUND — product id not found/inaccessible
- FLOW_CREATE_* / FLOW_SUBMIT_SLIP / FLOW_APPROVE_PAYMENT / FLOW_STATUS_TRANSITION_FAILED — main flow failures
- VERIFY_*_FAILED — verification failures (orders/payments/logs)

## Notes
- Scripts read from `.env.e2e.local` only; no hardcoded secrets.
- If env or backend is not ready, the combined script fails fast with a clear failure_code.
- Keep scripts untracked or commit separately as needed; never commit secrets.
