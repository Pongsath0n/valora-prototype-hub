# HEALHOLIC — BACKEND CONTRACT FREEZE V1

> **Canonical source of truth for frontend integration.**
> Code is the current contract. This document reflects the actual implementation
> at HEAD `c1d43c25` on branch `Healholic-graphic`. If code and this document
> differ, the CODE is authoritative and the discrepancy must be reported.

---

## 0. Document Status

| Field | Value |
|---|---|
| Freeze version | V1 |
| Branch | `Healholic-graphic` |
| Freeze checkpoint | PENDING COMMIT |
| Canonical tag | `healholic-backend-v1` |
| Regression | `469 passed, 0 failed` (20 Docker-dependent integration tests excluded) |
| P0-1 (cancellation bypass) | FIXED — Owner-only for cancelled/voided via PATCH /orders/{id}, PATCH /orders/{id}/status, DELETE /orders/{id} |
| P0-2 (menu readiness) | VERIFIED — menu already filters by recipe readiness; tests M01-M07 added |
| Order number format | FIXED — fallback ORD-<timestamp>-<hex> removed; generator raises HTTPException(500) on failure |
| Production writes | NONE |
| Production mutating RPC calls | NONE |
| Production data changes | NONE |
| Backend code changes | P0-1 cancellation bypass fix + order number format fix |
| Frontend changes during freeze | NONE |
| Database changes during freeze | NONE |

---

## 1. Application Identity & Router Prefixes

The FastAPI application is created in `backend/app/main.py` with `title="Valora Backend"`.
This is a legacy naming discrepancy: the product is **Healholic** but the backend
process is still named **Valora Backend**. Frontend must not rely on the app title
for product branding.

Router prefixes (authoritative):

| Router | Prefix | Module |
|---|---|---|
| health | (none — root) | `app/api/health.py` |
| line | `/api/line` | `app/api/line.py` |
| customer | `/api/customer` | `app/api/customer.py` |
| store-admin | `/api/store-admin` | `app/api/store_admin.py` |
| system | `/api/system` | `app/api/system_console.py` |

> **CRITICAL:** The staff/owner/kiosk API surface is mounted at **`/api/store-admin`**,
> NOT `/api/store`. The frontend already calls `/api/store-admin/...` (see
> `frontend/src/services/storeAdminApi.ts`). This is consistent.

CORS (`main.py`):
- `allow_origins` = configured `CORS_ALLOWED_ORIGINS` or local defaults
  (`localhost:5174`, `localhost:8080`, `localhost:8000` and 127.0.0.1 variants)
- `allow_credentials = False`
- `allow_methods = ["*"]`
- `allow_headers = ["*"]`

Root route `GET /` returns `{"app":"Valora Backend","status":"running","docs":"/docs","health":"/health"}`.

---

## 2. Authentication & RBAC

### 2.1 Token extraction

All staff/system routes require `Authorization: Bearer <supabase_access_token>`.
The token is extracted by `_extract_token` (`store_admin.py:806`):
- Missing header → `401 missing_token`
- Malformed (not `Bearer <token>`) → `401 invalid_authorization_header`

The token is verified via `client.auth.get_user(token)` (`_get_user_id`, `store_admin.py:815`):
- Verification failure → `401 invalid_token`

Customer routes do NOT require authentication. They use `public_token` (per-order secret)
or `order_no + phone` for lookup.

### 2.2 Context resolution

`_get_ctx(authorization)` (`store_admin.py:2005`) returns:
- `client` — service-role Supabase client
- `user_id` — authenticated user id
- `profile` — row from `profiles` (id, email, full_name, role)
- `memberships` — rows from `store_members` (store_id, role)

`_get_system_ctx(authorization)` (`store_admin.py:1124`) = `_get_ctx` + `_require_owner_profile`.
Used by System Console.

### 2.3 Store resolution (`_resolve_store_id`, `store_admin.py:875`)

1. If `DEFAULT_STORE_ID` is configured (canonical store), it is the default
   requested store when no `store_id` query param is supplied.
2. The requested store id must appear in the user's `store_members` rows.
3. Foreign or non-member store → `403 store_access_denied` (fail-closed).
4. No canonical store configured and no store id supplied → legacy
   single-membership fallback (first membership). Not used in Healholic V1
   (DEFAULT_STORE_ID is expected to be set).

### 2.4 Role sets (`store_admin.py:125-129`)

| Constant | Members | Meaning |
|---|---|---|
| `_BUSINESS_ROLES` | owner, admin, manager | Managerial / business-insights access |
| `_MANAGERIAL_ROLES` | = `_BUSINESS_ROLES` | Alias |
| `_OPERATOR_ROLES` | owner, admin, manager, staff | Operational store access |
| `_PAYMENT_REVIEW_ROLES` | = `_OPERATOR_ROLES` | Payment queue review |

Role normalization: `_normalize_store_role` lowercases and trims.

### 2.5 RBAC helpers

| Helper | Allows | Denies with |
|---|---|---|
| `_require_staff_or_above` | owner, admin, manager, staff | `403 insufficient_role` |
| `_require_manager` | owner, admin, manager | `403 insufficient_role` |
| `_require_business_role` | owner, admin, manager | `403 insufficient_role` |
| `_require_owner_store_role` | owner only | `403 owner_role_required` |
| `_require_owner_profile` (System Console) | profile.role in {owner, admin} | `403 owner_role_required` |
| `_ensure_staff_can_manage_payments` | owner, admin, manager, staff | `403 insufficient_role` |

> The `admin` profile role is the canonical System Console operator. The
> `owner` profile role retains System Console access. No other profile role
> may enter System Console.

### 2.6 Staff financial masking

When `role == "staff"`, responses are masked:
- `_mask_financial_fields` nulls `total_cost` and `gross_profit` on order rows.
- `_mask_order_item_fields` nulls `unit_cost`, `line_cost`, `line_profit`,
  `total_cost`, `option_cost_total` on item rows, drops `overhead_per_unit`,
  `net_profit_after_overhead_per_unit`, `direct_cost_per_unit`,
  `gross_profit_per_unit`, and runs `mask_option_costs` on `options`.
- `_mask_payment` drops `slip_url`, `slip_storage_path`, `slip_file_name`,
  `confirmed_by`, `confirmed_at`, `reject_reason` from payment rows.

---

## 3. Customer Self-Order Contract

Router: `/api/customer` (`app/api/customer.py`)

### 3.1 `POST /api/customer/orders` — Create self-order

**Auth:** None (public).

**Request model `CustomerOrderCreatePayload` (`customer.py:62`):**
```python
class CustomerPayload(BaseModel):
    name: str                      # REQUIRED
    phone: Optional[str] = None    # optional
    line_user_id: Optional[str] = None

class CustomerOrderItemPayload(BaseModel):
    product_id: str
    quantity: int
    options: Optional[Dict[str, Any]] = None

class CustomerOrderCreatePayload(BaseModel):
    customer: CustomerPayload
    items: List[CustomerOrderItemPayload]
    pickup_time: Optional[str] = None
    note: Optional[str] = None
    store_id: Optional[str] = None
    line_link_token: Optional[str] = None
```

**Validation (in order):**
1. Empty `items` → `400 order_items_required`
2. `pickup_time` (when supplied) must be ISO-parseable → else `400 pickup_time_invalid`
3. Blank `customer.name` → `400 customer_name_required`
4. `customer.phone` (when supplied) is normalized via `_normalize_phone`
5. Each item `quantity <= 0` → `400 quantity_positive`
6. Per-item: client `_system` is stripped (`strip_client_system`), then
   `prepare_order_item_snapshot` runs server-side pricing + cost + recipe validation.
   - Base recipe unit mismatch → `400 invalid_recipe_configuration`
   - Addon missing recipe → `400 addon_not_available`
   - Addon unit mismatch → `400 addon_not_available`
