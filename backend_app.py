from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import os
from supabase import create_client, Client

app = FastAPI(title="Valora Phase 1 API", version="0.1.0")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
DEFAULT_STORE_ID = "348544d2-9a2c-4ba4-8875-bc106fed752e"

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    supabase: Optional[Client] = None
else:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


class OrderItemIn(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    note: Optional[str] = None


class LineOrderIn(BaseModel):
    line_user_id: str
    line_display_name: str
    phone: Optional[str] = None
    pickup_time: str
    order_note: Optional[str] = None
    items: List[OrderItemIn]
    store_id: str = DEFAULT_STORE_ID


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/orders/line-oa")
def create_line_oa_order(payload: LineOrderIn):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase is not configured")

    products = supabase.table("products").select("id,name,base_price,base_cost").in_("id", [i.product_id for i in payload.items]).execute().data or []
    pmap = {p["id"]: p for p in products}
    if len(pmap) != len(payload.items):
        raise HTTPException(status_code=400, detail="Some products not found")

    order_items = []
    total_amount = total_cost = gross_profit = 0.0
    for it in payload.items:
        p = pmap[it.product_id]
        unit_price = float(p.get("base_price") or 0)
        unit_cost = float(p.get("base_cost") or 0)
        line_total = unit_price * it.quantity
        line_cost = unit_cost * it.quantity
        line_profit = line_total - line_cost
        total_amount += line_total
        total_cost += line_cost
        gross_profit += line_profit
        order_items.append({
            "product_id": it.product_id,
            "product_name_snapshot": p.get("name") or "Unknown",
            "quantity": it.quantity,
            "unit_price": unit_price,
            "unit_cost": unit_cost,
            "total_price": line_total,
            "total_cost": line_cost,
            "line_profit": line_profit,
            "note": it.note,
            "store_id": payload.store_id,
        })

    order_insert = {
        "store_id": payload.store_id,
        "order_type": "manual",
        "channel": "line_oa",
        "pickup_type": "pickup",
        "order_status": "pending_payment",
        "status": "pending_payment",
        "payment_status": "unpaid",
        "customer_line_user_id": payload.line_user_id,
        "customer_name": payload.line_display_name,
        "customer_phone": payload.phone,
        "pickup_time": payload.pickup_time,
        "order_note": payload.order_note,
        "total_amount": total_amount,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
    }

    order = supabase.table("orders").insert(order_insert).execute().data
    if not order:
        raise HTTPException(status_code=500, detail="Order insert failed")
    created = order[0]

    for oi in order_items:
        oi["order_id"] = created["id"]
    supabase.table("order_items").insert(order_items).execute()

    payment_insert = {
        "order_id": created["id"],
        "store_id": payload.store_id,
        "method": "transfer",
        "status": "pending",
        "amount": total_amount,
    }
    payment = supabase.table("payments").insert(payment_insert).execute().data

    return {"order": created, "payment": payment[0] if payment else None}


@app.post("/v1/admin/payments/{payment_id}/approve")
def admin_approve_payment(payment_id: str):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase is not configured")

    payment = supabase.table("payments").update({"status": "approved"}).eq("id", payment_id).execute().data
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    order_id = payment[0]["order_id"]
    order = supabase.table("orders").update({"payment_status": "paid", "order_status": "accepted", "status": "accepted"}).eq("id", order_id).execute().data

    supabase.table("audit_logs").insert({
        "entity_type": "order",
        "entity_id": order_id,
        "event_name": "order_accepted_after_payment_approved",
        "payload": {"payment_id": payment_id},
    }).execute()
    return {"payment": payment[0], "order": order[0] if order else None}
