# HEALHOLIC — BACKEND CONTRACT V1.1 ADDENDUM
## BE-ADD-01 — Staff Production Queue

## 0. Document Status

| Field | Value |
|---|---|
| Addendum version | V1.1 |
| Base freeze | `healholic-backend-v1` (commit `e56551d`) |
| Branch | `Healholic-graphic` |
| Addendum tag | `healholic-backend-v1.1` |
| Regression | `491 passed, 0 failed` (20 Docker-dependent tests excluded) |
| V1 modified? | NO — V1 remains frozen |
| Database changes | NONE |
| Production writes | NONE |

## 1. Purpose

This is a backward-compatible additive endpoint required by Frontend
integration. V1 remains frozen. V1.1 adds ONE Production Queue read
contract.

## 2. New Endpoint

### `GET /api/store-admin/orders/production` — Production Queue

**Auth:** Staff, manager, or owner (`_require_staff_or_above`).

Returns paid operational orders from canonical sources, ordered by
`payments.confirmed_at` ASC (oldest paid-ready order first).

**Filter:**
- `store_id` = resolved store
- `order_source` IN (`web_order`, `kiosk`)
- `payment_status` = `paid`
- `status` IN (`accepted`, `preparing`, `ready`)

**Excluded:**
- `pending_payment`, `waiting_payment_review`, `draft`
- `cancelled`, `voided`
- `completed`

**FIFO:**
- Canonical timestamp: `payments.confirmed_at`
- Ordering: `confirmed_at ASC`
- Source priority: NONE

**Response:**
```json
{
  "orders": [
    {
      "id": "...",
      "order_no": "ORD-00001",
      "order_number": "ORD-00001",
      "order_source": "web_order",
      "customer_name": "...",
      "customer_note": "...",
      "items": [...],
      "total_amount": 120.0,
      "status": "accepted",
      "payment_status": "paid",
      "payment_confirmed_at": "<iso>"
    }
  ],
  "store_id": "..."
}
```

## 3. Staff Visibility

Staff may receive `payment_confirmed_at` because it is an operational
queue timestamp.

Staff MUST NOT receive through this endpoint:
- `slip_url`, `slip_storage_path`, `slip_file_name`
- `confirmed_by`, `reject_reason`
- `total_cost`, `gross_profit`
- `unit_cost`, `line_cost`, `line_profit`, `option_cost_total`
- `_system`, `usage_breakdown`
- `cost_status` (stripped from item options via `mask_option_costs`)

## 4. Payment Cardinality

Canonical V1 atomic payment path produces one paid payment per order.
For deterministic FIFO selection when multiple paid payments exist, the
EARLIEST `confirmed_at` is used (the first time the order was confirmed
paid). This is consistent with the canonical FIFO contract.

Orders with no paid payment row having a non-null `confirmed_at` are
excluded (fail-closed).

## 5. Query Efficiency

- 1 order query (batched)
- 1 payment query (batched by order_ids)
- 1 order_items query (batched by order_ids)
- No N+1.

## 6. Production Queue Readiness

**READY** — after PQ01-PQ20 tests pass.

## 7. Frontend Route Readiness Matrix Update

| Frontend flow | Backend route | Status |
|---|---|
| Staff production queue | `GET /api/store-admin/orders/production` | READY |

## 8. Existing Contracts Unchanged

The following remain frozen and unmodified:
- `POST /api/customer/orders`
- `GET /api/store-admin/orders/incoming`
- `POST /api/store-admin/kiosk/orders`
- `POST /api/store-admin/orders/{id}/finalize-payment`
- `POST /api/store-admin/orders/{id}/cancel`
- Atomic SQL, stock logic, order-number logic, cancellation rules,
  recipe readiness, idempotency.

## 9. Database Changes

NONE — no SQL, no new table, no new column, no new index, no new RPC.

## 10. Tests

| Test | Description | Status |
|---|---|---|
| PQ01 | Staff can access | PASS |
| PQ02 | Manager can access | PASS |
| PQ03 | Owner can access | PASS |
| PQ04 | Non-member denied | PASS |
| PQ05 | web_order paid accepted included | PASS |
| PQ06 | kiosk paid accepted included | PASS |
| PQ07 | pending_payment excluded | PASS |
| PQ08 | unpaid excluded | PASS |
| PQ09 | cancelled/voided excluded | PASS |
| PQ10 | completed excluded | PASS |
| PQ11 | preparing included | PASS |
| PQ12 | ready included | PASS |
| PQ13 | FIFO uses payment_confirmed_at ASC | PASS |
| PQ14 | No source priority | PASS |
| PQ15 | Staff includes payment_confirmed_at | PASS |
| PQ16 | No slip/internal payment fields | PASS |
| PQ17 | _system stripped from item options | PASS |
| PQ18 | No financial cost/profit leakage | PASS |
| PQ19 | Empty queue → 200 with empty array | PASS |
| PQ20 | No N+1 query behavior | PASS |

STOP.