7. Server-generated `usage_breakdown` is embedded into `options._system`
   via `embed_usage_snapshot`. Failure → `400 invalid_recipe_configuration`.
8. Store resolution: first item's snapshot store_id wins; mismatched items →
   `400 store_mismatch`. No resolved store → `500 store_resolution_failed`.

**Created order fields (`customer.py:1355`):**
```python
{
  "store_id": resolved_store_id,
  "customer_id": customer_id,           # may be None if phone absent
  "order_type": "pickup",
  "pickup_type": "pickup",
  "pickup_time": pickup_time_raw,       # may be None
  "status": "pending_payment",
  "payment_status": "unpaid",
  "subtotal": subtotal,
  "total_amount": total_amount,         # = subtotal (no channel fee, no discount)
  "total_cost": total_cost,
  "gross_profit": gross_profit,
  "note": note or None,
  "order_no": generate_order_number(client),
  "public_token": _generate_public_token(),
  "customer_name": customer_name,
  "customer_phone": normalized_phone,   # may be None
  "order_source": "web_order",
}
```

**Order-number collision handling (`customer.py:1384`):**
- Bounded retry: max 5 attempts.
- `orders_store_order_no_unique` violation → regenerate `order_no`, retry.
- `orders_public_token_key` violation → regenerate `public_token`, retry (unbounded).
- `orders_pkey` violation → `500 customer_order_create_failed` (NOT an order_no retry).
- Unknown unique violation → try missing-column recovery, else `500 customer_order_create_failed`.
- Exhausted order_no attempts → `503 order_no_generation_exhausted`.

**Post-insert:**
- Order items inserted with server-built records (`build_order_item_record`).
- `recalculate_order_totals` re-runs.
- **NO payment row is created** (BE-FIX-02). The `finalize_paid_order_atomic`
  RPC creates the paid payment row when staff confirms cash/PromptPay.
- `order_status_logs` row written (best-effort).
- If `line_link_token` resolved a LINE customer, the token is marked used.

**Response (`customer.py:1462`):**
```json
{
  "order_id": "<uuid>",
  "order_no": "ORD-00001",
  "order_number": "ORD-00001",
  "public_token": "<32-byte url-safe>",
  "status": "pending_payment",
  "payment_status": "unpaid",
  "total_amount": 120.0,
  "pickup_time": null,
  "created_at": "<iso>",
  "customer_name": "<name>",
  "items": [
    {
      "product_id": "<uuid>",
      "product_name": "<name>",
      "quantity": 2,
      "unit_price": 60.0,
      "line_total": 120.0,
      "options": { /* _system and cost_status masked */ }
    }
  ]
}
```

> **No stock is consumed** during self-order creation. Stock is consumed
> only when staff finalize payment via `finalize_paid_order_atomic`.

### 3.2 `GET /api/customer/orders/status?token=<public_token>` — Status by token

**Auth:** None. Requires `token` query param = order's `public_token`.
- Missing token → `400 token_required`
- Unknown token → `404 order_not_found`

Returns `_build_customer_order_status_response` (`customer.py:867`):
```json
{
  "order_no": "ORD-00001",
  "order_status": "pending_payment",
  "payment_status": "unpaid",
  "pickup_time": null,
  "total_amount": 120.0,
  "created_at": "<iso>",
  "customer_name": "<name>",
  "items": [
    {"product_name": "...", "quantity": 2, "line_total": 120.0, "image_url": "..."}
  ],
  "payment": {
    "status": "pending",          // "pending" when no payment row exists
    "method": "transfer",
    "amount": 0.0,
    "slip_submitted": false,
    "last_submitted_at": null,
    "reject_reason": null,
    "can_upload_slip": true
  },
  "public_token": "<token>"
}
```

> Items in this response carry `product_name`, `quantity`, `line_total`,
> `image_url` only — no `options`, no `unit_price`, no cost data.

### 3.3 `GET /api/customer/orders/{order_id}?token=<token>&store_id=<optional>` — Order detail

**Auth:** None. Requires `token` query param matching the order's `public_token`.
- `order_id` not a UUID → `404 order_not_found`
- Missing token → `403 token_required`
- Token mismatch → `403 token_invalid`
- Unknown order → `404 order_not_found`

Returns `_order_response` (`customer.py:1109`):
```json
{
  "order_id": "<uuid>",
  "order_number": "ORD-00001",
  "status": "pending_payment",
  "payment_status": "unpaid",
  "total_amount": 120.0,
  "pickup_time": null,
  "created_at": "<iso>",
  "customer_name": "<name>",
  "items": [
    {"product_id": "...", "product_name": "...", "quantity": 2, "unit_price": 60.0, "line_total": 120.0}
  ]
}
```

> **LEGACY/INCONSISTENCY:** `GET /orders/{order_id}` returns `items` with
> `product_id`, `product_name`, `quantity`, `unit_price`, `line_total` but
> NO `options` and NO `image_url`. `GET /orders/status` returns `image_url`
> but NO `product_id`, NO `unit_price`, NO `options`. The two endpoints
> have **different item shapes**. Frontend must consume each endpoint's
> shape as-is. This is a documented legacy inconsistency, not a freeze blocker.

### 3.4 `POST /api/customer/orders/lookup` — Legacy lookup by order_no + phone

**Auth:** None.

**Request model `CustomerOrderLookupPayload` (`customer.py:74`):**
```python
class CustomerOrderLookupPayload(BaseModel):
    order_no: str
    phone: str
```

- Blank `order_no` or `phone` → `400 lookup_fields_required`
- Phone normalized via `_normalize_phone`.
- Looks up order by `order_no` AND `customer_phone`. Unknown → `404 order_not_found`.
- Returns the SAME `_build_customer_order_status_response` shape as `/orders/status`.

> **LEGACY:** This endpoint requires `phone`. Self-orders created without a
> phone cannot be looked up via this route. Use `/orders/status?token=...`
> or `/orders/{order_id}?token=...` for phone-less self-orders.

### 3.5 `GET /api/customer/payment-instructions` — Payment instructions

**Auth:** None. Returns config-driven payment instructions:
```json
{
  "enabled": true,
  "method_label": "โอนผ่านบัญชีธนาคาร",
  "bank_name": null,
  "account_name": null,
  "account_number": null,
  "promptpay_id": null,
  "note_lines": [],
  "allowed_file_types": ["image/jpeg", "image/png", "image/webp"],
  "max_file_mb": 5.0
}
```

### 3.6 `POST /api/customer/orders/status/slip` — Upload payment slip

**Auth:** None. `multipart/form-data` with `public_token` (form field) and `file` (file).

Flow (`customer.py:1556`):
1. Resolve order by `public_token`. Unknown → `404 order_not_found`.
2. `_ensure_payment_row` — creates a `pending` payment row with
   `method="transfer"` if none exists. (This is the ONLY path that creates
   a payment row on the customer side.)
3. `_is_payment_upload_allowed`:
   - Already paid → `409 payment_already_paid`
   - Under review with slip already submitted → `409 payment_under_review`
   - Allowed states: `pending`, `unpaid`, `rejected`
   - Otherwise → `409 payment_upload_not_allowed`
4. If `payment_instructions_enabled` is false → `403 payment_instruction_disabled`.
5. File validation: required, non-empty, ≤ `max_file_mb`, MIME in `allowed_file_types`.
   - Empty/missing file → `400 file_required`
   - Empty content → `400 empty_file`
   - Too large → `413 file_too_large`
   - Bad type → `400 file_type_not_allowed`
