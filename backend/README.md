# Valora Backend (Phase 1)

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Endpoints
- POST `/api/customers/line`
- GET `/api/menus?store_id=...&channel_id=...`
- POST `/api/orders`
- POST `/api/orders/{order_id}/items`
- GET `/api/orders/{order_id}`
- PATCH `/api/orders/{order_id}/status`
- POST `/api/payments/upload-slip`
- PATCH `/api/payments/{payment_id}/approve`
- PATCH `/api/payments/{payment_id}/reject`
- GET `/api/admin/orders`
- GET `/api/admin/payments/pending`
- POST `/api/line/push`

## Manual flow test example

```bash
# 1) upsert customer
curl -X POST http://localhost:8000/api/customers/line -H 'Content-Type: application/json' -d '{"store_id":"'$DEFAULT_STORE_ID'","line_user_id":"U123","display_name":"Demo User","phone":"0812345678"}'

# 2) create order
curl -X POST http://localhost:8000/api/orders -H 'Content-Type: application/json' -d '{"store_id":"'$DEFAULT_STORE_ID'","customer_id":"<customer_id>","pickup_time":null,"customer_note":"no sugar"}'

# 3) add item
curl -X POST http://localhost:8000/api/orders/<order_id>/items -H 'Content-Type: application/json' -d '{"product_id":"<product_id>","product_name_snapshot":"Latte","quantity":1,"unit_price":80,"unit_cost":40}'

# 4) upload slip
curl -X POST http://localhost:8000/api/payments/upload-slip -H 'Content-Type: application/json' -d '{"order_id":"<order_id>","customer_id":"<customer_id>","amount":80,"slip_url":"https://example.com/slip.jpg"}'

# 5) approve
curl -X PATCH http://localhost:8000/api/payments/<payment_id>/approve -H 'Content-Type: application/json' -d '{"confirmed_by":"admin@valora"}'
```


## Run full Phase 1 manual API flow test

Use the dedicated test guide:

```bash
cat ../docs/phase1-api-test.md
```

Recommended run order:
1. Start backend (`uvicorn app.main:app --reload --port 8000`)
2. Execute each curl step from `docs/phase1-api-test.md`
3. Validate order/payment status transitions and log tables
