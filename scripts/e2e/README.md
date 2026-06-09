# Store Admin E2E Regression Scripts (Phase 4)

## Purpose
Phase 4 regression ensures the Store Admin order/payment flow is repeatable and self-diagnostic before any LINE OA/LIFF work.

## Ports (must match)
- Backend: http://127.0.0.1:8000
- Frontend (manual smoke): http://localhost:8080

## Setup
1) Copy `.env.e2e.example` → `.env.e2e.local` and fill values. Do **not** commit `.env.e2e.local`.
2) Local-first defaults (all scripts load them through `scripts/e2e/env.mjs`):
   - `BACKEND_URL=http://127.0.0.1:8000`
   - `FRONTEND_URL=http://localhost:8080/`
   - `OWNER_TOKEN`, `STAFF_TOKEN`: Supabase `access_token` copied from browser devtools after local login (owner/staff accounts listed below)
   - `ADMIN_TOKEN`: optional; falls back to `OWNER_TOKEN`
   - `TEST_STORE_ID`, `CUSTOMER_PRODUCT_ID`: see known values below
   - Never store production URLs or tokens in `.env.e2e.local`. For cloud verification, override via shell (e.g. `E2E_ENVIRONMENT=cloud BACKEND_URL=…`).
3) Legacy E2E variables (`E2E_BACKEND_URL`, `E2E_PRODUCT_ID`, etc.) remain supported but are now fallbacks only.
4) Start backend:
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
- All scripts share `scripts/e2e/env.mjs`, which enforces local-first URLs unless `E2E_ENVIRONMENT=cloud` or explicit overrides are provided.
- Shell env always overrides `.env.e2e.local`; nothing uses `override: true`.
- Token summaries are masked automatically; on `/api/store-admin/me` 401 responses the scripts advise refreshing tokens.
- If env or backend is not ready, scripts fail fast with descriptive codes (MISSING_ENV, LOCAL_FIRST_VIOLATION, BACKEND_UNREACHABLE, etc.).
- Keep `.env.e2e.local` gitignored and never commit real secrets.