6. Upload to Supabase Storage (`payment-slips` bucket). Failure → `500 <error>`.
7. `_update_payment_after_upload`:
   - payment row → `status="pending_review"`, slip fields set, `submitted_at` set.
   - order row → `payment_status="pending_review"`, `status="waiting_payment_review"`.
   - `payment_status_logs` and `order_status_logs` written (best-effort).
8. Returns refreshed `_build_customer_order_status_response`.

> **Slip upload is the customer-side path into `waiting_payment_review`.**
> Staff then review and approve/reject via `/api/store-admin/payments/{id}/approve|reject`.

### 3.7 `GET /api/customer/menu` and `GET /api/customer/menu/{product_id}`

**Auth:** None. Optional `store_id` query param.

Store resolution (`_resolve_store_id`, `customer.py:293`):
- Supplied `store_id` must have products → else `404 store_not_found_or_empty`.
- No `store_id` + `DEFAULT_STORE_ID` set → use it; empty menu → `404 menu_not_available`.
- No `store_id` + no canonical → first store with products; none → `404 menu_not_available`.

Menu item shape (`_map_customer_menu_item`, `customer.py:322`):
```json
{
  "id": "<uuid>",
  "name": "...",
  "description": "...",
  "image_url": "...",
  "price": 60.0,
  "category": "...",
  "available": true,
  "allow_sweetness": true,
  "default_sweetness": 100,
  "addons": [
    {"addon_id": "...", "code": "...", "name": "...", "price": 10.0, "max_quantity": 3, "addon_type": "..."}
  ]
}
```

Addons are filtered by `is_addon_customer_selectable` (active + max_quantity > 0 +
recipe ready). **Products ARE filtered by recipe readiness** —
`list_menu` calls `batch_check_product_recipe_readiness` and only returns
products where `is_product_customer_orderable` is true (active + recipe-ready +
strict unit-compatible). `get_menu_item` returns `404 menu_item_not_available`
for products that are inactive or not recipe-ready. Readiness is also enforced
at order creation. The three surfaces (menu list, menu detail, order creation)
use the same canonical readiness logic from `app/services/readiness.py`.

---

## 4. Kiosk Contract

Router: `/api/store-admin` (`app/api/store_admin.py`)

### 4.1 `POST /api/store-admin/kiosk/orders` — Atomic kiosk order

**Status code:** `201 Created` on success.

**Auth:** Staff, manager, or owner (`_require_staff_or_above`).

**Request model `KioskOrderCreate` (`store_admin.py:676`):**
```python
class KioskOrderCustomer(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

class KioskOrderCreate(BaseModel):
    items: List[OrderItemPayload]
    payment_method: Literal["promptpay", "cash"]
    customer: Optional[KioskOrderCustomer] = None
    note: Optional[str] = None
    client_order_id: Optional[str] = None
```

**Flow (`store_admin.py:7690`):**
1. Resolve actor + store membership. Missing actor → `401 invalid_token`.
2. Validate `client_order_id`:
   - Required. Missing/blank → `400 kiosk_order_invalid_client_order_id`
   - Must be a valid UUID → else `400 kiosk_order_invalid_client_order_id`
   - Used as `orders.id` (PRIMARY KEY) — idempotency key.
3. `_sanitize_kiosk_order_items` — empty list → `400 items_required`.
4. `_ensure_kiosk_channel` — auto-creates a "Kiosk" sales channel if missing.
5. Per-item:
   - `_ensure_product_in_store` — product must belong to the store.
   - Strip client `_system`.
   - `prepare_order_item_snapshot` — server-side pricing/cost/recipe validation.
   - `embed_usage_snapshot` — embed `_system.usage_breakdown`. Failure →
     `400 invalid_recipe_configuration`.
6. `_validate_sale_configuration` — pre-persistence check that every snapshot
   has a valid base recipe (non-empty breakdown, ingredient_id present,
   quantity_used > 0) and valid addon breakdown. Failure →
   `400 kiosk_order_invalid_inventory_configuration:<sub_code>` where sub_code
   is one of: `missing_recipe`, `missing_ingredient_id`, `invalid_recipe_quantity`,
   `missing_addon_ingredient_id`, `invalid_addon_recipe_quantity`.
7. Resolve customer metadata: `_ensure_customer_record_for_kiosk` returns
   `(None, name or "Kiosk Customer", phone or None)`. No customer row is created.
8. Build trusted RPC item records (with `_system.usage_breakdown` in `options`).
9. Call `create_and_finalize_kiosk_order` RPC wrapper (`atomic_rpc.py:253`).

**RPC behavior (`public.create_and_finalize_kiosk_order_atomic`):**
- Generates race-safe `order_no` (DB-side `pg_advisory_xact_lock`).
- INSERTs order as `pending_payment` / `unpaid` / `order_source='kiosk'`.
- INSERTs order_items with embedded usage snapshots.
- Calls `finalize_paid_order_atomic` in the SAME transaction:
  - locks order, validates actor/store membership
  - validates usage snapshots
  - locks ingredients deterministically
  - validates sufficient stock
  - creates paid payment (`confirmed_at = DB now()`)
  - `apply_order_stock_usage` (stock movements + deduction)
- Returns committed result.
- Any failure rolls back the entire transaction (no order, items, payment, stock).

**Response — success (`store_admin.py:7884`):**
Returns `_map_created_order_with_items` (full order with items) plus:
```json
{
  ...order fields...,
  "stock_consumed": true,
  "order_no": "ORD-00001",
  "payment_id": "<uuid>",
  "confirmed_at": "<iso>",
  "idempotent_replay": false
}
```

**Response — idempotent replay (`already_finalized`, `store_admin.py:7859`):**
Same order shape plus:
```json
{
  ...order fields...,
  "idempotent_replay": true,
  "stock_consumed": true,
  "order_no": "...",
  "payment_id": "...",
  "confirmed_at": "..."
}
```

**Error mappings from `AtomicRPCError` (`atomic_rpc.py:43-63`):**

| RPC reason | HTTP status |
|---|---|
| `store_id_required`, `order_id_required`, `actor_id_required`, `client_order_id_required`, `items_required`, `invalid_payment_method` | 400 |
| `order_not_found_for_store` | 404 |
| `actor_not_member_of_store` | 403 |
| `ambiguous_payment_state`, `inconsistent_paid_payment_state`, `invalid_order_status_for_finalization`, `invalid_payment_status_for_finalization`, `invalid_status_for_stock_return`, `insufficient_stock`, `idempotency_conflict` | 409 |
| `order_has_no_items`, `usage_snapshot_missing`, `usage_snapshot_empty` | 400 |
| `ingredient_not_found_for_store` | 500 |
| `rpc_exception` | 503 |
| `rpc_error` (unmapped) | 500 |

Error body shape: `{"code": "<reason>", "message": "<detail>"}` (passed as `detail`).

**Idempotency conflict (`idempotency_conflict`):**
```json
{"code": "idempotency_conflict", "order_id": "...", "order_no": "..."}
```
HTTP 409.

> **Note:** `_handle_idempotent_replay` and `_classify_existing_order`
> (`store_admin.py:7898`, `1646`) exist for client-side classification of
> duplicate `client_order_id` but are NOT currently invoked from the
> `create_kiosk_order` route — the RPC returns `already_finalized` or
> `idempotency_conflict` directly. These helpers are reserved for
> future client-driven replay classification.

---

## 5. Incoming Queue

### 5.1 `GET /api/store-admin/orders/incoming` — Staff incoming queue

**Auth:** Staff, manager, or owner (`_require_staff_or_above`).

**Query params:** `store_id` (optional; resolved via `_resolve_store_id`).

**Filter (`store_admin.py:7407`):**
- `store_id` = resolved store
- `status = 'pending_payment'`
- `payment_status = 'unpaid'`
- `order_source = 'web_order'` (only if `orders.order_source` column exists)
- Sort: `created_at ASC` (oldest first)

