import csv
import logging
import os
import re
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from typing import Any, Callable, Dict, List, Optional, Tuple, Literal, Set, Union
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from supabase import Client

try:  # Python 3.9+
    from zoneinfo import ZoneInfo  # type: ignore
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

DEFAULT_BUSINESS_TIMEZONE = "Asia/Bangkok"
if ZoneInfo is not None:
    try:
        _DEFAULT_TZINFO = ZoneInfo(DEFAULT_BUSINESS_TIMEZONE)
    except Exception:  # pragma: no cover - tzdata missing
        _DEFAULT_TZINFO = timezone(timedelta(hours=7))
else:  # pragma: no cover - zoneinfo unavailable
    _DEFAULT_TZINFO = timezone(timedelta(hours=7))

from app.core.config import settings
from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client
from app.services.cost_engine import build_order_item_record, mask_option_costs, prepare_order_item_snapshot
from app.services.order_item_columns import (
    order_item_select_clause,
    order_items_has_column,
    order_items_supports_store_scope,
    prune_order_item_columns,
)
from app.services.order_totals import recalculate_order_totals, resolve_channel_fee
from app.services.notification_sender import send_line_notification
from app.services.order_numbers import generate_order_number
from app.services.storage import StorageUploadError, create_signed_slip_url, upload_public_asset

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
    "voided",
]
PaymentStatus = Literal["unpaid", "pending", "pending_review", "paid", "rejected", "refunded"]

_DASHBOARD_QUEUE_STATUSES: List[str] = [
    "pending_payment",
    "waiting_payment_review",
    "accepted",
    "preparing",
    "ready",
    "ready_for_pickup",
    "completed",
    "cancelled",
]
CANCELLED_ORDER_STATUSES: Set[str] = {"cancelled", "voided"}
CONFIRMED_PAYMENT_STATUSES: Set[str] = {"paid"}
PENDING_REVIEW_PAYMENT_STATUSES: Set[str] = {"pending_review"}
_FINALIZED_ORDER_STATUSES: Set[str] = {"completed"} | CANCELLED_ORDER_STATUSES
_RECENT_ORDERS_LIMIT = 10
_DASHBOARD_TREND_DAYS = 7

_BUSINESS_ROLES: Set[str] = {"owner", "admin", "manager"}
_MANAGERIAL_ROLES: Set[str] = set(_BUSINESS_ROLES)
_OPERATOR_ROLES: Set[str] = {"owner", "admin", "manager", "staff"}
_PAYMENT_REVIEW_ROLES: Set[str] = set(_OPERATOR_ROLES)
_STAFF_ORDER_STATUS_ALLOWED: Set[str] = {"accepted", "preparing", "ready", "completed"}
_STAFF_CANCEL_OPERATIONAL_STATUSES: Set[str] = {"pending_payment", "draft"}
_ORDER_FINANCIAL_FIELDS: Set[str] = {"total_cost", "gross_profit"}
_ORDER_ITEM_FINANCIAL_FIELDS: Set[str] = {"unit_cost", "line_cost", "line_profit", "total_cost", "option_cost_total"}
SWEETNESS_LEVELS: Tuple[int, ...] = (0, 25, 50, 75, 100)
DEFAULT_SWEETNESS = 100
_MENU_IMAGE_ALLOWED_TYPES: Set[str] = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
_MENU_IMAGE_EXTENSION_MAP: Dict[str, str] = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

CsvAccessor = Union[str, Callable[[Dict[str, Any]], Any]]
CsvColumn = Tuple[str, CsvAccessor]


def _csv_filename(prefix: str) -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return f"{prefix}-{timestamp}.csv"


def _serialize_csv_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _resolve_csv_value(row: Dict[str, Any], accessor: CsvAccessor) -> str:
    try:
        raw = accessor(row) if callable(accessor) else row.get(accessor)
    except Exception:  # pragma: no cover
        raw = None
    return _serialize_csv_value(raw)


