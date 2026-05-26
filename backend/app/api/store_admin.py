import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Literal, Set
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/store-admin", tags=["store-admin"])

FeeType = Literal["none", "percent", "fixed"]
ChannelType = Literal["direct", "delivery", "manual"]
OrderStatus = Literal[
    "draft",
    "pending_payment",
    "waiting_payment_review",
    "paid",
    "accepted",
    "preparing",
    "ready",
    "ready_for_pickup",
    "completed",
    "cancelled",
]
PaymentStatus = Literal["unpaid", "pending", "pending_review", "paid", "rejected", "refunded"]


class SalesChannelCreate(BaseModel):
    name: str
    type: ChannelType
    fee_type: FeeType = "none"
    fee_value: float = 0
    is_active: Optional[bool] = True


class SalesChannelUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[ChannelType] = None
    fee_type: Optional[FeeType] = None
    fee_value: Optional[float] = None
    is_active: Optional[bool] = None


class ChannelPriceCreate(BaseModel):
    product_id: str
    channel_id: str
    price: float


class ChannelPriceUpdate(BaseModel):
    product_id: Optional[str] = None
    channel_id: Optional[str] = None
    price: Optional[float] = None


# ─── Menus (products + categories) ─────────────────────────────────────────────


def _generate_order_number() -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    suffix = uuid4().hex[:4].upper()
    return f"ORD-{timestamp}-{suffix}"


class ProductCreate(BaseModel):
    name: str
    base_price: float
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_special: Optional[bool] = False
    image_url: Optional[str] = None
    description: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    base_price: Optional[float] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_special: Optional[bool] = None
    image_url: Optional[str] = None
    description: Optional[str] = None


class IngredientCreate(BaseModel):
    name: str
    unit: str
    cost_per_unit: float
    current_stock: float
    low_stock_threshold: float
    supplier_name: Optional[str] = None
    is_active: Optional[bool] = True


class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    cost_per_unit: Optional[float] = None
    current_stock: Optional[float] = None
    low_stock_threshold: Optional[float] = None
    supplier_name: Optional[str] = None
    is_active: Optional[bool] = None


class RecipeCreate(BaseModel):
    product_id: str
    ingredient_id: str
    quantity_used: float
    unit: Optional[str] = None


class RecipeUpdate(BaseModel):
    product_id: Optional[str] = None
    ingredient_id: Optional[str] = None
    quantity_used: Optional[float] = None
    unit: Optional[str] = None


class OrderItemPayload(BaseModel):
    product_id: str
    quantity: int
    unit_price: float
    unit_cost: float


class OrderItemUpdate(BaseModel):
    product_id: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    unit_cost: Optional[float] = None


class OrderCreate(BaseModel):
    customer_id: Optional[str] = None
    channel_id: Optional[str] = None
    order_type: Optional[str] = None
    pickup_type: Optional[str] = None
    pickup_time: Optional[str] = None
    status: OrderStatus = "pending_payment"
    payment_status: PaymentStatus = "unpaid"
    subtotal: Optional[float] = None
    discount_amount: Optional[float] = None
    channel_fee: Optional[float] = None
    total_amount: Optional[float] = None
    total_cost: Optional[float] = None
    gross_profit: Optional[float] = None
    note: Optional[str] = None
    order_no: Optional[str] = None
    items: List[OrderItemPayload] = []


class OrderUpdate(BaseModel):
    customer_id: Optional[str] = None
    channel_id: Optional[str] = None
    order_type: Optional[str] = None
    pickup_type: Optional[str] = None
    pickup_time: Optional[str] = None
    status: Optional[OrderStatus] = None
    payment_status: Optional[PaymentStatus] = None
    subtotal: Optional[float] = None
    discount_amount: Optional[float] = None
    channel_fee: Optional[float] = None
    total_amount: Optional[float] = None
    total_cost: Optional[float] = None
    gross_profit: Optional[float] = None
    note: Optional[str] = None
    order_no: Optional[str] = None
    cancelled_reason: Optional[str] = None
    cancelled_at: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    note: Optional[str] = None


class OrderCancelPayload(BaseModel):
    reason: Optional[str] = None


PaymentMethod = Literal["transfer", "bank_transfer", "promptpay", "cash", "other"]


class PaymentCreate(BaseModel):
    amount: Optional[float] = None
    method: PaymentMethod = "transfer"
    slip_url: Optional[str] = None
    slip_storage_path: Optional[str] = None
    slip_file_name: Optional[str] = None


class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    method: Optional[PaymentMethod] = None
    status: Optional[PaymentStatus] = None
    note: Optional[str] = None


class PaymentSubmitSlip(BaseModel):
    slip_url: Optional[str] = None
    slip_storage_path: Optional[str] = None
    slip_file_name: Optional[str] = None
    note: Optional[str] = None


class PaymentApprovePayload(BaseModel):
    note: Optional[str] = None


class PaymentRejectPayload(BaseModel):
    reason: Optional[str] = None
    note: Optional[str] = None


def _get_client() -> Client:
    try:
        return get_supabase_admin_client()
    except SupabaseConfigurationError:
        raise HTTPException(status_code=500, detail="supabase_not_configured")
    except Exception:
        raise HTTPException(status_code=500, detail="supabase_client_error")


def _extract_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_authorization_header")
    return parts[1]


def _get_user_id(client: Client, token: str) -> str:
    try:
        response = client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    user_obj = getattr(response, "user", None)
    if user_obj is None and hasattr(response, "model_dump"):
        user_obj = response.model_dump().get("user")

    user_id = None
    if user_obj is not None:
        user_id = getattr(user_obj, "id", None)
        if user_id is None and isinstance(user_obj, dict):
            user_id = user_obj.get("id")

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    return str(user_id)


def _get_profile(client: Client, user_id: str) -> Dict[str, Any]:
    try:
        response = client.table("profiles").select("id, email, full_name, role").eq("id", user_id).limit(1).execute()
        error = getattr(response, "error", None)
        if error:
            return {}
        data = getattr(response, "data", None) or []
        return data[0] if data else {}
    except Exception:
        return {}


def _get_memberships(client: Client, user_id: str) -> List[Dict[str, Any]]:
    response = client.table("store_members").select("store_id, role").eq("user_id", user_id).execute()
    error = getattr(response, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="membership_query_failed")
    memberships = getattr(response, "data", None) or []
    if not memberships:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_store_membership")
    return memberships


def _resolve_store_id(memberships: List[Dict[str, Any]], store_id: Optional[str]) -> Tuple[str, str]:
    if store_id:
        for m in memberships:
            if str(m.get("store_id")) == str(store_id):
                return str(m.get("store_id")), str(m.get("role") or "")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_access_denied")

    chosen = memberships[0]
    return str(chosen.get("store_id")), str(chosen.get("role") or "")


def _is_managerial(role: str) -> bool:
    return (role or "").lower() in {"owner", "manager", "admin"}


