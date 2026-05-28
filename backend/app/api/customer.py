import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from supabase import Client

from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customer", tags=["customer"])


class CustomerPayload(BaseModel):
    name: str
    phone: str
    line_user_id: Optional[str] = None


class CustomerOrderItemPayload(BaseModel):
    product_id: str
    quantity: int


class CustomerOrderCreatePayload(BaseModel):
    customer: CustomerPayload
    items: List[CustomerOrderItemPayload]
    pickup_time: str
    note: Optional[str] = None
    store_id: Optional[str] = None


def _get_client() -> Client:
    try:
        return get_supabase_admin_client()
    except SupabaseConfigurationError:
        raise HTTPException(status_code=500, detail="supabase_not_configured")
    except Exception:
        raise HTTPException(status_code=500, detail="supabase_client_error")


def _extract_missing_column(error: Any) -> Optional[str]:
    message = str(getattr(error, "message", error) or "")
    m = re.search(r'column\s+"([^"]+)"\s+does\s+not\s+exist', message, flags=re.IGNORECASE)
    if m:
        return m.group(1)
    m = re.search(r"find the '([^']+)' column", message, flags=re.IGNORECASE)
    if m:
        return m.group(1)
    return None


def _generate_order_number() -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    suffix = uuid4().hex[:4].upper()
    return f"ORD-{timestamp}-{suffix}"


def _try_select_products(client: Client, store_id: Optional[str], product_id: Optional[str] = None) -> List[Dict[str, Any]]:
    select_cols = "id, store_id, name, base_price, is_active, image_url, description, product_categories(name)"
    active_filter_enabled = True
    while True:
        query = client.table("products").select(select_cols)
        if store_id:
            query = query.eq("store_id", store_id)
        if product_id:
            query = query.eq("id", product_id).limit(1)
        if active_filter_enabled:
            query = query.eq("is_active", True)
        query = query.order("created_at", desc=False)
        resp = query.execute()
        err = getattr(resp, "error", None)
        if not err:
            return getattr(resp, "data", None) or []

        missing = _extract_missing_column(err)
        if missing == "is_active" and active_filter_enabled:
            active_filter_enabled = False
            continue
        if missing in {"image_url", "description"}:
            select_cols = "id, store_id, name, base_price, is_active, product_categories(name)"
            continue
        if missing == "is_active":
            select_cols = select_cols.replace(", is_active", "")
            continue
        if missing == "product_categories":
            select_cols = "id, store_id, name, base_price, is_active, image_url, description"
            continue

        message = str(getattr(err, "message", err))
        logger.error("customer_product_query_failed: %s", message)
        raise HTTPException(status_code=500, detail="customer_product_query_failed")


def _resolve_store_id(client: Client, requested_store_id: Optional[str]) -> str:
    if requested_store_id:
        rows = _try_select_products(client, requested_store_id)
        if rows:
            return requested_store_id
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="store_not_found_or_empty")

    rows = _try_select_products(client, None)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="menu_not_available")

    resolved = str(rows[0].get("store_id") or "").strip()
    if not resolved:
        raise HTTPException(status_code=500, detail="store_resolution_failed")
    return resolved


def _map_customer_menu_item(row: Dict[str, Any]) -> Dict[str, Any]:
    category_rel = row.get("product_categories") if isinstance(row, dict) else None
    category = category_rel.get("name") if isinstance(category_rel, dict) else None
    return {
        "id": str(row.get("id")),
        "name": row.get("name"),
        "description": row.get("description"),
        "image_url": row.get("image_url"),
        "price": float(row.get("base_price") or 0),
        "category": category,
        "available": bool(row.get("is_active", True)),
    }