**Response:**
```json
{
  "orders": [
    {
      "id": "<uuid>",
      "order_no": "ORD-00001",
      "order_number": "ORD-00001",
      "customer_name": "...",
      "customer_note": "...",
      "items": [
        {
          "id": "<uuid>",
          "product_id": "...",
          "product_name": "...",
          "quantity": 2,
          "unit_price": 60.0,
          "line_total": 120.0,
          "total_price": 120.0,
          "options": { /* _system stripped */ }
        }
      ],
      "total_amount": 120.0,
      "created_at": "<iso>",
      "status": "pending_payment",
      "payment_status": "unpaid",
      "order_source": "web_order"
    }
  ],
  "store_id": "<uuid>"
}
```

> Items are staff-safe: `_system` is stripped from `options`; no cost/profit
> fields. The 15-minute waiting warning is frontend-derived from `created_at`.

**Polling/Realtime contract:**
- Suitable for 15-second polling (canonical fallback).
- FastAPI does NOT emit Realtime push events. However, Supabase Realtime
  on `public.orders` is the approved invalidation transport design:
  Realtime INSERT/UPDATE → invalidation only → frontend refetches
  `/orders/incoming`. Realtime is NOT a separate data payload.
- Realtime readiness: PENDING FRONTEND INTEGRATION VALIDATION (see section 16).
- Frontend polling fallback: poll `/orders/incoming` every 15 seconds.

---

## 6. Production Order Queue (Staff Order List)

> **NOTE:** `GET /api/store-admin/orders` is a **general store order list**,
> NOT automatically the canonical Production Queue. Production Queue V1
> contract: sources = `web_order` + `kiosk` (paid/finalized operational
> orders), canonical timestamp = `payments.confirmed_at`, FIFO =
> `confirmed_at ASC`, source priority = NONE. Backend Production Queue
> readiness: **PARTIAL** — until Frontend integration proves the existing
> response contains sufficient canonical payment data for safe
> filtering/sorting, or a future backend endpoint is approved.

### 6.1 `GET /api/store-admin/orders` — List all store orders

**Auth:** Staff, manager, or owner.

Returns all orders for the store (no status filter). Staff see masked financial
fields. Each order includes `items`, `latest_payment`, customer/channel names.

### 6.2 `GET /api/store-admin/orders/{order_id}` — Order detail

**Auth:** Staff, manager, or owner. Staff see masked financial fields.

### 6.3 `PATCH /api/store-admin/orders/{order_id}` — Update order (manager+)

**Auth:** Manager or above (`_require_manager`).
- **P0-1 (G-audit) CANCELLATION BYPASS FIX:** If the request sets `status` to
  `cancelled` or `voided`, requires `_require_owner_store_role`. Staff and
  Manager receive `403 owner_role_required`. Non-cancellation manager
  functionality (note updates, status=preparing, etc.) is unchanged.
- Validates `_valid_order_transition` for status changes.
- `ready_for_pickup` is normalized to `ready`.
- `payment_status: "pending"` is normalized to `"pending_review"`.

### 6.4 `PATCH /api/store-admin/orders/{order_id}/status` — Status update (staff+)

**Auth:** Staff, manager, or owner.
- **P0-1 CANCELLATION BYPASS FIX:** Any transition to `cancelled` or `voided`
  requires `_require_owner_store_role`. Staff and Manager receive
  `403 owner_role_required`. This closes the cancellation bypass that
  previously allowed staff to cancel `pending_payment`/`draft` orders and
  managers to cancel any order via PATCH /status.
- Operational non-cancellation transitions remain Staff+:
  `accepted`, `preparing`, `ready`, `completed`.
- `ready_for_pickup` normalized to `ready`.
- The legacy `_staff_can_cancel_operational_order` helper still exists but
  is NO LONGER called from the route. Staff cancellation is fully blocked.

### 6.5 `DELETE /api/store-admin/orders/{order_id}` — Archive (owner only)

**Auth:** Owner store role only (`_require_owner_store_role`).
- **P0-1 CANCELLATION BYPASS FIX:** This route always results in `cancelled`
  or `voided`, making it cancellation-equivalent. Changed from manager+ to
  owner-only to match the frozen product contract.
- Sets status to `voided` (if has confirmed payment or was completed) or `cancelled`.
- Idempotent for already-archived orders.

### 6.6 `POST /api/store-admin/orders` — Manual order creation (manager+)

**Auth:** Manager or above. Legacy manual order flow (not kiosk, not self-order).
Does NOT embed usage snapshots and does NOT consume stock. Stock is consumed
only via `finalize_paid_order_atomic` later.

### 6.7 Order status transition table (`_valid_order_transition`, `store_admin.py:5346`)

| From | Allowed To |
|---|---|
| draft | pending_payment, cancelled |
| pending_payment | waiting_payment_review, accepted, cancelled |
| waiting_payment_review | accepted, pending_payment, cancelled |
| paid | accepted, cancelled |
| accepted | preparing, ready, completed, cancelled |
| preparing | ready, completed, cancelled |
| ready | completed, cancelled |
| ready_for_pickup | completed, cancelled |
| completed | (none) |
| cancelled | (none) |

> `ready_for_pickup` is normalized to `ready` on input. `completed` and
> `cancelled` are terminal.

### 6.8 Status normalization

- `normalize_order_status` (`store_admin.py:291`): trims/lowers; maps
  `ready_for_pickup` → `ready`.
- `normalize_payment_status` (`store_admin.py:298`): trims/lowers; maps
  `pending` → `pending_review`.
- `CANCELLED_ORDER_STATUSES` = `{"cancelled", "voided"}`.
- `CONFIRMED_PAYMENT_STATUSES` = `{"paid"}`.
- `PENDING_REVIEW_PAYMENT_STATUSES` = `{"pending_review"}`.

---

## 7. Cancellation Contract

### 7.1 `POST /api/store-admin/orders/{order_id}/cancel` — Canonical cancellation

**Auth:** Owner store role only (`_require_owner_store_role`).

**Request `OrderCancelPayload` (`store_admin.py:737`):**
```python
class OrderCancelPayload(BaseModel):
    reason: Optional[str] = None
```

**Behavior (`_cancel_order_business`, `store_admin.py:8217`):**

| Persisted status | Action | Result | HTTP |
|---|---|---|---|
| `cancelled` or `voided` | idempotent | `{"id":"...","status":"cancelled","result":"already_cancelled"}` | 200 |
| `pending_payment` | direct cancel, no stock return | `{"id":"...","status":"cancelled","result":"cancelled_unpaid","stock_returned":0}` | 200 |
| `accepted` | `cancel_accepted_order_atomic` RPC (stock return) | `{"id":"...","status":"cancelled","result":"...","stock_returned":N,"already_returned":M}` | 200 |
| `preparing`, `ready`, `ready_for_pickup`, `completed` | blocked | `{"code":"invalid_status_for_cancellation","status":"..."}` | 409 |
| other | rejected | `{"code":"invalid_status_for_cancellation","status":"..."}` | 400 |

### 7.2 `POST /api/store-admin/orders/{order_id}/cancel-atomic` — DEPRECATED alias

**Auth:** Owner store role only. Delegates to the same `_cancel_order_business`.
Contains NO separate business logic. Frontend MUST use `/cancel`.

---

## 8. Payment Finalization Contract

### 8.1 `POST /api/store-admin/orders/{order_id}/finalize-payment` — Atomic finalize

**Auth:** Staff, manager, or owner (`_require_staff_or_above`).

**Request `FinalizePaymentPayload` (`store_admin.py:745`):**
```python
class FinalizePaymentPayload(BaseModel):
    payment_method: Literal["cash", "promptpay"]
```