def _require_manager(role: str) -> None:
    if not _is_managerial(role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def _is_missing_column(error: Any, column: str) -> bool:
    message = str(getattr(error, "message", "") or error or "").lower()
    return column.lower() in message and ("column" in message or "does not exist" in message)


_ORDER_ITEMS_COLUMN_CACHE: Dict[str, Optional[bool]] = {}
_PAYMENTS_COLUMN_CACHE: Dict[str, Optional[bool]] = {}


def _order_items_has_column(client: Client, column: str) -> bool:
    cached = _ORDER_ITEMS_COLUMN_CACHE.get(column)
    if cached is not None:
        return bool(cached)

    try:
        probe = client.table("order_items").select(column).limit(1).execute()
        err = getattr(probe, "error", None)
        if err and _is_missing_column(err, column):
            _ORDER_ITEMS_COLUMN_CACHE[column] = False
        else:
            _ORDER_ITEMS_COLUMN_CACHE[column] = True
    except Exception as exc:
        if _is_missing_column(exc, column):
            _ORDER_ITEMS_COLUMN_CACHE[column] = False
        else:
            _ORDER_ITEMS_COLUMN_CACHE[column] = True

    return bool(_ORDER_ITEMS_COLUMN_CACHE.get(column))


def _payments_has_column(client: Client, column: str) -> bool:
    cached = _PAYMENTS_COLUMN_CACHE.get(column)
    if cached is not None:
        return bool(cached)

    try:
        probe = client.table("payments").select(column).limit(1).execute()
        err = getattr(probe, "error", None)
        if err and _is_missing_column(err, column):
            _PAYMENTS_COLUMN_CACHE[column] = False
        else:
            _PAYMENTS_COLUMN_CACHE[column] = True
    except Exception as exc:
        if _is_missing_column(exc, column):
            _PAYMENTS_COLUMN_CACHE[column] = False
        else:
            _PAYMENTS_COLUMN_CACHE[column] = True

    return bool(_PAYMENTS_COLUMN_CACHE.get(column))


def _prune_payment_columns(client: Client, data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    optional_cols = [
        "store_id",
        "slip_url",
        "slip_storage_path",
        "slip_file_name",
        "submitted_at",
        "confirmed_by",
        "confirmed_at",
        "reject_reason",
        "verified_by_api",
        "verification_provider",
        "verification_status",
        "verification_score",
        "api_response",
    ]
    for col in optional_cols:
        if col == "store_id":
            if not _payments_has_column(client, col):
                payload.pop(col, None)
        else:
            if not _payments_has_column(client, col):
                payload.pop(col, None)
    return payload


def _payments_supports_store_scope(client: Client) -> bool:
    return _payments_has_column(client, "store_id")


def _payment_lookup_columns(client: Client) -> str:
    base = ["id", "order_id", "status"]
    if _payments_supports_store_scope(client):
        base.insert(1, "store_id")
    return ", ".join(base)


def _payment_select_clause(client: Client, include_relations: bool = False, include_slip_fields: bool = True) -> str:
    cols: List[str] = []
    if _payments_supports_store_scope(client):
        cols.append("store_id")
    cols.extend([
        "id",
        "order_id",
        "amount",
        "method",
        "status",
    ])
    if include_slip_fields:
        cols.extend([
            "slip_url",
            "slip_storage_path",
            "slip_file_name",
            "submitted_at",
            "confirmed_by",
            "confirmed_at",
            "reject_reason",
        ])
    cols.append("created_at")
    if include_relations:
        cols.append("orders(id, status, payment_status, customers(display_name))")
    return ", ".join(cols)


def _order_items_supports_store_scope(client: Client) -> bool:
    return _order_items_has_column(client, "store_id")


def _order_item_select_clause(client: Client) -> str:
    columns = [
        "id",
        "order_id",
        "product_id",
        "quantity",
        "unit_price",
        "unit_cost",
        "created_at",
        "products(name)",
    ]
    if _order_items_supports_store_scope(client):
        columns.insert(1, "store_id")
    if _order_items_has_column(client, "product_name_snapshot"):
        columns.append("product_name_snapshot")
    if _order_items_has_column(client, "line_total"):
        columns.append("line_total")
    if _order_items_has_column(client, "line_cost"):
        columns.append("line_cost")
    if _order_items_has_column(client, "line_profit"):
        columns.append("line_profit")
    return ", ".join(columns)


def _prune_order_item_columns(client: Client, data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    if not _order_items_supports_store_scope(client):
        payload.pop("store_id", None)
    optional_cols = ["product_name_snapshot", "line_total", "line_cost", "line_profit"]
    for col in optional_cols:
        if not _order_items_has_column(client, col):
            payload.pop(col, None)
    return payload


def _extract_missing_column(error: Any) -> Optional[str]:
    message = str(getattr(error, "message", "") or error or "")
    if not message or "column" not in message.lower():
        return None
    matches = re.findall(r"'([^']+)'", message)
    return matches[0] if matches else None


def _omit_optional_fields(data: Dict[str, Any], optional_keys: List[str]) -> Dict[str, Any]:
    return {k: v for k, v in data.items() if k not in optional_keys}


def _clean_optional(data: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in data.items() if v is not None}


def _sanitize_channel_payload(payload: SalesChannelCreate | SalesChannelUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name_required")
        data["name"] = name

    if "type" in data or not partial:
        ch_type = data.get("type")
        if ch_type not in ("direct", "delivery", "manual"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channel_type_invalid")
        data["type"] = ch_type

    if "fee_type" in data:
        fee_type = data["fee_type"]
        fee_value = float(data.get("fee_value") or 0)
        if fee_type == "none":
            fee_value = 0
        elif fee_type == "percent":
            if fee_value < 0 or fee_value > 100:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fee_value_percent_range")
        elif fee_type == "fixed":
            if fee_value < 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fee_value_non_negative")
        data["fee_value"] = fee_value
    elif "fee_value" in data:
        data.pop("fee_value")  # cannot update fee_value without fee_type context

    return data


def _sanitize_price_payload(payload: ChannelPriceCreate | ChannelPriceUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if not partial:
        if not data.get("product_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="product_required")
        if not data.get("channel_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channel_required")

    if "price" in data:
        price_value = float(data.get("price") or 0)
        if price_value < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="price_non_negative")
        data["price"] = price_value
        data.pop("price", None)
        data["price"] = price_value

    return data


def _map_channel(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "name": row.get("name"),
        "type": row.get("type"),
        "fee_type": row.get("fee_type"),
        "fee_value": float(row.get("fee_value") or 0),
        "is_active": bool(row.get("is_active")) if row.get("is_active") is not None else True,
        "created_at": row.get("created_at"),
    }


def _map_price(row: Dict[str, Any]) -> Dict[str, Any]:
    product_rel = row.get("products") if isinstance(row, dict) else None
    channel_rel = row.get("sales_channels") if isinstance(row, dict) else None
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "product_id": row.get("product_id"),
        "channel_id": row.get("channel_id"),
        "price": float(row.get("selling_price") or row.get("price") or 0),
        "product_name": product_rel.get("name") if isinstance(product_rel, dict) else None,
        "channel_name": channel_rel.get("name") if isinstance(channel_rel, dict) else None,
        "created_at": row.get("created_at"),
    }


def _get_ctx(authorization: Optional[str]) -> Dict[str, Any]:
    client = _get_client()
    token = _extract_token(authorization)
    user_id = _get_user_id(client, token)
    profile = _get_profile(client, user_id)
    memberships = _get_memberships(client, user_id)
    return {"client": client, "user_id": user_id, "profile": profile, "memberships": memberships}


@router.get("/channels")
def list_channels(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    response = ctx["client"].table("sales_channels").select("id, store_id, name, type, fee_type, fee_value, is_active, created_at").eq("store_id", store_id_resolved).order("created_at", desc=False).execute()
    error = getattr(response, "error", None)
    if error and _is_missing_column(error, "is_active"):
        response = ctx["client"].table("sales_channels").select("id, store_id, name, type, fee_type, fee_value, created_at").eq("store_id", store_id_resolved).order("created_at", desc=False).execute()
        error = getattr(response, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="channel_query_failed")

    data = getattr(response, "data", None) or []
    return {"items": [_map_channel(row) for row in data], "store_id": store_id_resolved}


@router.post("/channels")
def create_channel(payload: SalesChannelCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_channel_payload(payload)
    data["store_id"] = store_id_resolved

    response = ctx["client"].table("sales_channels").insert(data).execute()
    error = getattr(response, "error", None)
    if error and _is_missing_column(error, "is_active"):
        data = _omit_optional_fields(data, ["is_active"])
        response = ctx["client"].table("sales_channels").insert(data).execute()
        error = getattr(response, "error", None)
    if error:
        # unique constraint violation on name per store
        message = str(getattr(error, "message", ""))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channel_name_exists")
        raise HTTPException(status_code=500, detail="channel_create_failed")

    rows = getattr(response, "data", None) or []
    created = rows[0] if rows else data
    return _map_channel(created)


@router.patch("/channels/{channel_id}")
def update_channel(channel_id: str, payload: SalesChannelUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_channel_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    # Ensure exists and belongs to store
    exists = ctx["client"].table("sales_channels").select("id").eq("id", channel_id).eq("store_id", store_id_resolved).limit(1).execute()
    if not (getattr(exists, "data", None) or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="channel_not_found")

    response = ctx["client"].table("sales_channels").update(data).eq("id", channel_id).eq("store_id", store_id_resolved).execute()
    error = getattr(response, "error", None)
    if error and _is_missing_column(error, "is_active"):
        data = _omit_optional_fields(data, ["is_active"])
        response = ctx["client"].table("sales_channels").update(data).eq("id", channel_id).eq("store_id", store_id_resolved).execute()
        error = getattr(response, "error", None)
    if error:
        message = str(getattr(error, "message", ""))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channel_name_exists")
        raise HTTPException(status_code=500, detail="channel_update_failed")

    rows = getattr(response, "data", None) or []
    updated = rows[0] if rows else data | {"id": channel_id, "store_id": store_id_resolved}
    return _map_channel(updated)


def _has_order_history(client: Client, store_id: str, channel_id: str) -> bool:
    resp = client.table("orders").select("id").eq("store_id", store_id).eq("channel_id", channel_id).limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="order_history_check_failed")
    data = getattr(resp, "data", None) or []
    return len(data) > 0


def _try_deactivate_channel(client: Client, store_id: str, channel_id: str) -> bool:
    try:
        resp = client.table("sales_channels").update({"is_active": False}).eq("id", channel_id).eq("store_id", store_id).execute()
        error = getattr(resp, "error", None)
        if error:
            return False
        return True
    except Exception:
        return False


@router.delete("/channels/{channel_id}")
def delete_channel(channel_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    # Ensure exists
    existing_resp = ctx["client"].table("sales_channels").select("id").eq("id", channel_id).eq("store_id", store_id_resolved).limit(1).execute()
    existing = getattr(existing_resp, "data", None) or []
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="channel_not_found")

    if _has_order_history(ctx["client"], store_id_resolved, channel_id):
        if _try_deactivate_channel(ctx["client"], store_id_resolved, channel_id):
            return {"status": "deactivated"}
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="channel_has_history")

    # Safe to delete prices then channel
    ctx["client"].table("channel_prices").delete().eq("store_id", store_id_resolved).eq("channel_id", channel_id).execute()
    ctx["client"].table("sales_channels").delete().eq("id", channel_id).eq("store_id", store_id_resolved).execute()
    return {"status": "deleted"}


def _ensure_product_in_store(client: Client, product_id: str, store_id: str) -> Dict[str, Any]:
    resp = client.table("products").select("id, store_id, name").eq("id", product_id).limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="product_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_not_found")
    row = data[0]
    if _order_items_supports_store_scope(client):
        store_value = row.get("store_id")
        if store_value is not None and str(store_value) != str(store_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")
    return row


def _ensure_category_in_store(client: Client, category_id: str, store_id: str) -> None:
    resp = client.table("product_categories").select("id, store_id").eq("id", category_id).limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="category_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="category_not_found")
    row = data[0]
    if str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")


def _get_or_create_category(client: Client, store_id: str, name: str) -> str:
    try:
        existing = client.table("product_categories").select("id").eq("store_id", store_id).eq("name", name).limit(1).execute()
        data = getattr(existing, "data", None) or []
        if data:
            return str(data[0].get("id"))
    except Exception:
        pass

    try:
        resp = client.table("product_categories").insert({"store_id": store_id, "name": name, "sort_order": 0}).execute()
        error = getattr(resp, "error", None)
        if error:
            message = str(getattr(error, "message", ""))
            if "duplicate" in message or "unique" in message:
                # race: fetch again
                fetched = client.table("product_categories").select("id").eq("store_id", store_id).eq("name", name).limit(1).execute()
                data = getattr(fetched, "data", None) or []
                if data:
                    return str(data[0].get("id"))
                raise HTTPException(status_code=500, detail="category_lookup_failed")
            raise HTTPException(status_code=500, detail="category_create_failed")
        rows = getattr(resp, "data", None) or []
        if rows:
            return str(rows[0].get("id"))
        raise HTTPException(status_code=500, detail="category_create_failed")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="category_create_failed")


def _sanitize_product_payload(payload: ProductCreate | ProductUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name_required")
        data["name"] = name

    if "base_price" in data or not partial:
        price_val = float(data.get("base_price") or 0)
        if price_val < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="base_price_non_negative")
        data["base_price"] = price_val

    for flag in ("is_active", "is_special"):
        if flag in data and data[flag] is None:
            data.pop(flag)

    return data


def _map_product(row: Dict[str, Any]) -> Dict[str, Any]:
    cat_rel = row.get("product_categories") if isinstance(row, dict) else None
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "name": row.get("name"),
        "category_id": row.get("category_id"),
        "category_name": cat_rel.get("name") if isinstance(cat_rel, dict) else None,
        "base_price": float(row.get("base_price") or 0),
        "is_active": bool(row.get("is_active")) if row.get("is_active") is not None else True,
        "is_special": bool(row.get("is_special")) if row.get("is_special") is not None else False,
        "image_url": row.get("image_url"),
        "description": row.get("description"),
        "created_at": row.get("created_at"),
    }


def _map_category(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "name": row.get("name"),
        "sort_order": row.get("sort_order"),
    }


def _sanitize_ingredient_payload(payload: IngredientCreate | IngredientUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ingredient_name_required")
        data["name"] = name

    if "unit" in data or not partial:
        unit = (data.get("unit") or "").strip()
        if not unit:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unit_required")
        data["unit"] = unit

    if "cost_per_unit" in data:
        cpu = float(data.get("cost_per_unit") or 0)
        if cpu < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cost_non_negative")
        data["cost_per_unit"] = cpu

    if "current_stock" in data:
        stock = float(data.get("current_stock") or 0)
        if stock < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="stock_non_negative")
        data["stock_on_hand"] = stock
        data.pop("current_stock", None)
    elif not partial:
        data["stock_on_hand"] = 0

    if "low_stock_threshold" in data:
        low = float(data.get("low_stock_threshold") or 0)
        if low < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="low_stock_non_negative")
        data["low_stock_threshold"] = low

    # supplier_name, is_active are optional and may not exist in schema; keep for now
    return data


def _map_ingredient(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "name": row.get("name"),
        "unit": row.get("unit"),
        "cost_per_unit": float(row.get("cost_per_unit") or 0),
        "current_stock": float(row.get("stock_on_hand") or row.get("current_stock") or 0),
        "low_stock_threshold": float(row.get("low_stock_threshold") or 0),
        "supplier_name": row.get("supplier_name"),
        "is_active": bool(row.get("is_active")) if row.get("is_active") is not None else True,
        "created_at": row.get("created_at"),
    }


def _sanitize_recipe_payload(payload: RecipeCreate | RecipeUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if "product_id" in data or not partial:
        if not data.get("product_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="product_required")
    if "ingredient_id" in data or not partial:
        if not data.get("ingredient_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ingredient_required")

    if "quantity_used" in data or not partial:
        qty = float(data.get("quantity_used") or 0)
        if qty < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_non_negative")
        data["quantity_used"] = qty

    if "unit" in data:
        unit = (data.get("unit") or "").strip()
        if unit:
            data["unit"] = unit
        else:
            data.pop("unit", None)
    return data


def _map_recipe(row: Dict[str, Any]) -> Dict[str, Any]:
    prod_rel = row.get("products") if isinstance(row, dict) else None
    ing_rel = row.get("ingredients") if isinstance(row, dict) else None
    quantity = float(row.get("quantity_used") or 0)
    cost_per_unit = float(ing_rel.get("cost_per_unit") or 0) if isinstance(ing_rel, dict) else 0
    line_cost = quantity * cost_per_unit
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "product_id": row.get("product_id"),
        "ingredient_id": row.get("ingredient_id"),
        "quantity_used": quantity,
        "product_name": prod_rel.get("name") if isinstance(prod_rel, dict) else None,
        "ingredient_name": ing_rel.get("name") if isinstance(ing_rel, dict) else None,
        "ingredient_unit": ing_rel.get("unit") if isinstance(ing_rel, dict) else None,
        "ingredient_cost_per_unit": cost_per_unit,
        "line_cost": line_cost,
    }


def _ensure_channel_in_store(client: Client, channel_id: str, store_id: str) -> None:
    resp = client.table("sales_channels").select("id, store_id").eq("id", channel_id).limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="channel_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="channel_not_found")
    row = data[0]
    if str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")


@router.get("/channel-pricing")
def list_channel_prices(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    try:
        price_resp = ctx["client"].table("channel_prices").select("id, store_id, product_id, channel_id, price, created_at, products(name), sales_channels(name)").eq("store_id", store_id_resolved).execute()
        error = getattr(price_resp, "error", None)
    except Exception as exc:
        price_resp = None
        error = exc
    if error and _is_missing_column(error, "price"):
        try:
            price_resp = ctx["client"].table("channel_prices").select("id, store_id, product_id, channel_id, selling_price, created_at, products(name), sales_channels(name)").eq("store_id", store_id_resolved).execute()
            error = getattr(price_resp, "error", None)
        except Exception as exc:
            price_resp = None
            error = exc
    if error:
        raise HTTPException(status_code=500, detail="channel_price_query_failed")
    prices = getattr(price_resp, "data", None) or []

    products_resp = ctx["client"].table("products").select("id, name, is_active, base_price").eq("store_id", store_id_resolved).order("name", desc=False).execute()
    if getattr(products_resp, "error", None):
        raise HTTPException(status_code=500, detail="product_query_failed")
    products = getattr(products_resp, "data", None) or []

    channels_resp = ctx["client"].table("sales_channels").select("id, name, type, fee_type, fee_value, is_active").eq("store_id", store_id_resolved).order("name", desc=False).execute()
    ch_error = getattr(channels_resp, "error", None)
    if ch_error and _is_missing_column(ch_error, "is_active"):
        channels_resp = ctx["client"].table("sales_channels").select("id, name, type, fee_type, fee_value").eq("store_id", store_id_resolved).order("name", desc=False).execute()
        ch_error = getattr(channels_resp, "error", None)
    if ch_error:
        raise HTTPException(status_code=500, detail="channel_query_failed")
    channels = getattr(channels_resp, "data", None) or []

    return {
        "items": [_map_price(row) for row in prices],
        "products": products,
        "channels": [_map_channel(row) for row in channels],
        "store_id": store_id_resolved,
    }


@router.post("/channel-pricing")
def create_channel_price(payload: ChannelPriceCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_price_payload(payload)
    _ensure_product_in_store(ctx["client"], data["product_id"], store_id_resolved)
    _ensure_channel_in_store(ctx["client"], data["channel_id"], store_id_resolved)

    data["store_id"] = store_id_resolved

    try:
        response = ctx["client"].table("channel_prices").insert(data).execute()
        error = getattr(response, "error", None)
    except Exception as exc:
        response = None
        error = exc
    if error and _is_missing_column(error, "price"):
        fallback = dict(data)
        if "price" in fallback:
            fallback["selling_price"] = fallback.pop("price")
        try:
            response = ctx["client"].table("channel_prices").insert(fallback).execute()
            error = getattr(response, "error", None)
            data = fallback
        except Exception as exc:
            response = None
            error = exc
    if error:
        message = str(getattr(error, "message", error))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channel_price_exists")
        raise HTTPException(status_code=500, detail="channel_price_create_failed")

    rows = getattr(response, "data", None) or []
    created = rows[0] if rows else data
    return _map_price(created)


@router.patch("/channel-pricing/{price_id}")
def update_channel_price(price_id: str, payload: ChannelPriceUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_price_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    # ensure belongs to store
    existing_resp = ctx["client"].table("channel_prices").select("product_id, channel_id, store_id").eq("id", price_id).limit(1).execute()
    existing = getattr(existing_resp, "data", None) or []
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="channel_price_not_found")
    existing_row = existing[0]
    if str(existing_row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    target_product = data.get("product_id") or existing_row.get("product_id")
    target_channel = data.get("channel_id") or existing_row.get("channel_id")

    _ensure_product_in_store(ctx["client"], target_product, store_id_resolved)
    _ensure_channel_in_store(ctx["client"], target_channel, store_id_resolved)

    try:
        response = ctx["client"].table("channel_prices").update(data).eq("id", price_id).eq("store_id", store_id_resolved).execute()
        error = getattr(response, "error", None)
    except Exception as exc:
        response = None
        error = exc
    if error and _is_missing_column(error, "price"):
        fallback = dict(data)
        if "price" in fallback:
            fallback["selling_price"] = fallback.pop("price")
        try:
            response = ctx["client"].table("channel_prices").update(fallback).eq("id", price_id).eq("store_id", store_id_resolved).execute()
            error = getattr(response, "error", None)
            data = fallback
        except Exception as exc:
            response = None
            error = exc
    if error:
        message = str(getattr(error, "message", error))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channel_price_exists")
        raise HTTPException(status_code=500, detail="channel_price_update_failed")

    rows = getattr(response, "data", None) or []
    updated = rows[0] if rows else data | {"id": price_id, "store_id": store_id_resolved}
    return _map_price(updated)


def _has_channel_price_history(client: Client, store_id: str, product_id: str, channel_id: str) -> bool:
    try:
        resp = (
            client.table("order_items")
            .select("id, orders!inner(channel_id)")
            .eq("store_id", store_id)
            .eq("product_id", product_id)
            .eq("orders.channel_id", channel_id)
            .limit(1)
            .execute()
        )
        if getattr(resp, "error", None):
            raise HTTPException(status_code=500, detail="price_history_check_failed")
        data = getattr(resp, "data", None) or []
        return len(data) > 0
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="price_history_check_failed")


@router.delete("/channel-pricing/{price_id}")
def delete_channel_price(price_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    existing_resp = ctx["client"].table("channel_prices").select("id, product_id, channel_id, store_id").eq("id", price_id).limit(1).execute()
    existing = getattr(existing_resp, "data", None) or []
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="channel_price_not_found")

    row = existing[0]
    if str(row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    if _has_channel_price_history(ctx["client"], store_id_resolved, row.get("product_id"), row.get("channel_id")):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="channel_price_has_history")

    ctx["client"].table("channel_prices").delete().eq("id", price_id).eq("store_id", store_id_resolved).execute()
    return {"status": "deleted"}


# ─── Menus (products) ─────────────────────────────────────────────────────────


def _has_product_dependencies(client: Client, store_id: str, product_id: str) -> bool:
    checks = [
        client.table("order_items").select("id").eq("store_id", store_id).eq("product_id", product_id).limit(1),
        client.table("channel_prices").select("id").eq("store_id", store_id).eq("product_id", product_id).limit(1),
        client.table("recipes").select("id").eq("store_id", store_id).eq("product_id", product_id).limit(1),
    ]
    for query in checks:
        try:
            resp = query.execute()
            if getattr(resp, "data", None):
                return True
        except Exception:
            continue
    return False


@router.get("/menus")
def list_menus(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    categories_resp = ctx["client"].table("product_categories").select("id, store_id, name, sort_order").eq("store_id", store_id_resolved).order("sort_order", desc=False).order("name", desc=False).execute()
    if getattr(categories_resp, "error", None):
        raise HTTPException(status_code=500, detail="category_query_failed")
    categories = getattr(categories_resp, "data", None) or []

    prod_select = "id, store_id, name, category_id, base_price, is_active, is_special, image_url, description, created_at, product_categories(name)"
    products_resp = ctx["client"].table("products").select(prod_select).eq("store_id", store_id_resolved).order("created_at", desc=False).execute()
    prod_err = getattr(products_resp, "error", None)
    if prod_err and _is_missing_column(prod_err, "is_special"):
        prod_select = "id, store_id, name, category_id, base_price, is_active, image_url, description, created_at, product_categories(name)"
        products_resp = ctx["client"].table("products").select(prod_select).eq("store_id", store_id_resolved).order("created_at", desc=False).execute()
        prod_err = getattr(products_resp, "error", None)
    if prod_err and _is_missing_column(prod_err, "is_active"):
        prod_select = "id, store_id, name, category_id, base_price, created_at, product_categories(name)"
        products_resp = ctx["client"].table("products").select(prod_select).eq("store_id", store_id_resolved).order("created_at", desc=False).execute()
        prod_err = getattr(products_resp, "error", None)
    if prod_err:
        raise HTTPException(status_code=500, detail="product_query_failed")
    products = getattr(products_resp, "data", None) or []

    return {
        "items": [_map_product(p) for p in products],
        "categories": [_map_category(c) for c in categories],
        "store_id": store_id_resolved,
    }


@router.post("/menus")
def create_menu(payload: ProductCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_product_payload(payload)

    category_name = (data.pop("category_name", None) or payload.category_name or "").strip()
    cat_id = data.get("category_id")
    if cat_id:
        _ensure_category_in_store(ctx["client"], cat_id, store_id_resolved)
    elif category_name:
        cat_id = _get_or_create_category(ctx["client"], store_id_resolved, category_name)
        data["category_id"] = cat_id

    data["store_id"] = store_id_resolved

    optional_fields = ["is_active", "is_special", "image_url", "description"]
    try:
        resp = ctx["client"].table("products").insert(data).execute()
        error = getattr(resp, "error", None)
        if error and any(_is_missing_column(error, f) for f in optional_fields):
            trimmed = _omit_optional_fields(data, optional_fields)
            resp = ctx["client"].table("products").insert(trimmed).execute()
            error = getattr(resp, "error", None)
        if error:
            message = str(getattr(error, "message", ""))
            if "duplicate" in message or "unique" in message:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="product_name_exists")
            raise HTTPException(status_code=500, detail="product_create_failed")
        rows = getattr(resp, "data", None) or []
        created = rows[0] if rows else data
        return _map_product(created)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="product_create_failed")


@router.patch("/menus/{product_id}")
def update_menu(product_id: str, payload: ProductUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_product_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    existing_resp = ctx["client"].table("products").select("id, store_id").eq("id", product_id).eq("store_id", store_id_resolved).limit(1).execute()
    if not (getattr(existing_resp, "data", None) or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_not_found")

    category_name = (data.pop("category_name", None) or payload.category_name or "").strip()
    cat_id = data.get("category_id")
    if cat_id:
        _ensure_category_in_store(ctx["client"], cat_id, store_id_resolved)
    elif category_name:
        cat_id = _get_or_create_category(ctx["client"], store_id_resolved, category_name)
        data["category_id"] = cat_id

    optional_fields = ["is_active", "is_special", "image_url", "description"]
    try:
        resp = ctx["client"].table("products").update(data).eq("id", product_id).eq("store_id", store_id_resolved).execute()
        error = getattr(resp, "error", None)
        if error and any(_is_missing_column(error, f) for f in optional_fields):
            trimmed = _omit_optional_fields(data, optional_fields)
            resp = ctx["client"].table("products").update(trimmed).eq("id", product_id).eq("store_id", store_id_resolved).execute()
            error = getattr(resp, "error", None)
        if error:
            message = str(getattr(error, "message", ""))
            if "duplicate" in message or "unique" in message:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="product_name_exists")
            raise HTTPException(status_code=500, detail="product_update_failed")
        rows = getattr(resp, "data", None) or []
        updated = rows[0] if rows else data | {"id": product_id, "store_id": store_id_resolved}
        return _map_product(updated)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="product_update_failed")


@router.delete("/menus/{product_id}")
def delete_menu(product_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    existing_resp = ctx["client"].table("products").select("id, store_id").eq("id", product_id).eq("store_id", store_id_resolved).limit(1).execute()
    if not (getattr(existing_resp, "data", None) or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_not_found")

    has_history = _has_product_dependencies(ctx["client"], store_id_resolved, product_id)
    if has_history:
        try:
            resp = ctx["client"].table("products").update({"is_active": False}).eq("id", product_id).eq("store_id", store_id_resolved).execute()
            if getattr(resp, "error", None) and _is_missing_column(getattr(resp, "error"), "is_active"):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="product_has_history")
            if getattr(resp, "error", None):
                raise HTTPException(status_code=500, detail="product_deactivate_failed")
            return {"status": "deactivated"}
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=500, detail="product_deactivate_failed")

    # no history: remove dependent channel_prices and recipes, then delete product
    ctx["client"].table("channel_prices").delete().eq("store_id", store_id_resolved).eq("product_id", product_id).execute()
    ctx["client"].table("recipes").delete().eq("store_id", store_id_resolved).eq("product_id", product_id).execute()
    ctx["client"].table("products").delete().eq("id", product_id).eq("store_id", store_id_resolved).execute()
    return {"status": "deleted"}


# ─── Ingredients ──────────────────────────────────────────────────────────────


def _has_ingredient_dependencies(client: Client, store_id: str, ingredient_id: str) -> bool:
    checks = [
        client.table("recipes").select("id").eq("store_id", store_id).eq("ingredient_id", ingredient_id).limit(1),
        client.table("stock_movements").select("id").eq("store_id", store_id).eq("ingredient_id", ingredient_id).limit(1),
    ]
    for query in checks:
        try:
            resp = query.execute()
            if getattr(resp, "data", None):
                return True
        except Exception:
            continue
    return False


@router.get("/ingredients")
def list_ingredients(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    def _query_ingredients(cols: str) -> tuple[Optional[Any], Optional[Any]]:
        try:
            resp_local = ctx["client"].table("ingredients").select(cols).eq("store_id", store_id_resolved).order("created_at", desc=False).execute()
            return resp_local, getattr(resp_local, "error", None)
        except Exception as exc:
            return None, exc

    select_cols = "id, store_id, name, unit, cost_per_unit, stock_on_hand, low_stock_threshold, supplier_name, is_active, created_at"
    resp, err = _query_ingredients(select_cols)
    if err and _is_missing_column(err, "stock_on_hand"):
        resp, err = _query_ingredients("id, store_id, name, unit, cost_per_unit, current_stock, low_stock_threshold, supplier_name, is_active, created_at")
    if err and _is_missing_column(err, "is_active"):
        resp, err = _query_ingredients("id, store_id, name, unit, cost_per_unit, stock_on_hand, current_stock, low_stock_threshold, supplier_name, created_at")
        if err and _is_missing_column(err, "stock_on_hand"):
            resp, err = _query_ingredients("id, store_id, name, unit, cost_per_unit, current_stock, low_stock_threshold, supplier_name, created_at")
    if err and _is_missing_column(err, "supplier_name"):
        resp, err = _query_ingredients("id, store_id, name, unit, cost_per_unit, stock_on_hand, current_stock, low_stock_threshold, created_at")
        if err and _is_missing_column(err, "stock_on_hand"):
            resp, err = _query_ingredients("id, store_id, name, unit, cost_per_unit, current_stock, low_stock_threshold, created_at")
    if err:
        raise HTTPException(status_code=500, detail="ingredient_query_failed")

    rows = getattr(resp, "data", None) or []
    return {"items": [_map_ingredient(r) for r in rows], "store_id": store_id_resolved}


@router.post("/ingredients")
def create_ingredient(payload: IngredientCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_ingredient_payload(payload)
    data["store_id"] = store_id_resolved

    optional_fields = ["supplier_name", "is_active"]
    try:
        try:
            resp = ctx["client"].table("ingredients").insert(data).execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
        if err and _is_missing_column(err, "stock_on_hand"):
            stock_value = data.pop("stock_on_hand", None)
            if stock_value is not None:
                data["current_stock"] = stock_value
            try:
                resp = ctx["client"].table("ingredients").insert(data).execute()
                err = getattr(resp, "error", None)
            except Exception as exc:
                resp = None
                err = exc
        if err and any(_is_missing_column(err, f) for f in optional_fields):
            trimmed = _omit_optional_fields(data, optional_fields)
            try:
                resp = ctx["client"].table("ingredients").insert(trimmed).execute()
                err = getattr(resp, "error", None)
            except Exception as exc:
                resp = None
                err = exc
        if err:
            raise HTTPException(status_code=500, detail="ingredient_create_failed")
        rows = getattr(resp, "data", None) or []
        created = rows[0] if rows else data
        return _map_ingredient(created)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="ingredient_create_failed")


@router.patch("/ingredients/{ingredient_id}")
def update_ingredient(ingredient_id: str, payload: IngredientUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_ingredient_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    exists = ctx["client"].table("ingredients").select("id, store_id").eq("id", ingredient_id).eq("store_id", store_id_resolved).limit(1).execute()
    if not (getattr(exists, "data", None) or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ingredient_not_found")

    optional_fields = ["supplier_name", "is_active"]
    try:
        try:
            resp = ctx["client"].table("ingredients").update(data).eq("id", ingredient_id).eq("store_id", store_id_resolved).execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
        if err and _is_missing_column(err, "stock_on_hand"):
            stock_value = data.pop("stock_on_hand", None)
            if stock_value is not None:
                data["current_stock"] = stock_value
            try:
                resp = ctx["client"].table("ingredients").update(data).eq("id", ingredient_id).eq("store_id", store_id_resolved).execute()
                err = getattr(resp, "error", None)
            except Exception as exc:
                resp = None
                err = exc
        if err and any(_is_missing_column(err, f) for f in optional_fields):
            trimmed = _omit_optional_fields(data, optional_fields)
            try:
                resp = ctx["client"].table("ingredients").update(trimmed).eq("id", ingredient_id).eq("store_id", store_id_resolved).execute()
                err = getattr(resp, "error", None)
            except Exception as exc:
                resp = None
                err = exc
        if err:
            raise HTTPException(status_code=500, detail="ingredient_update_failed")
        rows = getattr(resp, "data", None) or []
        updated = rows[0] if rows else data | {"id": ingredient_id, "store_id": store_id_resolved}
        return _map_ingredient(updated)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="ingredient_update_failed")


@router.delete("/ingredients/{ingredient_id}")
def delete_ingredient(ingredient_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    exists = ctx["client"].table("ingredients").select("id, store_id").eq("id", ingredient_id).eq("store_id", store_id_resolved).limit(1).execute()
    if not (getattr(exists, "data", None) or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ingredient_not_found")

    has_history = _has_ingredient_dependencies(ctx["client"], store_id_resolved, ingredient_id)
    if has_history:
        try:
            resp = ctx["client"].table("ingredients").update({"is_active": False}).eq("id", ingredient_id).eq("store_id", store_id_resolved).execute()
            if getattr(resp, "error", None) and _is_missing_column(getattr(resp, "error"), "is_active"):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ingredient_has_history")
            if getattr(resp, "error", None):
                raise HTTPException(status_code=500, detail="ingredient_deactivate_failed")
            return {"status": "deactivated"}
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=500, detail="ingredient_deactivate_failed")

    ctx["client"].table("ingredients").delete().eq("id", ingredient_id).eq("store_id", store_id_resolved).execute()
    return {"status": "deleted"}


# ─── Recipes ──────────────────────────────────────────────────────────────────


@router.get("/recipes")
def list_recipes(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    recipe_resp = ctx["client"].table("recipes").select("id, store_id, product_id, ingredient_id, quantity_used, products(name), ingredients(name, unit, cost_per_unit)").eq("store_id", store_id_resolved).order("product_id", desc=False).execute()
    if getattr(recipe_resp, "error", None):
        raise HTTPException(status_code=500, detail="recipe_query_failed")
    recipes = getattr(recipe_resp, "data", None) or []

    products_resp = ctx["client"].table("products").select("id, name, is_active").eq("store_id", store_id_resolved).order("name", desc=False).execute()
    if getattr(products_resp, "error", None):
        raise HTTPException(status_code=500, detail="product_query_failed")
    products = getattr(products_resp, "data", None) or []

    ingredients_resp = ctx["client"].table("ingredients").select("id, name, unit, cost_per_unit, is_active").eq("store_id", store_id_resolved).order("name", desc=False).execute()
    if getattr(ingredients_resp, "error", None):
        raise HTTPException(status_code=500, detail="ingredient_query_failed")
    ingredients = getattr(ingredients_resp, "data", None) or []

    return {
        "items": [_map_recipe(r) for r in recipes],
        "products": [_map_product(p) for p in products],
        "ingredients": [_map_ingredient(i) for i in ingredients],
        "store_id": store_id_resolved,
    }


@router.post("/recipes")
def create_recipe(payload: RecipeCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_recipe_payload(payload)
    _ensure_product_in_store(ctx["client"], data["product_id"], store_id_resolved)
    _ensure_ingredient_in_store(ctx["client"], data["ingredient_id"], store_id_resolved)

    if not data.get("unit"):
        ing_resp = ctx["client"].table("ingredients").select("unit").eq("id", data["ingredient_id"]).limit(1).execute()
        ing_rows = getattr(ing_resp, "data", None) or []
        if ing_rows and ing_rows[0].get("unit"):
            data["unit"] = str(ing_rows[0].get("unit"))

    data["store_id"] = store_id_resolved
    data["created_at"] = datetime.utcnow().isoformat()
    data["updated_at"] = datetime.utcnow().isoformat()

    try:
        resp = ctx["client"].table("recipes").insert(data).execute()
        err = getattr(resp, "error", None)
    except Exception as exc:
        resp = None
        err = exc

    if err and _is_missing_column(err, "updated_at"):
        fallback = dict(data)
        fallback.pop("updated_at", None)
        try:
            resp = ctx["client"].table("recipes").insert(fallback).execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc

    if err:
        message = str(getattr(err, "message", err))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="recipe_exists")
        raise HTTPException(status_code=500, detail="recipe_create_failed")
    rows = getattr(resp, "data", None) or []
    return _map_recipe(rows[0] if rows else data)


def _ensure_ingredient_in_store(client: Client, ingredient_id: str, store_id: str) -> None:
    resp = client.table("ingredients").select("id, store_id").eq("id", ingredient_id).limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="ingredient_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ingredient_not_found")
    row = data[0]
    if str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")


@router.patch("/recipes/{recipe_id}")
def update_recipe(recipe_id: str, payload: RecipeUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_recipe_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    existing_resp = ctx["client"].table("recipes").select("store_id, product_id, ingredient_id").eq("id", recipe_id).limit(1).execute()
    existing = getattr(existing_resp, "data", None) or []
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recipe_not_found")
    existing_row = existing[0]
    if str(existing_row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    target_product = data.get("product_id") or existing_row.get("product_id")
    target_ing = data.get("ingredient_id") or existing_row.get("ingredient_id")
    _ensure_product_in_store(ctx["client"], target_product, store_id_resolved)
    _ensure_ingredient_in_store(ctx["client"], target_ing, store_id_resolved)

    resp = ctx["client"].table("recipes").update(data).eq("id", recipe_id).eq("store_id", store_id_resolved).execute()
    if getattr(resp, "error", None):
        message = str(getattr(resp.error, "message", getattr(resp, "error", "")))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="recipe_exists")
        raise HTTPException(status_code=500, detail="recipe_update_failed")
    rows = getattr(resp, "data", None) or []
    return _map_recipe(rows[0] if rows else data | {"id": recipe_id, "store_id": store_id_resolved})


@router.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    existing_resp = ctx["client"].table("recipes").select("id, store_id").eq("id", recipe_id).limit(1).execute()
    existing = getattr(existing_resp, "data", None) or []
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recipe_not_found")
    row = existing[0]
    if str(row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    ctx["client"].table("recipes").delete().eq("id", recipe_id).eq("store_id", store_id_resolved).execute()
    return {"status": "deleted"}


# ─── Orders + Order Items ─────────────────────────────────────────────────────


def _ensure_customer_in_store(client: Client, customer_id: str, store_id: str) -> None:
    resp = client.table("customers").select("id, store_id").eq("id", customer_id).limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="customer_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="customer_not_found")
    row = data[0]
    if str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")


def _sanitize_order_item_payload(payload: OrderItemPayload | OrderItemUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if "product_id" in data or not partial:
        if not data.get("product_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="product_required")

    if "quantity" in data or not partial:
        qty = int(data.get("quantity") or 0)
        if qty <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_positive")
        data["quantity"] = qty

    for field in ("unit_price", "unit_cost"):
        if field in data:
            value = float(data.get(field) or 0)
            if value < 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field}_non_negative")
            data[field] = value

    return data


def _valid_order_transition(from_status: str, to_status: str) -> bool:
    if from_status == to_status:
        return True
    allowed: Dict[str, List[str]] = {
        "draft": ["pending_payment", "cancelled"],
        "pending_payment": ["waiting_payment_review", "accepted", "cancelled"],
        "waiting_payment_review": ["accepted", "pending_payment", "cancelled"],
        "paid": ["accepted", "cancelled"],
        "accepted": ["preparing", "ready", "completed", "cancelled"],
        "preparing": ["ready", "completed", "cancelled"],
        "ready": ["completed", "cancelled"],
        "ready_for_pickup": ["completed", "cancelled"],
        "completed": [],
        "cancelled": [],
    }
    return to_status in allowed.get(from_status, [])


def _sanitize_order_payload(payload: OrderCreate | OrderUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    text_fields = ["order_type", "pickup_type", "pickup_time", "note", "cancelled_reason", "cancelled_at"]
    for field in text_fields:
        if field in data and data[field] is not None:
            data[field] = str(data[field]).strip()
            if data[field] == "":
                data[field] = None

    for field in ("subtotal", "discount_amount", "channel_fee", "total_amount", "total_cost", "gross_profit"):
        if field in data and data[field] is not None:
            value = float(data.get(field) or 0)
            if value < 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field}_non_negative")
            data[field] = value

    if "payment_status" in data and data.get("payment_status") == "pending":
        data["payment_status"] = "pending_review"

    if "status" in data and data.get("status") == "ready_for_pickup":
        data["status"] = "ready"

    if "pickup_time" in data and data.get("pickup_time"):
        try:
            datetime.fromisoformat(str(data["pickup_time"]).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pickup_time_invalid")

    if not partial:
        data.setdefault("status", "pending_payment")
        data.setdefault("payment_status", "unpaid")
        data.setdefault("order_type", "pickup")
        data.setdefault("pickup_type", "pickup")
        data.setdefault("order_no", _generate_order_number())

    return data


def _map_order_item(row: Dict[str, Any]) -> Dict[str, Any]:
    product_rel = row.get("products") if isinstance(row, dict) else None
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "order_id": row.get("order_id"),
        "product_id": row.get("product_id"),
        "product_name": product_rel.get("name") if isinstance(product_rel, dict) else None,
        "quantity": int(row.get("quantity") or 0),
        "unit_price": float(row.get("unit_price") or 0),
        "unit_cost": float(row.get("unit_cost") or 0),
        "line_total": float(row.get("line_total") or 0),
        "line_cost": float(row.get("line_cost") or 0),
        "line_profit": float(row.get("line_profit") or 0),
        "created_at": row.get("created_at"),
    }


def _make_fallback_label(prefix: str, identifier: Optional[str]) -> str:
    ident = str(identifier or "")
    short = ident[:8] if ident else "unknown"
    return f"{prefix} {short}".strip()


def _load_relation_names(
    client: Client,
    table: str,
    store_id: str,
    ids: Set[str],
    candidate_columns: List[str],
    fallback_prefix: str,
) -> Dict[str, str]:
    if not ids:
        return {}

    id_list = list(ids)
    for column in candidate_columns:
        try:
            resp = (
                client.table(table)
                .select(f"id, {column}")
                .eq("store_id", store_id)
                .in_("id", id_list)
                .execute()
            )
        except Exception as exc:
            if _is_missing_column(exc, column):
                continue
            raise

        err = getattr(resp, "error", None)
        if err:
            if _is_missing_column(err, column):
                continue
            raise HTTPException(status_code=500, detail=f"{table}_lookup_failed")

        result: Dict[str, str] = {}
        for row in getattr(resp, "data", None) or []:
            ident = str(row.get("id")) if row.get("id") else None
            value = row.get(column)
            if value:
                result[str(row["id"])] = str(value)
            elif ident:
                result[str(row["id"])] = _make_fallback_label(fallback_prefix, ident)
        for ident in id_list:
            result.setdefault(str(ident), _make_fallback_label(fallback_prefix, ident))
        return result

    # Final fallback: fetch ids only and return generated labels
    try:
        resp = (
            client.table(table)
            .select("id")
            .eq("store_id", store_id)
            .in_("id", id_list)
            .execute()
        )
    except Exception:
        resp = None

    data = getattr(resp, "data", None) if resp else None
    base_map: Dict[str, str] = {}
    for row in (data or []):
        ident = str(row.get("id")) if row.get("id") else None
        if ident:
            base_map[ident] = _make_fallback_label(fallback_prefix, ident)
    for ident in id_list:
        base_map.setdefault(str(ident), _make_fallback_label(fallback_prefix, ident))
    return base_map


def _load_order_relation_maps(client: Client, store_id: str, rows: List[Dict[str, Any]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    customer_ids: Set[str] = set()
    channel_ids: Set[str] = set()
    for row in rows:
        cid = row.get("customer_id")
        if cid:
            customer_ids.add(str(cid))
        ch_id = row.get("channel_id")
        if ch_id:
            channel_ids.add(str(ch_id))

    customer_map = _load_relation_names(
        client,
        "customers",
        store_id,
        customer_ids,
        ["full_name", "customer_name", "name"],
        "Customer",
    )
    channel_map = _load_relation_names(
        client,
        "sales_channels",
        store_id,
        channel_ids,
        ["name", "channel_name"],
        "Channel",
    )

    return customer_map, channel_map


def _map_order(
    row: Dict[str, Any],
    customer_names: Optional[Dict[str, str]] = None,
    channel_names: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    customer_name = None
    channel_name = None
    if customer_names and row.get("customer_id"):
        customer_name = customer_names.get(str(row.get("customer_id")))
    if channel_names and row.get("channel_id"):
        channel_name = channel_names.get(str(row.get("channel_id")))
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "customer_id": row.get("customer_id"),
        "customer_name": customer_name,
        "channel_id": row.get("channel_id"),
        "channel_name": channel_name,
        "order_type": row.get("order_type"),
        "pickup_type": row.get("pickup_type"),
        "pickup_time": row.get("pickup_time"),
        "status": row.get("status"),
        "payment_status": "pending_review" if row.get("payment_status") == "pending" else row.get("payment_status"),
        "subtotal": float(row.get("subtotal") or 0),
        "discount_amount": float(row.get("discount_amount") or 0),
        "channel_fee": float(row.get("channel_fee") or row.get("channel_fee_total") or 0),
        "total_amount": float(row.get("total_amount") or 0),
        "total_cost": float(row.get("total_cost") or 0),
        "gross_profit": float(row.get("gross_profit") or 0),
        "note": row.get("note"),
        "cancelled_reason": row.get("cancelled_reason"),
        "cancelled_at": row.get("cancelled_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _order_select_columns(use_channel_fee: bool = True) -> str:
    columns = [
        "id",
        "store_id",
        "customer_id",
        "channel_id",
        "order_type",
        "pickup_type",
        "pickup_time",
        "status",
        "payment_status",
        "subtotal",
        "discount_amount",
        "channel_fee" if use_channel_fee else "channel_fee_total",
        "total_amount",
        "total_cost",
        "gross_profit",
        "note",
        "cancelled_reason",
        "cancelled_at",
    ]
    columns.extend([
        "created_at",
        "updated_at",
    ])
    return ", ".join(columns)


def _recalculate_order_totals(client: Client, store_id: str, order_id: str) -> None:
    items_query = client.table("order_items").select("quantity, unit_price, unit_cost").eq("order_id", order_id)
    if _order_items_supports_store_scope(client):
        items_query = items_query.eq("store_id", store_id)
    items_resp = items_query.execute()
    if getattr(items_resp, "error", None):
        raise HTTPException(status_code=500, detail="order_totals_recalc_failed")
    items = getattr(items_resp, "data", None) or []

    subtotal = 0.0
    total_cost = 0.0
    for item in items:
        qty = float(item.get("quantity") or 0)
        unit_price = float(item.get("unit_price") or 0)
        unit_cost = float(item.get("unit_cost") or 0)
        subtotal += qty * unit_price
        total_cost += qty * unit_cost

    order_resp = client.table("orders").select("id, channel_id, discount_amount").eq("id", order_id).eq("store_id", store_id).limit(1).execute()
    if getattr(order_resp, "error", None):
        raise HTTPException(status_code=500, detail="order_lookup_failed")
    rows = getattr(order_resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
    order_row = rows[0]

    channel_fee = 0.0
    channel_id = order_row.get("channel_id")
    if channel_id:
        channel_resp = client.table("sales_channels").select("fee_type, fee_value").eq("id", channel_id).eq("store_id", store_id).limit(1).execute()
        if not getattr(channel_resp, "error", None):
            channel_rows = getattr(channel_resp, "data", None) or []
            if channel_rows:
                fee_type = str(channel_rows[0].get("fee_type") or "none")
                fee_value = float(channel_rows[0].get("fee_value") or 0)
                if fee_type == "percent":
                    channel_fee = subtotal * (fee_value / 100)
                elif fee_type == "fixed":
                    channel_fee = fee_value

    discount_amount = float(order_row.get("discount_amount") or 0)
    total_amount = subtotal + channel_fee - discount_amount
    gross_profit = total_amount - total_cost - channel_fee

    update_data = {
        "subtotal": subtotal,
        "total_cost": total_cost,
        "channel_fee": channel_fee,
        "total_amount": total_amount,
        "gross_profit": gross_profit,
    }
    update_resp = client.table("orders").update(update_data).eq("id", order_id).eq("store_id", store_id).execute()
    if getattr(update_resp, "error", None):
        err = getattr(update_resp, "error")
        if _is_missing_column(err, "channel_fee"):
            fallback = {
                "subtotal": subtotal,
                "total_cost": total_cost,
                "channel_fee_total": channel_fee,
                "total_amount": total_amount,
                "gross_profit": gross_profit,
            }
            update_resp = client.table("orders").update(fallback).eq("id", order_id).eq("store_id", store_id).execute()
            if getattr(update_resp, "error", None):
                raise HTTPException(status_code=500, detail="order_totals_recalc_failed")
        else:
            raise HTTPException(status_code=500, detail="order_totals_recalc_failed")


def _write_order_status_log(
    client: Client,
    order_id: str,
    from_status: Optional[str],
    to_status: str,
    changed_by: Optional[str],
    note: Optional[str] = None,
) -> None:
    payload = {
        "order_id": order_id,
        "from_status": from_status,
        "to_status": to_status,
        "changed_by": changed_by,
        "changed_by_type": "admin",
        "note": note,
    }
    def _insert(data: Dict[str, Any]) -> None:
        resp = client.table("order_status_logs").insert(data).execute()
        err = getattr(resp, "error", None)
        if err:
            raise err

    try:
        _insert(payload)
    except Exception as exc:
        missing_optional = any(_is_missing_column(exc, k) for k in ["changed_by", "changed_by_type", "note"])
        if missing_optional:
            trimmed = _omit_optional_fields(payload, ["changed_by", "changed_by_type", "note"])
            try:
                _insert(trimmed)
                return
            except Exception as exc2:
                logger.warning("order_status_log_failed_trimmed: %s", getattr(exc2, "message", str(exc2)))
                return
        logger.warning("order_status_log_failed: %s", getattr(exc, "message", str(exc)))
        return


def _get_order_row(client: Client, order_id: str, store_id: str) -> Dict[str, Any]:
    resp = client.table("orders").select("id, store_id, status, payment_status").eq("id", order_id).limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="order_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
    row = data[0]
    if str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")
    return row


def _get_order_customer_context(client: Client, store_id: str, order_id: str) -> Dict[str, Any]:
    resp = (
        client.table("orders")
        .select("id, customer_id, customers(line_user_id)")
        .eq("id", order_id)
        .eq("store_id", store_id)
        .limit(1)
        .execute()
    )
    if getattr(resp, "error", None):
        return {"customer_id": None, "line_user_id": None}
    rows = getattr(resp, "data", None) or []
    if not rows:
        return {"customer_id": None, "line_user_id": None}
    row = rows[0]
    customer_rel = row.get("customers") if isinstance(row, dict) else None
    return {
        "customer_id": row.get("customer_id"),
        "line_user_id": customer_rel.get("line_user_id") if isinstance(customer_rel, dict) else None,
    }


def _write_mock_line_notification(
    client: Client,
    order_id: str,
    customer_id: Optional[str],
    line_user_id: Optional[str],
    message_type: str,
    message_payload: Dict[str, Any],
) -> None:
    line_user_id_effective = line_user_id or "mock-line-user"
    payload = {
        "order_id": order_id,
        "customer_id": customer_id,
        "line_user_id": line_user_id_effective,
        "message_type": message_type,
        "message_payload": message_payload,
        "send_status": "success",
        "error_message": None,
        "sent_at": datetime.utcnow().isoformat(),
    }
    def _insert(data: Dict[str, Any]) -> None:
        resp = client.table("line_notification_logs").insert(data).execute()
        err = getattr(resp, "error", None)
        if err:
            raise err

    try:
        _insert(payload)
    except Exception as exc:
        missing_optional = any(
            _is_missing_column(exc, k)
            for k in [
                "customer_id",
                "line_user_id",
                "message_payload",
                "error_message",
                "sent_at",
            ]
        )
        send_status_missing = _is_missing_column(exc, "send_status")

        if missing_optional or send_status_missing:
            trimmed = _omit_optional_fields(
                payload,
                [
                    "customer_id",
                    "line_user_id",
                    "message_payload",
                    "error_message",
                    "sent_at",
                ]
                + (["send_status"] if send_status_missing else []),
            )
            try:
                _insert(trimmed)
                return
            except Exception as exc2:
                logger.warning(
                    "mock_notification_log_failed_trimmed order=%s type=%s: %s",
                    order_id,
                    message_type,
                    getattr(exc2, "message", str(exc2)),
                )
                return
        logger.warning(
            "mock_notification_log_failed order=%s type=%s: %s",
            order_id,
            message_type,
            getattr(exc, "message", str(exc)),
        )
        return


@router.get("/orders")
def list_orders(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    use_channel_fee = True
    while True:
        select_cols = _order_select_columns(use_channel_fee)
        resp = (
            ctx["client"].table("orders").select(select_cols).eq("store_id", store_id_resolved).order("created_at", desc=True).execute()
        )
        err = getattr(resp, "error", None)
        if not err:
            break
        missing_col = _extract_missing_column(err)
        if use_channel_fee and missing_col == "channel_fee":
            use_channel_fee = False
            continue
        raise HTTPException(status_code=500, detail="order_query_failed")

    rows = getattr(resp, "data", None) or []
    customer_map, channel_map = _load_order_relation_maps(ctx["client"], store_id_resolved, rows)
    order_ids = [str(r.get("id")) for r in rows if r.get("id")]

    item_map: Dict[str, List[Dict[str, Any]]] = {}
    if order_ids:
        item_query = (
            ctx["client"]
            .table("order_items")
            .select(_order_item_select_clause(ctx["client"]))
            .in_("order_id", order_ids)
            .order("created_at", desc=False)
        )
        if _order_items_supports_store_scope(ctx["client"]):
            item_query = item_query.eq("store_id", store_id_resolved)
        item_resp = item_query.execute()
        if getattr(item_resp, "error", None):
            raise HTTPException(status_code=500, detail="order_items_query_failed")
        for item in (getattr(item_resp, "data", None) or []):
            oid = str(item.get("order_id"))
            item_map.setdefault(oid, []).append(_map_order_item(item))

    mapped = []
    for row in rows:
        itemized = _map_order(row, customer_map, channel_map)
        itemized["items"] = item_map.get(str(row.get("id")), [])
        mapped.append(itemized)

    return {"items": mapped, "store_id": store_id_resolved}


@router.post("/orders")
def create_order(payload: OrderCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_order_payload(payload)
    items = payload.items or []
    if data.get("customer_id"):
        _ensure_customer_in_store(ctx["client"], data["customer_id"], store_id_resolved)
    if data.get("channel_id"):
        _ensure_channel_in_store(ctx["client"], data["channel_id"], store_id_resolved)

    data["store_id"] = store_id_resolved
    data.pop("items", None)
    logger.warning("creating order with payload: %s", data)

    attempt_data = dict(data)
    order_resp = None
    max_attempts = len(attempt_data) + 1
    for _ in range(max_attempts):
        try:
            order_resp = ctx["client"].table("orders").insert(attempt_data).execute()
            error = getattr(order_resp, "error", None)
        except Exception as exc:
            error = exc
        if not error:
            break
        missing_col = _extract_missing_column(error)
        if missing_col and missing_col in attempt_data:
            logger.warning("orders insert missing column %s; retrying without it", missing_col)
            attempt_data.pop(missing_col, None)
            continue
        message = getattr(error, "message", str(error))
        logger.error("order_create_failed: %s", message)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "order_create_failed",
                "error": message,
                "payload_keys": list(attempt_data.keys()),
            },
        )
    else:
        raise HTTPException(status_code=500, detail="order_create_failed:max_attempts_exceeded")

    order_rows = getattr(order_resp, "data", None) or []
    created = order_rows[0] if order_rows else attempt_data
    order_id = str(created.get("id"))

    item_rows: List[Dict[str, Any]] = []
    for raw_item in items:
        item_data = _sanitize_order_item_payload(raw_item)
        product_row = _ensure_product_in_store(ctx["client"], item_data["product_id"], store_id_resolved)
        base_payload = {**item_data, "order_id": order_id}
        if _order_items_has_column(ctx["client"], "product_name_snapshot"):
            product_name = product_row.get("name") if isinstance(product_row, dict) else None
            if not product_name:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_name_missing")
            base_payload["product_name_snapshot"] = product_name
        if _order_items_supports_store_scope(ctx["client"]):
            base_payload["store_id"] = store_id_resolved
        item_rows.append(_prune_order_item_columns(ctx["client"], base_payload))

    if item_rows:
        item_resp = ctx["client"].table("order_items").insert(item_rows).execute()
        if getattr(item_resp, "error", None):
            raise HTTPException(status_code=500, detail="order_items_create_failed")

    _recalculate_order_totals(ctx["client"], store_id_resolved, order_id)
    initial_status = str(created.get("status") or data.get("status") or "pending_payment")
    _write_order_status_log(ctx["client"], order_id, None, initial_status, ctx.get("user_id"), payload.note)
    return {"id": order_id, "status": "created"}


@router.get("/orders/{order_id}")
def get_order(order_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    use_channel_fee = True
    while True:
        select_cols = _order_select_columns(use_channel_fee)
        resp = (
            ctx["client"].table("orders").select(select_cols).eq("id", order_id).eq("store_id", store_id_resolved).limit(1).execute()
        )
        err = getattr(resp, "error", None)
        if not err:
            break
        missing_col = _extract_missing_column(err)
        if use_channel_fee and missing_col == "channel_fee":
            use_channel_fee = False
            continue
        raise HTTPException(status_code=500, detail="order_query_failed")

    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
    row = rows[0]

    customer_map, channel_map = _load_order_relation_maps(ctx["client"], store_id_resolved, [row])

    item_query = (
        ctx["client"]
        .table("order_items")
        .select(_order_item_select_clause(ctx["client"]))
        .eq("order_id", order_id)
        .order("created_at", desc=False)
    )
    if _order_items_supports_store_scope(ctx["client"]):
        item_query = item_query.eq("store_id", store_id_resolved)
    item_resp = item_query.execute()
    if getattr(item_resp, "error", None):
        raise HTTPException(status_code=500, detail="order_items_query_failed")

    mapped = _map_order(row, customer_map, channel_map)
    mapped["items"] = [_map_order_item(i) for i in (getattr(item_resp, "data", None) or [])]
    return mapped


@router.patch("/orders/{order_id}")
def update_order(order_id: str, payload: OrderUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_order_row(ctx["client"], order_id, store_id_resolved)
    data = _sanitize_order_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    if data.get("customer_id"):
        _ensure_customer_in_store(ctx["client"], data["customer_id"], store_id_resolved)
    if data.get("channel_id"):
        _ensure_channel_in_store(ctx["client"], data["channel_id"], store_id_resolved)

    next_status = data.get("status")
    if next_status and not _valid_order_transition(str(current.get("status") or ""), str(next_status)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_status_transition")

    resp = ctx["client"].table("orders").update(data).eq("id", order_id).eq("store_id", store_id_resolved).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_update_failed")

    _recalculate_order_totals(ctx["client"], store_id_resolved, order_id)

    new_status = next_status
    response: Dict[str, Any] = {"id": order_id, "status": "updated"}
    if new_status and str(new_status) != str(current.get("status")):
        _write_order_status_log(
            ctx["client"],
            order_id,
            str(current.get("status") or ""),
            str(new_status),
            ctx.get("user_id"),
            data.get("note"),
        )
        if str(new_status) == "ready":
            mock_message = "เครื่องดื่มของคุณพร้อมแล้ว สามารถมารับได้เลยครับ"
            customer_ctx = _get_order_customer_context(ctx["client"], store_id_resolved, order_id)
            _write_mock_line_notification(
                ctx["client"],
                order_id,
                customer_ctx.get("customer_id"),
                customer_ctx.get("line_user_id"),
                "order_ready",
                {"order_id": order_id, "message": mock_message},
            )
            response["mock_notification"] = mock_message

    return response


@router.delete("/orders/{order_id}")
def delete_order(order_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _get_order_row(ctx["client"], order_id, store_id_resolved)

    pay_resp = ctx["client"].table("payments").select("id").eq("store_id", store_id_resolved).eq("order_id", order_id).limit(1).execute()
    if getattr(pay_resp, "error", None):
        raise HTTPException(status_code=500, detail="payment_lookup_failed")
    if getattr(pay_resp, "data", None):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="order_has_payments")

    delete_query = ctx["client"].table("order_items").delete().eq("order_id", order_id)
    if _order_items_supports_store_scope(ctx["client"]):
        delete_query = delete_query.eq("store_id", store_id_resolved)
    delete_query.execute()
    ctx["client"].table("order_status_logs").delete().eq("order_id", order_id).execute()
    ctx["client"].table("payment_status_logs").delete().eq("order_id", order_id).execute()
    ctx["client"].table("orders").delete().eq("id", order_id).eq("store_id", store_id_resolved).execute()
    return {"status": "deleted"}


@router.patch("/orders/{order_id}/status")
def update_order_status(order_id: str, payload: OrderStatusUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_order_row(ctx["client"], order_id, store_id_resolved)
    next_status = payload.status
    if next_status == "ready_for_pickup":
        next_status = "ready"

    if not _valid_order_transition(str(current.get("status") or ""), str(next_status)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_status_transition")

    resp = ctx["client"].table("orders").update({"status": next_status}).eq("id", order_id).eq("store_id", store_id_resolved).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_status_update_failed")

    _write_order_status_log(
        ctx["client"],
        order_id,
        str(current.get("status") or ""),
        str(next_status),
        ctx.get("user_id"),
        payload.note,
    )

    response: Dict[str, Any] = {"id": order_id, "status": str(next_status)}
    if str(next_status) == "ready":
        mock_message = "เครื่องดื่มของคุณพร้อมแล้ว สามารถมารับได้เลยครับ"
        customer_ctx = _get_order_customer_context(ctx["client"], store_id_resolved, order_id)
        _write_mock_line_notification(
            ctx["client"],
            order_id,
            customer_ctx.get("customer_id"),
            customer_ctx.get("line_user_id"),
            "order_ready",
            {"order_id": order_id, "message": mock_message},
        )
        response["mock_notification"] = mock_message

    return response


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: str, payload: OrderCancelPayload, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_order_row(ctx["client"], order_id, store_id_resolved)
    if not _valid_order_transition(str(current.get("status") or ""), "cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_status_transition")

    update_data = {
        "status": "cancelled",
        "cancelled_reason": (payload.reason or "").strip() or None,
        "cancelled_at": datetime.utcnow().isoformat(),
    }
    resp = ctx["client"].table("orders").update(update_data).eq("id", order_id).eq("store_id", store_id_resolved).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_cancel_failed")

    _write_order_status_log(
        ctx["client"],
        order_id,
        str(current.get("status") or ""),
        "cancelled",
        ctx.get("user_id"),
        (payload.reason or "").strip() or None,
    )
    return {"id": order_id, "status": "cancelled"}


@router.get("/orders/{order_id}/items")
def list_order_items(order_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)
    _get_order_row(ctx["client"], order_id, store_id_resolved)

    list_query = (
        ctx["client"]
        .table("order_items")
        .select(_order_item_select_clause(ctx["client"]))
        .eq("order_id", order_id)
        .order("created_at", desc=False)
    )
    if _order_items_supports_store_scope(ctx["client"]):
        list_query = list_query.eq("store_id", store_id_resolved)
    resp = list_query.execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_items_query_failed")
    rows = getattr(resp, "data", None) or []
    return {"items": [_map_order_item(r) for r in rows], "order_id": order_id, "store_id": store_id_resolved}


@router.post("/orders/{order_id}/items")
def create_order_item(order_id: str, payload: OrderItemPayload, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _get_order_row(ctx["client"], order_id, store_id_resolved)
    data = _sanitize_order_item_payload(payload)
    product_row = _ensure_product_in_store(ctx["client"], data["product_id"], store_id_resolved)

    qty = float(data.get("quantity") or 0)
    unit_price = float(data.get("unit_price") or 0)
    unit_cost = float(data.get("unit_cost") or 0)
    insert_data = {
        **data,
        "line_total": qty * unit_price,
        "line_cost": qty * unit_cost,
        "line_profit": (qty * unit_price) - (qty * unit_cost),
        "order_id": order_id,
    }
    if _order_items_has_column(ctx["client"], "product_name_snapshot"):
        product_name = product_row.get("name") if isinstance(product_row, dict) else None
        if not product_name:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_name_missing")
        insert_data["product_name_snapshot"] = product_name
    if _order_items_supports_store_scope(ctx["client"]):
        insert_data["store_id"] = store_id_resolved
    pruned_insert = _prune_order_item_columns(ctx["client"], insert_data)
    resp = ctx["client"].table("order_items").insert(pruned_insert).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_item_create_failed")
    rows = getattr(resp, "data", None) or []
    _recalculate_order_totals(ctx["client"], store_id_resolved, order_id)
    return _map_order_item(rows[0] if rows else pruned_insert)


@router.patch("/order-items/{item_id}")
def update_order_item(item_id: str, payload: OrderItemUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_order_item_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    exists_query = ctx["client"].table("order_items").select("id, store_id, order_id, product_id").eq("id", item_id).limit(1)
    if _order_items_supports_store_scope(ctx["client"]):
        exists_query = exists_query.eq("store_id", store_id_resolved)
    exists_resp = exists_query.execute()
    exists = getattr(exists_resp, "data", None) or []
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_item_not_found")
    row = exists[0]
    if str(row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    target_product = data.get("product_id") or row.get("product_id")
    _ensure_product_in_store(ctx["client"], target_product, store_id_resolved)

    target_qty = float(data.get("quantity") if data.get("quantity") is not None else row.get("quantity") or 0)
    target_unit_price = float(data.get("unit_price") if data.get("unit_price") is not None else row.get("unit_price") or 0)
    target_unit_cost = float(data.get("unit_cost") if data.get("unit_cost") is not None else row.get("unit_cost") or 0)
    data["line_total"] = target_qty * target_unit_price
    data["line_cost"] = target_qty * target_unit_cost
    data["line_profit"] = data["line_total"] - data["line_cost"]

    pruned_update = _prune_order_item_columns(ctx["client"], data)

    update_query = ctx["client"].table("order_items").update(pruned_update).eq("id", item_id)
    if _order_items_supports_store_scope(ctx["client"]):
        update_query = update_query.eq("store_id", store_id_resolved)
    resp = update_query.execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_item_update_failed")
    rows = getattr(resp, "data", None) or []
    updated = rows[0] if rows else (row | pruned_update)
    _recalculate_order_totals(ctx["client"], store_id_resolved, str(row.get("order_id")))
    return _map_order_item(updated)


@router.delete("/order-items/{item_id}")
def delete_order_item(item_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    exists_query = ctx["client"].table("order_items").select("id, store_id, order_id").eq("id", item_id).limit(1)
    if _order_items_supports_store_scope(ctx["client"]):
        exists_query = exists_query.eq("store_id", store_id_resolved)
    exists_resp = exists_query.execute()
    exists = getattr(exists_resp, "data", None) or []
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_item_not_found")
    row = exists[0]
    if str(row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    delete_item_query = ctx["client"].table("order_items").delete().eq("id", item_id)
    if _order_items_supports_store_scope(ctx["client"]):
        delete_item_query = delete_item_query.eq("store_id", store_id_resolved)
    delete_item_query.execute()
    _recalculate_order_totals(ctx["client"], store_id_resolved, str(row.get("order_id")))
    return {"status": "deleted"}


# ─── Payments (manual flow + slip review) ─────────────────────────────────────


def _valid_payment_transition(from_status: str, to_status: str) -> bool:
    if from_status == to_status:
        return True
    allowed: Dict[str, List[str]] = {
        "unpaid": ["pending", "pending_review", "paid", "rejected"],
        "pending": ["pending_review", "paid", "rejected", "refunded"],
        "pending_review": ["paid", "rejected"],
        "paid": ["refunded"],
        "rejected": ["pending", "pending_review"],
        "refunded": [],
    }
    return to_status in allowed.get(from_status, [])


def _sanitize_payment_payload(payload: PaymentCreate | PaymentUpdate, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    if not partial and not data.get("method"):
        data["method"] = "transfer"

    if "amount" in data and data["amount"] is not None:
        amount = float(data.get("amount") or 0)
        if amount < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payment_amount_non_negative")
        data["amount"] = amount

    if "status" in data and data.get("status") == "pending":
        data["status"] = "pending"

    return data


def _map_payment(row: Dict[str, Any]) -> Dict[str, Any]:
    order_rel = row.get("orders") if isinstance(row, dict) else None
    customer_rel = order_rel.get("customers") if isinstance(order_rel, dict) else None
    customer_name = None
    if isinstance(customer_rel, dict):
        customer_name = (
            customer_rel.get("display_name")
            or customer_rel.get("name")
            or customer_rel.get("customer_name")
        )
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "order_id": row.get("order_id"),
        "order_status": order_rel.get("status") if isinstance(order_rel, dict) else None,
        "order_payment_status": order_rel.get("payment_status") if isinstance(order_rel, dict) else None,
        "customer_name": customer_name,
        "amount": float(row.get("amount") or 0),
        "method": row.get("method"),
        "status": row.get("status"),
        "slip_url": row.get("slip_url"),
        "slip_storage_path": row.get("slip_storage_path"),
        "slip_file_name": row.get("slip_file_name"),
        "submitted_at": row.get("submitted_at"),
        "confirmed_by": row.get("confirmed_by"),
        "confirmed_at": row.get("confirmed_at"),
        "reject_reason": row.get("reject_reason"),
        "created_at": row.get("created_at"),
    }


def _write_payment_status_log(
    client: Client,
    payment_id: str,
    order_id: str,
    from_status: Optional[str],
    to_status: str,
    changed_by: Optional[str],
    note: Optional[str] = None,
) -> None:
    payload = {
        "payment_id": payment_id,
        "order_id": order_id,
        "from_status": from_status,
        "to_status": to_status,
        "changed_by": changed_by,
        "changed_by_type": "admin",
        "note": note,
    }
    def _insert(data: Dict[str, Any]) -> None:
        resp = client.table("payment_status_logs").insert(data).execute()
        err = getattr(resp, "error", None)
        if err:
            raise err

    try:
        _insert(payload)
    except Exception as exc:
        missing_optional = any(_is_missing_column(exc, k) for k in ["changed_by", "changed_by_type", "note"])
        if missing_optional:
            trimmed = _omit_optional_fields(payload, ["changed_by", "changed_by_type", "note"])
            try:
                _insert(trimmed)
                return
            except Exception as exc2:
                logger.warning("payment_status_log_failed_trimmed: %s", getattr(exc2, "message", str(exc2)))
                return
        logger.warning("payment_status_log_failed: %s", getattr(exc, "message", str(exc)))
        return


def _get_payment_row(client: Client, payment_id: str, store_id: str) -> Dict[str, Any]:
    select_cols = _payment_lookup_columns(client)
    query = client.table("payments").select(select_cols).eq("id", payment_id).limit(1)
    if _payments_supports_store_scope(client):
        query = query.eq("store_id", store_id)
    resp = query.execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="payment_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="payment_not_found")
    row = rows[0]
    if _payments_supports_store_scope(client):
        store_value = row.get("store_id")
        if store_value is not None and str(store_value) != str(store_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")
    return row


def _sync_order_payment_status(
    client: Client,
    store_id: str,
    order_id: str,
    payment_status: str,
    next_order_status: Optional[str] = None,
    changed_by: Optional[str] = None,
    note: Optional[str] = None,
) -> None:
    order_before = _get_order_row(client, order_id, store_id)
    update_payload: Dict[str, Any] = {"payment_status": payment_status}
    if next_order_status:
        update_payload["status"] = next_order_status

    resp = client.table("orders").update(update_payload).eq("id", order_id).eq("store_id", store_id).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_payment_sync_failed")

    if next_order_status and str(order_before.get("status") or "") != str(next_order_status):
        _write_order_status_log(
            client,
            order_id,
            str(order_before.get("status") or ""),
            str(next_order_status),
            changed_by,
            note,
        )


@router.get("/payments")
def list_payments(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    select_cols = _payment_select_clause(ctx["client"], include_relations=True, include_slip_fields=True)
    query = ctx["client"].table("payments").select(select_cols).order("created_at", desc=True)
    if _payments_supports_store_scope(ctx["client"]):
        query = query.eq("store_id", store_id_resolved)
    resp = query.execute()
    err = getattr(resp, "error", None)
    if err and _is_missing_column(err, "slip_url"):
        fallback_cols = _payment_select_clause(ctx["client"], include_relations=True, include_slip_fields=False)
        fallback_query = ctx["client"].table("payments").select(fallback_cols).order("created_at", desc=True)
        if _payments_supports_store_scope(ctx["client"]):
            fallback_query = fallback_query.eq("store_id", store_id_resolved)
        resp = fallback_query.execute()
        err = getattr(resp, "error", None)
    if err and (_is_missing_column(err, "customers") or _is_missing_column(err, "customers.name") or _is_missing_column(err, "customers.display_name")):
        fallback_cols = _payment_select_clause(ctx["client"], include_relations=False, include_slip_fields=not _is_missing_column(err, "slip_url"))
        fallback_query = ctx["client"].table("payments").select(fallback_cols).order("created_at", desc=True)
        if _payments_supports_store_scope(ctx["client"]):
            fallback_query = fallback_query.eq("store_id", store_id_resolved)
        resp = fallback_query.execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_query_failed")

    rows = getattr(resp, "data", None) or []
    mapped = [_map_payment(r) for r in rows]
    queue = [p for p in mapped if p.get("status") in {"pending", "pending_review"}]
    return {"items": mapped, "payment_queue": queue, "store_id": store_id_resolved}


@router.get("/orders/{order_id}/payments")
def list_order_payments(order_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)
    _get_order_row(ctx["client"], order_id, store_id_resolved)

    select_cols = _payment_select_clause(ctx["client"], include_relations=False, include_slip_fields=True)
    query = ctx["client"].table("payments").select(select_cols).eq("order_id", order_id).order("created_at", desc=True)
    if _payments_supports_store_scope(ctx["client"]):
        query = query.eq("store_id", store_id_resolved)
    resp = query.execute()
    err = getattr(resp, "error", None)
    if err and _is_missing_column(err, "slip_url"):
        fallback_cols = _payment_select_clause(ctx["client"], include_relations=False, include_slip_fields=False)
        fallback_query = ctx["client"].table("payments").select(fallback_cols).eq("order_id", order_id).order("created_at", desc=True)
        if _payments_supports_store_scope(ctx["client"]):
            fallback_query = fallback_query.eq("store_id", store_id_resolved)
        resp = fallback_query.execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_query_failed")

    rows = getattr(resp, "data", None) or []
    return {"items": [_map_payment(r) for r in rows], "order_id": order_id, "store_id": store_id_resolved}


@router.post("/orders/{order_id}/payments")
def create_order_payment(order_id: str, payload: PaymentCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _get_order_row(ctx["client"], order_id, store_id_resolved)
    data = _sanitize_payment_payload(payload)

    order_total_resp = (
        ctx["client"]
        .table("orders")
        .select("id, total_amount")
        .eq("id", order_id)
        .eq("store_id", store_id_resolved)
        .limit(1)
        .execute()
    )
    if getattr(order_total_resp, "error", None):
        raise HTTPException(status_code=500, detail="order_lookup_failed")
    order_rows = getattr(order_total_resp, "data", None) or []
    if not order_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
    order_total = float(order_rows[0].get("total_amount") or 0)

    has_slip = bool(payload.slip_url or payload.slip_storage_path)
    status_value = "pending_review" if has_slip else "pending"

    create_payload: Dict[str, Any] = {
        "store_id": store_id_resolved,
        "order_id": order_id,
        "amount": float(data.get("amount") if data.get("amount") is not None else order_total),
        "method": data.get("method") or "transfer",
        "status": status_value,
        "slip_url": payload.slip_url,
        "slip_storage_path": payload.slip_storage_path,
        "slip_file_name": payload.slip_file_name,
        "submitted_at": datetime.utcnow().isoformat() if has_slip else None,
    }

    pruned_payload = _prune_payment_columns(ctx["client"], create_payload)

    resp = ctx["client"].table("payments").insert(pruned_payload).execute()
    err = getattr(resp, "error", None)
    if err and _is_missing_column(err, "slip_url"):
        fallback = {
            "order_id": order_id,
            "amount": pruned_payload.get("amount"),
            "method": pruned_payload.get("method"),
            "status": status_value,
        }
        if _payments_has_column(ctx["client"], "store_id"):
            fallback["store_id"] = store_id_resolved
        resp = ctx["client"].table("payments").insert(fallback).execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_create_failed")

    rows = getattr(resp, "data", None) or []
    created = rows[0] if rows else create_payload
    payment_id = str(created.get("id"))

    target_order_status = "waiting_payment_review" if status_value == "pending_review" else None
    order_payment_status = "pending_review" if status_value == "pending_review" else "unpaid"
    _sync_order_payment_status(
        ctx["client"],
        store_id_resolved,
        order_id,
        order_payment_status,
        target_order_status,
        ctx.get("user_id"),
        None,
    )
    _write_payment_status_log(ctx["client"], payment_id, order_id, None, status_value, ctx.get("user_id"), None)

    return {"id": payment_id, "status": status_value}


@router.patch("/payments/{payment_id}")
def update_payment(payment_id: str, payload: PaymentUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_payment_row(ctx["client"], payment_id, store_id_resolved)
    data = _sanitize_payment_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    next_status = data.get("status")
    if next_status and not _valid_payment_transition(str(current.get("status") or ""), str(next_status)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payment_status_transition")

    if next_status == "paid":
        data["confirmed_by"] = ctx.get("user_id")
        data["confirmed_at"] = datetime.utcnow().isoformat()
        data["reject_reason"] = None
    elif next_status == "rejected":
        data["confirmed_by"] = None
        data["confirmed_at"] = None

    update_query = ctx["client"].table("payments").update(data).eq("id", payment_id)
    if _payments_supports_store_scope(ctx["client"]):
        update_query = update_query.eq("store_id", store_id_resolved)
    resp = update_query.execute()
    err = getattr(resp, "error", None)
    if err and any(_is_missing_column(err, k) for k in ["confirmed_by", "confirmed_at", "reject_reason"]):
        trimmed = _omit_optional_fields(data, ["confirmed_by", "confirmed_at", "reject_reason"])
        trimmed_query = ctx["client"].table("payments").update(trimmed).eq("id", payment_id)
        if _payments_supports_store_scope(ctx["client"]):
            trimmed_query = trimmed_query.eq("store_id", store_id_resolved)
        resp = trimmed_query.execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_update_failed")

    if next_status and str(next_status) != str(current.get("status")):
        order_id = str(current.get("order_id"))
        if next_status == "paid":
            _sync_order_payment_status(
                ctx["client"],
                store_id_resolved,
                order_id,
                "paid",
                "accepted",
                ctx.get("user_id"),
                data.get("note"),
            )
        elif next_status == "rejected":
            _sync_order_payment_status(
                ctx["client"],
                store_id_resolved,
                order_id,
                "rejected",
                None,
                ctx.get("user_id"),
                data.get("note"),
            )
        elif next_status == "pending_review":
            _sync_order_payment_status(
                ctx["client"],
                store_id_resolved,
                order_id,
                "pending_review",
                "waiting_payment_review",
                ctx.get("user_id"),
                data.get("note"),
            )
        _write_payment_status_log(
            ctx["client"],
            payment_id,
            order_id,
            str(current.get("status") or ""),
            str(next_status),
            ctx.get("user_id"),
            data.get("note"),
        )

    return {"id": payment_id, "status": data.get("status") or current.get("status")}


@router.post("/payments/{payment_id}/submit-slip")
def submit_payment_slip(payment_id: str, payload: PaymentSubmitSlip, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_payment_row(ctx["client"], payment_id, store_id_resolved)
    if not _valid_payment_transition(str(current.get("status") or ""), "pending_review"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payment_status_transition")

    update_payload = {
        "status": "pending_review",
        "slip_url": payload.slip_url,
        "slip_storage_path": payload.slip_storage_path,
        "slip_file_name": payload.slip_file_name,
        "submitted_at": datetime.utcnow().isoformat(),
    }
    update_query = ctx["client"].table("payments").update(update_payload).eq("id", payment_id)
    if _payments_supports_store_scope(ctx["client"]):
        update_query = update_query.eq("store_id", store_id_resolved)
    resp = update_query.execute()
    err = getattr(resp, "error", None)
    if err and any(_is_missing_column(err, k) for k in ["slip_url", "slip_storage_path", "slip_file_name", "submitted_at"]):
        trimmed = _omit_optional_fields(update_payload, ["slip_url", "slip_storage_path", "slip_file_name", "submitted_at"])
        trimmed_query = ctx["client"].table("payments").update(trimmed).eq("id", payment_id)
        if _payments_supports_store_scope(ctx["client"]):
            trimmed_query = trimmed_query.eq("store_id", store_id_resolved)
        resp = trimmed_query.execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_submit_slip_failed")

    order_id = str(current.get("order_id"))
    _sync_order_payment_status(
        ctx["client"],
        store_id_resolved,
        order_id,
        "pending_review",
        "waiting_payment_review",
        ctx.get("user_id"),
        payload.note,
    )
    _write_payment_status_log(
        ctx["client"],
        payment_id,
        order_id,
        str(current.get("status") or ""),
        "pending_review",
        ctx.get("user_id"),
        payload.note,
    )

    return {"id": payment_id, "status": "pending_review"}


@router.post("/payments/{payment_id}/approve")
def approve_payment(payment_id: str, payload: Optional[PaymentApprovePayload] = None, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_payment_row(ctx["client"], payment_id, store_id_resolved)
    if not _valid_payment_transition(str(current.get("status") or ""), "paid"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payment_status_transition")

    update_payload = {
        "status": "paid",
        "confirmed_by": ctx.get("user_id"),
        "confirmed_at": datetime.utcnow().isoformat(),
        "reject_reason": None,
    }
    update_query = ctx["client"].table("payments").update(update_payload).eq("id", payment_id)
    if _payments_supports_store_scope(ctx["client"]):
        update_query = update_query.eq("store_id", store_id_resolved)
    resp = update_query.execute()
    err = getattr(resp, "error", None)
    if err and any(_is_missing_column(err, k) for k in ["confirmed_by", "confirmed_at", "reject_reason"]):
        trimmed = _omit_optional_fields(update_payload, ["confirmed_by", "confirmed_at", "reject_reason"])
        trimmed_query = ctx["client"].table("payments").update(trimmed).eq("id", payment_id)
        if _payments_supports_store_scope(ctx["client"]):
            trimmed_query = trimmed_query.eq("store_id", store_id_resolved)
        resp = trimmed_query.execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_approve_failed")

    order_id = str(current.get("order_id"))
    note = (payload.note or "").strip() if payload else None
    _sync_order_payment_status(
        ctx["client"],
        store_id_resolved,
        order_id,
        "paid",
        "accepted",
        ctx.get("user_id"),
        note or None,
    )
    _write_payment_status_log(
        ctx["client"],
        payment_id,
        order_id,
        str(current.get("status") or ""),
        "paid",
        ctx.get("user_id"),
        note or None,
    )

    mock_message = "ตรวจสอบการชำระเงินสำเร็จแล้ว กำลังเตรียมเครื่องดื่มให้คุณ"
    customer_ctx = _get_order_customer_context(ctx["client"], store_id_resolved, order_id)
    _write_mock_line_notification(
        ctx["client"],
        order_id,
        customer_ctx.get("customer_id"),
        customer_ctx.get("line_user_id"),
        "payment_approved",
        {"payment_id": payment_id, "order_id": order_id, "message": mock_message},
    )
    return {
        "id": payment_id,
        "status": "paid",
        "mock_notification": mock_message,
    }


@router.post("/payments/{payment_id}/reject")
def reject_payment(payment_id: str, payload: PaymentRejectPayload, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_payment_row(ctx["client"], payment_id, store_id_resolved)
    if not _valid_payment_transition(str(current.get("status") or ""), "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payment_status_transition")

    update_payload = {
        "status": "rejected",
        "reject_reason": (payload.reason or "").strip() or None,
        "confirmed_by": None,
        "confirmed_at": None,
    }
    resp = ctx["client"].table("payments").update(update_payload).eq("id", payment_id).eq("store_id", store_id_resolved).execute()
    err = getattr(resp, "error", None)
    if err and any(_is_missing_column(err, k) for k in ["reject_reason", "confirmed_by", "confirmed_at"]):
        trimmed = _omit_optional_fields(update_payload, ["reject_reason", "confirmed_by", "confirmed_at"])
        resp = ctx["client"].table("payments").update(trimmed).eq("id", payment_id).eq("store_id", store_id_resolved).execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_reject_failed")

    order_id = str(current.get("order_id"))
    note = (payload.note or "").strip() or (payload.reason or "").strip() or None
    _sync_order_payment_status(
        ctx["client"],
        store_id_resolved,
        order_id,
        "rejected",
        None,
        ctx.get("user_id"),
        note,
    )
    _write_payment_status_log(
        ctx["client"],
        payment_id,
        order_id,
        str(current.get("status") or ""),
        "rejected",
        ctx.get("user_id"),
        note,
    )
    return {
        "id": payment_id,
        "status": "rejected",
        "message": "ไม่ผ่านการตรวจสอบการชำระเงิน กรุณาตรวจสอบข้อมูลและส่งหลักฐานใหม่",
    }
