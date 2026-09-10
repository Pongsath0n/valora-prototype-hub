# HEALHOLIC — BACKEND CONTRACT V1 FREEZE CHECKPOINT REPORT

## Verdict

PASS — BACKEND CONTRACT V1 FROZEN

## 1. Git Reference

| Field | Value |
|---|---|
| Branch | `Healholic-graphic` |
| Freeze checkpoint | PENDING COMMIT |
| Canonical tag | `healholic-backend-v1` |

## 2. Cancellation

All cancellation-equivalent operations require Owner store role:

| Route | Cancellation path | Owner-only? |
|---|---|---|
| `PATCH /orders/{id}` (general) | `status=cancelled` or `status=voided` | YES |
| `PATCH /orders/{id}/status` | `status=cancelled` or `status=voided` | YES |
| `DELETE /orders/{id}` | always results in `cancelled` or `voided` | YES |
| `POST /orders/{id}/cancel` | canonical cancellation | YES |
| `POST /orders/{id}/cancel-atomic` | deprecated alias | YES |

Staff and Manager receive `403 owner_role_required` for all
cancellation-equivalent operations. Operational non-cancellation transitions
remain Staff+ (status-only route) or Manager+ (general route).

## 3. Customer Menu

Customer menu enforces: active + recipe-ready + strict-unit-compatible.
- `list_menu` filters by `is_product_customer_orderable`.
- `get_menu_item` returns `404 menu_item_not_available` for not-ready products.
- Addon readiness: active + max_quantity > 0 + recipe-ready + unit-compatible.
- Order creation readiness: enforced by `prepare_order_item_snapshot`.

## 4. Order Number

Visible format: `ORD-XXXXX` only (zero-padded to 5 digits).
- No fallback format.
- On generator/read failure: `HTTPException(500, order_number_generation_failed)`.
- Bounded collision retry (5 attempts) at caller level.
- `orders_store_order_no_unique` per-store constraint preserved.
- Kiosk: DB-side generation inside `create_and_finalize_kiosk_order_atomic`.

## 5. Self-Order

- `order_source = 'web_order'`
- `status = 'pending_payment'`
- `payment_status = 'unpaid'`
- `customer_name` required, `customer_phone` optional, `note` optional.
- No payment row on creation. No stock deduction on creation.

## 6. Kiosk

- Atomic create + finalize via `create_and_finalize_kiosk_order_atomic`.
- Order + items + payment + stock = ONE transaction.
- On failure: ROLLBACK ALL.
- `StockSyncFailedError` / `kiosk_order_stock_sync_failed` / partial-commit
  is LEGACY / NON-CANONICAL for V1 Kiosk.

## 7. Legacy Payment Flow

- `GET /api/customer/payment-instructions` — LEGACY / OUT OF V1 FRONTEND SCOPE
- `POST /api/customer/orders/status/slip` — LEGACY / OUT OF V1 FRONTEND SCOPE
- `GET /api/store-admin/payments` — LEGACY / OUT OF V1 FRONTEND SCOPE
- `POST /api/store-admin/payments/{id}/approve` — LEGACY / OUT OF V1 FRONTEND SCOPE
- `POST /api/store-admin/payments/{id}/reject` — LEGACY / OUT OF V1 FRONTEND SCOPE
- `POST /api/store-admin/payments/{id}/submit-slip` — LEGACY / OUT OF V1 FRONTEND SCOPE
- `GET /api/store-admin/payments/{id}/slip-preview` — LEGACY / OUT OF V1 FRONTEND SCOPE

Canonical V1 payment flow: self-order → wait for name → pay at counter →
Cash or Static PromptPay → Staff finalize-payment.
Frontend MUST NOT build customer slip-upload UI.

## 8. Realtime

- FastAPI does NOT emit Realtime push events.
- Supabase Realtime on `public.orders` is the approved invalidation transport.
- Design: Realtime INSERT/UPDATE → invalidation only → frontend refetches
  `/api/store-admin/orders/incoming`.
- Polling fallback: 15 seconds.
- Readiness: PENDING FRONTEND INTEGRATION VALIDATION.

## 9. Production Queue

- `GET /api/store-admin/orders` is a general store order list, NOT the
  canonical Production Queue.
- Sources: `web_order` + `kiosk` (paid/finalized operational orders).
- Canonical timestamp: `payments.confirmed_at`.
- FIFO: `confirmed_at ASC`.
- Source priority: NONE.
- Readiness: PARTIAL.

## 10. Error Contract

| Error | HTTP | Meaning |
|---|---|---|
| `order_number_generation_failed` | 500 | Backend could not safely generate canonical ORD-XXXXX order number. Do not expose DB internals. |
| `order_no_generation_exhausted` | 503 | 5 order_no collisions in self-order (caller-level retry exhausted). |

These are different errors.

## 11. Tests

| Metric | Value |
|---|---|
| Passed | 469 |
| Failed | 0 |
| Warnings | 23 |
| Docker errors (excluded) | 20 (environment-dependent, not regressions) |

## 12. Production Safety

- Production writes: NONE
- Production mutating RPC calls: NONE
- Production data changes: NONE
- SQL changes: NONE
- Database changes: NONE
- Frontend changes: NONE

## 13. Files in Freeze Checkpoint

**Modified (tracked):**
- `backend/app/api/customer.py`
- `backend/app/api/store_admin.py`
- `backend/app/services/cost_engine.py`
- `backend/app/services/order_numbers.py`
- `backend/app/tests/test_cost_engine.py`
- `backend/app/tests/test_kiosk_orders.py`
- `backend/app/tests/test_staff_cancellation.py`

**New (untracked):**
- `backend/BACKEND-CONTRACT-FREEZE-V1.md`
- `backend/BACKEND-CONTRACT-FREEZE-V1-REPORT.md`
- `backend/app/services/atomic_rpc.py`
- `backend/app/services/availability.py`
- `backend/app/services/readiness.py`
- `backend/app/services/usage_snapshot.py`
- `backend/app/tests/test_atomic_endpoints.py`
- `backend/app/tests/test_cancellation_bypass_p0.py`
- `backend/app/tests/test_cross_flow_05b1.py`
- `backend/app/tests/test_general_patch_cancellation_p0.py`
- `backend/app/tests/test_incoming_queue.py`
- `backend/app/tests/test_integration_05b.py`
- `backend/app/tests/test_kiosk_atomic.py`
- `backend/app/tests/test_menu_readiness_p0.py`
- `backend/app/tests/test_order_number_format_p0.py`
- `backend/app/tests/test_readiness.py`
- `backend/app/tests/test_self_order.py`
- `backend/app/tests/test_self_order_order_no.py`
- `backend/app/tests/test_usage_snapshot.py`
- `backend/sql/`

## 14. Final Recommendation

BACKEND CONTRACT V1 FROZEN — READY FOR FRONTEND EXISTING-CODE AUDIT

STOP.