def _find_or_create_customer(client: Client, store_id: str, payload: CustomerPayload) -> Optional[str]:
    name = str(payload.name or "").strip()
    phone = str(payload.phone or "").strip()
    line_user_id = str(payload.line_user_id or "").strip() or None

    if not name or not phone:
        return None

    try:
        lookup_resp = client.table("customers").select("id").eq("store_id", store_id).eq("phone", phone).limit(1).execute()
        lookup_err = getattr(lookup_resp, "error", None)
    except Exception as exc:
        lookup_err = exc
        lookup_resp = None
    if lookup_err:
        logger.warning("customer_lookup_failed: %s", getattr(lookup_err, "message", str(lookup_err)))
        return None
    existing_rows = getattr(lookup_resp, "data", None) or []
    if existing_rows:
        return str(existing_rows[0].get("id"))

    create_data: Dict[str, Any] = {
        "store_id": store_id,
        "display_name": name,
        "phone": phone,
        "line_user_id": line_user_id,
    }
    while True:
        try:
            create_resp = client.table("customers").insert(create_data).execute()
            err = getattr(create_resp, "error", None)
        except Exception as exc:
            create_resp = None
            err = exc
        if not err:
            rows = getattr(create_resp, "data", None) or []
            if not rows:
                raise HTTPException(status_code=500, detail="customer_create_failed")
            return str(rows[0].get("id"))
        missing = _extract_missing_column(err)
        if missing == "display_name" and "display_name" in create_data:
            create_data.pop("display_name", None)
            create_data["name"] = name
            continue
        if missing == "name" and "name" in create_data:
            create_data.pop("name", None)
            create_data["full_name"] = name
            continue
        if missing == "full_name" and "full_name" in create_data:
            create_data.pop("full_name", None)
            continue
        if missing and missing in create_data:
            create_data.pop(missing, None)
            continue
        logger.warning("customer_create_failed: %s", getattr(err, "message", str(err)))
        return None