def _build_csv_response(filename: str, columns: List[CsvColumn], rows: List[Dict[str, Any]]) -> Response:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow([header for header, _ in columns])
    for row in rows:
        writer.writerow([_resolve_csv_value(row, accessor) for _, accessor in columns])
    content = buffer.getvalue()
    disposition = f'attachment; filename="{filename}"'
    return Response(content=content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": disposition})


_ORDER_EXPORT_COLUMNS_STAFF: List[CsvColumn] = [
    ("order_id", "id"),
    ("order_no", "order_no"),
    ("created_at", "created_at"),
    ("channel", "channel_name"),
    ("status", lambda row: row.get("status") or row.get("order_status")),
    ("payment_status", "payment_status"),
    ("total_amount", "total_amount"),
]

_ORDER_EXPORT_COLUMNS_MANAGER: List[CsvColumn] = _ORDER_EXPORT_COLUMNS_STAFF + [
    ("subtotal", "subtotal"),
    ("discount_amount", "discount_amount"),
    ("channel_fee", "channel_fee"),
    ("total_cost", "total_cost"),
    ("gross_profit", "gross_profit"),
]

_PAYMENT_EXPORT_COLUMNS_STAFF: List[CsvColumn] = [
    ("payment_id", "id"),
    ("order_id", "order_id"),
    ("order_no", "order_no"),
    ("customer_name", "customer_name"),
    ("amount", "amount"),
    ("method", "method"),
    ("status", "status"),
    ("submitted_at", "submitted_at"),
    ("created_at", "created_at"),
]

_PAYMENT_EXPORT_COLUMNS_MANAGER: List[CsvColumn] = _PAYMENT_EXPORT_COLUMNS_STAFF + [
    ("order_status", "order_status"),
    ("order_payment_status", "order_payment_status"),
    ("confirmed_by", "confirmed_by"),
    ("confirmed_at", "confirmed_at"),
    ("reject_reason", "reject_reason"),
]

_SALES_ORDER_EXPORT_COLUMNS: List[CsvColumn] = [
    ("order_id", "order_id"),
    ("order_no", "order_no"),
    ("channel", "channel_name"),
    ("status", "status"),
    ("payment_status", "payment_status"),
    ("sales_amount", "sales_amount"),
    ("cost_amount", "cost_amount"),
    ("gross_profit", "gross_profit"),
    ("gross_margin_percent", "gross_margin_percent"),
    ("created_at", "created_at"),
]


def normalize_order_status(value: Optional[str]) -> str:
    status = str(value or "").strip().lower()
    if status == "void":
        return "voided"
    return status


def normalize_payment_status(value: Optional[str]) -> str:
    status = str(value or "").strip().lower()
    if status == "pending":
        return "pending_review"
    return status


def _staff_can_cancel_operational_order(
    current_status: Optional[str],
    payment_status: Optional[str],
    cancelled_at: Optional[str],
) -> Tuple[bool, Optional[str]]:
    normalized_status = normalize_order_status(current_status)
    normalized_payment = normalize_payment_status(payment_status)

    if cancelled_at or normalized_status in CANCELLED_ORDER_STATUSES:
        return False, "order_already_archived"
    if normalized_status == "completed":
        return False, "order_already_completed"
    if normalized_status == "paid" or normalized_payment in CONFIRMED_PAYMENT_STATUSES:
        return False, "staff_cannot_cancel_paid_order"
    if normalized_payment in PENDING_REVIEW_PAYMENT_STATUSES:
        return False, "insufficient_role_for_status"
    if normalized_status not in _STAFF_CANCEL_OPERATIONAL_STATUSES:
        return False, "insufficient_role_for_status"
    return True, None


def _extract_row_payment_status(row: Dict[str, Any]) -> Optional[str]:
    if not isinstance(row, dict):
        return None
    payment_status = row.get("payment_status")
    latest_payment = row.get("latest_payment")
    if not payment_status and isinstance(latest_payment, dict):
        payment_status = latest_payment.get("status")
    return payment_status


def is_cancelled_order(row: Dict[str, Any], *, order_status: Optional[str] = None) -> bool:
    status_value = order_status if order_status is not None else normalize_order_status((row or {}).get("status") or (row or {}).get("order_status"))
    return status_value in CANCELLED_ORDER_STATUSES


def is_confirmed_sales_order(
    row: Dict[str, Any], *, order_status: Optional[str] = None, payment_status: Optional[str] = None
) -> bool:
    status_value = order_status if order_status is not None else normalize_order_status((row or {}).get("status") or (row or {}).get("order_status"))
    payment_value = payment_status if payment_status is not None else normalize_payment_status(_extract_row_payment_status(row))
    return payment_value in CONFIRMED_PAYMENT_STATUSES and status_value not in CANCELLED_ORDER_STATUSES


def is_pending_review_order(
    row: Dict[str, Any], *, order_status: Optional[str] = None, payment_status: Optional[str] = None
) -> bool:
    status_value = order_status if order_status is not None else normalize_order_status((row or {}).get("status") or (row or {}).get("order_status"))
    payment_value = payment_status if payment_status is not None else normalize_payment_status(_extract_row_payment_status(row))
    return payment_value in PENDING_REVIEW_PAYMENT_STATUSES and status_value not in CANCELLED_ORDER_STATUSES


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


class ProductCreate(BaseModel):
    name: str
    base_price: float
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_special: Optional[bool] = False
    image_url: Optional[str] = None
    description: Optional[str] = None
    allow_sweetness: Optional[bool] = None
    default_sweetness: Optional[int] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    base_price: Optional[float] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_special: Optional[bool] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    allow_sweetness: Optional[bool] = None
    default_sweetness: Optional[int] = None


class ProductOptionUpdate(BaseModel):
    allow_sweetness: Optional[bool] = None
    default_sweetness: Optional[int] = None


class ProductAddonCreate(BaseModel):
    name: str
    code: Optional[str] = None
    addon_type: Optional[str] = "extra_shot"
    price: float
    max_quantity: Optional[int] = None
    is_active: Optional[bool] = True


class ProductAddonUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    addon_type: Optional[str] = None
    price: Optional[float] = None
    max_quantity: Optional[int] = None
    is_active: Optional[bool] = None


class ProductAddonRecipeCreate(BaseModel):
    ingredient_id: str
    quantity_used: float
    unit: Optional[str] = None


class ProductAddonRecipeUpdate(BaseModel):
    ingredient_id: Optional[str] = None
    quantity_used: Optional[float] = None
    unit: Optional[str] = None


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
    options: Optional[Dict[str, Any]] = None


class OrderItemUpdate(BaseModel):
    product_id: Optional[str] = None
    quantity: Optional[int] = None
    options: Optional[Dict[str, Any]] = None


class SalesReportFilters(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    channel_id: Optional[str] = None
    product_id: Optional[str] = None


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
    cancelled_reason: Optional[str] = None
    cancelled_at: Optional[str] = None


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


class LineBindPayload(BaseModel):
    line_user_id: str


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


def _normalize_store_role(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _resolve_store_id(memberships: List[Dict[str, Any]], store_id: Optional[str]) -> Tuple[str, str]:
    if store_id:
        for m in memberships:
            if str(m.get("store_id")) == str(store_id):
                normalized_role = _normalize_store_role(m.get("role"))
                return str(m.get("store_id")), normalized_role
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_access_denied")

    chosen = memberships[0]
    return str(chosen.get("store_id")), _normalize_store_role(chosen.get("role"))


def _is_business_role(role: str) -> bool:
    return _normalize_store_role(role) in _BUSINESS_ROLES


def _is_managerial(role: str) -> bool:
    return _is_business_role(role)


def _is_owner(role: str) -> bool:
    return _normalize_store_role(role) == "owner"


def _is_staff_or_above(role: str) -> bool:
    return _normalize_store_role(role) in _OPERATOR_ROLES


def _require_manager(role: str) -> None:
    if not _is_managerial(role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def _require_business_role(role: str) -> None:
    if not _is_business_role(role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def _require_staff_or_above(role: str) -> None:
    if not _is_staff_or_above(role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def _require_owner_profile(profile: Dict[str, Any]) -> None:
    role_value = _normalize_store_role((profile or {}).get("role"))
    if role_value != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="owner_role_required")


def _require_owner_store_role(role: str) -> None:
    if not _is_owner(role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="owner_role_required")


def _ensure_staff_can_manage_payments(role: str) -> None:
    if _normalize_store_role(role) not in _PAYMENT_REVIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def _mask_financial_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    masked = dict(row)
    for fld in _ORDER_FINANCIAL_FIELDS:
        if fld in masked:
            masked[fld] = None
    latest_payment = masked.get("latest_payment")
    if isinstance(latest_payment, dict):
        masked["latest_payment"] = _mask_payment(latest_payment)
    return masked


def _mask_order_item_fields(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    masked: List[Dict[str, Any]] = []
    for item in items:
        sanitized = dict(item)
        for fld in _ORDER_ITEM_FINANCIAL_FIELDS:
            if fld in sanitized:
                sanitized[fld] = None
        if "options" in sanitized:
            sanitized["options"] = mask_option_costs(sanitized.get("options"))
        masked.append(sanitized)
    return masked


def _get_system_ctx(authorization: Optional[str]) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    _require_owner_profile(ctx.get("profile", {}))
    return ctx


def _is_missing_column(error: Any, column: str) -> bool:
    message = str(getattr(error, "message", "") or error or "").lower()
    return column.lower() in message and ("column" in message or "does not exist" in message)


def _short_identifier(value: Any) -> str:
    s = str(value) if value is not None else ""
    if len(s) <= 12:
        return s
    return f"{s[:6]}...{s[-6:]}"


def _safe_error_detail(error: Any, limit: int = 300) -> str:
    text = str(getattr(error, "message", "") or error or "")
    text = text.replace("\n", " ").replace("\r", " ")
    return text[:limit]


def _safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


_PAYMENTS_COLUMN_CACHE: Dict[str, Optional[bool]] = {}
_ORDERS_COLUMN_CACHE: Dict[str, Optional[bool]] = {}


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


def _orders_has_column(client: Client, column: str) -> bool:
    cached = _ORDERS_COLUMN_CACHE.get(column)
    if cached is not None:
        return bool(cached)

    try:
        probe = client.table("orders").select(column).limit(1).execute()
        err = getattr(probe, "error", None)
        if err and _is_missing_column(err, column):
            _ORDERS_COLUMN_CACHE[column] = False
        else:
            _ORDERS_COLUMN_CACHE[column] = True
    except Exception as exc:
        if _is_missing_column(exc, column):
            _ORDERS_COLUMN_CACHE[column] = False
        else:
            _ORDERS_COLUMN_CACHE[column] = True

    return bool(_ORDERS_COLUMN_CACHE.get(column))


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
    columns: List[str] = ["id", "order_id", "status"]
    if _payments_supports_store_scope(client):
        columns.insert(1, "store_id")

    optional_fields = [
        "slip_storage_path",
        "slip_file_name",
        "slip_url",
        "submitted_at",
        "reject_reason",
        "confirmed_by",
        "confirmed_at",
    ]
    for field in optional_fields:
        if _payments_has_column(client, field):
            columns.append(field)

    return ", ".join(columns)


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
        order_rel_fields = ["id", "status", "payment_status"]
        if _orders_has_column(client, "order_no"):
            order_rel_fields.append("order_no")
        if _orders_has_column(client, "order_status"):
            order_rel_fields.append("order_status")
        if _orders_has_column(client, "customer_name"):
            order_rel_fields.append("customer_name")
        if _orders_has_column(client, "customer_phone"):
            order_rel_fields.append("customer_phone")
        cols.append(
            f"orders({', '.join(order_rel_fields)}, customers(display_name))"
        )
    return ", ".join(cols)


def _extract_missing_column(error: Any) -> Optional[str]:
    message = str(getattr(error, "message", "") or error or "")
    if not message or "column" not in message.lower():
        return None
    matches = re.findall(r"'([^']+)'", message)
    return matches[0] if matches else None


def _is_unique_violation(error: Any, column: str) -> bool:
    message = str(getattr(error, "message", error) or "").lower()
    return "duplicate key value" in message and column.lower() in message


def _omit_optional_fields(data: Dict[str, Any], optional_keys: List[str]) -> Dict[str, Any]:
    return {k: v for k, v in data.items() if k not in optional_keys}


def _clean_optional(data: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in data.items() if v is not None}


def _get_store_timezone(client: Client, store_id: str) -> Optional[str]:
    try:
        resp = client.table("stores").select("timezone").eq("id", store_id).limit(1).execute()
    except Exception:
        return None


_REPORT_DEFAULT_RANGE_DAYS = 7


def _parse_report_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_date")


def _normalize_filter_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = str(value).strip()
    if not value or value.lower() in {"all", "null", "undefined"}:
        return None
    return value


def _compute_report_range(store_tz: Optional[str], start_text: Optional[str], end_text: Optional[str]) -> Dict[str, Any]:
    tzinfo = _resolve_timezone(store_tz)
    today = datetime.now(tzinfo).date()
    end_date = _parse_report_date(end_text) or today
    start_date = _parse_report_date(start_text) or (end_date - timedelta(days=_REPORT_DEFAULT_RANGE_DAYS - 1))
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    start_dt = datetime(year=start_date.year, month=start_date.month, day=start_date.day, tzinfo=tzinfo)
    end_dt = datetime(year=end_date.year, month=end_date.month, day=end_date.day, tzinfo=tzinfo) + timedelta(days=1)

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "start_datetime": start_dt.astimezone(timezone.utc),
        "end_datetime": end_dt.astimezone(timezone.utc),
        "timezone": str(tzinfo),
    }


def _line_total(row: Dict[str, Any]) -> float:
    if row.get("line_total") is not None:
        return _parse_float(row.get("line_total"))
    if row.get("total_price") is not None:
        return _parse_float(row.get("total_price"))
    quantity = int(row.get("quantity") or 0)
    unit_price = _parse_float(row.get("unit_price"))
    return quantity * unit_price


def _line_cost(row: Dict[str, Any]) -> float:
    if row.get("line_cost") is not None:
        return _parse_float(row.get("line_cost"))
    if row.get("total_cost") is not None:
        return _parse_float(row.get("total_cost"))
    quantity = int(row.get("quantity") or 0)
    unit_cost = _parse_float(row.get("unit_cost"))
    return quantity * unit_cost


def _line_profit(row: Dict[str, Any]) -> float:
    if row.get("line_profit") is not None:
        return _parse_float(row.get("line_profit"))
    return _line_total(row) - _line_cost(row)


def _normalize_timezone_name(value: Optional[str]) -> str:
    candidate = str(value or "").strip()
    return candidate or DEFAULT_BUSINESS_TIMEZONE


def _get_store_timezone(client: Client, store_id: str) -> str:
    try:
        resp = client.table("stores").select("timezone").eq("id", store_id).limit(1).execute()
    except Exception:
        return DEFAULT_BUSINESS_TIMEZONE
    error = getattr(resp, "error", None)
    if error:
        if _is_missing_column(error, "timezone"):
            return DEFAULT_BUSINESS_TIMEZONE
        return DEFAULT_BUSINESS_TIMEZONE
    rows = getattr(resp, "data", None) or []
    tz_value = rows[0].get("timezone") if rows else None
    return _normalize_timezone_name(tz_value)


def _resolve_timezone(store_tz: Optional[str]):
    tz_name = _normalize_timezone_name(store_tz)
    if ZoneInfo is not None:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            return _DEFAULT_TZINFO
    return _DEFAULT_TZINFO


def _format_timezone_offset(tzinfo) -> str:
    probe = datetime.now(tzinfo) if tzinfo else datetime.now(_DEFAULT_TZINFO)
    offset = probe.utcoffset() or timedelta()
    total_minutes = int(offset.total_seconds() // 60)
    sign = "+" if total_minutes >= 0 else "-"
    hours = abs(total_minutes) // 60
    minutes = abs(total_minutes) % 60
    return f"UTC{sign}{hours:02d}:{minutes:02d}"


def _today_range(store_tz: Optional[str]) -> Tuple[datetime, datetime]:
    tzinfo = _resolve_timezone(store_tz)
    now = datetime.now(tzinfo)
    start = datetime(year=now.year, month=now.month, day=now.day, tzinfo=tzinfo)
    end = start + timedelta(days=1)
    return start, end


def _parse_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        text = str(value)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


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


def _mask_line_user_id(line_user_id: Optional[str]) -> Optional[str]:
    if not line_user_id:
        return None
    s = str(line_user_id).strip()
    if not s:
        return None
    if len(s) <= 4:
        return "***" if len(s) >= 3 else "**"
    if len(s) <= 8:
        return f"{s[:2]}...{s[-2:]}"
    return f"{s[:4]}...{s[-4:]}"


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


@router.get("/me")
def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    client = _get_client()
    token = _extract_token(authorization)
    user_id = _get_user_id(client, token)
    profile = _get_profile(client, user_id)
    role = _normalize_store_role(profile.get("role")) if profile else None

    memberships: List[Dict[str, Any]] = []
    store_id: Optional[str] = None
    store_name: Optional[str] = None
    store_timezone: Optional[str] = None
    store_currency: Optional[str] = None

    try:
        memberships = _get_memberships(client, user_id)
        if memberships:
            chosen = memberships[0]
            store_id = str(chosen.get("store_id"))
            try:
                resp = client.table("stores").select("name, timezone, currency").eq("id", store_id).limit(1).execute()
                rows = getattr(resp, "data", []) or []
                if rows:
                    store_name = rows[0].get("name")
                    store_timezone = rows[0].get("timezone")
                    store_currency = rows[0].get("currency")
            except Exception:
                pass
    except HTTPException:
        pass

    return {
        "user_id": user_id,
        "role": role,
        "store_id": store_id,
        "store_name": store_name,
        "store_timezone": store_timezone,
        "store_currency": store_currency,
        "memberships": memberships,
    }


@router.get("/channels")
def list_channels(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

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



# ─── Product Options + Addons ────────────────────────────────────────────────
@router.get("/products/{product_id}/options")
def get_product_options(product_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    product_row = _ensure_product_in_store(ctx["client"], product_id, store_id_resolved)
    return _build_product_options_response(ctx["client"], product_row, store_id_resolved)


@router.patch("/products/{product_id}/options")
def update_product_options(
    product_id: str,
    payload: ProductOptionUpdate,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_product_option_payload(payload)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    _ensure_product_in_store(ctx["client"], product_id, store_id_resolved)

    resp = (
        ctx["client"].table("products").update(data).eq("id", product_id).eq("store_id", store_id_resolved).execute()
    )
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="product_option_update_failed")

    refreshed = _ensure_product_in_store(ctx["client"], product_id, store_id_resolved)
    return _build_product_options_response(ctx["client"], refreshed, store_id_resolved)


@router.get("/products/{product_id}/addons")
def list_product_addons(product_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _ensure_product_in_store(ctx["client"], product_id, store_id_resolved)
    addons = _collect_product_addons(ctx["client"], store_id_resolved, product_id)
    return {"items": addons, "product_id": product_id, "store_id": store_id_resolved}


@router.post("/products/{product_id}/addons")
def create_product_addon(
    product_id: str,
    payload: ProductAddonCreate,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    product_row = _ensure_product_in_store(ctx["client"], product_id, store_id_resolved)
    data = _sanitize_addon_payload(payload)
    data["product_id"] = product_id
    data["store_id"] = store_id_resolved
    data.setdefault("addon_type", "extra_shot")
    data.setdefault("code", _generate_addon_code(data.get("name") or "extra_shot", data.get("addon_type")))

    try:
        resp = ctx["client"].table("product_addons").insert(data).execute()
        err = getattr(resp, "error", None)
    except Exception as exc:
        resp = None
        err = exc

    if err:
        message = str(getattr(err, "message", err))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_code_exists")
        raise HTTPException(status_code=500, detail="addon_create_failed")

    rows = getattr(resp, "data", None) or []
    created = rows[0] if rows else data
    mapped = _map_addon(created)
    mapped["recipes"] = []
    mapped["unit_cost"] = 0.0
    mapped["unit_profit"] = mapped.get("price", 0.0)
    mapped["has_recipe"] = False
    return mapped | {"product_name": product_row.get("name")}


@router.patch("/addons/{addon_id}")
def update_product_addon(
    addon_id: str,
    payload: ProductAddonUpdate,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_addon_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    addon_row = _ensure_addon_in_store(ctx["client"], addon_id, store_id_resolved)

    resp = (
        ctx["client"].table("product_addons").update(data).eq("id", addon_id).eq("store_id", store_id_resolved).execute()
    )
    if getattr(resp, "error", None):
        message = str(getattr(resp.error, "message", getattr(resp, "error", "")))
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_code_exists")
        raise HTTPException(status_code=500, detail="addon_update_failed")

    return _get_addon_with_cost(ctx["client"], store_id_resolved, addon_id) | {
        "product_id": addon_row.get("product_id"),
    }


@router.delete("/addons/{addon_id}")
def deactivate_product_addon(addon_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _ensure_addon_in_store(ctx["client"], addon_id, store_id_resolved)

    resp = (
        ctx["client"].table("product_addons").update({"is_active": False}).eq("id", addon_id).eq("store_id", store_id_resolved).execute()
    )
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="addon_deactivate_failed")
    return {"status": "deactivated"}


@router.get("/addons/{addon_id}/recipes")
def list_addon_recipes(addon_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    addon_row = _ensure_addon_in_store(ctx["client"], addon_id, store_id_resolved)
    recipes, total_cost = _fetch_addon_recipes_with_cost(ctx["client"], store_id_resolved, addon_id)
    return {
        "items": recipes,
        "addon_id": addon_id,
        "product_id": addon_row.get("product_id"),
        "store_id": store_id_resolved,
        "unit_cost": total_cost,
    }


@router.post("/addons/{addon_id}/recipes")
def create_addon_recipe(
    addon_id: str,
    payload: ProductAddonRecipeCreate,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    addon_row = _ensure_addon_in_store(ctx["client"], addon_id, store_id_resolved)
    _ensure_ingredient_in_store(ctx["client"], payload.ingredient_id, store_id_resolved)
    data = _sanitize_addon_recipe_payload(payload)
    data["addon_id"] = addon_id
    data["store_id"] = store_id_resolved

    try:
        resp = ctx["client"].table("product_addon_recipes").insert(data).execute()
        err = getattr(resp, "error", None)
    except Exception as exc:
        resp = None
        err = exc

    if err:
        raise HTTPException(status_code=500, detail="addon_recipe_create_failed")

    rows = getattr(resp, "data", None) or []
    created = rows[0] if rows else data
    mapped = _map_addon_recipe(created)
    mapped["addon_id"] = addon_id
    mapped["product_id"] = addon_row.get("product_id")
    return mapped


@router.patch("/addon-recipes/{recipe_id}")
def update_addon_recipe(
    recipe_id: str,
    payload: ProductAddonRecipeUpdate,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_addon_recipe_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    existing = _get_addon_recipe_row(ctx["client"], recipe_id)
    if str(existing.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    target_addon = existing.get("addon_id")
    addon_row = _ensure_addon_in_store(ctx["client"], target_addon, store_id_resolved)

    if data.get("ingredient_id"):
        _ensure_ingredient_in_store(ctx["client"], data["ingredient_id"], store_id_resolved)

    resp = (
        ctx["client"].table("product_addon_recipes").update(data).eq("id", recipe_id).eq("store_id", store_id_resolved).execute()
    )
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="addon_recipe_update_failed")

    refreshed = _get_addon_recipe_row(ctx["client"], recipe_id)
    mapped = _map_addon_recipe(refreshed)
    mapped["product_id"] = addon_row.get("product_id")
    return mapped


@router.delete("/addon-recipes/{recipe_id}")
def delete_addon_recipe(recipe_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    existing = _get_addon_recipe_row(ctx["client"], recipe_id)
    if str(existing.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    ctx["client"].table("product_addon_recipes").delete().eq("id", recipe_id).eq("store_id", store_id_resolved).execute()
    return {"status": "deleted"}


def _ensure_product_in_store(client: Client, product_id: str, store_id: str) -> Dict[str, Any]:
    select_cols = "id, store_id, name, allow_sweetness, default_sweetness"
    try:
        resp = client.table("products").select(select_cols).eq("id", product_id).limit(1).execute()
        error = getattr(resp, "error", None)
    except Exception as exc:
        resp = None
        error = exc
    if error and any(_is_missing_column(error, col) for col in ["allow_sweetness", "default_sweetness"]):
        resp = client.table("products").select("id, store_id, name").eq("id", product_id).limit(1).execute()
        error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="product_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_not_found")
    row = data[0]
    if order_items_supports_store_scope(client):
        store_value = row.get("store_id")
        if store_value is not None and str(store_value) != str(store_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")
    return row


def _get_product_row(client: Client, product_id: str, store_id: str) -> Dict[str, Any]:
    query = client.table("products").select("id, store_id, name, image_url").eq("id", product_id).limit(1)
    if order_items_supports_store_scope(client):
        query = query.eq("store_id", store_id)
    resp = query.execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="product_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product_not_found")
    row = rows[0]
    if str(row.get("store_id")) not in {"", "None", None} and str(row.get("store_id")) != str(store_id):
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

    if "allow_sweetness" in data:
        allow_value = data.get("allow_sweetness")
        if allow_value is None:
            data.pop("allow_sweetness")
        else:
            data["allow_sweetness"] = bool(allow_value)

    if "default_sweetness" in data:
        ds_value = data.get("default_sweetness")
        if ds_value is None:
            data.pop("default_sweetness")
        else:
            data["default_sweetness"] = _sanitize_sweetness_level(ds_value)

    return data


def _sanitize_sweetness_level(value: Any) -> int:
    try:
        level = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sweetness_invalid")
    if level not in SWEETNESS_LEVELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sweetness_invalid")
    return level


def _product_row_allows_sweetness(row: Dict[str, Any]) -> bool:
    for key in ("allow_sweetness", "allows_sweetness", "sweetness_enabled"):
        if key in row and row[key] is not None:
            return bool(row[key])
    return True


def _product_row_default_sweetness(row: Dict[str, Any]) -> int:
    for key in ("default_sweetness", "sweetness_default"):
        if key in row and row[key] is not None:
            try:
                level = int(row[key])
            except (TypeError, ValueError):
                continue
            if level in SWEETNESS_LEVELS:
                return level
    return DEFAULT_SWEETNESS


def _sanitize_product_option_payload(payload: ProductOptionUpdate) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    if "allow_sweetness" in data:
        data["allow_sweetness"] = bool(data["allow_sweetness"])
    if "default_sweetness" in data:
        value = data.get("default_sweetness")
        if value is None:
            data.pop("default_sweetness")
        else:
            data["default_sweetness"] = _sanitize_sweetness_level(value)
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
        "allow_sweetness": _product_row_allows_sweetness(row),
        "default_sweetness": _product_row_default_sweetness(row),
    }


def _generate_addon_code(name: str, addon_type: Optional[str]) -> str:
    base = (addon_type or name or "extra_addon").strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return slug or "addon"


def _sanitize_addon_payload(payload: ProductAddonCreate | ProductAddonUpdate, *, partial: bool = False) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_name_required")
        data["name"] = name

    if "code" in data:
        code_value = (data.get("code") or "").strip().lower()
        if not code_value:
            data.pop("code")
        else:
            data["code"] = code_value

    if "addon_type" in data or not partial:
        addon_type_value = (data.get("addon_type") or "extra_shot").strip().lower()
        if addon_type_value not in {"extra_shot"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_type_not_supported")
        data["addon_type"] = addon_type_value

    if "price" in data or not partial:
        price_value = _safe_float(data.get("price"))
        if price_value < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_price_non_negative")
        data["price"] = price_value

    if "max_quantity" in data:
        max_quantity = data.get("max_quantity")
        if max_quantity is None:
            data["max_quantity"] = None
        else:
            try:
                max_value = int(max_quantity)
            except (TypeError, ValueError):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_max_quantity_invalid")
            if max_value < 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_max_quantity_invalid")
            data["max_quantity"] = max_value

    if "is_active" in data:
        data["is_active"] = bool(data["is_active"])

    if not partial and "code" not in data:
        data["code"] = _generate_addon_code(data.get("name") or "extra_shot", data.get("addon_type"))

    return data


def _sanitize_addon_recipe_payload(
    payload: ProductAddonRecipeCreate | ProductAddonRecipeUpdate,
    *,
    partial: bool = False,
) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)

    if "ingredient_id" in data or not partial:
        ingredient_id = (data.get("ingredient_id") or "").strip()
        if not ingredient_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ingredient_id_required")
        data["ingredient_id"] = ingredient_id

    if "quantity_used" in data or not partial:
        try:
            quantity_value = float(data.get("quantity_used"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_required")
        if quantity_value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_positive_required")
        data["quantity_used"] = quantity_value

    if "unit" in data:
        unit_value = (data.get("unit") or "").strip()
        if not unit_value:
            data.pop("unit")
        else:
            data["unit"] = unit_value

    return data


def _map_addon(row: Dict[str, Any]) -> Dict[str, Any]:
    max_quantity = row.get("max_quantity")
    try:
        max_qty_value = int(max_quantity) if max_quantity is not None else None
    except (TypeError, ValueError):
        max_qty_value = None

    price_value = _safe_float(row.get("price"))

    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "product_id": row.get("product_id"),
        "name": row.get("name"),
        "code": row.get("code"),
        "addon_type": (row.get("addon_type") or "extra_shot"),
        "price": price_value,
        "max_quantity": max_qty_value,
        "is_active": bool(row.get("is_active")) if row.get("is_active") is not None else True,
        "created_at": row.get("created_at"),
    }


def _map_addon_recipe(row: Dict[str, Any]) -> Dict[str, Any]:
    ingredient_rel = row.get("ingredients") if isinstance(row, dict) else None
    quantity = _safe_float(row.get("quantity_used"))
    ingredient_cost = _safe_float((ingredient_rel or {}).get("cost_per_unit"))
    line_cost = quantity * ingredient_cost
    unit_value = row.get("unit") or (ingredient_rel or {}).get("unit")
    return {
        "id": str(row.get("id")),
        "addon_id": row.get("addon_id"),
        "store_id": row.get("store_id"),
        "ingredient_id": row.get("ingredient_id"),
        "quantity_used": quantity,
        "unit": unit_value,
        "ingredient_name": (ingredient_rel or {}).get("name"),
        "ingredient_unit": (ingredient_rel or {}).get("unit"),
        "cost_per_unit": ingredient_cost,
        "line_cost": line_cost,
    }


def _fetch_addon_recipes_with_cost(client: Client, store_id: str, addon_id: str) -> Tuple[List[Dict[str, Any]], float]:
    query = (
        client.table("product_addon_recipes")
        .select(
            "id, store_id, addon_id, ingredient_id, quantity_used, unit, ingredients(name, unit, cost_per_unit)"
        )
        .eq("addon_id", addon_id)
        .order("created_at", desc=False)
    )
    try:
        query = query.eq("store_id", store_id)
    except Exception:
        pass
    resp = query.execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="addon_recipe_query_failed")
    rows = getattr(resp, "data", None) or []
    recipes = [_map_addon_recipe(r) for r in rows]
    total_cost = sum(_safe_float(r.get("line_cost")) for r in recipes)
    return recipes, total_cost


def _collect_product_addons(client: Client, store_id: str, product_id: str) -> List[Dict[str, Any]]:
    resp = (
        client.table("product_addons")
        .select("id, store_id, product_id, name, code, addon_type, price, max_quantity, is_active, created_at")
        .eq("store_id", store_id)
        .eq("product_id", product_id)
        .order("created_at", desc=False)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="product_addon_query_failed")
    rows = getattr(resp, "data", None) or []
    addons: List[Dict[str, Any]] = []
    for row in rows:
        mapped = _map_addon(row)
        recipes, unit_cost = _fetch_addon_recipes_with_cost(client, store_id, mapped["id"])
        mapped["recipes"] = recipes
        mapped["unit_cost"] = unit_cost
        mapped["unit_profit"] = mapped.get("price", 0) - unit_cost
        mapped["has_recipe"] = len(recipes) > 0
        addons.append(mapped)
    return addons


def _get_addon_with_cost(client: Client, store_id: str, addon_id: str) -> Dict[str, Any]:
    resp = (
        client.table("product_addons")
        .select("id, store_id, product_id, name, code, addon_type, price, max_quantity, is_active, created_at")
        .eq("id", addon_id)
        .eq("store_id", store_id)
        .limit(1)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="product_addon_query_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="addon_not_found")
    mapped = _map_addon(rows[0])
    recipes, unit_cost = _fetch_addon_recipes_with_cost(client, store_id, mapped["id"])
    mapped["recipes"] = recipes
    mapped["unit_cost"] = unit_cost
    mapped["unit_profit"] = mapped.get("price", 0) - unit_cost
    mapped["has_recipe"] = len(recipes) > 0
    return mapped


def _ensure_addon_in_store(client: Client, addon_id: str, store_id: str) -> Dict[str, Any]:
    resp = client.table("product_addons").select("id, store_id, product_id").eq("id", addon_id).limit(1).execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="addon_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="addon_not_found")
    row = rows[0]
    if str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")
    return row


def _get_addon_recipe_row(client: Client, recipe_id: str) -> Dict[str, Any]:
    resp = client.table("product_addon_recipes").select("id, store_id, addon_id, ingredient_id").eq("id", recipe_id).limit(1).execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="addon_recipe_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="addon_recipe_not_found")
    return rows[0]


def _build_product_options_response(client: Client, product_row: Dict[str, Any], store_id: str) -> Dict[str, Any]:
    product_id = str(product_row.get("id"))
    addons = _collect_product_addons(client, store_id, product_id)
    return {
        "product_id": product_id,
        "allow_sweetness": _product_row_allows_sweetness(product_row),
        "default_sweetness": _product_row_default_sweetness(product_row),
        "addons": addons,
    }


def _menu_image_limit_bytes() -> int:
    max_mb = float(settings.menu_image_max_mb or 5.0)
    return int(max(1.0, max_mb) * 1024 * 1024)


def _normalize_mime_type(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _resolve_menu_image_extension(filename: Optional[str], content_type: str) -> str:
    normalized = _normalize_mime_type(content_type)
    if normalized in _MENU_IMAGE_EXTENSION_MAP:
        return _MENU_IMAGE_EXTENSION_MAP[normalized]
    if filename:
        _, ext = os.path.splitext(filename)
        ext = ext.replace(".", "").strip().lower()
        if ext in {"jpg", "jpeg", "png", "webp"}:
            return "jpg" if ext == "jpeg" else ext
    return "jpg"


def _build_menu_image_path(store_id: str, product_id: str, extension: str) -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    suffix = uuid4().hex[:8]
    safe_ext = extension.lstrip(".").lower() or "jpg"
    return f"stores/{store_id}/products/{product_id}/{timestamp}-{suffix}.{safe_ext}"


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
        "cost_type": row.get("cost_type"),
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
        "unit": row.get("unit"),
        "product_name": prod_rel.get("name") if isinstance(prod_rel, dict) else None,
        "ingredient_name": ing_rel.get("name") if isinstance(ing_rel, dict) else None,
        "ingredient_unit": ing_rel.get("unit") if isinstance(ing_rel, dict) else None,
        "ingredient_cost_per_unit": cost_per_unit,
        "ingredient_cost_type": ing_rel.get("cost_type") if isinstance(ing_rel, dict) else None,
        "ingredient_is_active": ing_rel.get("is_active") if isinstance(ing_rel, dict) else None,
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
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

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

    prod_select = "id, store_id, name, category_id, base_price, is_active, is_special, image_url, description, created_at, allow_sweetness, default_sweetness, product_categories(name)"
    products_resp = ctx["client"].table("products").select(prod_select).eq("store_id", store_id_resolved).order("created_at", desc=False).execute()
    prod_err = getattr(products_resp, "error", None)
    if prod_err and any(
        _is_missing_column(prod_err, col) for col in ["allow_sweetness", "default_sweetness"]
    ):
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


@router.post("/products/{product_id}/image")
async def upload_product_image(product_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None, file: UploadFile = File(...)) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_business_role(role)

    product_row = _get_product_row(ctx["client"], product_id, store_id_resolved)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_file")

    mime_type = _normalize_mime_type(file.content_type or "")
    if mime_type not in _MENU_IMAGE_ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_type_not_allowed")

    if len(content) > _menu_image_limit_bytes():
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file_too_large")

    extension = _resolve_menu_image_extension(file.filename, mime_type)
    storage_path = _build_menu_image_path(store_id_resolved, product_id, extension)

    try:
        upload_result = upload_public_asset(
            bucket=settings.menu_image_bucket,
            path=storage_path,
            data=content,
            content_type=mime_type or "application/octet-stream",
        )
    except StorageUploadError as exc:
        logger.error(
            "product_image_upload_failed product=%s store=%s detail=%s",
            _short_identifier(product_id),
            _short_identifier(store_id_resolved),
            _safe_error_detail(exc),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    public_url = upload_result.get("public_url")
    if not public_url:
        raise HTTPException(status_code=500, detail="menu_image_public_url_missing")

    update_resp = (
        ctx["client"]
        .table("products")
        .update({"image_url": public_url})
        .eq("id", product_id)
        .eq("store_id", store_id_resolved)
        .execute()
    )
    if getattr(update_resp, "error", None):
        raise HTTPException(status_code=500, detail="product_image_update_failed")

    refreshed = _get_product_row(ctx["client"], product_id, store_id_resolved) | {"image_url": public_url}
    return {
        "product": _map_product(refreshed),
        "image": {
            "url": public_url,
        },
    }


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
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

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
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    recipe_resp = (
        ctx["client"]
        .table("recipes")
        .select(
            "id, store_id, product_id, ingredient_id, quantity_used, unit, products(name, base_price, is_active, allow_sweetness, default_sweetness), ingredients(name, unit, cost_per_unit, cost_type, is_active)"
        )
        .eq("store_id", store_id_resolved)
        .order("product_id", desc=False)
        .execute()
    )
    recipe_error = getattr(recipe_resp, "error", None)
    if recipe_error and any(_is_missing_column(recipe_error, col) for col in ["allow_sweetness", "default_sweetness"]):
        recipe_resp = (
            ctx["client"].table("recipes").select(
                "id, store_id, product_id, ingredient_id, quantity_used, unit, products(name, base_price, is_active), ingredients(name, unit, cost_per_unit, cost_type, is_active)"
            )
            .eq("store_id", store_id_resolved)
            .order("product_id", desc=False)
            .execute()
        )
        recipe_error = getattr(recipe_resp, "error", None)
    if recipe_error and _is_missing_column(recipe_error, "cost_type"):
        recipe_resp = (
            ctx["client"]
            .table("recipes")
            .select(
                "id, store_id, product_id, ingredient_id, quantity_used, unit, products(name, base_price, is_active), ingredients(name, unit, cost_per_unit, is_active)"
            )
            .eq("store_id", store_id_resolved)
            .order("product_id", desc=False)
            .execute()
        )
        recipe_error = getattr(recipe_resp, "error", None)
    if recipe_error:
        raise HTTPException(status_code=500, detail="recipe_query_failed")
    recipes = getattr(recipe_resp, "data", None) or []

    products_resp = (
        ctx["client"]
        .table("products")
        .select("id, name, base_price, is_active")
        .eq("store_id", store_id_resolved)
        .order("name", desc=False)
        .execute()
    )
    if getattr(products_resp, "error", None):
        raise HTTPException(status_code=500, detail="product_query_failed")
    products = getattr(products_resp, "data", None) or []

    ingredients_resp = (
        ctx["client"]
        .table("ingredients")
        .select("id, name, unit, cost_per_unit, cost_type, is_active")
        .eq("store_id", store_id_resolved)
        .order("name", desc=False)
        .execute()
    )
    ingredients_error = getattr(ingredients_resp, "error", None)
    if ingredients_error and _is_missing_column(ingredients_error, "cost_type"):
        ingredients_resp = (
            ctx["client"]
            .table("ingredients")
            .select("id, name, unit, cost_per_unit, is_active")
            .eq("store_id", store_id_resolved)
            .order("name", desc=False)
            .execute()
        )
        ingredients_error = getattr(ingredients_resp, "error", None)
    if ingredients_error:
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


# ─── Customer LINE Binding (manual, mock/key-ready) ────────────────────────────


def _get_customer_row(client: Client, customer_id: str) -> Dict[str, Any]:
    resp = client.table("customers").select("id, store_id, line_user_id").eq("id", customer_id).limit(1).execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="customer_lookup_failed")
    data = getattr(resp, "data", None) or []
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="customer_not_found")
    return data[0]


def _find_customer_by_line_user_id(client: Client, store_id: str, line_user_id: str) -> Optional[str]:
    resp = (
        client.table("customers")
        .select("id")
        .eq("store_id", store_id)
        .eq("line_user_id", line_user_id)
        .limit(1)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="line_user_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        return None
    row = rows[0]
    return str(row.get("id")) if row and row.get("id") else None


@router.post("/customers/{customer_id}/bind-line")
def bind_line_user(customer_id: str, payload: LineBindPayload, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    line_user_id_raw = (payload.line_user_id or "").strip()
    if not line_user_id_raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="line_user_id_required")

    _ensure_customer_in_store(ctx["client"], customer_id, store_id_resolved)
    customer_row = _get_customer_row(ctx["client"], customer_id)
    existing_line = (customer_row.get("line_user_id") or "").strip()

    duplicate_customer_id = _find_customer_by_line_user_id(ctx["client"], store_id_resolved, line_user_id_raw)
    if duplicate_customer_id and str(duplicate_customer_id) != str(customer_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="duplicate_line_user_id")

    if existing_line:
        if existing_line == line_user_id_raw:
            masked = _mask_line_user_id(existing_line)
            logger.info(
                "line_bind_idempotent",
                extra={"customer_id": customer_id, "store_id": store_id_resolved, "line_user_id_masked": masked},
            )
            return {
                "customer_id": customer_id,
                "line_binding_status": "linked",
                "line_user_id_masked": masked,
            }
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="line_user_id_already_set")

    update_resp = (
        ctx["client"]
        .table("customers")
        .update({"line_user_id": line_user_id_raw})
        .eq("id", customer_id)
        .eq("store_id", store_id_resolved)
        .execute()
    )
    err = getattr(update_resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="line_user_bind_failed")

    masked = _mask_line_user_id(line_user_id_raw)
    logger.info(
        "line_bind_linked",
        extra={"customer_id": customer_id, "store_id": store_id_resolved, "line_user_id_masked": masked},
    )
    return {
        "customer_id": customer_id,
        "line_binding_status": "linked",
        "line_user_id_masked": masked,
    }


@router.delete("/customers/{customer_id}/unbind-line")
def unbind_line_user(customer_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _ensure_customer_in_store(ctx["client"], customer_id, store_id_resolved)
    update_resp = (
        ctx["client"]
        .table("customers")
        .update({"line_user_id": None})
        .eq("id", customer_id)
        .eq("store_id", store_id_resolved)
        .execute()
    )
    err = getattr(update_resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="line_user_unbind_failed")

    logger.info(
        "line_bind_unlinked",
        extra={"customer_id": customer_id, "store_id": store_id_resolved, "line_user_id_masked": None},
    )
    return {
        "customer_id": customer_id,
        "line_binding_status": "unlinked",
        "line_user_id_masked": None,
    }


@router.get("/customers")
def list_customers(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, _role = _resolve_store_id(ctx["memberships"], store_id)

    # Schema-drift: actual DB may use display_name instead of name
    try:
        response = ctx["client"].table("customers").select("id, display_name, phone, line_user_id, created_at").eq("store_id", store_id_resolved).order("created_at", desc=True).execute()
    except Exception:
        response = ctx["client"].table("customers").select("id, name, phone, line_user_id, created_at").eq("store_id", store_id_resolved).order("created_at", desc=True).execute()
    error = getattr(response, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="customer_query_failed")

    data = getattr(response, "data", None) or []
    items = []
    for row in data:
        line_uid = row.get("line_user_id")
        display_name = row.get("display_name") or row.get("name")
        items.append({
            "id": str(row.get("id")),
            "name": display_name,
            "phone": row.get("phone"),
            "line_binding_status": "linked" if line_uid else "unlinked",
            "line_user_id_masked": _mask_line_user_id(line_uid),
            "created_at": row.get("created_at"),
        })
    return {"items": items, "store_id": store_id_resolved}


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

    if "options" in data:
        options_value = data.get("options")
        if options_value is None:
            data["options"] = None
        elif isinstance(options_value, dict):
            # Basic validation; deep validation occurs in prepare_order_item_snapshot
            sweetness = options_value.get("sweetness")
            if sweetness is not None:
                try:
                    int_value = int(sweetness)
                except (TypeError, ValueError):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sweetness_invalid")
                if int_value not in (0, 25, 50, 75, 100):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sweetness_invalid")
            data["options"] = options_value
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="options_invalid")

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

    return data


def _map_order_item(row: Dict[str, Any]) -> Dict[str, Any]:
    product_rel = row.get("products") if isinstance(row, dict) else None
    product_name = None
    if isinstance(product_rel, dict):
        product_name = product_rel.get("name")
    if not product_name:
        product_name = row.get("product_name_snapshot")
    line_total_value = _line_total(row)
    line_cost_value = _line_cost(row)
    line_profit_value = _line_profit(row)
    option_total_value = float(row.get("option_total") or 0)
    option_cost_total_value = float(row.get("option_cost_total") or 0)
    total_price_value = float(row.get("total_price") or line_total_value)
    total_cost_value = float(row.get("total_cost") or line_cost_value)
    options_value = row.get("options")
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "order_id": row.get("order_id"),
        "product_id": row.get("product_id"),
        "product_name": product_name,
        "quantity": int(row.get("quantity") or 0),
        "unit_price": float(row.get("unit_price") or 0),
        "unit_cost": float(row.get("unit_cost") or 0),
        "line_total": line_total_value,
        "line_cost": line_cost_value,
        "line_profit": line_profit_value,
        "option_total": option_total_value,
        "option_cost_total": option_cost_total_value,
        "total_price": total_price_value,
        "total_cost": total_cost_value,
        "options": options_value,
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


def _load_order_items_map(client: Client, order_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    if not order_ids:
        return {}

    select_cols = order_item_select_clause(client)
    try:
        resp = (
            client.table("order_items")
            .select(select_cols)
            .in_("order_id", order_ids)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="order_items_query_failed") from exc

    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="order_items_query_failed")

    items_map: Dict[str, List[Dict[str, Any]]] = {}
    for row in getattr(resp, "data", None) or []:
        mapped = _map_order_item(row)
        order_id = mapped.get("order_id")
        if not order_id:
            continue
        key = str(order_id)
        items_map.setdefault(key, []).append(mapped)
    return items_map


def _initialize_sales_summary() -> Dict[str, Any]:
    return {
        "order_count": 0,
        "total_sales_confirmed": 0.0,
        "pending_revenue": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "gross_margin_percent": 0.0,
    }


def _empty_sales_report(store_id: str, range_meta: Dict[str, Any], channel_id: Optional[str], product_id: Optional[str]) -> Dict[str, Any]:
    return {
        "store_id": store_id,
        "range": {
            "start": range_meta["start_date"],
            "end": range_meta["end_date"],
            "timezone": range_meta["timezone"],
        },
        "summary": _initialize_sales_summary(),
        "orders": [],
        "order_items": [],
        "channels": [],
        "products": [],
        "filters": {
            "channels": [],
            "products": [],
            "applied": {
                "channel_id": channel_id,
                "product_id": product_id,
            },
        },
    }


def _generate_sales_report(
    ctx: Dict[str, Any],
    store_id: str,
    filters: SalesReportFilters,
) -> Dict[str, Any]:
    store_timezone = _get_store_timezone(ctx["client"], store_id)
    normalized_channel = _normalize_filter_value(filters.channel_id)
    normalized_product = _normalize_filter_value(filters.product_id)
    range_meta = _compute_report_range(store_timezone, filters.start_date, filters.end_date)

    start_iso = range_meta["start_datetime"].isoformat()
    end_iso = range_meta["end_datetime"].isoformat()

    use_channel_fee = True
    orders_rows: List[Dict[str, Any]] = []
    while True:
        select_cols = _order_select_columns(ctx["client"], use_channel_fee)
        query = (
            ctx["client"].table("orders")
            .select(select_cols)
            .eq("store_id", store_id)
            .gte("created_at", start_iso)
            .lt("created_at", end_iso)
            .order("created_at", desc=True)
        )
        if normalized_channel:
            query = query.eq("channel_id", normalized_channel)

        resp = query.execute()
        err = getattr(resp, "error", None)
        if not err:
            orders_rows = getattr(resp, "data", None) or []
            break
        missing_col = _extract_missing_column(err)
        if use_channel_fee and missing_col == "channel_fee":
            use_channel_fee = False
            continue
        raise HTTPException(status_code=500, detail="order_query_failed")

    if not orders_rows:
        return _empty_sales_report(store_id, range_meta, normalized_channel, normalized_product)

    customer_map, channel_map = _load_order_relation_maps(ctx["client"], store_id, orders_rows)
    order_ids = [str(row.get("id")) for row in orders_rows if row.get("id")]
    items_map = _load_order_items_map(ctx["client"], order_ids)
    mapped_orders = [_map_order(row, customer_map, channel_map) for row in orders_rows]

    return _build_sales_report_payload(
        mapped_orders,
        items_map,
        store_id,
        range_meta,
        normalized_channel,
        normalized_product,
    )


@router.get("/reports/sales")
def get_sales_report(
    filters: SalesReportFilters = Depends(),
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    return _generate_sales_report(ctx, store_id_resolved, filters)


@router.get("/reports/sales/export")
def export_sales_report_csv(
    filters: SalesReportFilters = Depends(),
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Response:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    report = _generate_sales_report(ctx, store_id_resolved, filters)
    orders = report.get("orders", [])
    summary = report.get("summary", {}) or {}

    prepared_rows: List[Dict[str, Any]] = []
    for row in orders:
        sales_amount = _parse_float(row.get("sales_amount"))
        gross_profit = _parse_float(row.get("gross_profit"))
        margin = (gross_profit / sales_amount * 100) if sales_amount > 0 else 0.0
        prepared_rows.append({**row, "gross_margin_percent": margin})

    if summary:
        prepared_rows.append(
            {
                "order_id": "SUMMARY",
                "order_no": "",
                "channel_name": "",
                "status": "",
                "payment_status": "",
                "sales_amount": summary.get("total_sales_confirmed", 0),
                "cost_amount": summary.get("total_cost", 0),
                "gross_profit": summary.get("gross_profit", 0),
                "gross_margin_percent": summary.get("gross_margin_percent", 0),
                "created_at": "",
            }
        )

    filename = _csv_filename("sales-report")
    return _build_csv_response(filename, _SALES_ORDER_EXPORT_COLUMNS, prepared_rows)


def _build_sales_report_payload(
    orders: List[Dict[str, Any]],
    items_map: Dict[str, List[Dict[str, Any]]],
    store_id: str,
    range_meta: Dict[str, Any],
    channel_id: Optional[str],
    product_id: Optional[str],
) -> Dict[str, Any]:
    summary = _initialize_sales_summary()
    order_rows: List[Dict[str, Any]] = []
    order_item_rows: List[Dict[str, Any]] = []
    channel_totals: Dict[str, Dict[str, Any]] = {}
    product_totals: Dict[str, Dict[str, Any]] = {}
    channel_options: Dict[str, str] = {}
    product_options: Dict[str, str] = {}

    normalized_product = _normalize_filter_value(product_id)

    for order in orders:
        order_id = str(order.get("id")) if order.get("id") else None
        if not order_id:
            continue
        items = items_map.get(order_id, [])
        matched_items = items
        if normalized_product:
            matched_items = [item for item in items if str(item.get("product_id")) == normalized_product]
            if not matched_items:
                continue

        amount_total = _parse_float(order.get("total_amount"))
        cost_total = _parse_float(order.get("total_cost"))
        profit_total = _parse_float(order.get("gross_profit"))
        if normalized_product:
            amount_total = sum(_line_total(item) for item in matched_items)
            cost_total = sum(_line_cost(item) for item in matched_items)
            profit_total = sum(_line_profit(item) for item in matched_items)

        order_status_value = normalize_order_status(order.get("status") or order.get("order_status"))
        payment_status_value = normalize_payment_status(order.get("payment_status"))
        is_confirmed = is_confirmed_sales_order(order, order_status=order_status_value, payment_status=payment_status_value)
        is_pending_review = is_pending_review_order(order, order_status=order_status_value, payment_status=payment_status_value)
        include_financials = not is_cancelled_order(order, order_status=order_status_value)

        if is_confirmed:
            summary["total_sales_confirmed"] += amount_total
        elif is_pending_review:
            summary["pending_revenue"] += amount_total

        if include_financials:
            summary["total_cost"] += cost_total
            summary["gross_profit"] += profit_total
        summary["order_count"] += 1

        order_rows.append({
            "order_id": order_id,
            "order_no": order.get("order_no") or order.get("order_number"),
            "channel_id": order.get("channel_id"),
            "channel_name": order.get("channel_name"),
            "status": order.get("status") or order.get("order_status"),
            "payment_status": payment_status_value,
            "sales_amount": amount_total,
            "cost_amount": cost_total,
            "gross_profit": profit_total,
            "created_at": order.get("created_at"),
        })

        channel_key = str(order.get("channel_id") or "unassigned")
        channel_entry = channel_totals.setdefault(
            channel_key,
            {
                "channel_id": order.get("channel_id"),
                "channel_name": order.get("channel_name") or _make_fallback_label("Channel", order.get("channel_id")),
                "orders": 0,
                "sales_confirmed": 0.0,
                "pending_revenue": 0.0,
                "gross_profit": 0.0,
            },
        )
        channel_entry["orders"] += 1
        if is_confirmed:
            channel_entry["sales_confirmed"] += amount_total
        elif is_pending_review:
            channel_entry["pending_revenue"] += amount_total
        if include_financials:
            channel_entry["gross_profit"] += profit_total

        channel_id_value = order.get("channel_id")
        if channel_id_value is not None:
            channel_options[str(channel_id_value)] = order.get("channel_name") or _make_fallback_label("Channel", channel_id_value)

        for item in matched_items:
            sales_amount = _line_total(item)
            cost_amount = _line_cost(item)
            profit_amount = _line_profit(item)
            order_item_rows.append({
                "order_id": order_id,
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name") or _make_fallback_label("Product", item.get("product_id")),
                "quantity": int(item.get("quantity") or 0),
                "sales_amount": sales_amount,
                "cost_amount": cost_amount,
                "gross_profit": profit_amount,
                "channel_id": order.get("channel_id"),
                "channel_name": order.get("channel_name"),
            })

            if include_financials:
                product_key = str(item.get("product_id") or "unassigned")
                product_entry = product_totals.setdefault(
                    product_key,
                    {
                        "product_id": item.get("product_id"),
                        "product_name": item.get("product_name") or _make_fallback_label("Product", item.get("product_id")),
                        "quantity": 0,
                        "sales_amount": 0.0,
                        "cost_amount": 0.0,
                        "gross_profit": 0.0,
                    },
                )
                product_entry["quantity"] += int(item.get("quantity") or 0)
                product_entry["sales_amount"] += sales_amount
                product_entry["cost_amount"] += cost_amount
                product_entry["gross_profit"] += profit_amount

            if item.get("product_id") is not None:
                product_options[str(item.get("product_id"))] = item.get("product_name") or _make_fallback_label("Product", item.get("product_id"))

        for item in items:
            if item.get("product_id") is not None:
                product_options.setdefault(
                    str(item.get("product_id")),
                    item.get("product_name") or _make_fallback_label("Product", item.get("product_id")),
                )

    summary["gross_margin_percent"] = (
        (summary["gross_profit"] / summary["total_sales_confirmed"]) * 100
        if summary["total_sales_confirmed"] > 0
        else 0.0
    )

    return {
        "store_id": store_id,
        "range": {
            "start": range_meta["start_date"],
            "end": range_meta["end_date"],
            "timezone": range_meta["timezone"],
        },
        "summary": summary,
        "orders": order_rows,
        "order_items": order_item_rows,
        "channels": sorted(channel_totals.values(), key=lambda row: row["sales_confirmed"], reverse=True),
        "products": sorted(product_totals.values(), key=lambda row: row["sales_amount"], reverse=True),
        "filters": {
            "channels": [
                {"id": key, "name": name}
                for key, name in sorted(channel_options.items(), key=lambda item: item[1])
            ],
            "products": [
                {"id": key, "name": name}
                for key, name in sorted(product_options.items(), key=lambda item: item[1])
            ],
            "applied": {
                "channel_id": _normalize_filter_value(channel_id),
                "product_id": normalized_product,
            },
        },
    }

def _map_order(
    row: Dict[str, Any],
    customer_names: Optional[Dict[str, str]] = None,
    channel_names: Optional[Dict[str, str]] = None,
    latest_payment: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    customer_name = None
    channel_name = None
    if customer_names and row.get("customer_id"):
        customer_name = customer_names.get(str(row.get("customer_id")))
    if channel_names and row.get("channel_id"):
        channel_name = channel_names.get(str(row.get("channel_id")))
    inline_customer_name = row.get("customer_name")
    if inline_customer_name:
        customer_name = inline_customer_name
    order_no = row.get("order_no") or row.get("order_number")
    order_status = row.get("order_status") or row.get("status")
    normalized_status = normalize_order_status(order_status)
    archived = normalized_status in CANCELLED_ORDER_STATUSES or bool(row.get("cancelled_at"))
    customer_phone = row.get("customer_phone")
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "customer_id": row.get("customer_id"),
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "channel_id": row.get("channel_id"),
        "channel_name": channel_name,
        "order_no": order_no,
        "order_number": order_no,
        "order_type": row.get("order_type"),
        "pickup_type": row.get("pickup_type"),
        "pickup_time": row.get("pickup_time"),
        "order_status": order_status,
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
        "archived": archived,
        "latest_payment": latest_payment,
    }


def _order_select_columns(client: Client, use_channel_fee: bool = True) -> str:
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
    optional_fields = [
        "order_no",
        "order_number",
        "order_status",
        "customer_name",
        "customer_phone",
    ]
    for field in optional_fields:
        if _orders_has_column(client, field):
            columns.append(field)
    columns.extend([
        "created_at",
        "updated_at",
    ])
    return ", ".join(columns)


def _fetch_store_orders(client: Client, store_id: str) -> List[Dict[str, Any]]:
    """Fetch all orders for the given store with compatibility fallbacks."""
    use_channel_fee = True
    while True:
        select_cols = _order_select_columns(client, use_channel_fee)
        resp = (
            client.table("orders")
            .select(select_cols)
            .eq("store_id", store_id)
            .order("created_at", desc=True)
            .execute()
        )
        err = getattr(resp, "error", None)
        if not err:
            return getattr(resp, "data", None) or []
        missing_col = _extract_missing_column(err)
        if use_channel_fee and missing_col == "channel_fee":
            use_channel_fee = False
            continue
        raise HTTPException(status_code=500, detail="order_query_failed")


def _load_orders_for_dashboard(client: Client, store_id: str) -> List[Dict[str, Any]]:
    rows = _fetch_store_orders(client, store_id)
    if not rows:
        return []

    customer_map, channel_map = _load_order_relation_maps(client, store_id, rows)
    order_ids = [str(r.get("id")) for r in rows if r.get("id")]
    latest_payments = _load_latest_payments(client, order_ids)

    mapped: List[Dict[str, Any]] = []
    for row in rows:
        oid = str(row.get("id")) if row.get("id") else None
        mapped.append(_map_order(row, customer_map, channel_map, latest_payments.get(oid) if oid else None))
    return mapped


def _prepare_orders_for_export(client: Client, store_id: str, is_staff: bool) -> List[Dict[str, Any]]:
    orders = _load_orders_for_dashboard(client, store_id)
    if not orders:
        return []

    if not is_staff:
        return orders

    masked: List[Dict[str, Any]] = []
    for order in orders:
        sanitized = _mask_financial_fields(order)
        sanitized.pop("latest_payment", None)
        masked.append(sanitized)
    return masked


def _map_recent_order(order: Dict[str, Any]) -> Dict[str, Any]:
    order_id = str(order.get("id")) if order.get("id") else None
    order_no = order.get("order_no") or order.get("order_number") or _make_fallback_label("Order", order_id)
    order_status = order.get("order_status") or order.get("status")
    return {
        "order_id": order_id,
        "order_no": order_no,
        "customer_name": order.get("customer_name") or _make_fallback_label("Customer", order.get("customer_id")),
        "customer_phone": order.get("customer_phone") or "-",
        "status": order.get("status"),
        "order_status": order_status,
        "payment_status": order.get("payment_status"),
        "total_amount": _parse_float(order.get("total_amount")),
        "created_at": order.get("created_at"),
        "latest_payment": order.get("latest_payment"),
    }


def _init_trend_buckets(today_start: datetime) -> Tuple[List[str], Dict[str, Dict[str, Any]]]:
    ordered_keys: List[str] = []
    buckets: Dict[str, Dict[str, Any]] = {}
    for delta in range(_DASHBOARD_TREND_DAYS - 1, -1, -1):
        day = (today_start - timedelta(days=delta)).date()
        key = day.isoformat()
        ordered_keys.append(key)
        buckets[key] = {
            "date": key,
            "sales_amount": 0.0,
            "cost_amount": 0.0,
            "profit_amount": 0.0,
            "order_count": 0,
        }
    return ordered_keys, buckets


def _build_dashboard_summary(orders: List[Dict[str, Any]], today_start: datetime, today_end: datetime) -> Dict[str, Any]:
    tzinfo = today_start.tzinfo or timezone.utc
    queue_counts: Dict[str, int] = {status: 0 for status in _DASHBOARD_QUEUE_STATUSES}
    today_orders_count = 0
    confirmed_revenue_today = 0.0
    pending_revenue_today = 0.0
    pending_payment_review_count = 0
    pending_payment_review_value = 0.0
    today_cost_amount = 0.0
    today_profit_amount = 0.0
    today_completed_orders_count = 0
    today_cancelled_orders_count = 0
    paid_orders_count = 0
    active_orders_count = 0
    completed_orders_count = 0
    recent_candidates: List[Tuple[datetime, Dict[str, Any]]] = []
    default_dt = datetime.min.replace(tzinfo=timezone.utc)
    trend_keys, trend_buckets = _init_trend_buckets(today_start)
    trend_key_set = set(trend_buckets.keys())

    for order in orders:
        status_value = normalize_order_status(order.get("status") or order.get("order_status"))
        payment_status_value = normalize_payment_status(order.get("payment_status"))
        created_dt = _parse_iso_datetime(order.get("created_at"))
        created_in_tz = created_dt.astimezone(tzinfo) if created_dt else None
        is_today = bool(created_in_tz and today_start <= created_in_tz < today_end)
        amount = _parse_float(order.get("total_amount"))
        cost_amount = _parse_float(order.get("total_cost"))
        profit_amount = _parse_float(order.get("gross_profit"))
        is_confirmed = is_confirmed_sales_order(order, order_status=status_value, payment_status=payment_status_value)
        is_pending_review = is_pending_review_order(order, order_status=status_value, payment_status=payment_status_value)

        if is_today:
            today_orders_count += 1
            if is_confirmed:
                confirmed_revenue_today += amount
                today_cost_amount += cost_amount
                today_profit_amount += profit_amount
            elif is_pending_review:
                pending_revenue_today += amount

            if status_value == "completed":
                today_completed_orders_count += 1
            elif status_value in CANCELLED_ORDER_STATUSES:
                today_cancelled_orders_count += 1

        if is_pending_review or status_value == "waiting_payment_review":
            pending_payment_review_count += 1
            pending_payment_review_value += amount

        if is_confirmed:
            paid_orders_count += 1

        if status_value and status_value not in _FINALIZED_ORDER_STATUSES:
            active_orders_count += 1

        if status_value == "completed":
            completed_orders_count += 1

        if status_value in queue_counts:
            queue_counts[status_value] += 1

        if created_in_tz:
            day_key = created_in_tz.date().isoformat()
            if day_key in trend_key_set:
                bucket = trend_buckets[day_key]
                bucket["order_count"] += 1
                if is_confirmed:
                    bucket["sales_amount"] += amount
                    bucket["cost_amount"] += cost_amount
                    bucket["profit_amount"] += profit_amount

        recent_candidates.append((created_in_tz or default_dt, order))

    recent_candidates.sort(key=lambda item: item[0], reverse=True)
    recent_orders = [_map_recent_order(order) for _, order in recent_candidates[:_RECENT_ORDERS_LIMIT]]
    seven_day_trend = [trend_buckets[key] for key in trend_keys]

    return {
        "today_orders_count": today_orders_count,
        "confirmed_revenue_today": confirmed_revenue_today,
        "pending_revenue_today": pending_revenue_today,
        "pending_payment_review_count": pending_payment_review_count,
        "pending_payment_review_value": pending_payment_review_value,
        "today_cost_amount": today_cost_amount,
        "today_profit_amount": today_profit_amount,
        "today_completed_orders_count": today_completed_orders_count,
        "today_cancelled_orders_count": today_cancelled_orders_count,
        "paid_orders_count": paid_orders_count,
        "active_orders_count": active_orders_count,
        "completed_orders_count": completed_orders_count,
        "queues": queue_counts,
        "recent_orders": recent_orders,
        "seven_day_trend": seven_day_trend,
    }


@router.get("/dashboard-summary")
def get_dashboard_summary(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    store_timezone = _get_store_timezone(ctx["client"], store_id_resolved)
    orders = _load_orders_for_dashboard(ctx["client"], store_id_resolved)
    today_start, today_end = _today_range(store_timezone)
    summary = _build_dashboard_summary(orders, today_start, today_end)
    tzinfo = today_start.tzinfo or _DEFAULT_TZINFO
    timezone_offset = _format_timezone_offset(tzinfo)

    response = {
        "store_id": store_id_resolved,
        "store_timezone": store_timezone,
        "store_timezone_offset": timezone_offset,
        "store_timezone_display": f"{store_timezone} ({timezone_offset})",
        **summary,
    }
    return response


def _map_latest_payment_summary(row: Dict[str, Any]) -> Dict[str, Any]:
    payment_id = row.get("id")
    slip_submitted = bool(
        row.get("slip_storage_path")
        or row.get("slip_file_name")
        or row.get("slip_url")
        or row.get("submitted_at")
    )
    return {
        "id": str(payment_id) if payment_id else None,
        "payment_id": str(payment_id) if payment_id else None,
        "status": row.get("status"),
        "method": row.get("method"),
        "amount": float(row.get("amount") or 0),
        "slip_submitted": slip_submitted,
        "slip_file_name": row.get("slip_file_name"),
        "slip_storage_path": row.get("slip_storage_path"),
        "submitted_at": row.get("submitted_at"),
        "reject_reason": row.get("reject_reason"),
    }


def _load_latest_payments(client: Client, order_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Return a map of order_id -> latest payment summary."""
    if not order_ids:
        return {}

    select_cols = _payment_select_clause(client, include_relations=False, include_slip_fields=True)
    query = (
        client.table("payments")
        .select(select_cols)
        .in_("order_id", order_ids)
        .order("created_at", desc=True)
    )
    resp = query.execute()
    err = getattr(resp, "error", None)
    if err and _is_missing_column(err, "slip_url"):
        fallback_cols = _payment_select_clause(client, include_relations=False, include_slip_fields=False)
        resp = (
            client.table("payments")
            .select(fallback_cols)
            .in_("order_id", order_ids)
            .order("created_at", desc=True)
            .execute()
        )
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="latest_payments_query_failed")

    latest_map: Dict[str, Dict[str, Any]] = {}
    for row in getattr(resp, "data", None) or []:
        oid = row.get("order_id")
        if not oid:
            continue
        oid_str = str(oid)
        if oid_str in latest_map:
            continue
        latest_map[oid_str] = _map_latest_payment_summary(row)
    return latest_map



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
    resp = (
        client.table("orders")
        .select("id, store_id, status, payment_status, cancelled_reason, cancelled_at, channel_id")
        .eq("id", order_id)
        .limit(1)
        .execute()
    )
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


@router.get("/orders")
def list_orders(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_staff_or_above(role)
    is_staff = _normalize_store_role(role) == "staff"

    rows = _fetch_store_orders(ctx["client"], store_id_resolved)
    customer_map, channel_map = _load_order_relation_maps(ctx["client"], store_id_resolved, rows)
    order_ids = [str(r.get("id")) for r in rows if r.get("id")]

    item_map: Dict[str, List[Dict[str, Any]]] = {}
    if order_ids:
        item_query = (
            ctx["client"]
            .table("order_items")
            .select(order_item_select_clause(ctx["client"]))
            .in_("order_id", order_ids)
            .order("created_at", desc=False)
        )
        if order_items_supports_store_scope(ctx["client"]):
            item_query = item_query.eq("store_id", store_id_resolved)
        item_resp = item_query.execute()
        if getattr(item_resp, "error", None):
            raise HTTPException(status_code=500, detail="order_items_query_failed")
        for item in (getattr(item_resp, "data", None) or []):
            oid = str(item.get("order_id"))
            item_map.setdefault(oid, []).append(_map_order_item(item))

    latest_payments = _load_latest_payments(ctx["client"], order_ids)
    mapped = []
    for row in rows:
        oid = str(row.get("id")) if row.get("id") else None
        itemized = _map_order(row, customer_map, channel_map, latest_payments.get(oid))
        itemized["items"] = item_map.get(str(row.get("id")), [])
        mapped.append(itemized)

    if is_staff:
        masked_orders: List[Dict[str, Any]] = []
        for order in mapped:
            masked_order = _mask_financial_fields(order)
            masked_order["items"] = _mask_order_item_fields(order.get("items") or [])
            masked_orders.append(masked_order)
        mapped = masked_orders

    return {"items": mapped, "store_id": store_id_resolved}


@router.get("/orders/export")
def export_orders_csv(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Response:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_staff_or_above(role)
    is_staff = _normalize_store_role(role) == "staff"

    orders = _prepare_orders_for_export(ctx["client"], store_id_resolved, is_staff)
    columns = _ORDER_EXPORT_COLUMNS_STAFF if is_staff else _ORDER_EXPORT_COLUMNS_MANAGER
    filename = _csv_filename("orders")
    return _build_csv_response(filename, columns, orders)


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
    if not data.get("order_no"):
        data["order_no"] = generate_order_number(ctx["client"])
    data.pop("items", None)
    logger.warning("creating order with payload: %s", data)

    channel_id_value = data.get("channel_id")
    item_snapshots: List[Dict[str, Any]] = []
    for raw_item in items:
        item_data = _sanitize_order_item_payload(raw_item)
        _ensure_product_in_store(ctx["client"], item_data["product_id"], store_id_resolved)
        snapshot = prepare_order_item_snapshot(
            ctx["client"],
            store_id_resolved,
            product_id=item_data["product_id"],
            quantity=item_data["quantity"],
            channel_id=channel_id_value,
            raw_options=item_data.get("options"),
        )
        item_snapshots.append(snapshot)

    subtotal = sum(float(snapshot.get("total_price") or 0) for snapshot in item_snapshots)
    total_cost = sum(float(snapshot.get("total_cost") or 0) for snapshot in item_snapshots)
    discount_amount = float(data.get("discount_amount") or 0)
    channel_fee = resolve_channel_fee(ctx["client"], store_id_resolved, channel_id_value, subtotal)
    total_amount = subtotal + channel_fee - discount_amount
    gross_profit = total_amount - total_cost - channel_fee

    data["subtotal"] = subtotal
    data["total_cost"] = total_cost
    data["channel_fee"] = channel_fee
    data["total_amount"] = total_amount
    data["gross_profit"] = gross_profit

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
        if _is_unique_violation(error, "order_no"):
            attempt_data["order_no"] = generate_order_number(ctx["client"])
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
    store_scope_supported = order_items_supports_store_scope(ctx["client"])
    for snapshot in item_snapshots:
        record = build_order_item_record(
            snapshot,
            order_id=order_id,
            store_id=store_id_resolved if store_scope_supported else None,
            product_name=snapshot.get("product_name"),
        )
        item_rows.append(prune_order_item_columns(ctx["client"], record))

    if item_rows:
        item_resp = ctx["client"].table("order_items").insert(item_rows).execute()
        if getattr(item_resp, "error", None):
            raise HTTPException(status_code=500, detail="order_items_create_failed")

    recalculate_order_totals(ctx["client"], store_id_resolved, order_id)
    initial_status = str(created.get("status") or data.get("status") or "pending_payment")
    _write_order_status_log(ctx["client"], order_id, None, initial_status, ctx.get("user_id"), payload.note)
    return {"id": order_id, "status": "created"}


@router.get("/orders/{order_id}")
def get_order(order_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_staff_or_above(role)
    is_staff = _normalize_store_role(role) == "staff"

    use_channel_fee = True
    while True:
        select_cols = _order_select_columns(ctx["client"], use_channel_fee)
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
        .select(order_item_select_clause(ctx["client"]))
        .eq("order_id", order_id)
        .order("created_at", desc=False)
    )
    if order_items_supports_store_scope(ctx["client"]):
        item_query = item_query.eq("store_id", store_id_resolved)
    item_resp = item_query.execute()
    if getattr(item_resp, "error", None):
        raise HTTPException(status_code=500, detail="order_items_query_failed")

    latest_map = _load_latest_payments(ctx["client"], [str(row.get("id"))])
    mapped = _map_order(row, customer_map, channel_map, latest_map.get(str(row.get("id"))))
    raw_items = [_map_order_item(i) for i in (getattr(item_resp, "data", None) or [])]
    if is_staff:
        masked_order = _mask_financial_fields(mapped)
        masked_order["items"] = _mask_order_item_fields(raw_items)
        return masked_order
    mapped["items"] = raw_items
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

    recalculate_order_totals(ctx["client"], store_id_resolved, order_id)

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
            # TODO(LINE-Identity-Binding): After LIFF getProfile binds line_user_id
            # to the order/customer, enable live push only for verified orders.
            notification_result = send_line_notification(
                ctx["client"],
                order_id,
                customer_ctx.get("customer_id"),
                customer_ctx.get("line_user_id"),
                "order_ready",
                {"order_id": order_id, "message": mock_message},
            )
            if notification_result.get("send_status") != "skipped":
                response["mock_notification"] = mock_message

    return response


@router.delete("/orders/{order_id}")
def delete_order(order_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    order_row = _get_order_row(ctx["client"], order_id, store_id_resolved)
    current_status = normalize_order_status(order_row.get("status"))
    current_payment_status = normalize_payment_status(order_row.get("payment_status"))

    payments_query = ctx["client"].table("payments").select("id, status").eq("order_id", order_id)
    if _payments_has_column(ctx["client"], "store_id"):
        payments_query = payments_query.eq("store_id", store_id_resolved)
    payments_resp = payments_query.execute()
    if getattr(payments_resp, "error", None):
        raise HTTPException(status_code=500, detail="payment_lookup_failed")
    payments = getattr(payments_resp, "data", None) or []

    has_confirmed_payment = any(
        normalize_payment_status(payment.get("status")) in CONFIRMED_PAYMENT_STATUSES for payment in payments
    ) or current_payment_status in CONFIRMED_PAYMENT_STATUSES

    target_status = "voided" if has_confirmed_payment or current_status == "completed" else "cancelled"
    already_archived = current_status in CANCELLED_ORDER_STATUSES
    archive_reason = "archived_by_manager" if target_status == "cancelled" else "voided_by_manager"

    if already_archived and current_status == target_status:
        return {
            "id": order_id,
            "status": "archived",
            "order_status": current_status,
            "archived": True,
            "archived_reason": order_row.get("cancelled_reason") or archive_reason,
            "archived_at": order_row.get("cancelled_at"),
        }

    archive_time = datetime.utcnow().isoformat()
    update_data = {
        "status": target_status,
        "cancelled_reason": archive_reason,
        "cancelled_at": archive_time,
    }

    resp = ctx["client"].table("orders").update(update_data).eq("id", order_id).eq("store_id", store_id_resolved).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_archive_failed")

    _write_order_status_log(
        ctx["client"],
        order_id,
        str(order_row.get("status") or ""),
        target_status,
        ctx.get("user_id"),
        archive_reason,
    )

    return {
        "id": order_id,
        "status": "archived",
        "order_status": target_status,
        "archived": True,
        "archived_reason": archive_reason,
        "archived_at": archive_time,
    }


@router.patch("/orders/{order_id}/status")
def update_order_status(order_id: str, payload: OrderStatusUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_staff_or_above(role)
    normalized_role = _normalize_store_role(role)

    current = _get_order_row(ctx["client"], order_id, store_id_resolved)
    next_status = payload.status
    if next_status == "ready_for_pickup":
        next_status = "ready"

    current_status_raw = str(current.get("status") or "")
    current_status_normalized = normalize_order_status(current_status_raw)
    current_payment_status = normalize_payment_status(current.get("payment_status"))
    next_status_value = str(next_status)

    if not _valid_order_transition(current_status_normalized, next_status_value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_status_transition")

    if normalized_role == "staff":
        if next_status_value == "cancelled":
            allowed, denial_reason = _staff_can_cancel_operational_order(
                current_status_normalized,
                current_payment_status,
                current.get("cancelled_at"),
            )
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=denial_reason or "insufficient_role_for_status",
                )
        elif next_status_value not in _STAFF_ORDER_STATUS_ALLOWED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role_for_status")

    status_note = (payload.note or "").strip() or None
    update_data: Dict[str, Any] = {"status": next_status_value}
    if next_status_value == "cancelled":
        cancelled_reason = (payload.cancelled_reason or "").strip()
        cancelled_reason = cancelled_reason or status_note or "cancelled_via_status_update"
        cancelled_at_value = (payload.cancelled_at or "").strip() or datetime.utcnow().isoformat()
        update_data["cancelled_reason"] = cancelled_reason
        update_data["cancelled_at"] = cancelled_at_value

    resp = (
        ctx["client"].table("orders").update(update_data).eq("id", order_id).eq("store_id", store_id_resolved).execute()
    )
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_status_update_failed")

    _write_order_status_log(
        ctx["client"],
        order_id,
        current_status_raw,
        next_status_value,
        ctx.get("user_id"),
        status_note,
    )

    response: Dict[str, Any] = {"id": order_id, "status": next_status_value}
    if next_status_value == "ready":
        mock_message = "เครื่องดื่มของคุณพร้อมแล้ว สามารถมารับได้เลยครับ"
        customer_ctx = _get_order_customer_context(ctx["client"], store_id_resolved, order_id)
        # TODO(LINE-Identity-Binding): After LIFF getProfile binds line_user_id
        # to the order/customer, enable live push only for verified orders.
        notification_result = send_line_notification(
            ctx["client"],
            order_id,
            customer_ctx.get("customer_id"),
            customer_ctx.get("line_user_id"),
            "order_ready",
            {"order_id": order_id, "message": mock_message},
        )
        if notification_result.get("send_status") != "skipped":
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
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_staff_or_above(role)
    is_staff = _normalize_store_role(role) == "staff"
    _get_order_row(ctx["client"], order_id, store_id_resolved)

    list_query = (
        ctx["client"]
        .table("order_items")
        .select(order_item_select_clause(ctx["client"]))
        .eq("order_id", order_id)
        .order("created_at", desc=False)
    )
    if order_items_supports_store_scope(ctx["client"]):
        list_query = list_query.eq("store_id", store_id_resolved)
    resp = list_query.execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_items_query_failed")
    rows = getattr(resp, "data", None) or []
    items = [_map_order_item(r) for r in rows]
    if is_staff:
        items = _mask_order_item_fields(items)
    return {"items": items, "order_id": order_id, "store_id": store_id_resolved}


@router.post("/orders/{order_id}/items")
def create_order_item(order_id: str, payload: OrderItemPayload, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    order_row = _get_order_row(ctx["client"], order_id, store_id_resolved)
    data = _sanitize_order_item_payload(payload)
    _ensure_product_in_store(ctx["client"], data["product_id"], store_id_resolved)
    snapshot = prepare_order_item_snapshot(
        ctx["client"],
        store_id_resolved,
        product_id=data["product_id"],
        quantity=data["quantity"],
        channel_id=order_row.get("channel_id"),
        raw_options=data.get("options"),
    )
    store_scope_supported = order_items_supports_store_scope(ctx["client"])
    insert_data = build_order_item_record(
        snapshot,
        order_id=order_id,
        store_id=store_id_resolved if store_scope_supported else None,
        product_name=snapshot.get("product_name"),
    )
    pruned_insert = prune_order_item_columns(ctx["client"], insert_data)
    resp = ctx["client"].table("order_items").insert(pruned_insert).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_item_create_failed")
    rows = getattr(resp, "data", None) or []
    recalculate_order_totals(ctx["client"], store_id_resolved, order_id)
    return _map_order_item(rows[0] if rows else pruned_insert)


@router.patch("/order-items/{item_id}")
def update_order_item(item_id: str, payload: OrderItemUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_order_item_payload(payload, partial=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    select_columns = ["id", "store_id", "order_id", "product_id", "quantity"]
    if order_items_has_column(ctx["client"], "options"):
        select_columns.append("options")
    exists_query = (
        ctx["client"].table("order_items").select(", ".join(select_columns)).eq("id", item_id).limit(1)
    )
    if order_items_supports_store_scope(ctx["client"]):
        exists_query = exists_query.eq("store_id", store_id_resolved)
    exists_resp = exists_query.execute()
    exists = getattr(exists_resp, "data", None) or []
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_item_not_found")
    row = exists[0]
    if str(row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    target_product = data.get("product_id") or row.get("product_id")
    order_id_value = str(row.get("order_id"))
    order_row = _get_order_row(ctx["client"], order_id_value, store_id_resolved)
    target_quantity = data.get("quantity") if data.get("quantity") is not None else row.get("quantity")
    if target_quantity is None:
        raise HTTPException(status_code=500, detail="order_item_quantity_missing")
    target_quantity_int = int(target_quantity)
    target_options = data["options"] if "options" in data else row.get("options")
    _ensure_product_in_store(ctx["client"], target_product, store_id_resolved)

    snapshot = prepare_order_item_snapshot(
        ctx["client"],
        store_id_resolved,
        product_id=target_product,
        quantity=target_quantity_int,
        channel_id=order_row.get("channel_id"),
        raw_options=target_options,
    )

    store_scope_supported = order_items_supports_store_scope(ctx["client"])
    update_payload = build_order_item_record(
        snapshot,
        order_id=order_id_value,
        store_id=store_id_resolved if store_scope_supported else None,
        product_name=snapshot.get("product_name"),
    )
    update_payload.pop("order_id", None)
    pruned_update = prune_order_item_columns(ctx["client"], update_payload)

    update_query = ctx["client"].table("order_items").update(pruned_update).eq("id", item_id)
    if store_scope_supported:
        update_query = update_query.eq("store_id", store_id_resolved)
    resp = update_query.execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="order_item_update_failed")
    rows = getattr(resp, "data", None) or []
    updated = rows[0] if rows else (row | pruned_update)
    recalculate_order_totals(ctx["client"], store_id_resolved, order_id_value)
    return _map_order_item(updated)


@router.delete("/order-items/{item_id}")
def delete_order_item(item_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    exists_query = ctx["client"].table("order_items").select("id, store_id, order_id").eq("id", item_id).limit(1)
    if order_items_supports_store_scope(ctx["client"]):
        exists_query = exists_query.eq("store_id", store_id_resolved)
    exists_resp = exists_query.execute()
    exists = getattr(exists_resp, "data", None) or []
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_item_not_found")
    row = exists[0]
    if str(row.get("store_id")) != str(store_id_resolved):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")

    delete_item_query = ctx["client"].table("order_items").delete().eq("id", item_id)
    if order_items_supports_store_scope(ctx["client"]):
        delete_item_query = delete_item_query.eq("store_id", store_id_resolved)
    delete_item_query.execute()
    recalculate_order_totals(ctx["client"], store_id_resolved, str(row.get("order_id")))
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


def _map_payment(row: Dict[str, Any], order_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    order_rel = order_context or (row.get("orders") if isinstance(row, dict) else None)
    customer_rel = order_rel.get("customers") if isinstance(order_rel, dict) else None
    customer_name = None
    if isinstance(customer_rel, dict):
        customer_name = (
            customer_rel.get("display_name")
            or customer_rel.get("name")
            or customer_rel.get("customer_name")
        )
    if not customer_name and isinstance(order_rel, dict):
        customer_name = order_rel.get("customer_name")
    customer_phone = None
    if isinstance(order_rel, dict):
        customer_phone = order_rel.get("customer_phone")
    slip_submitted = bool(
        row.get("slip_storage_path")
        or row.get("slip_file_name")
        or row.get("slip_url")
        or row.get("submitted_at")
    )
    return {
        "id": str(row.get("id")),
        "store_id": row.get("store_id"),
        "order_id": row.get("order_id"),
        "order_no": order_rel.get("order_no") if isinstance(order_rel, dict) else None,
        "order_status": order_rel.get("order_status") if isinstance(order_rel, dict) else (order_rel.get("status") if isinstance(order_rel, dict) else None),
        "order_payment_status": order_rel.get("payment_status") if isinstance(order_rel, dict) else None,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
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
        "slip_submitted": slip_submitted,
    }


def _prepare_payments_for_export(client: Client, store_id: str, is_staff: bool) -> List[Dict[str, Any]]:
    all_orders = _fetch_store_orders(client, store_id)
    if not all_orders:
        return []

    customer_map, channel_map = _load_order_relation_maps(client, store_id, all_orders)
    order_map: Dict[str, Dict[str, Any]] = {}
    for row in all_orders:
        mapped_order = _map_order(row, customer_map, channel_map)
        order_map[mapped_order["id"]] = mapped_order

    order_ids = list(order_map.keys())
    if not order_ids:
        return []

    select_cols = _payment_select_clause(client, include_relations=False, include_slip_fields=True)
    payments_query = (
        client
        .table("payments")
        .select(select_cols)
        .in_("order_id", order_ids)
        .order("created_at", desc=True)
    )
    resp = payments_query.execute()
    err = getattr(resp, "error", None)
    if err and _is_missing_column(err, "slip_url"):
        fallback_cols = _payment_select_clause(client, include_relations=False, include_slip_fields=False)
        resp = (
            client
            .table("payments")
            .select(fallback_cols)
            .in_("order_id", order_ids)
            .order("created_at", desc=True)
        ).execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_query_failed")

    payments: List[Dict[str, Any]] = []
    for row in getattr(resp, "data", None) or []:
        oid = str(row.get("order_id")) if row.get("order_id") else None
        order_ctx = order_map.get(oid) if oid else None
        payment = _map_payment(row, order_ctx)
        if is_staff:
            payment = _mask_payment(payment)
        payments.append(payment)
    return payments


def _mask_payment(row: Dict[str, Any]) -> Dict[str, Any]:
    masked = dict(row)
    masked.pop("slip_url", None)
    masked.pop("slip_storage_path", None)
    masked.pop("slip_file_name", None)
    masked.pop("confirmed_by", None)
    masked.pop("confirmed_at", None)
    masked.pop("reject_reason", None)
    return masked


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
    try:
        resp = query.execute()
    except Exception as exc:
        err_msg = str(getattr(exc, "message", "") or exc or "").lower()
        if "invalid" in err_msg and ("uuid" in err_msg or "syntax" in err_msg):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payment_id")
        raise HTTPException(status_code=500, detail="payment_lookup_failed")
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
    else:
        order_id = row.get("order_id")
        if not order_id:
            raise HTTPException(status_code=500, detail="payment_order_missing")
        _get_order_row(client, str(order_id), store_id)
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


@router.get("/payments/{payment_id}/slip-preview")
def get_payment_slip_preview(payment_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _ensure_staff_can_manage_payments(role)

    payment_row = _get_payment_row(ctx["client"], payment_id, store_id_resolved)
    storage_path = payment_row.get("slip_storage_path")
    if not storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="payment_slip_not_found")

    bucket = settings.payment_slip_bucket or "payment-slips"
    try:
        signed_payload = create_signed_slip_url(bucket, storage_path, expires_in=60)
    except StorageUploadError:
        logger.warning("payment_slip_preview_failed payment_id=%s", payment_id)
        raise HTTPException(status_code=500, detail="payment_slip_preview_failed")

    return {
        "payment_id": payment_id,
        "signed_url": signed_payload.get("signed_url"),
        "expires_in": signed_payload.get("expires_in"),
        "file_name": payment_row.get("slip_file_name"),
        "submitted_at": payment_row.get("submitted_at"),
    }


@router.get("/payments")
def list_payments(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _ensure_staff_can_manage_payments(role)
    is_staff = _normalize_store_role(role) == "staff"

    all_orders = _fetch_store_orders(ctx["client"], store_id_resolved)
    if not all_orders:
        return {"items": [], "payment_queue": [], "store_id": store_id_resolved}

    customer_map, channel_map = _load_order_relation_maps(ctx["client"], store_id_resolved, all_orders)
    order_map: Dict[str, Dict[str, Any]] = {}
    for row in all_orders:
        mapped_order = _map_order(row, customer_map, channel_map)
        order_map[mapped_order["id"]] = mapped_order

    order_ids = list(order_map.keys())
    if not order_ids:
        return {"items": [], "payment_queue": [], "store_id": store_id_resolved}

    select_cols = _payment_select_clause(ctx["client"], include_relations=False, include_slip_fields=True)
    payments_query = (
        ctx["client"]
        .table("payments")
        .select(select_cols)
        .in_("order_id", order_ids)
        .order("created_at", desc=True)
    )
    resp = payments_query.execute()
    err = getattr(resp, "error", None)
    if err and _is_missing_column(err, "slip_url"):
        fallback_cols = _payment_select_clause(ctx["client"], include_relations=False, include_slip_fields=False)
        payments_query = (
            ctx["client"]
            .table("payments")
            .select(fallback_cols)
            .in_("order_id", order_ids)
            .order("created_at", desc=True)
        )
        resp = payments_query.execute()
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_query_failed")

    rows = getattr(resp, "data", None) or []
    mapped: List[Dict[str, Any]] = []
    queue: List[Dict[str, Any]] = []
    for row in rows:
        oid = str(row.get("order_id")) if row.get("order_id") else None
        order_ctx = order_map.get(oid) if oid else None
        payment = _map_payment(row, order_ctx)
        if is_staff:
            payment = _mask_payment(payment)
        mapped.append(payment)
        order_status = (order_ctx or {}).get("status")
        order_payment_status = (order_ctx or {}).get("payment_status")
        if payment.get("status") in {"pending", "pending_review"} or order_payment_status == "pending_review" or order_status == "waiting_payment_review":
            queue.append(payment)

    return {"items": mapped, "payment_queue": queue, "store_id": store_id_resolved}


@router.get("/payments/export")
def export_payments_csv(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Response:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _ensure_staff_can_manage_payments(role)
    is_staff = _normalize_store_role(role) == "staff"

    payments = _prepare_payments_for_export(ctx["client"], store_id_resolved, is_staff)
    columns = _PAYMENT_EXPORT_COLUMNS_STAFF if is_staff else _PAYMENT_EXPORT_COLUMNS_MANAGER
    filename = _csv_filename("payments")
    return _build_csv_response(filename, columns, payments)


@router.get("/orders/{order_id}/payments")
def list_order_payments(order_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _ensure_staff_can_manage_payments(role)
    is_staff = _normalize_store_role(role) == "staff"
    order_row = _get_order_row(ctx["client"], order_id, store_id_resolved)

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
    order_ctx = {
        "id": str(order_row.get("id")),
        "status": order_row.get("status"),
        "payment_status": order_row.get("payment_status"),
    }
    payments = [_map_payment(r, order_ctx) for r in rows]
    if is_staff:
        payments = [_mask_payment(p) for p in payments]
    return {"items": payments, "order_id": order_id, "store_id": store_id_resolved}


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
    _ensure_staff_can_manage_payments(role)

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
    _ensure_staff_can_manage_payments(role)

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
    # TODO(LINE-Identity-Binding): After LIFF getProfile binds line_user_id
    # to the order/customer, enable live push only for verified orders.
    notification_result = send_line_notification(
        ctx["client"],
        order_id,
        customer_ctx.get("customer_id"),
        customer_ctx.get("line_user_id"),
        "payment_approved",
        {"payment_id": payment_id, "order_id": order_id, "message": mock_message},
    )
    if notification_result.get("send_status") != "skipped":
        return {
            "id": payment_id,
            "status": "paid",
            "mock_notification": mock_message,
        }
    return {
        "id": payment_id,
        "status": "paid",
    }


@router.post("/payments/{payment_id}/reject")
def reject_payment(payment_id: str, payload: PaymentRejectPayload, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _ensure_staff_can_manage_payments(role)

    current = _get_payment_row(ctx["client"], payment_id, store_id_resolved)
    if not _valid_payment_transition(str(current.get("status") or ""), "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payment_status_transition")

    order_id = str(current.get("order_id"))
    payment_short = _short_identifier(payment_id)
    order_short = _short_identifier(order_id)
    logger.info(
        "payment_reject_begin payment=%s order=%s status=%s",
        payment_short,
        order_short,
        current.get("status"),
    )

    update_payload = {
        "status": "rejected",
        "reject_reason": (payload.reason or "").strip() or None,
        "confirmed_by": None,
        "confirmed_at": None,
    }
    update_query = ctx["client"].table("payments").update(update_payload).eq("id", payment_id)
    if _payments_supports_store_scope(ctx["client"]):
        update_query = update_query.eq("store_id", store_id_resolved)
    resp = update_query.execute()
    err = getattr(resp, "error", None)
    if err and any(_is_missing_column(err, k) for k in ["reject_reason", "confirmed_by", "confirmed_at"]):
        logger.warning("payment_reject_optional_columns_missing payment=%s detail=%s", payment_short, _safe_error_detail(err))
        trimmed = _omit_optional_fields(update_payload, ["reject_reason", "confirmed_by", "confirmed_at"])
        trimmed_query = ctx["client"].table("payments").update(trimmed).eq("id", payment_id)
        if _payments_supports_store_scope(ctx["client"]):
            trimmed_query = trimmed_query.eq("store_id", store_id_resolved)
        resp = trimmed_query.execute()
        err = getattr(resp, "error", None)
    if err:
        logger.error("payment_reject_failed payment=%s detail=%s", payment_short, _safe_error_detail(err))
        raise HTTPException(status_code=500, detail="payment_reject_failed")
    logger.info("payment_reject_payment_updated payment=%s", payment_short)

    note = (payload.note or "").strip() or (payload.reason or "").strip() or None
    try:
        _sync_order_payment_status(
            ctx["client"],
            store_id_resolved,
            order_id,
            "rejected",
            None,
            ctx.get("user_id"),
            note,
        )
        logger.info("payment_reject_order_synced order=%s", order_short)
    except HTTPException:
        logger.error("payment_reject_order_sync_failed order=%s", order_short)
        raise
    except Exception as exc:  # pragma: no cover
        logger.exception("payment_reject_order_sync_unexpected order=%s", order_short)
        raise HTTPException(status_code=500, detail="order_payment_status_sync_failed") from exc

    try:
        _write_payment_status_log(
            ctx["client"],
            payment_id,
            order_id,
            str(current.get("status") or ""),
            "rejected",
            ctx.get("user_id"),
            note,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "payment_reject_log_failed payment=%s detail=%s",
            payment_short,
            _safe_error_detail(exc),
        )
    else:
        logger.info("payment_reject_log_written payment=%s", payment_short)

    return {
        "id": payment_id,
        "status": "rejected",
        "message": "ไม่ผ่านการตรวจสอบการชำระเงิน กรุณาตรวจสอบข้อมูลและส่งหลักฐานใหม่",
    }