**Behavior (`store_admin.py:8347`):**
Calls `finalize_paid_order` wrapper → `public.finalize_paid_order_atomic` RPC.
The RPC:
- locks the order
- verifies actor store membership
- validates payment cardinality
- validates the persisted usage snapshot (`options._system.usage_breakdown`)
- checks stock availability
- creates/updates the payment row as `paid`
- consumes stock via `apply_order_stock_usage`

**Response:**
```json
{
  "id": "<order_id>",
  "order_id": "<order_id>",
  "status": "accepted",
  "payment_status": "paid",
  "result": "<rpc result>",
  "payment_id": "<uuid>",
  "payment_method": "cash" | "promptpay"
}
```

Idempotent: already accepted+paid returns `already_finalized`.

**Error mappings:** same table as Kiosk (section 4.1), via `AtomicRPCError`.

---

## 9. Payment Review Contract (Slip-based)

### 9.1 `GET /api/store-admin/payments` — Payment queue

**Auth:** Staff, manager, or owner (`_ensure_staff_can_manage_payments`).
Returns `{items: [...], payment_queue: [...], store_id}`. Staff see masked
payments (slip fields, confirmed_by/at, reject_reason dropped).
`payment_queue` includes payments with status `pending` or `pending_review`,
or orders with `payment_status=pending_review` or `status=waiting_payment_review`.

### 9.2 `POST /api/store-admin/payments/{payment_id}/submit-slip` — Staff slip submit

**Auth:** Staff, manager, or owner. Transitions payment `→ pending_review`,
order `→ waiting_payment_review`. Validates `_valid_payment_transition`.

### 9.3 `POST /api/store-admin/payments/{payment_id}/approve` — Approve

**Auth:** Staff, manager, or owner. Transitions payment `→ paid`, order `→ accepted`.
Sends LINE notification (`payment_approved`).

### 9.4 `POST /api/store-admin/payments/{payment_id}/reject` — Reject

**Auth:** Staff, manager, or owner. Transitions payment `→ rejected`.

### 9.5 `GET /api/store-admin/payments/{payment_id}/slip-preview` — Slip URL

**Auth:** Staff, manager, or owner. Returns a signed URL for the slip image.

### 9.6 `GET /api/store-admin/orders/{order_id}/payments` — Order payments

**Auth:** Staff, manager, or owner.

### 9.7 `POST /api/store-admin/orders/{order_id}/payments` — Create payment

**Auth:** Staff, manager, or owner. Legacy manual payment creation.

### 9.8 `PATCH /api/store-admin/payments/{payment_id}` — Update payment

**Auth:** Staff, manager, or owner.

### 9.9 `GET /api/store-admin/payments/export` — CSV export

**Auth:** Staff, manager, or owner. Staff get reduced column set.

> **NOTE:** The slip-review flow (customer uploads slip → `waiting_payment_review`
> → staff approve → `accepted`/`paid`) is a LEGACY/ALTERNATE flow to the
> `finalize-payment` atomic flow. Both paths can move an order to `accepted`/
> `paid`. The `finalize-payment` path is the canonical Healholic V1 path for
> cash/PromptPay at-counter confirmation. The slip path remains for
> bank-transfer slip review.

---

## 10. Stock, Recipe Readiness, and Units

### 10.1 Recipe readiness (`app/services/readiness.py`)

- Product is customer-orderable: `is_active=True` AND ≥1 valid recipe row.
- Addon is customer-selectable: `is_active=True` AND `max_quantity>0` AND
  ≥1 valid addon recipe row.
- A recipe row is valid: `ingredient_id` not null, `quantity_used>0`,
  referenced ingredient exists, belongs to same store, is active.
- **Unit contract (BE-FIX-02B):** recipe unit and ingredient unit must BOTH
  be present and match after normalization (trim + lowercase). No unit
  conversion exists. Any mismatch → fail closed (not orderable / max=0).
- If ANY recipe row has a unit mismatch, the product/addon is NOT orderable
  (prevents partial stock deduction).

### 10.2 Advisory availability (`app/services/availability.py`)

- `batch_product_max_producible` / `batch_addon_max_producible`: advisory
  max producible quantity from current stock. ADVISORY ONLY — does NOT
  reserve, lock, or mutate.
- Authoritative stock decision is inside `finalize_paid_order_atomic` →
  `apply_order_stock_usage`.
- `compute_item_max_producible`: combines base + addon usage per serving.
  Min capacity across all required ingredients wins.

### 10.3 Usage snapshot (`app/services/usage_snapshot.py`)

- Server-generated, embedded into `order_items.options._system.usage_breakdown`.
- This is the ONLY path that produces `_system.usage_breakdown`.
- Client-supplied `_system` is always stripped first (`strip_client_system`).
- Snapshot contract consumed by the RPC:
  ```
  options._system.usage_breakdown.base = [
    {"ingredient_id": uuid, "quantity_used": float, "unit": str}, ...
  ]
  options._system.usage_breakdown.addons = [
    {"ingredient_id": uuid, "addon_id": uuid, "quantity_used": float, "unit": str}, ...
  ]
  ```
- `quantity_used` is per unit of the order item (base) or per unit of addon.
  The RPC multiplies by `oi.quantity` and addon selected quantity.
- Fail-closed: any `unit_mismatch` in breakdown → `UsageSnapshotError`.
- `mask_system_from_options` strips `_system` for customer-facing responses.

### 10.4 Stock consumption (`app/services/stock_service.py`)

- `build_usage_plan`: aggregates usage per `(order_item_id, ingredient_id)`.
- `consume_for_paid_order`: calls `public.apply_order_stock_usage` RPC.
  Bounded retry (2 retries) for transient errors; the RPC is idempotent.
- `movement_type="used"`, `movement_reason="pos_sale"`.
- ONE "used" movement per `(store_id, order_item_id, ingredient_id)` —
  enforced by partial unique index `uq_stock_used_order_item_ingredient`.
- `StockSyncFailedError` → structured partial-commit response
  (`kiosk_order_stock_sync_failed`).

> **LEGACY / NON-CANONICAL FOR HEALHOLIC V1 KIOSK:** The
> `StockSyncFailedError` / `kiosk_order_stock_sync_failed` /
> partial-commit response path is a LEGACY helper retained for backward
> compatibility. The canonical Healholic V1 Kiosk flow uses
> `create_and_finalize_kiosk_order_atomic`, in which order + items +
> payment + stock are ONE atomic transaction. On failure: ROLLBACK ALL.
> Partial stock synchronization failure is NOT a possible result of the
> canonical V1 Kiosk endpoint. The legacy helper is NOT deleted.

### 10.5 Cost engine (`app/services/cost_engine.py`)

- `prepare_order_item_snapshot`: server-side pricing + cost + recipe validation.
  Rejects base recipe unit mismatch (`400 invalid_recipe_configuration`),
  addon missing recipe (`400 addon_not_available`), addon unit mismatch
  (`400 addon_not_available`).
- `build_order_item_record`: builds the trusted `order_items` row.
- `mask_option_costs`: strips `cost_status` from options for customer display.

---

## 11. Order Numbering

### 11.1 `generate_order_number` (`app/services/order_numbers.py:61`)

- Format: `ORD-XXXXX` (zero-padded to 5 digits, e.g. `ORD-00001`). This is
  the ONLY visible format. There is NO fallback format.
- Scans the 50 most recent orders, finds max sequence, +1.
- **On generator/read failure:** raises `HTTPException(500,
  order_number_generation_failed)`. The function NEVER returns a different
  visible format (the legacy `ORD-<timestamp>-<hex>` fallback has been removed
  to preserve the frozen V1 order_no contract).
- Constraint `orders_store_order_no_unique` is enforced per-store.
- Bounded collision retry (5 attempts) is handled at the caller level
  (customer.py), not in the generator.

### 11.2 Kiosk order numbers