def _insert_order_items(client: Client, store_id: str, order_id: str, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    payload_rows = [dict(x) for x in rows]
    while True:
        try:
            resp = client.table("order_items").insert(payload_rows).execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
        if not err:
            return
        missing = _extract_missing_column(err)
        if missing:
            changed = False
            for row in payload_rows:
                if missing in row:
                    row.pop(missing, None)
                    changed = True
            if changed:
                continue
        raise HTTPException(status_code=500, detail="customer_order_items_create_failed")


def _recalculate_order_totals(client: Client, store_id: str, order_id: str) -> None:
    query = client.table("order_items").select("quantity, unit_price, unit_cost").eq("order_id", order_id)
    query = query.eq("store_id", store_id)
    try:
        resp = query.execute()
        err = getattr(resp, "error", None)
    except Exception as exc:
        resp = None
        err = exc
    if err and _extract_missing_column(err) == "store_id":
        try:
            resp = client.table("order_items").select("quantity, unit_price, unit_cost").eq("order_id", order_id).execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
    if err:
        raise HTTPException(status_code=500, detail="customer_order_totals_recalc_failed")

    items = getattr(resp, "data", None) or []
    subtotal = 0.0
    total_cost = 0.0
    for item in items:
        qty = float(item.get("quantity") or 0)
        unit_price = float(item.get("unit_price") or 0)
        unit_cost = float(item.get("unit_cost") or 0)
        subtotal += qty * unit_price
        total_cost += qty * unit_cost

    total_amount = subtotal
    gross_profit = total_amount - total_cost

    update_data = {
        "subtotal": subtotal,
        "channel_fee": 0,
        "total_amount": total_amount,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
    }
    try:
        update_resp = client.table("orders").update(update_data).eq("id", order_id).eq("store_id", store_id).execute()
        update_err = getattr(update_resp, "error", None)
    except Exception as exc:
        update_resp = None
        update_err = exc
    if update_err and _extract_missing_column(update_err) == "channel_fee":
        fallback = {
            "subtotal": subtotal,
            "channel_fee_total": 0,
            "total_amount": total_amount,
            "total_cost": total_cost,
            "gross_profit": gross_profit,
        }
        try:
            update_resp = client.table("orders").update(fallback).eq("id", order_id).eq("store_id", store_id).execute()
            update_err = getattr(update_resp, "error", None)
        except Exception as exc:
            update_resp = None
            update_err = exc
    if update_err:
        raise HTTPException(status_code=500, detail="customer_order_totals_recalc_failed")


def _order_response(client: Client, store_id: str, order_id: str) -> Dict[str, Any]:
    order_cols = ["id", "order_no", "status", "payment_status", "total_amount", "pickup_time", "created_at", "customer_id"]
    while True:
        order_select = ", ".join(order_cols)
        try:
            order_resp = client.table("orders").select(order_select).eq("id", order_id).eq("store_id", store_id).limit(1).execute()
            order_err = getattr(order_resp, "error", None)
        except Exception as exc:
            order_resp = None
            order_err = exc
        if not order_err:
            break
        missing = _extract_missing_column(order_err)
        if missing and missing in order_cols:
            order_cols = [c for c in order_cols if c != missing]
            if not order_cols:
                raise HTTPException(status_code=500, detail="customer_order_lookup_failed")
            continue
        raise HTTPException(status_code=500, detail="customer_order_lookup_failed")
    order_rows = getattr(order_resp, "data", None) or []
    if not order_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
    order_row = order_rows[0]

    customer_name = None
    customer_id = order_row.get("customer_id")
    if customer_id:
        select_cols = "id, display_name, name, full_name"
        customer_resp = None
        c_err = None
        while True:
            try:
                customer_resp = (
                    client.table("customers")
                    .select(select_cols)
                    .eq("id", customer_id)
                    .eq("store_id", store_id)
                    .limit(1)
                    .execute()
                )
                c_err = getattr(customer_resp, "error", None)
            except Exception as exc:
                c_err = exc

            if not c_err:
                break

            missing = _extract_missing_column(c_err)
            if missing and missing in select_cols:
                select_cols = ", ".join([c.strip() for c in select_cols.split(",") if c.strip() != missing])
                if not select_cols:
                    c_err = None
                    break
                continue
            break

        if not c_err and customer_resp is not None:
            c_rows = getattr(customer_resp, "data", None) or []
            if c_rows:
                customer_name = c_rows[0].get("display_name") or c_rows[0].get("name") or c_rows[0].get("full_name")

    items: List[Dict[str, Any]] = []

    return {
        "order_id": str(order_row.get("id")),
        "order_number": order_row.get("order_no"),
        "status": order_row.get("status") or "pending_payment",
        "payment_status": order_row.get("payment_status") or "unpaid",
        "total_amount": float(order_row.get("total_amount") or 0),
        "pickup_time": order_row.get("pickup_time"),
        "created_at": order_row.get("created_at"),
        "customer_name": customer_name,
        "items": items,
    }


@router.get("/menu")
def list_menu(store_id: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    client = _get_client()
    store_id_resolved = _resolve_store_id(client, store_id)
    rows = _try_select_products(client, store_id_resolved)
    items = [_map_customer_menu_item(r) for r in rows if bool(r.get("is_active", True))]
    return {"items": items, "store_id": store_id_resolved}


@router.get("/menu/{product_id}")
def get_menu_item(product_id: str, store_id: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    client = _get_client()
    store_id_resolved = _resolve_store_id(client, store_id)
    rows = _try_select_products(client, store_id_resolved, product_id)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="menu_item_not_found")
    row = rows[0]
    if not bool(row.get("is_active", True)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="menu_item_not_available")
    return _map_customer_menu_item(row)


@router.post("/orders")
def create_customer_order(payload: CustomerOrderCreatePayload) -> Dict[str, Any]:
    if not payload.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_items_required")

    pickup_time = str(payload.pickup_time or "").strip()
    customer_name = str(payload.customer.name or "").strip()
    customer_phone = str(payload.customer.phone or "").strip()
    if not pickup_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pickup_time_required")
    if not customer_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer_name_required")
    if not customer_phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer_phone_required")
    try:
        datetime.fromisoformat(pickup_time.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pickup_time_invalid")

    client = _get_client()

    resolved_store_id = payload.store_id
    prepared_items: List[Dict[str, Any]] = []

    for item in payload.items:
        quantity = int(item.quantity or 0)
        if quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_positive")

        product_rows = _try_select_products(client, None, item.product_id)
        if not product_rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_not_found")
        product = product_rows[0]
        if not bool(product.get("is_active", True)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="product_not_available")

        product_store_id = str(product.get("store_id") or "").strip()
        if not product_store_id:
            raise HTTPException(status_code=500, detail="store_resolution_failed")

        if resolved_store_id and str(resolved_store_id) != product_store_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="store_mismatch")
        resolved_store_id = product_store_id

        unit_price = float(product.get("base_price") or 0)
        line_total = unit_price * quantity

        prepared_items.append(
            {
                "product_id": str(product.get("id")),
                "product_name": product.get("name"),
                "quantity": quantity,
                "unit_price": unit_price,
                "line_total": line_total,
            }
        )

    if not resolved_store_id:
        raise HTTPException(status_code=500, detail="store_resolution_failed")

    subtotal = sum(float(item.get("line_total") or 0) for item in prepared_items)
    total_amount = subtotal
    total_cost = 0.0
    gross_profit = total_amount

    customer_id: Optional[str] = None
    try:
        customer_id = _find_or_create_customer(client, resolved_store_id, payload.customer)
    except HTTPException as exc:
        logger.warning("customer_upsert_skipped: %s", exc.detail)
        customer_id = None

    order_data: Dict[str, Any] = {
        "store_id": resolved_store_id,
        "customer_id": customer_id,
        "order_type": "pickup",
        "pickup_type": "pickup",
        "pickup_time": pickup_time,
        "status": "pending_payment",
        "payment_status": "unpaid",
        "subtotal": subtotal,
        "total_amount": total_amount,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "note": str(payload.note or "").strip() or None,
        "order_no": _generate_order_number(),
    }
    while True:
        order_resp = client.table("orders").insert(order_data).execute()
        order_err = getattr(order_resp, "error", None)
        if not order_err:
            break
        missing = _extract_missing_column(order_err)
        if missing and missing in order_data:
            order_data.pop(missing, None)
            continue
        raise HTTPException(status_code=500, detail="customer_order_create_failed")

    order_rows = getattr(order_resp, "data", None) or []
    if not order_rows:
        raise HTTPException(status_code=500, detail="customer_order_create_failed")
    order_row = order_rows[0]
    order_id = str(order_row.get("id"))

    item_rows: List[Dict[str, Any]] = []
    for item in prepared_items:
        item_rows.append(
            {
                "store_id": resolved_store_id,
                "order_id": order_id,
                "product_id": item["product_id"],
                "product_name_snapshot": item["product_name"],
                "quantity": item["quantity"],
                "unit_price": item["unit_price"],
                "unit_cost": 0,
                "line_total": item["line_total"],
                "line_cost": 0,
                "line_profit": item["line_total"],
            }
        )
    _insert_order_items(client, resolved_store_id, order_id, item_rows)

    return {
        "order_id": order_id,
        "order_number": order_row.get("order_no"),
        "status": order_row.get("status") or "pending_payment",
        "payment_status": order_row.get("payment_status") or "unpaid",
        "total_amount": float(order_row.get("total_amount") or total_amount),
        "pickup_time": order_row.get("pickup_time") or pickup_time,
        "created_at": order_row.get("created_at"),
        "customer_name": customer_name,
        "items": [
            {
                "product_id": item["product_id"],
                "product_name": item.get("product_name"),
                "quantity": int(item["quantity"]),
                "unit_price": float(item["unit_price"]),
                "line_total": float(item["line_total"]),
            }
            for item in prepared_items
        ],
    }


@router.get("/orders/{order_id}")
def get_customer_order(order_id: str, store_id: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    client = _get_client()

    store_id_resolved = store_id
    if not store_id_resolved:
        lookup = client.table("orders").select("id, store_id").eq("id", order_id).limit(1).execute()
        if getattr(lookup, "error", None):
            raise HTTPException(status_code=500, detail="customer_order_lookup_failed")
        rows = getattr(lookup, "data", None) or []
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
        store_id_resolved = str(rows[0].get("store_id") or "").strip()
    if not store_id_resolved:
        raise HTTPException(status_code=500, detail="store_resolution_failed")

    return _order_response(client, store_id_resolved, order_id)

