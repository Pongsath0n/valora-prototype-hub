# Valora Phase 1 Manual API Test Flow

This guide validates the end-to-end Phase 1 transaction flow using the FastAPI backend.

## Prerequisites

- Backend is running: `uvicorn app.main:app --reload --port 8000` from `backend/`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- You have at least one valid `products.id` in store `348544d2-9a2c-4ba4-8875-bc106fed752e` if you want to use `product_id`

Set common env vars:

```bash
export API_BASE_URL=http://localhost:8000
export STORE_ID=348544d2-9a2c-4ba4-8875-bc106fed752e
```

---

## 1) Create / update LINE customer

```bash
curl -sS -X POST "$API_BASE_URL/api/customers/line" \
  -H 'Content-Type: application/json' \
  -d '{
    "store_id": "348544d2-9a2c-4ba4-8875-bc106fed752e",
    "line_user_id": "U_TEST_LINE_USER_001",
    "display_name": "Test Customer",
    "phone": "0800000000"
  }'
```

Save `customer_id` from response.

---

## 2) Create order

```bash
curl -sS -X POST "$API_BASE_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d '{
    "store_id": "348544d2-9a2c-4ba4-8875-bc106fed752e",
    "customer_id": "<customer_id>",
    "pickup_time": null,
    "customer_note": "Phase1 test"
  }'
```

Expected in order row:
- `order_type='manual'`
- `channel='line_oa'`
- `pickup_type='pickup'`
- `order_status='pending_payment'`
- `status='pending_payment'`
- `payment_status='unpaid'`

Save `order_id` from response.

---

## 3) Add order item

```bash
curl -sS -X POST "$API_BASE_URL/api/orders/<order_id>/items" \
  -H 'Content-Type: application/json' \
  -d '{
    "product_id": null,
    "product_name_snapshot": "Es-Yen 16oz",
    "quantity": 1,
    "unit_price": 65,
    "unit_cost": 28,
    "options": {"sweetness":"less","ice":"block_2"},
    "note": "Phase1 line order test"
  }'
```

Notes:
- Uses `quantity` (not `qty`)
- Uses trigger-calculated fields `total_price`, `total_cost`, `line_profit`

---

## 4) Get order detail

```bash
curl -sS "$API_BASE_URL/api/orders/<order_id>"
```

Expected totals after trigger update:
- `subtotal=65`
- `total_amount=65`
- `total_cost=28`
- `gross_profit=37` (if channel fee is 0)

---

## 5) Create payment slip

```bash
curl -sS -X POST "$API_BASE_URL/api/payments/upload-slip" \
  -H 'Content-Type: application/json' \
  -d '{
    "order_id": "<order_id>",
    "customer_id": "<customer_id>",
    "amount": 65,
    "slip_url": "https://example.com/slip-test.jpg",
    "slip_file_name": "slip.jpg",
    "slip_storage_path": "payment-slips/TEST/slip.jpg"
  }'
```

Expected after DB trigger sync:
- `orders.order_status='waiting_payment_review'`
- `orders.payment_status='pending_review'`

Save `payment_id` from response.

---

## 6) Approve payment

```bash
curl -sS -X PATCH "$API_BASE_URL/api/payments/<payment_id>/approve" \
  -H 'Content-Type: application/json' \
  -d '{"confirmed_by":"admin-phase1-test"}'
```

Expected:
- `payments.status='paid'`
- `orders.order_status='accepted'`
- `orders.status='accepted'`
- `orders.payment_status='paid'`

---

## 7) Mark order ready

```bash
curl -sS -X PATCH "$API_BASE_URL/api/orders/<order_id>/status" \
  -H 'Content-Type: application/json' \
  -d '{"order_status":"ready"}'
```

Expected:
- `orders.order_status='ready'`
- `orders.status='ready'`

---

## 8) Verify logs (SQL checks in Supabase SQL editor)

```sql
-- order status history
select *
from order_status_logs
where order_id = '<order_id>'
order by created_at asc;

-- payment status history
select *
from payment_status_logs
where payment_id = '<payment_id>'
order by created_at asc;

-- line notification attempts (optional in this flow)
select *
from line_notification_logs
where order_id = '<order_id>'
order by created_at desc;
```

Expected:
- `order_status_logs` contains transitions for payment and order flow
- `payment_status_logs` contains status progression including pending → paid
- `line_notification_logs` can be `pending/success/failed` depending on LINE env and whether `/api/line/push` is called