- Generated DB-side inside `create_and_finalize_kiosk_order_atomic` using
  `pg_advisory_xact_lock` for race safety.
- Same `ORD-XXXXX` format.

### 11.3 Collision handling (self-order)

- Bounded 5-attempt retry on `orders_store_order_no_unique`.
- `orders_pkey` is NOT treated as an order_no collision.
- `orders_public_token_key` regenerates only the public token.
- Unknown unique violations fail in a controlled manner.

---

## 12. Public Token / Status Lookup

- `public_token`: 32-byte URL-safe random (`secrets.token_urlsafe(32)`),
  generated on order creation. Unique via `orders_public_token_key`.
- `GET /api/customer/orders/status?token=<public_token>` — primary lookup.
- `GET /api/customer/orders/{order_id}?token=<token>` — detail lookup.
- `POST /api/customer/orders/lookup` — legacy `order_no + phone` lookup.

---

## 13. Idempotency

### 13.1 Kiosk (`client_order_id`)

- `client_order_id` is the idempotency key, used as `orders.id` (PK).
- Must be a valid UUID.
- Duplicate confirm returns `already_finalized` (idempotent replay) or
  `idempotency_conflict` (existing order in unexpected state).
- The RPC transaction is atomic: any failure rolls back everything.

### 13.2 Stock usage

- `apply_order_stock_usage` is idempotent via
  `uq_stock_used_order_item_ingredient` partial unique index.
- Bounded retry (2 retries) for transient transport errors.

### 13.3 Stock return (cancellation)

- `cancel_accepted_order_atomic` is idempotent via
  `uq_stock_return_order_item_ingredient` (or equivalent) unique index.

### 13.4 Payment finalization

- `finalize_paid_order_atomic` returns `already_finalized` for already
  accepted+paid orders.

---

## 14. Hidden / Internal Fields

The following are NEVER exposed to customers and masked from staff:

| Field | Location | Masking |
|---|---|---|
| `options._system.usage_breakdown` | order_items.options | `mask_system_from_options` (customer); stripped in Incoming Queue |
| `options.cost_status` | order_items.options | `mask_option_costs` (customer); `mask_option_costs` in staff item masking |
| `total_cost`, `gross_profit` | orders | `_mask_financial_fields` (staff) |
| `unit_cost`, `line_cost`, `line_profit`, `total_cost`, `option_cost_total` | order_items | `_mask_order_item_fields` (staff) |
| `overhead_per_unit`, `net_profit_after_overhead_per_unit`, `direct_cost_per_unit`, `gross_profit_per_unit` | order_items | dropped in `_mask_order_item_fields` (staff) |
| `slip_url`, `slip_storage_path`, `slip_file_name`, `confirmed_by`, `confirmed_at`, `reject_reason` | payments | `_mask_payment` (staff) |

---

## 15. Error Contract

### 15.1 Standard error shape

FastAPI `HTTPException` with `detail`:
- String detail: `{"detail": "<code>"}` (most validation errors).
- Object detail: `{"detail": {"code": "...", "message": "..."}}` (atomic RPC errors).
- Object detail: `{"detail": {"code": "...", "order_id": "...", ...}}` (idempotency conflicts).

### 15.2 Common error codes

| Code | HTTP | Meaning |
|---|---|---|
| `missing_token` | 401 | No Authorization header |
| `invalid_authorization_header` | 401 | Malformed Bearer header |
| `invalid_token` | 401 | Supabase auth verification failed |
| `insufficient_role` | 403 | Role below required (staff/manager/business) |
| `owner_role_required` | 403 | Owner store role or owner/admin profile required |
| `store_access_denied` | 403 | Requested store not in user's memberships |
| `no_store_membership` | 403 | User has no store_members rows |
| `order_not_found` | 404 | Order not found (customer) |
| `order_items_required` | 400 | Empty items list (self-order) |
| `customer_name_required` | 400 | Blank customer name (self-order) |
| `quantity_positive` | 400 | Item quantity ≤ 0 |
| `pickup_time_invalid` | 400 | Bad pickup_time format |
| `invalid_recipe_configuration` | 400 | Base recipe unit mismatch / snapshot failure |
| `addon_not_available` | 400 | Addon missing recipe or unit mismatch |
| `kiosk_order_invalid_client_order_id` | 400 | Missing/invalid client_order_id |
| `kiosk_order_invalid_inventory_configuration:<sub>` | 400 | Pre-persistence sale config failure |
| `items_required` | 400 | Empty items (kiosk/RPC) |
| `invalid_payment_method` | 400 | payment_method not in {cash, promptpay} |
| `token_required` | 400/403 | Missing public_token (status: 400; detail: 403) |
| `token_invalid` | 403 | public_token mismatch |
| `payment_already_paid` | 409 | Slip upload on paid order |
| `payment_under_review` | 409 | Slip upload while under review with slip |
| `payment_upload_not_allowed` | 409 | Slip upload in disallowed state |
| `payment_instruction_disabled` | 403 | Slip upload while instructions disabled |
| `file_required` / `empty_file` | 400 | Slip file missing/empty |
| `file_too_large` | 413 | Slip file > max_file_mb |
| `file_type_not_allowed` | 400 | Slip file MIME not allowed |
| `invalid_status_transition` | 400 | Order status transition not allowed |
| `invalid_status_for_cancellation` | 409/400 | Cancel blocked (409) or invalid status (400) |
| `order_no_generation_exhausted` | 503 | 5 order_no collisions in self-order (caller-level retry exhausted) |
| `order_number_generation_failed` | 500 | Backend could not safely generate the canonical ORD-XXXXX order number. Do not expose DB internals. |
| `store_resolution_failed` | 500 | Could not resolve store |
| `customer_order_create_failed` | 500 | Order insert failed (non-retryable) |
| `rpc_exception` | 503 | Atomic RPC transport error |
| `rpc_error` | 500 | Unmapped RPC error |
| `insufficient_stock` | 409 | Not enough stock for finalization |
| `idempotency_conflict` | 409 | Duplicate client_order_id in unexpected state |
| `already_finalized` | 200 | Idempotent replay (finalize-payment/kiosk) |
| `already_cancelled` | 200 | Idempotent replay (cancel) |

### 15.3 Atomic RPC error reasons (`atomic_rpc.py:43`)

See section 4.1 table for the full RPC reason → HTTP status mapping.

---

## 16. Realtime & Polling

### 16.1 Realtime

- **FastAPI does NOT emit Realtime push events.** There is no server-side
  WebSocket/SSE/push code in the backend.
- **However, Healholic V1 architecture uses Supabase Realtime on
  `public.orders` as a potential/approved invalidation transport.** The
  design contract is: Realtime INSERT/UPDATE → invalidation only →
  frontend refetches `/api/store-admin/orders/incoming`. Realtime is NOT
  a separate data payload — it is a refetch trigger.
- **Realtime readiness: PENDING FRONTEND INTEGRATION VALIDATION.** Before
  frontend Realtime implementation, the following must be audited:
  - `public.orders` publication exists and includes INSERT/UPDATE events.
  - Authenticated subscription feasibility (anon key + RLS).
  - RLS/store scoping (frontend only receives events for its store).
  - Event payload contains enough to identify the store and order.
  - Frontend Supabase client configuration supports Realtime.
- Frontend `@supabase/realtime-js` is installed (in `package-lock.json`).
- `AuthContext.tsx` uses `listener.subscription.unsubscribe()` for auth
  state changes only — not order/payment Realtime.

### 16.2 Polling fallback (frontend)

- Incoming Queue: poll `/api/store-admin/orders/incoming` every 15 seconds.
  This is the canonical fallback when Realtime is not yet validated.
- PromptPay charge polling: `usePayment.ts` polls every 2000ms, max 30 polls
  (60 seconds) — this is frontend payment-gateway polling, NOT backend status
  polling.
- Customer status: frontend polls `/api/customer/orders/status?token=...`
  (interval is frontend-controlled; no backend-specified interval).

---

## 17. System Console (`/api/system`)

**Auth:** `_require_owner_profile` — profile.role in {owner, admin}.

### 17.1 Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/system/users` | List profiles + memberships |
| GET | `/api/system/audit-logs?limit=N` | Aggregated audit logs (orders, payments, line_notifications) |
| GET | `/api/system/roles` | List profile roles + store roles |
| PATCH | `/api/system/users/{user_id}/role` | Update profile role (protects last owner) |
| POST | `/api/system/store-members` | Create store membership (protects duplicates) |
| PATCH | `/api/system/store-members/{member_id}` | Update store member role (protects last store owner) |
| DELETE | `/api/system/store-members/{member_id}` | Delete store member (protects last store owner) |

### 17.2 Audit log shape

```json
{
  "status": "ok" | "partial" | "unavailable",
  "limit": 50,
  "buckets": {"orders": [...], "payments": [...], "line_notifications": [...]},
  "items": [...]
}
```

---

## 18. LINE Webhook (`/api/line`)

### 18.1 `POST /api/line/webhook`

- Validates `X-Line-Signature` against `LINE_CHANNEL_SECRET`.
- Missing signature → `401 missing_signature`; invalid → `401 invalid_signature`.
- Bad JSON → `400 invalid_json`.
- Supported event types: `follow`, `message`, `postback`, `unfollow`.
- Returns `200` with `{"status": "disabled", "reason": "..."}` if LINE is
  not configured (does NOT error).

---

## 19. Health (`/health`)

No auth. All return masked config status.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/health/db` | Supabase DB connectivity probe |
| GET | `/health/env` | Required env var status |
| GET | `/health/auth` | Supabase auth config status |
| GET | `/health/line-ready` | LINE messaging/LIFF/webhook readiness |
| GET | `/health/storage` | Storage bucket probes |

---

## 20. Full API Inventory

### 20.1 Customer (`/api/customer`) — no auth

| Method | Path | Auth |
|---|---|---|
| GET | `/api/customer/menu` | none |
| GET | `/api/customer/menu/{product_id}` | none |
| POST | `/api/customer/orders` | none |
| GET | `/api/customer/orders/status` | public_token |
| POST | `/api/customer/orders/lookup` | order_no + phone |
| GET | `/api/customer/orders/{order_id}` | public_token |
| GET | `/api/customer/payment-instructions` | none |
| POST | `/api/customer/orders/status/slip` | public_token (form) |

### 20.2 Store Admin (`/api/store-admin`) — Bearer token

| Method | Path | RBAC |
|---|---|---|
| GET | `/me` | any auth |
| GET/PUT | `/payment-settings` | staff+ |
| POST/DELETE | `/payment-settings/qr` | staff+ |
| GET/POST | `/channels` | staff+ |
| PATCH/DELETE | `/channels/{channel_id}` | staff+ |
| GET/PATCH | `/products/{product_id}/options` | staff+ |
| GET/POST | `/products/{product_id}/addons` | staff+ |
| PATCH/DELETE | `/addons/{addon_id}` | staff+ |
| GET/POST | `/addons/{addon_id}/recipes` | staff+ |
| PATCH/DELETE | `/addon-recipes/{recipe_id}` | staff+ |
| GET/POST | `/channel-pricing` | staff+ |
| PATCH/DELETE | `/channel-pricing/{price_id}` | staff+ |
| GET/POST | `/menus` | staff+ |
| POST | `/products/{product_id}/image` | staff+ |
| PATCH/DELETE | `/menus/{product_id}` | staff+ |
| GET/POST | `/ingredients` | staff+ |
| PATCH/DELETE | `/ingredients/{ingredient_id}` | staff+ |
| GET | `/stock-intakes` | staff+ |
| GET | `/stock-intakes/{intake_id}` | staff+ |
| GET/POST | `/ingredients/waste-records` | staff+ |
| GET | `/ingredients/waste-summary` | staff+ |
| POST | `/stock-intakes` | staff+ |
| POST | `/stock-intakes/{intake_id}/receipt` | staff+ |
| GET | `/stock-intakes/{intake_id}/receipt-url` | staff+ |
| GET/POST | `/recipes` | staff+ |
| PATCH/DELETE | `/recipes/{recipe_id}` | staff+ |
| POST/DELETE | `/customers/{customer_id}/bind-line` / `/unbind-line` | staff+ |
| GET | `/customers` | staff+ |
| GET/PATCH/DELETE | `/planning/overhead-expenses[/{id}]` | manager+ |
| GET/PATCH | `/planning/assumptions` | manager+ |
| GET | `/planning/baseline` | manager+ |
| GET | `/reports/sales` | manager+ |
| GET | `/reports/sales/export` | manager+ |
| GET | `/dashboard-summary` | manager+ |
| GET | `/orders/incoming` | staff+ |
| GET | `/orders` | staff+ |
| GET | `/orders/export` | staff+ |
| POST | `/orders` | manager+ |
| POST | `/kiosk/orders` | staff+ |
| GET | `/orders/{order_id}` | staff+ |
| PATCH | `/orders/{order_id}` | manager+ |
| DELETE | `/orders/{order_id}` | owner only (cancellation-equivalent) |
| PATCH | `/orders/{order_id}/status` | staff+ |
| POST | `/orders/{order_id}/cancel` | owner only |
| POST | `/orders/{order_id}/finalize-payment` | staff+ |
| POST | `/orders/{order_id}/cancel-atomic` | owner only (DEPRECATED) |
| GET/POST | `/orders/{order_id}/items` | manager+ (POST) / staff+ (GET) |
| PATCH/DELETE | `/order-items/{item_id}` | manager+ |
| GET | `/payments/{payment_id}/slip-preview` | staff+ |
| GET | `/payments` | staff+ |
| GET | `/payments/export` | staff+ |
| GET/POST | `/orders/{order_id}/payments` | staff+ |
| PATCH | `/payments/{payment_id}` | staff+ |
| POST | `/payments/{payment_id}/submit-slip` | staff+ |
| POST | `/payments/{payment_id}/approve` | staff+ |
| POST | `/payments/{payment_id}/reject` | staff+ |
| GET | `/inventory-alerts` | staff+ |

### 20.3 System (`/api/system`) — owner/admin profile

| Method | Path |
|---|---|
| GET | `/users` |
| GET | `/audit-logs` |
| GET | `/roles` |
| PATCH | `/users/{user_id}/role` |
| POST | `/store-members` |
| PATCH | `/store-members/{member_id}` |
| DELETE | `/store-members/{member_id}` |

### 20.4 LINE (`/api/line`) — no auth (signature-verified)

| Method | Path |
|---|---|
| POST | `/webhook` |

### 20.5 Health (root) — no auth

| Method | Path |
|---|---|
| GET | `/health`, `/health/db`, `/health/env`, `/health/auth`, `/health/line-ready`, `/health/storage` |

---

## 21. Frontend Route Readiness Matrix

| Frontend flow | Backend route | Status |
|---|---|---|
| Customer menu | `GET /api/customer/menu` | READY |
| Customer create order | `POST /api/customer/orders` | READY |
| Customer status (token) | `GET /api/customer/orders/status` | READY |
| Customer order detail | `GET /api/customer/orders/{id}` | READY (legacy item shape) |
| Customer lookup (legacy) | `POST /api/customer/orders/lookup` | READY (requires phone) |
| Customer payment instructions | `GET /api/customer/payment-instructions` | LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE |
| Customer slip upload | `POST /api/customer/orders/status/slip` | LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE |
| Staff incoming queue | `GET /api/store-admin/orders/incoming` | READY (poll 15s) |
| Staff order list | `GET /api/store-admin/orders` | READY |
| Staff order detail | `GET /api/store-admin/orders/{id}` | READY |
| Staff status update | `PATCH /api/store-admin/orders/{id}/status` | READY |
| Staff kiosk order | `POST /api/store-admin/kiosk/orders` | READY |
| Staff finalize payment | `POST /api/store-admin/orders/{id}/finalize-payment` | READY |
| Owner cancel | `POST /api/store-admin/orders/{id}/cancel` | READY |
| Owner cancel (legacy) | `POST /api/store-admin/orders/{id}/cancel-atomic` | DEPRECATED — use /cancel |
| Staff payment queue | `GET /api/store-admin/payments` | LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE |
| Staff approve payment | `POST /api/store-admin/payments/{id}/approve` | LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE |
| Staff reject payment | `POST /api/store-admin/payments/{id}/reject` | LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE |
| Staff submit slip | `POST /api/store-admin/payments/{id}/submit-slip` | LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE |
| Staff slip preview | `GET /api/store-admin/payments/{id}/slip-preview` | LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE |
| Manager dashboard | `GET /api/store-admin/dashboard-summary` | READY |
| Manager sales report | `GET /api/store-admin/reports/sales` | READY |
| Manager planning | `GET /api/store-admin/planning/baseline` | READY |
| System users | `GET /api/system/users` | READY |
| System audit logs | `GET /api/system/audit-logs` | READY |
| Realtime order push | (none) | PENDING FRONTEND INTEGRATION VALIDATION — use polling until validated |

> **LEGACY — OUT OF HEALHOLIC V1 FRONTEND SCOPE:** These backend endpoints
> remain available for backward compatibility but MUST NOT be used by the
> Healholic V1 frontend. The canonical V1 payment flow is: self-order →
> wait for name → pay at counter → Cash or Static PromptPay → Staff
> finalize-payment. Frontend MUST NOT build customer slip-upload UI or
> staff slip-review UI for V1.

---

## 22. Legacy / Deprecated / Not-Ready

### 22.1 Deprecated routes

| Route | Replacement | Notes |
|---|---|---|
| `POST /api/store-admin/orders/{id}/cancel-atomic` | `POST /api/store-admin/orders/{id}/cancel` | Delegates to same business function |

### 22.2 Legacy behaviors preserved

- `POST /api/customer/orders/lookup` requires `phone` (pre-BE-FIX-01 contract).
  Self-orders without phone cannot use this route.
- `GET /api/customer/orders/{id}` returns a different item shape than
  `GET /api/customer/orders/status` (no `options`/`image_url` vs. with
  `image_url` but no `options`).
- `POST /api/store-admin/orders` (manual order) does NOT embed usage
  snapshots and does NOT consume stock on creation. Stock is consumed
  only via `finalize_paid_order_atomic` later.
- `POST /api/store-admin/orders/{id}/payments` (manual payment create)
  is a legacy path separate from the atomic finalize flow.
- Slip-review flow (`submit-slip` → `approve`/`reject`) is a **LEGACY /
  OUT OF HEALHOLIC V1 FRONTEND SCOPE** alternate path to `finalize-payment`
  for bank-transfer slip review. Healholic V1 canonical flow is: self-order
  → wait for name → pay at counter → Cash or Static PromptPay → Staff
  finalize-payment. Frontend MUST NOT expose customer slip upload in V1.
- Application title is `"Valora Backend"` (legacy naming).
- `payment_status: "pending"` is normalized to `"pending_review"` on input.
- `status: "ready_for_pickup"` is normalized to `"ready"` on input.
- Missing-column recovery: many routes retry after dropping missing columns
  for forward-compatibility with older schemas.
- Customer status response may still contain legacy fields:
  `payment.method = "transfer"`, `can_upload_slip`. V1 Frontend MUST IGNORE
  these legacy fields. Do not use them to build payment UI.

### 22.3 Not implemented

- Backend Realtime push for orders/payments (use polling until Supabase
  Realtime on `public.orders` is validated for frontend integration).
- LIFF login flow (deferred from Phase H2-B; backend `line_login_*` config
  exists but no LIFF-specific routes).

### 22.4 Production Queue readiness: PARTIAL

`GET /api/store-admin/orders` is a **general store order list**, NOT
automatically the canonical Production Queue. Production Queue V1 contract:

- Sources: `web_order` + `kiosk` (paid/finalized operational orders).
- Canonical timestamp: `payments.confirmed_at`.
- FIFO: `confirmed_at ASC`.
- Source priority: NONE.

Backend Production Queue readiness: **PARTIAL** — until Frontend integration
proves the existing response contains sufficient canonical payment data for
safe filtering/sorting, or a future backend endpoint is approved.

---

## 23. Freeze Blockers

**NONE (after P0 blocker fix + pre-freeze-gate audit).**

P0-1 (cancellation bypass), P0-2 (menu readiness), and order number format
were identified during the freeze audit and pre-freeze gate, and have been fixed:

- **P0-1 FIXED (3 routes):** `PATCH /orders/{id}` (general update),
  `PATCH /orders/{id}/status` (status-only), and `DELETE /orders/{id}`
  (archive) now all require Owner store role for any transition to
  `cancelled` or `voided`. Staff and Manager receive `403 owner_role_required`
  for cancellation-equivalent operations. Operational non-cancellation
  transitions remain Staff+ (status-only route) or Manager+ (general route).
- **P0-2 VERIFIED:** Customer menu (`list_menu` and `get_menu_item`) already
  filter by recipe readiness using `app/services/readiness.py`. The freeze
  audit's initial finding was incorrect — the code was already correct.
  Tests M01-M07 verify this.
- **Order number format FIXED:** The legacy `ORD-<timestamp>-<hex>` fallback
  has been removed from `generate_order_number`. On generator/read failure,
  the function raises `HTTPException(500, order_number_generation_failed)`.
  The visible format is ALWAYS `ORD-XXXXX`. Tests N01-N04 verify this.

No remaining critical route ambiguity, contradictory contract, RBAC
inconsistency, missing P0 endpoint, indeterminate error contract, or
backend/database contradiction was found.

Documented legacy inconsistencies (sections 3.3, 22.2) are intentional
backward-compatibility behaviors, not freeze blockers. The frontend must
consume each endpoint's response shape as-documented.

---

## 24. Database RPCs (Frozen, Production-Installed)

| RPC | Purpose | Caller |
|---|---|---|
| `public.finalize_paid_order_atomic` | Atomic payment + stock finalization | `finalize_paid_order` wrapper |
| `public.cancel_accepted_order_atomic` | Atomic cancellation + stock return | `cancel_accepted_order` wrapper |
| `public.apply_order_stock_usage` | Stock consumption (idempotent) | `consume_for_paid_order` (called inside finalize RPC) |
| `public.create_and_finalize_kiosk_order_atomic` | Atomic kiosk order + payment + stock | `create_and_finalize_kiosk_order` wrapper |
| `public.generate_kiosk_order_no_atomic` | Race-safe order_no generation | Called inside kiosk RPC |

All RPCs are `SECURITY DEFINER`, `EXECUTE` restricted to `postgres`/`service_role`.
The frontend MUST NEVER call these RPCs directly.

---

## 25. Key Constraints (Frozen)

| Constraint | Purpose |
|---|---|
| `orders_pkey` | PK on orders.id |
| `orders_public_token_key` | Unique public_token |
| `orders_store_order_no_unique` | Unique (store_id, order_no) |
| `uq_stock_used_order_item_ingredient` | Idempotent stock use (partial unique index) |
| `uq_stock_return_order_item_ingredient` | Idempotent stock return (partial unique index) |

---

*End of Backend Contract Freeze V1.*
