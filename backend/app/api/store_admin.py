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
from app.services.cost_engine import (
    _calculate_recipe_cost,
    build_order_item_record,
    mask_option_costs,
    prepare_order_item_snapshot,
)
from app.services.order_item_columns import (
    order_item_select_clause,
    order_items_has_column,
    order_items_supports_store_scope,
    prune_order_item_columns,
)
from app.services.order_totals import recalculate_order_totals, resolve_channel_fee
from app.services.notification_sender import (
    ORDER_CANCEL_REASON_FALLBACK,
    PAYMENT_REJECT_REASON_FALLBACK,
    send_line_notification,
)
from app.services.line_service import sanitize_line_display_name
from app.services.order_numbers import generate_order_number
from app.services.stock_service import (
    StockSyncFailedError,
    StockUsageError,
    build_usage_plan,
    consume_for_paid_order,
)
from app.services.storage import (
    StorageUploadError,
    create_signed_slip_url,
    delete_storage_object,
    upload_payment_slip,
    upload_public_asset,
)

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
PENDING_PAYMENT_STATUSES: Set[str] = {"pending_payment"}
PENDING_PAYMENT_PAYMENT_STATUSES: Set[str] = {"pending"}
_FINALIZED_ORDER_STATUSES: Set[str] = {"completed"} | CANCELLED_ORDER_STATUSES
_RECENT_ORDERS_LIMIT = 10
_DASHBOARD_TREND_DAYS = 7
_REVENUE_RANGE_LABELS: Dict[str, str] = {
    "all": "ทุกวัน",
    "today": "วันนี้",
    "last_7_days": "7 วันที่ผ่านมา",
    "last_30_days": "30 วันที่ผ่านมา",
    "this_month": "เดือนนี้",
    "custom": "กำหนดเอง",
}
_ALLOWED_REVENUE_RANGES: Set[str] = set(_REVENUE_RANGE_LABELS.keys())

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
CUSTOMER_NAME_FALLBACK = "ลูกค้าไม่ระบุชื่อ"
KIOSK_CUSTOMER_FALLBACK = "Walk-in Customer"
KIOSK_CHANNEL_INTERNAL_NAME = "kiosk"
KIOSK_CHANNEL_DISPLAY_NAME = "Kiosk / Walk-in"
KIOSK_CHANNEL_NAME_MATCHES: Set[str] = {
    "kiosk",
    "kiosk walk in",
    "walk in",
    "walk in kiosk",
}
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
_STORE_PAYMENT_QR_ALLOWED_TYPES: Set[str] = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/svg+xml",
}
_STORE_PAYMENT_QR_EXTENSION_MAP: Dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}

_PURCHASE_COST_SOURCE = "purchase_derived"
_STOCK_INTAKE_PAYMENT_STATUSES: Set[str] = {"paid", "unpaid"}
_PURCHASE_RECEIPT_ALLOWED_TYPES: Set[str] = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_INGREDIENT_BASE_UNITS: Set[str] = {"g", "ml", "pcs", "set", "bottle"}
# Frozen DB enum for ingredients.cost_type. Do NOT change the column or
# introduce a separate classification table.
_INGREDIENT_COST_TYPES: Set[str] = {"ingredient", "packaging", "consumable", "addon", "utility", "other"}
_DEFAULT_INGREDIENT_COST_TYPE = "ingredient"
_WASTE_BASE_REASON_SET: Set[str] = {
    "expired",
    "damaged",
    "spill",
    "quality_issue",
    "manual_adjustment",
    "other",
}
_WASTE_MOVEMENT_REASON_MAP: Dict[str, str] = {
    "expired": "expired_waste",
    "damaged": "damaged_waste",
    "spill": "spill_waste",
    "quality_issue": "quality_issue_waste",
    "manual_adjustment": "manual_waste",
    "other": "other_waste",
}
_WASTE_ALIAS_TO_BASE_MAP: Dict[str, str] = {alias: base for base, alias in _WASTE_MOVEMENT_REASON_MAP.items()}

_PLANNING_MIX_LOOKBACK_DAYS = 30
_PLANNING_MAX_MIX_ORDERS = 500

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
    return status


def _has_submitted_payment_slip(payment_summary: Optional[Dict[str, Any]]) -> bool:
    if not payment_summary:
        return False
    slip_flag = payment_summary.get("slip_submitted")
    has_flag = bool(slip_flag)
    if has_flag:
        return True
    return bool(
        payment_summary.get("slip_storage_path")
        or payment_summary.get("slip_file_name")
        or payment_summary.get("slip_url")
        or payment_summary.get("submitted_at")
    )


def _staff_can_cancel_operational_order(
    current_status: Optional[str],
    payment_status: Optional[str],
    cancelled_at: Optional[str],
    *,
    latest_payment: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str]]:
    normalized_status = normalize_order_status(current_status)
    normalized_payment = normalize_payment_status(payment_status)
    latest_payment_status = normalize_payment_status(latest_payment.get("status")) if isinstance(latest_payment, dict) else ""
    effective_payment_status = latest_payment_status or normalized_payment
    latest_pending_review = bool(latest_payment_status) and latest_payment_status in PENDING_REVIEW_PAYMENT_STATUSES
    top_level_pending_review = normalized_payment in PENDING_REVIEW_PAYMENT_STATUSES
    effective_pending_review = effective_payment_status in PENDING_REVIEW_PAYMENT_STATUSES
    has_slip = _has_submitted_payment_slip(latest_payment)

    if cancelled_at or normalized_status in CANCELLED_ORDER_STATUSES:
        return False, "order_already_archived"
    if normalized_status == "completed":
        return False, "order_already_completed"
    if normalized_status == "paid" or effective_payment_status in CONFIRMED_PAYMENT_STATUSES:
        return False, "staff_cannot_cancel_paid_order"
    if normalized_status == "waiting_payment_review":
        if has_slip:
            return False, "insufficient_role_for_status"
        if latest_pending_review:
            return False, "insufficient_role_for_status"
        if not latest_payment and top_level_pending_review:
            return True, None
        if effective_pending_review:
            return False, "insufficient_role_for_status"
        return True, None
    if effective_pending_review:
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


def is_pending_payment_order(
    row: Dict[str, Any], *, order_status: Optional[str] = None, payment_status: Optional[str] = None
) -> bool:
    status_value = order_status if order_status is not None else normalize_order_status((row or {}).get("status") or (row or {}).get("order_status"))
    payment_value = payment_status if payment_status is not None else normalize_payment_status(_extract_row_payment_status(row))
    if status_value in CANCELLED_ORDER_STATUSES:
        return False
    if payment_value in CONFIRMED_PAYMENT_STATUSES:
        return False
    if status_value in PENDING_PAYMENT_STATUSES:
        return True
    if payment_value in PENDING_PAYMENT_PAYMENT_STATUSES:
        return True
    return False


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
    cost_type: Optional[str] = None


class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    cost_per_unit: Optional[float] = None
    current_stock: Optional[float] = None
    low_stock_threshold: Optional[float] = None
    supplier_name: Optional[str] = None
    is_active: Optional[bool] = None
    cost_type: Optional[str] = None


class StockIntakeCreate(BaseModel):
    ingredient_id: str
    quantity: float
    purchase_unit: str
    conversion_factor: float
    total_cost: float
    supplier_name: Optional[str] = None
    payment_status: Literal["paid", "unpaid"] = "paid"
    paid_at: Optional[str] = None
    due_date: Optional[str] = None
    note: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_storage_path: Optional[str] = None
    is_perishable: Optional[bool] = False
    lot_code: Optional[str] = None
    expires_at: Optional[str] = None
    expiry_note: Optional[str] = None


class StockIntakeSummary(BaseModel):
    id: str
    store_id: str
    ingredient_id: str
    quantity: float
    normalized_quantity: float
    purchase_unit: str
    conversion_factor: float
    total_cost: float
    unit_cost_snapshot: Optional[float] = None
    supplier_name: Optional[str] = None
    payment_status: Literal["paid", "unpaid"]
    paid_at: Optional[str] = None
    due_date: Optional[str] = None
    note: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_storage_path: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[str] = None
    ingredient_name: Optional[str] = None
    ingredient_unit: Optional[str] = None
    movement_id: Optional[str] = None
    movement_type: Optional[str] = None
    is_perishable: bool = False
    lot_code: Optional[str] = None
    expires_at: Optional[str] = None
    expiry_note: Optional[str] = None


class StockIntakeResponse(BaseModel):
    intake: StockIntakeSummary
    ingredient: Dict[str, Any]


class StockIntakeListResponse(BaseModel):
    items: List[StockIntakeSummary]
    store_id: str


WasteReason = Literal[
    "expired",
    "damaged",
    "spill",
    "quality_issue",
    "manual_adjustment",
    "other",
]
WasteAliasReason = Literal[
    "expired_waste",
    "damaged_waste",
    "spill_waste",
    "quality_issue_waste",
    "manual_waste",
    "other_waste",
]
WastePayloadReason = Union[WasteReason, WasteAliasReason]


class IngredientWasteCreate(BaseModel):
    ingredient_id: str
    quantity: float
    reason: WastePayloadReason
    purchase_id: Optional[str] = None
    wasted_at: Optional[str] = None
    note: Optional[str] = None


class IngredientWasteRecordSummary(BaseModel):
    id: str
    store_id: str
    ingredient_id: str
    purchase_id: Optional[str] = None
    stock_movement_id: Optional[str] = None
    quantity: float
    unit: Optional[str] = None
    unit_cost_snapshot: Optional[float] = None
    total_cost: Optional[float] = None
    reason: WasteReason
    wasted_at: Optional[str] = None
    note: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class IngredientWasteListResponse(BaseModel):
    items: List[IngredientWasteRecordSummary]
    store_id: str


class IngredientWasteSummaryResponse(BaseModel):
    store_id: str
    total_quantity: float
    total_cost: float
    record_count: int
    filters: Dict[str, Any]


class IngredientWasteResponse(BaseModel):
    record: IngredientWasteRecordSummary


class IngredientWasteSummaryFilters(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    ingredient_id: Optional[str] = None


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


class KioskOrderCustomer(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class KioskOrderCreate(BaseModel):
    items: List[OrderItemPayload]
    payment_method: Literal["promptpay", "cash"]
    customer: Optional[KioskOrderCustomer] = None
    note: Optional[str] = None
    client_order_id: Optional[str] = None


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


class StorePaymentSettingsUpdate(BaseModel):
    promptpay_display_name: Optional[str] = None
    is_promptpay_enabled: Optional[bool] = None
    is_cash_enabled: Optional[bool] = None


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


def _canonical_store_id() -> Optional[str]:
    """Return the configured canonical runtime store id, if any.

    Healholic V1 ships with a single pre-provisioned store. When
    DEFAULT_STORE_ID is configured, business runtime must fail closed to
    that store and never silently fall back to an arbitrary membership.
    """
    value = str(getattr(settings, "default_store_id", "") or "").strip()
    return value or None


def _resolve_store_id(memberships: List[Dict[str, Any]], store_id: Optional[str]) -> Tuple[str, str]:
    canonical = _canonical_store_id()

    requested_id = store_id if store_id else canonical
    if requested_id:
        for m in memberships:
            if str(m.get("store_id")) == str(requested_id):
                normalized_role = _normalize_store_role(m.get("role"))
                return str(m.get("store_id")), normalized_role
        # Either the caller supplied a foreign store id, or the canonical
        # store is configured but the user has no membership there. Both
        # cases must fail closed rather than silently switching stores.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_access_denied")

    # No canonical store configured and no store id supplied: preserve the
    # legacy single-membership behavior for non-Healholic deployments.
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
    """Authorize System Console access.

    Healholic V1: the `admin` role is the canonical System Console operator
    (system health, audit logs, user/role management, store membership
    inspection). The `owner` role retains System Console access for
    co-ownership of the deployed system. No other role may enter.
    """
    role_value = _normalize_store_role((profile or {}).get("role"))
    if role_value not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="owner_role_required")


def _require_owner_store_role(role: str) -> None:
    if not _is_owner(role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="owner_role_required")


def _ensure_staff_can_manage_payments(role: str) -> None:
    if _normalize_store_role(role) not in _PAYMENT_REVIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def _store_payment_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
    return bool(value)


def _store_payment_bucket() -> str:
    bucket = getattr(settings, "store_payment_asset_bucket", "")
    return bucket or "store-payment-assets"


def _store_payment_qr_limit_bytes() -> int:
    max_mb = float(getattr(settings, "store_payment_qr_max_mb", 5.0) or 5.0)
    return int(max(0.1, max_mb) * 1024 * 1024)


def _store_payment_settings_db_defaults(store_id: str) -> Dict[str, Any]:
    return {
        "store_id": store_id,
        "promptpay_display_name": None,
        "is_promptpay_enabled": True,
        "is_cash_enabled": True,
        "promptpay_qr_storage_path": None,
        "promptpay_qr_file_name": None,
    }


def _store_payment_settings_response(row: Optional[Dict[str, Any]], store_id: str) -> Dict[str, Any]:
    defaults = _store_payment_settings_db_defaults(store_id)
    response = {
        "store_id": store_id,
        "promptpay_display_name": defaults["promptpay_display_name"],
        "is_promptpay_enabled": defaults["is_promptpay_enabled"],
        "is_cash_enabled": defaults["is_cash_enabled"],
        "promptpay_qr_storage_path": defaults["promptpay_qr_storage_path"],
        "promptpay_qr_file_name": defaults["promptpay_qr_file_name"],
        "promptpay_qr_url": None,
    }
    if row:
        response["promptpay_display_name"] = row.get("promptpay_display_name")
        response["is_promptpay_enabled"] = _store_payment_bool(row.get("is_promptpay_enabled"), True)
        response["is_cash_enabled"] = _store_payment_bool(row.get("is_cash_enabled"), True)
        response["promptpay_qr_storage_path"] = row.get("promptpay_qr_storage_path")
        response["promptpay_qr_file_name"] = row.get("promptpay_qr_file_name")
    response["is_promptpay_enabled"] = _store_payment_bool(response["is_promptpay_enabled"], True)
    response["is_cash_enabled"] = _store_payment_bool(response["is_cash_enabled"], True)
    response["promptpay_qr_url"] = _resolve_store_payment_qr_url(store_id, response.get("promptpay_qr_storage_path"))
    return response


def _resolve_store_payment_qr_url(store_id: str, storage_path: Optional[str]) -> Optional[str]:
    if not storage_path:
        return None
    bucket = _store_payment_bucket()
    try:
        signed = create_signed_slip_url(bucket, storage_path, expires_in=120, error_prefix="store_payment_qr")
    except StorageUploadError as exc:
        logger.warning(
            "store_payment_qr_signed_url_failed store=%s detail=%s",
            _short_identifier(store_id),
            _safe_error_detail(exc),
        )
        return None
    return signed.get("signed_url") or signed.get("signedURL") or signed.get("signedUrl")


def _get_store_payment_settings_row(client: Client, store_id: str) -> Dict[str, Any]:
    columns = "store_id, promptpay_display_name, is_promptpay_enabled, is_cash_enabled, promptpay_qr_storage_path, promptpay_qr_file_name"
    try:
        resp = (
            client.table("store_payment_settings")
            .select(columns)
            .eq("store_id", store_id)
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=500, detail="payment_settings_query_failed")
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_settings_query_failed")
    rows = getattr(resp, "data", None) or []
    return rows[0] if rows else {}


def _persist_store_payment_settings(client: Client, store_id: str, data: Dict[str, Any], existing_row: Optional[Dict[str, Any]]) -> None:
    payload = dict(data)
    try:
        if existing_row:
            resp = client.table("store_payment_settings").update(payload).eq("store_id", store_id).execute()
        else:
            insert_payload = _store_payment_settings_db_defaults(store_id)
            insert_payload.update(payload)
            resp = client.table("store_payment_settings").insert(insert_payload).execute()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="payment_settings_update_failed")
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="payment_settings_update_failed")


def _safe_storage_segment(value: str) -> str:
    segment = re.sub(r"[^A-Za-z0-9_-]+", "-", str(value or ""))
    segment = re.sub(r"-+", "-", segment).strip("-_") or "store"
    return segment[:60]


def _resolve_store_payment_qr_extension(filename: Optional[str], content_type: str) -> str:
    normalized = _normalize_mime_type(content_type)
    if normalized in _STORE_PAYMENT_QR_EXTENSION_MAP:
        return _STORE_PAYMENT_QR_EXTENSION_MAP[normalized]
    if filename:
        _, ext = os.path.splitext(filename)
        ext = ext.replace(".", "").strip().lower()
        if ext in {"jpg", "jpeg", "png", "webp", "svg"}:
            return "jpg" if ext in {"jpg", "jpeg"} else ext
    return "png"


def _build_store_payment_qr_path(store_id: str, extension: str) -> str:
    safe_store = _safe_storage_segment(store_id)
    safe_ext = extension.lstrip(".").lower() or "png"
    return f"{safe_store}/payment/qr/current.{safe_ext}"


def _sanitize_qr_file_name(filename: Optional[str], extension: str) -> str:
    base = os.path.splitext(os.path.basename(str(filename or "")))[0]
    if not base:
        base = "store-qr"
    base = re.sub(r"[^A-Za-z0-9ก-๙_-]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-_") or "store-qr"
    safe_ext = extension.lstrip(".").lower() or "png"
    return f"{base[:64]}.{safe_ext}"


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
        for sensitive in (
            "overhead_per_unit",
            "net_profit_after_overhead_per_unit",
            "direct_cost_per_unit",
            "gross_profit_per_unit",
        ):
            if sensitive in sanitized:
                sanitized.pop(sensitive, None)
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


def _strip_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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
            f"orders({', '.join(order_rel_fields)}, customers(display_name, phone))"
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


def _start_of_day_in_tz(day: date, tzinfo) -> datetime:
    tz = tzinfo or _DEFAULT_TZINFO
    return datetime(year=day.year, month=day.month, day=day.day, tzinfo=tz)


def _first_day_of_next_month(day: date) -> date:
    if day.month == 12:
        return date(day.year + 1, 1, 1)
    return date(day.year, day.month + 1, 1)


def _resolve_revenue_range(
    range_key: Optional[str],
    tzinfo,
    start_date_text: Optional[str] = None,
    end_date_text: Optional[str] = None,
) -> Dict[str, Any]:
    tz = tzinfo or _DEFAULT_TZINFO
    normalized = (range_key or "all").strip().lower()
    if normalized not in _ALLOWED_REVENUE_RANGES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_revenue_range")

    now = datetime.now(tz)
    today = now.date()
    all_time = False
    start_dt: Optional[datetime] = None
    end_dt: Optional[datetime] = None
    start_value: Optional[str] = None
    end_value: Optional[str] = None
    label = _REVENUE_RANGE_LABELS.get(normalized, _REVENUE_RANGE_LABELS["all"])

    if normalized == "all":
        all_time = True
    elif normalized == "today":
        start_dt = _start_of_day_in_tz(today, tz)
        end_dt = start_dt + timedelta(days=1)
    elif normalized == "last_7_days":
        end_dt = _start_of_day_in_tz(today, tz) + timedelta(days=1)
        start_dt = end_dt - timedelta(days=7)
    elif normalized == "last_30_days":
        end_dt = _start_of_day_in_tz(today, tz) + timedelta(days=1)
        start_dt = end_dt - timedelta(days=30)
    elif normalized == "this_month":
        first_day = date(today.year, today.month, 1)
        start_dt = _start_of_day_in_tz(first_day, tz)
        end_dt = _start_of_day_in_tz(_first_day_of_next_month(first_day), tz)
    elif normalized == "custom":
        if not start_date_text or not end_date_text:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="custom_range_required")
        try:
            start_day = date.fromisoformat(start_date_text)
            end_day = date.fromisoformat(end_date_text)
        except ValueError as exc:  # pragma: no cover - defensive
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_custom_range_format") from exc
        if start_day > end_day:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_custom_range_order")
        start_dt = _start_of_day_in_tz(start_day, tz)
        end_dt = _start_of_day_in_tz(end_day, tz) + timedelta(days=1)
        label = f"{start_day.isoformat()} ถึง {end_day.isoformat()}"

    if not all_time and start_dt and end_dt:
        start_value = start_dt.date().isoformat()
        end_value = (end_dt - timedelta(days=1)).date().isoformat()

    return {
        "key": normalized,
        "label": label,
        "all_time": all_time,
        "start": start_dt,
        "end": end_dt,
        "start_date": start_value,
        "end_date": end_value,
    }


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


def _sanitize_kiosk_order_items(items: List[OrderItemPayload]) -> List[Dict[str, Any]]:
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="items_required")
    sanitized: List[Dict[str, Any]] = []
    for raw in items:
        sanitized.append(_sanitize_order_item_payload(raw))
    return sanitized


# ── FIX-A: Pre-persistence sale configuration validation ────────────────
# Validates that every item snapshot has a usable recipe before any
# order/payment/stock persistence.  Rejects with 400 so no partial
# transaction is committed.
def _validate_sale_configuration(item_snapshots: List[Dict[str, Any]]) -> None:
    """Validate stock-consumption prerequisites BEFORE financial persistence.

    Checks each prepared snapshot for:
    - missing base recipe (empty base_cost_breakdown)
    - missing ingredient_id in breakdown rows
    - quantity_used <= 0 in breakdown rows
    - unresolved addon recipe rows with missing ingredient data

    Raises HTTPException(400) with domain code
    ``kiosk_order_invalid_inventory_configuration`` on the first issue.
    """
    for snapshot in item_snapshots:
        product_name = snapshot.get("product_name") or snapshot.get("product_id") or "unknown"
        base_breakdown = snapshot.get("base_cost_breakdown")
        if not isinstance(base_breakdown, list) or not base_breakdown:
            logger.warning(
                "kiosk_preflight_missing_recipe product=%s", product_name,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="kiosk_order_invalid_inventory_configuration:missing_recipe",
            )
        for detail in base_breakdown:
            if not isinstance(detail, dict):
                continue
            ingredient_id = detail.get("ingredient_id")
            if not ingredient_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="kiosk_order_invalid_inventory_configuration:missing_ingredient_id",
                )
            quantity_used = _safe_float(detail.get("quantity_used"))
            if quantity_used <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="kiosk_order_invalid_inventory_configuration:invalid_recipe_quantity",
                )
        addon_breakdown = snapshot.get("addon_cost_breakdown")
        if isinstance(addon_breakdown, list):
            for detail in addon_breakdown:
                if not isinstance(detail, dict):
                    continue
                ingredient_id = detail.get("ingredient_id")
                if not ingredient_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="kiosk_order_invalid_inventory_configuration:missing_addon_ingredient_id",
                    )
                quantity_used = _safe_float(detail.get("quantity_used"))
                if quantity_used <= 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="kiosk_order_invalid_inventory_configuration:invalid_addon_recipe_quantity",
                    )


# ── FIX-B: Idempotent replay helpers ────────────────────────────────────
# When a duplicate client_order_id is detected (orders_pkey unique
# violation), fetch the existing order state and classify it.
def _classify_existing_order(
    client: Client,
    store_id: str,
    order_id: str,
) -> Dict[str, Any]:
    """Fetch an existing order and classify its completion state.

    Returns a dict with:
    - order_id, order_no, payment_status, stock_consumed
    - state: "complete" | "in_progress" | "partial_paid"
    - order: the mapped order dict (for complete state)
    """
    order_resp = (
        client.table("orders")
        .select("id,order_no,status,payment_status,store_id")
        .eq("id", order_id)
        .eq("store_id", store_id)
        .limit(1)
        .execute()
    )
    order_rows = getattr(order_resp, "data", None) or []
    if not order_rows:
        # Order exists in a different store or not at all — treat as conflict
        return {"state": "not_found", "order_id": order_id}

    order_row = order_rows[0]
    payment_status = order_row.get("payment_status")
    order_no = order_row.get("order_no")

    # Check payment
    pay_resp = (
        client.table("payments")
        .select("id,status")
        .eq("order_id", order_id)
        .limit(1)
        .execute()
    )
    has_payment = bool(getattr(pay_resp, "data", None))

    # Check stock movements
    sm_resp = (
        client.table("stock_movements")
        .select("id")
        .eq("ref_order_id", order_id)
        .eq("movement_type", "used")
        .limit(1)
        .execute()
    )
    has_stock = bool(getattr(sm_resp, "data", None))

    if payment_status == "paid" and has_payment and has_stock:
        return {
            "state": "complete",
            "order_id": order_id,
            "order_no": order_no,
            "payment_status": payment_status,
            "stock_consumed": True,
        }
    elif payment_status == "paid" and has_payment and not has_stock:
        return {
            "state": "partial_paid",
            "order_id": order_id,
            "order_no": order_no,
            "payment_status": "paid",
            "stock_consumed": False,
        }
    else:
        return {
            "state": "in_progress",
            "order_id": order_id,
            "order_no": order_no,
            "payment_status": payment_status,
            "stock_consumed": has_stock,
        }


def _is_orders_pkey_violation(error: Any) -> bool:
    """Check if an error is a unique violation on orders_pkey (PostgreSQL 23505)."""
    message = str(getattr(error, "message", error) or "").lower()
    # PostgREST / supabase-py may surface "duplicate key value" or code 23505
    return ("duplicate key value" in message or "23505" in message) and (
        "orders_pkey" in message or "orders" in message or "id" in message
    )


def _compare_payload_with_existing_order(
    client: Client,
    store_id: str,
    order_id: str,
    incoming_items: List[Dict[str, Any]],
) -> bool:
    """Compare incoming payload items against existing order items.

    Returns True if the payloads match (safe replay), False if they differ
    (conflict).  Compares product_id and quantity at minimum.
    """
    items_resp = (
        client.table("order_items")
        .select("product_id,quantity")
        .eq("order_id", order_id)
        .execute()
    )
    existing_items = getattr(items_resp, "data", None) or []
    if len(existing_items) != len(incoming_items):
        return False
    # Sort both by product_id for comparison
    existing_sorted = sorted(existing_items, key=lambda r: str(r.get("product_id") or ""))
    incoming_sorted = sorted(incoming_items, key=lambda r: str(r.get("product_id") or ""))
    for existing, incoming in zip(existing_sorted, incoming_sorted):
        if str(existing.get("product_id")) != str(incoming.get("product_id")):
            return False
        if int(existing.get("quantity") or 0) != int(incoming.get("quantity") or 0):
            return False
    return True


def _normalize_channel_name(value: Any) -> str:
    text = str(value or "").lower()
    for ch in ("/", "-", "_"):
        text = text.replace(ch, " ")
    return " ".join(text.split())


def _lookup_kiosk_channel(client: Client, store_id: str) -> Optional[str]:
    for candidate in (KIOSK_CHANNEL_INTERNAL_NAME, KIOSK_CHANNEL_DISPLAY_NAME):
        resp = (
            client.table("sales_channels")
            .select("id, name")
            .eq("store_id", store_id)
            .eq("name", candidate)
            .limit(1)
            .execute()
        )
        err = getattr(resp, "error", None)
        if err:
            logger.warning(
                "kiosk_channel_lookup_error store=%s name=%s detail=%s",
                store_id,
                candidate,
                _safe_error_detail(err),
            )
            continue
        rows = getattr(resp, "data", None) or []
        if rows and rows[0].get("id"):
            return str(rows[0]["id"])

    try:
        resp = client.table("sales_channels").select("id, name").eq("store_id", store_id).execute()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "kiosk_channel_list_exception store=%s detail=%s",
            store_id,
            _safe_error_detail(exc),
        )
        return None

    err = getattr(resp, "error", None)
    if err:
        logger.warning(
            "kiosk_channel_list_error store=%s detail=%s",
            store_id,
            _safe_error_detail(err),
        )
        return None

    rows = getattr(resp, "data", None) or []
    for row in rows:
        normalized = _normalize_channel_name(row.get("name"))
        if normalized in KIOSK_CHANNEL_NAME_MATCHES and row.get("id"):
            return str(row["id"])
    return None


def _ensure_kiosk_channel(client: Client, store_id: str) -> str:
    existing = _lookup_kiosk_channel(client, store_id)
    if existing:
        return existing

    payload: Dict[str, Any] = {
        "store_id": store_id,
        "name": KIOSK_CHANNEL_DISPLAY_NAME,
        "type": "manual",
        "fee_type": "none",
        "fee_value": 0,
        "is_active": True,
    }

    trimmed_optional = False
    while True:
        try:
            resp = client.table("sales_channels").insert(payload).execute()
        except Exception as exc:  # pragma: no cover - defensive
            resp = None
            err = exc
        else:
            err = getattr(resp, "error", None)

        if not err:
            rows = getattr(resp, "data", None) or []
            created = rows[0] if rows else {}
            new_id = created.get("id")
            if new_id:
                return str(new_id)
            fallback = _lookup_kiosk_channel(client, store_id)
            if fallback:
                return fallback
            logger.error("kiosk_channel_created_without_id store=%s", store_id)
            break

        if not trimmed_optional and _is_missing_column(err, "is_active"):
            payload = _omit_optional_fields(payload, ["is_active"])
            trimmed_optional = True
            continue

        if _is_unique_violation(err, "name"):
            fallback = _lookup_kiosk_channel(client, store_id)
            if fallback:
                return fallback

        message = _safe_error_detail(err)
        logger.error("kiosk_channel_create_failed store=%s detail=%s", store_id, message)
        raise HTTPException(status_code=500, detail="kiosk_channel_unavailable")

    raise HTTPException(status_code=500, detail="kiosk_channel_unavailable")


def _ensure_customer_record_for_kiosk(client: Client, store_id: str, customer: Optional[KioskOrderCustomer]) -> Tuple[Optional[str], str, Optional[str]]:
    name = _strip_text((customer or {}).get("name")) or KIOSK_CUSTOMER_FALLBACK
    phone = _strip_text((customer or {}).get("phone"))
    return None, name, phone


def _mask_order_for_staff(order: Dict[str, Any]) -> Dict[str, Any]:
    masked = _mask_financial_fields(order)
    masked["items"] = _mask_order_item_fields(order.get("items") or [])
    return masked


def _map_created_order_with_items(
    client: Client,
    store_id: str,
    order_id: str,
    is_staff: bool,
) -> Dict[str, Any]:
    rows = (
        client.table("orders")
        .select(_order_select_columns(client))
        .eq("id", order_id)
        .eq("store_id", store_id)
        .limit(1)
        .execute()
    )
    if getattr(rows, "error", None):
        raise HTTPException(status_code=500, detail="order_lookup_failed")
    order_row = (getattr(rows, "data", None) or [])[0]
    items_query = (
        client.table("order_items")
        .select(order_item_select_clause(client))
        .eq("order_id", order_id)
        .order("created_at", desc=False)
    )
    if order_items_supports_store_scope(client):
        items_query = items_query.eq("store_id", store_id)
    item_resp = items_query.execute()
    if getattr(item_resp, "error", None):
        raise HTTPException(status_code=500, detail="order_items_query_failed")
    items = [_map_order_item(row) for row in getattr(item_resp, "data", None) or []]
    latest_payments = _load_latest_payments(client, [str(order_id)])
    mapped = _map_order(order_row, None, None, latest_payments.get(str(order_id)))
    mapped["items"] = items
    return _mask_order_for_staff(mapped) if is_staff else mapped


def _create_paid_payment(
    client: Client,
    store_id: str,
    order_id: str,
    amount: float,
    method: str,
    confirmed_by: Optional[str],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "order_id": order_id,
        "amount": amount,
        "method": method,
        "status": "paid",
        "confirmed_by": confirmed_by,
        "confirmed_at": datetime.utcnow().isoformat(),
        "store_id": store_id if _payments_supports_store_scope(client) else None,
    }
    payload = _prune_payment_columns(client, payload)
    resp = client.table("payments").insert(payload).execute()
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="payment_create_failed")
    rows = getattr(resp, "data", None) or []
    return rows[0] if rows else payload


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


# ─── Store Payment Settings ───────────────────────────────────────────────────


@router.get("/payment-settings")
def get_store_payment_settings(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_staff_or_above(role)

    row = _get_store_payment_settings_row(ctx["client"], store_id_resolved)
    return {
        "store_id": store_id_resolved,
        "settings": _store_payment_settings_response(row if row else None, store_id_resolved),
    }


@router.put("/payment-settings")
def update_store_payment_settings(payload: StorePaymentSettingsUpdate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    payload_data = payload.model_dump(exclude_unset=True)
    if not payload_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    existing_row = _get_store_payment_settings_row(ctx["client"], store_id_resolved)
    promptpay_current = _store_payment_bool((existing_row or {}).get("is_promptpay_enabled"), True)
    cash_current = _store_payment_bool((existing_row or {}).get("is_cash_enabled"), True)
    display_current = (existing_row or {}).get("promptpay_display_name")

    promptpay_new = promptpay_current
    cash_new = cash_current
    display_new = display_current

    if "is_promptpay_enabled" in payload_data:
        promptpay_new = _store_payment_bool(payload_data["is_promptpay_enabled"], promptpay_current)
    if "is_cash_enabled" in payload_data:
        cash_new = _store_payment_bool(payload_data["is_cash_enabled"], cash_current)
    if "promptpay_display_name" in payload_data:
        display_new = _strip_text(payload_data["promptpay_display_name"])

    if not (promptpay_new or cash_new):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="one_payment_method_required")

    update_payload = {
        "promptpay_display_name": display_new,
        "is_promptpay_enabled": promptpay_new,
        "is_cash_enabled": cash_new,
    }

    _persist_store_payment_settings(
        ctx["client"],
        store_id_resolved,
        update_payload,
        existing_row if existing_row else None,
    )

    refreshed = _get_store_payment_settings_row(ctx["client"], store_id_resolved)
    target_row = refreshed or ((existing_row or {}) | update_payload)

    return {
        "store_id": store_id_resolved,
        "settings": _store_payment_settings_response(target_row, store_id_resolved),
    }


@router.post("/payment-settings/qr")
async def upload_store_payment_qr(
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_file")

    mime_type = _normalize_mime_type(file.content_type or "")
    if mime_type not in _STORE_PAYMENT_QR_ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_type_not_allowed")

    if len(content) > _store_payment_qr_limit_bytes():
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file_too_large")

    extension = _resolve_store_payment_qr_extension(file.filename, mime_type)
    storage_path = _build_store_payment_qr_path(store_id_resolved, extension)
    display_file_name = _sanitize_qr_file_name(file.filename, extension)

    bucket = _store_payment_bucket()
    try:
        upload_payment_slip(
            bucket=bucket,
            path=storage_path,
            data=content,
            content_type=mime_type or "application/octet-stream",
            error_prefix="store_payment_qr",
        )
    except StorageUploadError as exc:
        logger.error(
            "store_payment_qr_upload_failed store=%s detail=%s",
            _short_identifier(store_id_resolved),
            _safe_error_detail(exc),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="payment_qr_upload_failed")

    existing_row = _get_store_payment_settings_row(ctx["client"], store_id_resolved)
    update_payload = {
        "promptpay_qr_storage_path": storage_path,
        "promptpay_qr_file_name": display_file_name,
    }

    _persist_store_payment_settings(
        ctx["client"],
        store_id_resolved,
        update_payload,
        existing_row if existing_row else None,
    )

    refreshed = _get_store_payment_settings_row(ctx["client"], store_id_resolved)
    target_row = refreshed or ((existing_row or {}) | update_payload)

    return {
        "store_id": store_id_resolved,
        "settings": _store_payment_settings_response(target_row, store_id_resolved),
    }


@router.delete("/payment-settings/qr")
def delete_store_payment_qr(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    existing_row = _get_store_payment_settings_row(ctx["client"], store_id_resolved)
    storage_path = (existing_row or {}).get("promptpay_qr_storage_path")
    bucket = _store_payment_bucket()

    if storage_path:
        try:
            delete_storage_object(bucket, storage_path, error_prefix="store_payment_qr")
        except StorageUploadError as exc:
            logger.error(
                "store_payment_qr_delete_failed store=%s detail=%s",
                _short_identifier(store_id_resolved),
                _safe_error_detail(exc),
            )
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="payment_qr_delete_failed")

    if existing_row:
        _persist_store_payment_settings(
            ctx["client"],
            store_id_resolved,
            {"promptpay_qr_storage_path": None, "promptpay_qr_file_name": None},
            existing_row,
        )

    refreshed = _get_store_payment_settings_row(ctx["client"], store_id_resolved)
    target_row = refreshed or ((existing_row or {}) | {"promptpay_qr_storage_path": None, "promptpay_qr_file_name": None})

    return {
        "store_id": store_id_resolved,
        "settings": _store_payment_settings_response(target_row, store_id_resolved),
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


def _purchase_receipt_limit_bytes() -> int:
    max_mb = float(settings.purchase_receipt_max_mb or 5.0)
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


def _safe_receipt_filename(filename: Optional[str]) -> str:
    base = os.path.splitext(str(filename or "").strip())[0]
    if not base:
        base = "receipt"
    base = re.sub(r"[^A-Za-z0-9ก-๙_-]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-_") or "receipt"
    return base[:48]


def _build_purchase_receipt_path(store_id: str, purchase_id: str, filename: Optional[str], content_type: str) -> str:
    extension = _resolve_menu_image_extension(filename, content_type)
    safe_name = _safe_receipt_filename(filename)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    suffix = uuid4().hex[:6]
    return f"{store_id}/ingredient-purchases/{purchase_id}/{timestamp}-{suffix}-{safe_name}.{extension}"


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
        unit = (data.get("unit") or "").strip().lower()
        if not unit:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unit_required")
        if unit not in _INGREDIENT_BASE_UNITS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unit_invalid")
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

    if "cost_type" in data:
        cost_type_value = str(data.get("cost_type") or "").strip().lower()
        if not cost_type_value:
            data.pop("cost_type", None)
        elif cost_type_value not in _INGREDIENT_COST_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cost_type_invalid")
        else:
            data["cost_type"] = cost_type_value
    elif not partial:
        data["cost_type"] = _DEFAULT_INGREDIENT_COST_TYPE

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
        "cost_source": row.get("cost_source"),
        "last_purchase_at": row.get("last_purchase_at"),
        "cost_updated_at": row.get("cost_updated_at"),
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

    stock_field = "stock_on_hand"
    include_supplier = True
    include_is_active = True
    include_cost_metadata = True
    include_cost_type = True
    attempts = 0
    resp = None
    err = None
    while attempts < 8:
        attempts += 1
        columns = [
            "id",
            "store_id",
            "name",
            "unit",
            "cost_per_unit",
            stock_field,
            "low_stock_threshold",
        ]
        if include_supplier:
            columns.append("supplier_name")
        if include_is_active:
            columns.append("is_active")
        if include_cost_metadata:
            columns.extend(["cost_source", "last_purchase_at", "cost_updated_at"])
        if include_cost_type:
            columns.append("cost_type")
        columns.append("created_at")
        resp, err = _query_ingredients(", ".join(columns))
        if not err:
            break
        if stock_field == "stock_on_hand" and _is_missing_column(err, "stock_on_hand"):
            stock_field = "current_stock"
            continue
        if include_is_active and _is_missing_column(err, "is_active"):
            include_is_active = False
            continue
        if include_supplier and _is_missing_column(err, "supplier_name"):
            include_supplier = False
            continue
        if include_cost_metadata and any(_is_missing_column(err, fld) for fld in ("cost_source", "last_purchase_at", "cost_updated_at")):
            include_cost_metadata = False
            continue
        if include_cost_type and _is_missing_column(err, "cost_type"):
            include_cost_type = False
            continue
        break
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

    optional_fields = ["supplier_name", "is_active", "cost_type"]
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

    optional_fields = ["supplier_name", "is_active", "cost_type"]
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


# ─── Stock Intake ────────────────────────────────────────────────────────────


def _normalize_optional_datetime_string(value: Optional[Union[str, datetime]], *, field: str) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    parsed = _parse_iso_datetime(str(value))
    if parsed is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"invalid_{field}")
    return parsed.astimezone(timezone.utc).isoformat()


def _normalize_optional_date_string(value: Optional[Union[str, datetime]], *, field: str) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    raw = str(value).strip()
    if not raw:
        return None
    try:
        parsed_date = datetime.strptime(raw, "%Y-%m-%d").date()
        return parsed_date.isoformat()
    except Exception:
        parsed_dt = _parse_iso_datetime(raw)
        if parsed_dt is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"invalid_{field}")
        return parsed_dt.date().isoformat()


def _normalize_optional_datetime_or_date(value: Optional[Union[str, datetime]], *, field: str) -> Optional[str]:
    dt_value = _normalize_optional_datetime_string(value, field=field)
    if dt_value:
        return dt_value
    date_value = _normalize_optional_date_string(value, field=field)
    if date_value:
        try:
            parsed = datetime.strptime(date_value, "%Y-%m-%d")
            return parsed.replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            return None
    return None


def _sanitize_stock_intake_payload(payload: StockIntakeCreate) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    ingredient_id = (data.get("ingredient_id") or "").strip()
    if not ingredient_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ingredient_required")
    quantity = _safe_float(data.get("quantity"))
    if quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_positive")
    conversion_factor = _safe_float(data.get("conversion_factor"))
    if conversion_factor <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="conversion_factor_positive")
    purchase_unit = (data.get("purchase_unit") or "").strip()
    if not purchase_unit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="purchase_unit_required")
    total_cost = _safe_float(data.get("total_cost"))
    if total_cost < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="total_cost_non_negative")
    normalized_quantity = quantity * conversion_factor
    if normalized_quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="normalized_quantity_required")
    payment_status = (data.get("payment_status") or "paid").strip().lower()
    if payment_status not in _STOCK_INTAKE_PAYMENT_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payment_status_invalid")

    supplier_name = (data.get("supplier_name") or "").strip() or None
    note = (data.get("note") or "").strip() or None
    receipt_url = (data.get("receipt_url") or "").strip() or None
    receipt_storage_path = (data.get("receipt_storage_path") or "").strip() or None
    lot_code = (data.get("lot_code") or "").strip() or None
    expiry_note = (data.get("expiry_note") or "").strip() or None
    is_perishable = bool(data.get("is_perishable"))
    expires_at = _normalize_optional_datetime_string(data.get("expires_at"), field="expires_at")

    return {
        "ingredient_id": ingredient_id,
        "quantity": quantity,
        "conversion_factor": conversion_factor,
        "purchase_unit": purchase_unit,
        "total_cost": total_cost,
        "normalized_quantity": normalized_quantity,
        "payment_status": payment_status,
        "supplier_name": supplier_name,
        "paid_at": _normalize_optional_datetime_string(data.get("paid_at"), field="paid_at"),
        "due_date": _normalize_optional_date_string(data.get("due_date"), field="due_date"),
        "note": note,
        "receipt_url": receipt_url,
        "receipt_storage_path": receipt_storage_path,
        "is_perishable": is_perishable,
        "lot_code": lot_code,
        "expires_at": expires_at,
        "expiry_note": expiry_note,
    }


def _get_ingredient_snapshot(client: Client, ingredient_id: str, store_id: str) -> Dict[str, Any]:
    resp = client.table("ingredients").select("*").eq("id", ingredient_id).limit(1).execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="ingredient_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ingredient_not_found")
    row = rows[0]
    if str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")
    return row


class StockIntakeReceiptUpdate(BaseModel):
    receipt_url: Optional[str] = None
    receipt_storage_path: Optional[str] = None


def _stock_intake_select_clause(include_relations: bool = True) -> str:
    columns = [
        "id",
        "store_id",
        "ingredient_id",
        "quantity",
        "normalized_quantity",
        "purchase_unit",
        "conversion_factor",
        "total_cost",
        "unit_cost_snapshot",
        "supplier_name",
        "payment_status",
        "paid_at",
        "due_date",
        "note",
        "receipt_url",
        "receipt_storage_path",
        "is_perishable",
        "lot_code",
        "expires_at",
        "expiry_note",
        "created_at",
        "created_by",
    ]
    if include_relations:
        columns.append("ingredients(id, name, unit)")
    return ", ".join(columns)


def _attach_movement_metadata(client: Client, store_id: str, purchase_rows: List[Dict[str, Any]]) -> None:
    purchase_ids = [str(row.get("id")) for row in purchase_rows if row.get("id")]
    if not purchase_ids:
        return
    try:
        resp = (
            client.table("stock_movements")
            .select("id, purchase_id, movement_type")
            .eq("store_id", store_id)
            .in_("purchase_id", purchase_ids)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="stock_movement_lookup_failed") from exc
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="stock_movement_lookup_failed")
    rows = getattr(resp, "data", None) or []
    movement_map: Dict[str, Dict[str, Any]] = {}
    for movement in rows:
        pid = movement.get("purchase_id")
        if pid:
            movement_map[str(pid)] = movement
    for purchase in purchase_rows:
        pid = purchase.get("id")
        movement = movement_map.get(str(pid)) if pid else None
        if movement:
            purchase["movement_id"] = movement.get("id")
            purchase["movement_type"] = movement.get("movement_type") or movement.get("type")


def _map_stock_intake(row: Dict[str, Any]) -> StockIntakeSummary:
    ingredient_rel = row.get("ingredients") if isinstance(row, dict) else None
    quantity = _safe_float(row.get("quantity"))
    conversion = _safe_float(row.get("conversion_factor")) or 1.0
    normalized_quantity = _safe_float(row.get("normalized_quantity"))
    if normalized_quantity <= 0:
        normalized_quantity = quantity * conversion if conversion > 0 else quantity
    return StockIntakeSummary(
        id=str(row.get("id")),
        store_id=str(row.get("store_id")),
        ingredient_id=str(row.get("ingredient_id")),
        quantity=quantity,
        normalized_quantity=normalized_quantity,
        purchase_unit=row.get("purchase_unit"),
        conversion_factor=conversion,
        total_cost=_safe_float(row.get("total_cost")),
        unit_cost_snapshot=_safe_float(row.get("unit_cost_snapshot")),
        supplier_name=row.get("supplier_name"),
        payment_status=str(row.get("payment_status") or "paid"),
        paid_at=row.get("paid_at"),
        due_date=row.get("due_date"),
        note=row.get("note"),
        receipt_url=row.get("receipt_url"),
        receipt_storage_path=row.get("receipt_storage_path"),
        created_at=row.get("created_at"),
        created_by=row.get("created_by"),
        ingredient_name=(ingredient_rel or {}).get("name") if isinstance(ingredient_rel, dict) else None,
        ingredient_unit=(ingredient_rel or {}).get("unit") if isinstance(ingredient_rel, dict) else None,
        movement_id=str(row.get("movement_id")) if row.get("movement_id") else None,
        movement_type=row.get("movement_type"),
        is_perishable=bool(row.get("is_perishable")),
        lot_code=row.get("lot_code"),
        expires_at=row.get("expires_at"),
        expiry_note=row.get("expiry_note"),
    )


def _normalize_waste_reason(value: Any, *, strict: bool = True) -> str:
    reason = str(value or "").strip().lower()
    if not reason:
        if strict:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="waste_reason_invalid")
        return "other"
    if reason in _WASTE_BASE_REASON_SET:
        return reason
    alias_base = _WASTE_ALIAS_TO_BASE_MAP.get(reason)
    if alias_base:
        return alias_base
    if strict:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="waste_reason_invalid")
    return "other"


def _sanitize_waste_payload(payload: IngredientWasteCreate) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    ingredient_id = (data.get("ingredient_id") or "").strip()
    if not ingredient_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ingredient_required")
    quantity = _safe_float(data.get("quantity"))
    if quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="waste_quantity_positive")
    reason = _normalize_waste_reason(data.get("reason"))
    purchase_id = (data.get("purchase_id") or "").strip() or None
    note = _strip_text(data.get("note"))
    wasted_at = _normalize_optional_datetime_string(data.get("wasted_at"), field="wasted_at")
    if not wasted_at:
        wasted_at = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()

    return {
        "ingredient_id": ingredient_id,
        "quantity": quantity,
        "reason": reason,
        "purchase_id": purchase_id,
        "note": note,
        "wasted_at": wasted_at,
    }


def _get_purchase_snapshot(client: Client, purchase_id: str, store_id: str) -> Dict[str, Any]:
    resp = (
        client.table("ingredient_purchases")
        .select("*")
        .eq("id", purchase_id)
        .eq("store_id", store_id)
        .limit(1)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="purchase_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="purchase_not_found")
    return rows[0]


def _get_purchase_remaining_quantity(client: Client, store_id: str, purchase_id: Optional[str]) -> Optional[float]:
    if not purchase_id:
        return None
    resp = (
        client.table("stock_movements")
        .select("quantity")
        .eq("store_id", store_id)
        .eq("purchase_id", purchase_id)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="purchase_remaining_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        return None
    remaining = sum(_safe_float(row.get("quantity")) for row in rows)
    return remaining


def _resolve_waste_unit_cost_snapshot(
    ingredient_row: Dict[str, Any], purchase_row: Optional[Dict[str, Any]]
) -> float:
    if purchase_row:
        cost = _safe_float(purchase_row.get("unit_cost_snapshot"))
        if cost > 0:
            return cost
    return _safe_float(ingredient_row.get("cost_per_unit"))


def _resolve_ingredient_stock_column(ingredient_row: Optional[Dict[str, Any]]) -> str:
    if ingredient_row:
        if "stock_on_hand" in ingredient_row:
            return "stock_on_hand"
        if "current_stock" in ingredient_row:
            return "current_stock"
    return "stock_on_hand"


def _update_ingredient_stock_for_waste(
    client: Client,
    ingredient_id: str,
    store_id: str,
    *,
    new_stock: float,
    ingredient_row: Optional[Dict[str, Any]] = None,
) -> None:
    timestamp_iso = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()
    preferred_column = _resolve_ingredient_stock_column(ingredient_row)
    fallback_column = "current_stock" if preferred_column == "stock_on_hand" else "stock_on_hand"
    columns_to_try = [preferred_column]
    if fallback_column not in columns_to_try:
        columns_to_try.append(fallback_column)

    def _exec(update_payload: Dict[str, Any]) -> tuple[Optional[Any], Optional[Any]]:
        try:
            resp_local = (
                client.table("ingredients")
                .update(update_payload)
                .eq("id", ingredient_id)
                .eq("store_id", store_id)
                .execute()
            )
            return resp_local, getattr(resp_local, "error", None)
        except Exception as exc:  # pragma: no cover - defensive against transport errors
            return None, exc

    for column in columns_to_try:
        payload: Dict[str, Any] = {column: new_stock, "cost_updated_at": timestamp_iso}
        resp, err = _exec(dict(payload))
        if err and _is_missing_column(err, "cost_updated_at"):
            trimmed = dict(payload)
            trimmed.pop("cost_updated_at", None)
            resp, err = _exec(trimmed)
        if not err:
            return
        if _is_missing_column(err, column):
            continue
        raise HTTPException(status_code=500, detail="ingredient_waste_update_failed")
    raise HTTPException(status_code=500, detail="ingredient_waste_update_failed")


def _insert_waste_stock_movement(
    client: Client,
    store_id: str,
    ingredient_id: str,
    *,
    quantity: float,
    unit: Optional[str],
    purchase_id: Optional[str],
    reason: str,
    unit_cost_snapshot: float,
    created_by: Optional[str],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "store_id": store_id,
        "ingredient_id": ingredient_id,
        "movement_type": "adjust",
        "quantity": -abs(quantity),
        "unit": unit,
        "movement_reason": reason,
        "unit_cost_snapshot": unit_cost_snapshot,
        "created_by": created_by,
    }
    if purchase_id:
        payload["purchase_id"] = purchase_id

    while True:
        resp = client.table("stock_movements").insert(payload).execute()
        err = getattr(resp, "error", None)
        if not err:
            rows = getattr(resp, "data", None) or []
            return rows[0] if rows else payload
        if "movement_reason" in payload and _is_missing_column(err, "movement_reason"):
            reason_value = payload.pop("movement_reason", None) or reason
            payload["reason"] = reason_value
            continue
        if "unit" in payload and _is_missing_column(err, "unit"):
            payload.pop("unit", None)
            continue
        if "purchase_id" in payload and _is_missing_column(err, "purchase_id"):
            payload.pop("purchase_id", None)
            continue
        if "unit_cost_snapshot" in payload and _is_missing_column(err, "unit_cost_snapshot"):
            payload.pop("unit_cost_snapshot", None)
            continue
        if "created_by" in payload and _is_missing_column(err, "created_by"):
            payload.pop("created_by", None)
            continue
        raise HTTPException(status_code=500, detail="stock_movement_create_failed")


def _cleanup_failed_waste_creation(
    client: Client,
    *,
    store_id: str,
    ingredient_id: str,
    ingredient_row: Dict[str, Any],
    original_stock: float,
    movement_id: Optional[str],
    stock_was_updated: bool,
) -> None:
    if stock_was_updated:
        try:
            _update_ingredient_stock_for_waste(
                client,
                ingredient_id,
                store_id,
                new_stock=original_stock,
                ingredient_row=ingredient_row,
            )
        except HTTPException as exc:  # pragma: no cover - best effort logging
            logger.warning(
                "ingredient_waste_cleanup_stock_failed ingredient_id=%s detail=%s",
                ingredient_id,
                getattr(exc, "detail", str(exc)),
            )
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.warning(
                "ingredient_waste_cleanup_stock_failed ingredient_id=%s detail=%s",
                ingredient_id,
                str(exc),
            )
    if movement_id:
        try:
            (
                client.table("stock_movements")
                .delete()
                .eq("id", movement_id)
                .eq("store_id", store_id)
                .execute()
            )
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.warning(
                "ingredient_waste_cleanup_movement_failed movement_id=%s detail=%s",
                movement_id,
                str(exc),
            )


def _map_waste_record(row: Dict[str, Any]) -> IngredientWasteRecordSummary:
    return IngredientWasteRecordSummary(
        id=str(row.get("id")),
        store_id=str(row.get("store_id")),
        ingredient_id=str(row.get("ingredient_id")),
        purchase_id=row.get("purchase_id"),
        stock_movement_id=row.get("stock_movement_id"),
        quantity=_safe_float(row.get("quantity")),
        unit=row.get("unit"),
        unit_cost_snapshot=_safe_float(row.get("unit_cost_snapshot")),
        total_cost=_safe_float(row.get("total_cost")),
        reason=_normalize_waste_reason(row.get("reason"), strict=False),
        wasted_at=row.get("wasted_at"),
        note=row.get("note"),
        created_by=row.get("created_by"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _update_ingredient_from_purchase(
    client: Client,
    ingredient_id: str,
    store_id: str,
    *,
    new_stock: float,
    new_cost: float,
    supplier_name: Optional[str],
    timestamp_iso: str,
    ingredient_row: Optional[Dict[str, Any]] = None,
) -> None:
    stock_column = "stock_on_hand"
    if ingredient_row is not None and "stock_on_hand" not in ingredient_row:
        stock_column = "current_stock"

    payload: Dict[str, Any] = {
        stock_column: new_stock,
        "cost_per_unit": new_cost,
        "cost_source": _PURCHASE_COST_SOURCE,
        "last_purchase_at": timestamp_iso,
        "cost_updated_at": timestamp_iso,
    }
    if supplier_name:
        payload["supplier_name"] = supplier_name

    def _exec(update_payload: Dict[str, Any]):
        return client.table("ingredients").update(update_payload).eq("id", ingredient_id).eq("store_id", store_id).execute()

    attempt = dict(payload)
    resp = _exec(attempt)
    err = getattr(resp, "error", None)
    if err and _is_missing_column(err, "stock_on_hand"):
        stock_value = attempt.pop("stock_on_hand", None)
        if stock_value is not None:
            attempt["current_stock"] = stock_value
        resp = _exec(attempt)
        err = getattr(resp, "error", None)
    if err and any(_is_missing_column(err, col) for col in ("cost_source", "last_purchase_at", "cost_updated_at")):
        trimmed = {k: v for k, v in attempt.items() if k not in {"cost_source", "last_purchase_at", "cost_updated_at"}}
        resp = _exec(trimmed)
        err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="ingredient_purchase_update_failed")


def _insert_stock_movement_record(
    client: Client,
    store_id: str,
    ingredient_id: str,
    *,
    normalized_quantity: float,
    ingredient_unit: Optional[str],
    purchase_id: Optional[str],
    unit_cost_snapshot: float,
    created_by: Optional[str],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "store_id": store_id,
        "ingredient_id": ingredient_id,
        "movement_type": "in",
        "quantity": normalized_quantity,
        "unit": ingredient_unit,
        "movement_reason": "stock_intake",
        "purchase_id": purchase_id,
        "unit_cost_snapshot": unit_cost_snapshot,
        "created_by": created_by,
    }

    while True:
        resp = client.table("stock_movements").insert(payload).execute()
        err = getattr(resp, "error", None)
        if not err:
            rows = getattr(resp, "data", None) or []
            return rows[0] if rows else payload
        if "movement_reason" in payload and _is_missing_column(err, "movement_reason"):
            reason_value = payload.pop("movement_reason", None) or "stock_intake"
            payload["reason"] = reason_value
            continue
        if "unit" in payload and _is_missing_column(err, "unit"):
            payload.pop("unit", None)
            continue
        if "purchase_id" in payload and _is_missing_column(err, "purchase_id"):
            payload.pop("purchase_id", None)
            continue
        if "unit_cost_snapshot" in payload and _is_missing_column(err, "unit_cost_snapshot"):
            payload.pop("unit_cost_snapshot", None)
            continue
        if "created_by" in payload and _is_missing_column(err, "created_by"):
            payload.pop("created_by", None)
            continue
        raise HTTPException(status_code=500, detail="stock_movement_create_failed")


def _update_purchase_receipt_fields(
    client: Client,
    purchase_id: str,
    store_id: str,
    *,
    receipt_url: Optional[str],
    receipt_storage_path: Optional[str],
) -> None:
    payload: Dict[str, Any] = {}
    if receipt_url is not None:
        payload["receipt_url"] = receipt_url
    if receipt_storage_path is not None:
        payload["receipt_storage_path"] = receipt_storage_path
    if not payload:
        return
    resp = client.table("ingredient_purchases").update(payload).eq("id", purchase_id).eq("store_id", store_id).execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="purchase_receipt_update_failed")


@router.get("/stock-intakes")
def list_stock_intakes(
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
    ingredient_id: Optional[str] = None,
    limit: int = 50,
) -> StockIntakeListResponse:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    limit_value = max(1, min(limit, 100))
    select_clause = _stock_intake_select_clause(include_relations=True)

    def _build_intake_query(clause: str):
        q = (
            ctx["client"]
            .table("ingredient_purchases")
            .select(clause)
            .eq("store_id", store_id_resolved)
            .order("created_at", desc=True)
            .limit(limit_value)
        )
        if ingredient_id:
            q = q.eq("ingredient_id", ingredient_id)
        return q

    try:
        resp = _build_intake_query(select_clause).execute()
        err = getattr(resp, "error", None)
    except Exception as exc:
        if _is_missing_column(exc, "expiry_note"):
            select_clause = select_clause.replace(", expiry_note", "")
            resp = _build_intake_query(select_clause).execute()
            err = getattr(resp, "error", None)
        else:
            raise HTTPException(status_code=500, detail="stock_intake_query_failed")
    if err:
        raise HTTPException(status_code=500, detail="stock_intake_query_failed")
    rows = getattr(resp, "data", None) or []
    _attach_movement_metadata(ctx["client"], store_id_resolved, rows)
    return StockIntakeListResponse(items=[_map_stock_intake(r) for r in rows], store_id=store_id_resolved)


@router.get("/stock-intakes/{intake_id}")
def get_stock_intake(intake_id: str, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> StockIntakeResponse:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    select_clause = _stock_intake_select_clause(include_relations=True)

    def _build_single_intake_query(clause: str):
        return (
            ctx["client"].table("ingredient_purchases").select(clause).eq("id", intake_id).eq("store_id", store_id_resolved).limit(1)
        )

    try:
        resp = _build_single_intake_query(select_clause).execute()
        err = getattr(resp, "error", None)
    except Exception as exc:
        if _is_missing_column(exc, "expiry_note"):
            select_clause = select_clause.replace(", expiry_note", "")
            resp = _build_single_intake_query(select_clause).execute()
            err = getattr(resp, "error", None)
        else:
            raise HTTPException(status_code=500, detail="stock_intake_lookup_failed")
    if err:
        raise HTTPException(status_code=500, detail="stock_intake_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="stock_intake_not_found")
    _attach_movement_metadata(ctx["client"], store_id_resolved, rows)
    mapped = _map_stock_intake(rows[0])
    ingredient_row = _get_ingredient_snapshot(ctx["client"], mapped.ingredient_id, store_id_resolved)
    return StockIntakeResponse(intake=mapped, ingredient=_map_ingredient(ingredient_row))


@router.get("/ingredients/waste-records")
def list_ingredient_waste_records(
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
    ingredient_id: Optional[str] = None,
    reason: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
) -> IngredientWasteListResponse:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    limit_value = max(1, min(limit, 250))
    query = (
        ctx["client"].table("ingredient_waste_records")
        .select("*")
        .eq("store_id", store_id_resolved)
        .order("wasted_at", desc=True)
        .limit(limit_value)
    )
    if ingredient_id:
        query = query.eq("ingredient_id", ingredient_id)
    normalized_reason = (reason or "").strip().lower()
    if normalized_reason:
        resolved_reason = _normalize_waste_reason(normalized_reason)
        filter_values = [resolved_reason]
        alias_value = _WASTE_MOVEMENT_REASON_MAP.get(resolved_reason)
        if alias_value and alias_value != resolved_reason:
            filter_values.append(alias_value)
        if len(filter_values) == 1:
            query = query.eq("reason", filter_values[0])
        else:
            query = query.in_("reason", filter_values)
    start_iso = _normalize_optional_datetime_or_date(start_date, field="start_date")
    end_iso = _normalize_optional_datetime_or_date(end_date, field="end_date")
    if start_iso:
        query = query.gte("wasted_at", start_iso)
    if end_iso:
        query = query.lte("wasted_at", end_iso)

    resp = query.execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="ingredient_waste_query_failed")
    rows = getattr(resp, "data", None) or []
    return IngredientWasteListResponse(items=[_map_waste_record(r) for r in rows], store_id=store_id_resolved)


@router.post("/ingredients/waste-records", status_code=status.HTTP_201_CREATED)
def create_ingredient_waste(
    payload: IngredientWasteCreate,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> IngredientWasteResponse:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    sanitized = _sanitize_waste_payload(payload)
    ingredient_row = _get_ingredient_snapshot(ctx["client"], sanitized["ingredient_id"], store_id_resolved)
    available_stock = _safe_float(ingredient_row.get("stock_on_hand") or ingredient_row.get("current_stock"))
    if sanitized["quantity"] > available_stock:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="insufficient_stock_for_waste")

    purchase_row: Optional[Dict[str, Any]] = None
    if sanitized["purchase_id"]:
        purchase_row = _get_purchase_snapshot(ctx["client"], sanitized["purchase_id"], store_id_resolved)
        purchase_ing_id = str(purchase_row.get("ingredient_id")) if purchase_row.get("ingredient_id") else None
        if purchase_ing_id and purchase_ing_id != sanitized["ingredient_id"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="purchase_mismatch")
        remaining_quantity = _get_purchase_remaining_quantity(ctx["client"], store_id_resolved, sanitized["purchase_id"])
        if remaining_quantity is not None and sanitized["quantity"] > remaining_quantity + 1e-6:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="insufficient_lot_stock_for_waste")

    unit = ingredient_row.get("unit")
    unit_cost_snapshot = _resolve_waste_unit_cost_snapshot(ingredient_row, purchase_row)
    total_cost = round(sanitized["quantity"] * unit_cost_snapshot, 4)

    movement_row: Optional[Dict[str, Any]] = None
    stock_updated = False
    record_row: Dict[str, Any]
    movement_reason = _WASTE_MOVEMENT_REASON_MAP.get(sanitized["reason"], sanitized["reason"])

    def _revert_side_effects() -> None:
        if not (movement_row or stock_updated):
            return
        movement_id = str(movement_row.get("id")) if movement_row and movement_row.get("id") else None
        _cleanup_failed_waste_creation(
            ctx["client"],
            store_id=store_id_resolved,
            ingredient_id=sanitized["ingredient_id"],
            ingredient_row=ingredient_row,
            original_stock=available_stock,
            movement_id=movement_id,
            stock_was_updated=stock_updated,
        )

    try:
        movement_row = _insert_waste_stock_movement(
            ctx["client"],
            store_id_resolved,
            sanitized["ingredient_id"],
            quantity=sanitized["quantity"],
            unit=unit,
            purchase_id=sanitized.get("purchase_id"),
            reason=movement_reason,
            unit_cost_snapshot=unit_cost_snapshot,
            created_by=ctx.get("user_id"),
        )

        new_stock = available_stock - sanitized["quantity"]
        if new_stock < 0:
            new_stock = 0.0
        _update_ingredient_stock_for_waste(
            ctx["client"],
            sanitized["ingredient_id"],
            store_id_resolved,
            new_stock=new_stock,
            ingredient_row=ingredient_row,
        )
        stock_updated = True

        record_payload: Dict[str, Any] = {
            "store_id": store_id_resolved,
            "ingredient_id": sanitized["ingredient_id"],
            "purchase_id": sanitized.get("purchase_id"),
            "stock_movement_id": movement_row.get("id"),
            "quantity": sanitized["quantity"],
            "unit": unit,
            "unit_cost_snapshot": unit_cost_snapshot,
            "total_cost": total_cost,
            "reason": sanitized["reason"],
            "wasted_at": sanitized["wasted_at"],
            "note": sanitized.get("note"),
            "created_by": ctx.get("user_id"),
        }

        resp = ctx["client"].table("ingredient_waste_records").insert(record_payload).execute()
        err = getattr(resp, "error", None)
        if err:
            raise HTTPException(status_code=500, detail="ingredient_waste_create_failed")
        rows = getattr(resp, "data", None) or []
        record_row = rows[0] if rows else record_payload
    except HTTPException:
        _revert_side_effects()
        raise
    except Exception as exc:
        _revert_side_effects()
        raise HTTPException(status_code=500, detail="ingredient_waste_create_failed") from exc

    return IngredientWasteResponse(record=_map_waste_record(record_row))


@router.get("/ingredients/waste-summary")
def get_ingredient_waste_summary(
    filters: IngredientWasteSummaryFilters = Depends(),
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> IngredientWasteSummaryResponse:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    query = (
        ctx["client"].table("ingredient_waste_records")
        .select("quantity, total_cost, wasted_at, ingredient_id")
        .eq("store_id", store_id_resolved)
    )

    normalized_ingredient = (filters.ingredient_id or "").strip() or None
    if normalized_ingredient:
        query = query.eq("ingredient_id", normalized_ingredient)

    start_iso = _normalize_optional_datetime_or_date(filters.start_date, field="start_date")
    end_iso = _normalize_optional_datetime_or_date(filters.end_date, field="end_date")
    if start_iso:
        query = query.gte("wasted_at", start_iso)
    if end_iso:
        query = query.lte("wasted_at", end_iso)

    resp = query.execute()
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="ingredient_waste_summary_failed")
    rows = getattr(resp, "data", None) or []

    total_quantity = sum(_safe_float(row.get("quantity")) for row in rows)
    total_cost = sum(_safe_float(row.get("total_cost")) for row in rows)

    filter_payload = {
        "ingredient_id": normalized_ingredient,
        "start_date": start_iso,
        "end_date": end_iso,
    }

    return IngredientWasteSummaryResponse(
        store_id=store_id_resolved,
        total_quantity=total_quantity,
        total_cost=total_cost,
        record_count=len(rows),
        filters=filter_payload,
    )


@router.post("/stock-intakes")
def create_stock_intake(payload: StockIntakeCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> StockIntakeResponse:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    try:
        sanitized = _sanitize_stock_intake_payload(payload)
        ingredient_row = _get_ingredient_snapshot(ctx["client"], sanitized["ingredient_id"], store_id_resolved)
        old_stock = _safe_float(ingredient_row.get("stock_on_hand") or ingredient_row.get("current_stock"))
        old_cost = _safe_float(ingredient_row.get("cost_per_unit"))
        normalized_quantity = sanitized["normalized_quantity"]
        purchase_unit_cost = sanitized["total_cost"] / normalized_quantity if normalized_quantity else 0
        new_stock = old_stock + normalized_quantity
        if new_stock <= 0:
            new_stock = normalized_quantity
        if old_stock <= 0:
            new_cost = purchase_unit_cost
        else:
            new_cost = ((old_stock * old_cost) + sanitized["total_cost"]) / (old_stock + normalized_quantity)

        purchase_payload: Dict[str, Any] = {
            "store_id": store_id_resolved,
            "ingredient_id": sanitized["ingredient_id"],
            "quantity": sanitized["quantity"],
            "normalized_quantity": normalized_quantity,
            "purchase_unit": sanitized["purchase_unit"] or ingredient_row.get("unit"),
            "conversion_factor": sanitized["conversion_factor"],
            "total_cost": sanitized["total_cost"],
            "unit_cost_snapshot": purchase_unit_cost,
            "payment_status": sanitized["payment_status"],
            "created_by": ctx.get("user_id"),
            "is_perishable": sanitized.get("is_perishable", False),
        }

        for optional_field in (
            "supplier_name",
            "paid_at",
            "due_date",
            "note",
            "receipt_url",
            "receipt_storage_path",
            "lot_code",
            "expiry_note",
            "expires_at",
        ):
            value = sanitized.get(optional_field)
            if value:
                purchase_payload[optional_field] = value

        def _insert_purchase(data: Dict[str, Any]) -> tuple[Optional[Any], Optional[Any]]:
            try:
                resp_local = ctx["client"].table("ingredient_purchases").insert(data).execute()
                return resp_local, getattr(resp_local, "error", None)
            except Exception as exc:
                return None, exc

        resp, err = _insert_purchase(dict(purchase_payload))
        if err and _is_missing_column(err, "normalized_quantity"):
            fallback = dict(purchase_payload)
            fallback.pop("normalized_quantity", None)
            resp, err = _insert_purchase(fallback)
        optional_purchase_fields = [
            "conversion_factor",
            "unit_cost_snapshot",
            "supplier_name",
            "payment_status",
            "paid_at",
            "due_date",
            "note",
            "receipt_url",
            "receipt_storage_path",
            "created_by",
        ]
        if err and any(_is_missing_column(err, fld) for fld in optional_purchase_fields):
            trimmed = {k: v for k, v in purchase_payload.items() if k not in optional_purchase_fields}
            resp, err = _insert_purchase(trimmed)
        if err:
            raise HTTPException(status_code=500, detail={"error": "stock_intake_create_failed", "reason": _safe_error_detail(err)})
        rows = getattr(resp, "data", None) if resp else []
        purchase_row = rows[0] if rows else purchase_payload

        timestamp_iso = datetime.utcnow().isoformat()
        _update_ingredient_from_purchase(
            ctx["client"],
            sanitized["ingredient_id"],
            store_id_resolved,
            new_stock=new_stock,
            new_cost=new_cost,
            supplier_name=sanitized.get("supplier_name"),
            timestamp_iso=timestamp_iso,
            ingredient_row=ingredient_row,
        )

        ingredient_updated = _get_ingredient_snapshot(ctx["client"], sanitized["ingredient_id"], store_id_resolved)
        unit_cost_snapshot = _safe_float(purchase_row.get("unit_cost_snapshot")) or purchase_unit_cost

        movement_row = _insert_stock_movement_record(
            ctx["client"],
            store_id_resolved,
            sanitized["ingredient_id"],
            normalized_quantity=normalized_quantity,
            ingredient_unit=ingredient_updated.get("unit"),
            purchase_id=str(purchase_row.get("id")) if purchase_row.get("id") else None,
            unit_cost_snapshot=unit_cost_snapshot,
            created_by=ctx.get("user_id"),
        )

        purchase_row["ingredients"] = {
            "id": ingredient_updated.get("id"),
            "name": ingredient_updated.get("name"),
            "unit": ingredient_updated.get("unit"),
        }
        if movement_row:
            purchase_row["movement_id"] = movement_row.get("id")
            purchase_row["movement_type"] = movement_row.get("movement_type") or movement_row.get("type") or "in"

        return StockIntakeResponse(intake=_map_stock_intake(purchase_row), ingredient=_map_ingredient(ingredient_updated))
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - diagnostic fallback
        logger.exception(
            "stock_intake_create_exception",
            extra={
                "store_id": store_id_resolved,
                "ingredient_id": payload.ingredient_id,
            },
        )
        raise HTTPException(status_code=500, detail={"error": "stock_intake_unhandled", "reason": _safe_error_detail(exc)})


@router.post("/stock-intakes/{intake_id}/receipt")
async def upload_stock_intake_receipt(
    intake_id: str,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
    file: UploadFile = File(...),
) -> StockIntakeSummary:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    resp = (
        ctx["client"]
        .table("ingredient_purchases")
        .select(_stock_intake_select_clause(include_relations=True))
        .eq("store_id", store_id_resolved)
        .eq("id", intake_id)
        .limit(1)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="stock_intake_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="stock_intake_not_found")
    purchase_row = rows[0]

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_file")

    mime_type = _normalize_mime_type(file.content_type or "")
    if mime_type not in _PURCHASE_RECEIPT_ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_type_not_allowed")
    if len(content) > _purchase_receipt_limit_bytes():
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file_too_large")

    storage_path = _build_purchase_receipt_path(store_id_resolved, intake_id, file.filename, mime_type)
    try:
        upload_payment_slip(
            settings.purchase_receipt_bucket,
            storage_path,
            content,
            mime_type or "application/octet-stream",
            error_prefix="purchase_receipt",
        )
    except StorageUploadError as exc:
        logger.error(
            "stock_intake_receipt_upload_failed purchase=%s store=%s detail=%s",
            _short_identifier(intake_id),
            _short_identifier(store_id_resolved),
            _safe_error_detail(exc),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    receipt_url = None
    try:
        signed = create_signed_slip_url(
            settings.purchase_receipt_bucket,
            storage_path,
            expires_in=60,
            error_prefix="purchase_receipt",
        )
        receipt_url = signed.get("signed_url")
    except StorageUploadError:
        receipt_url = None

    _update_purchase_receipt_fields(
        ctx["client"],
        intake_id,
        store_id_resolved,
        receipt_url=receipt_url,
        receipt_storage_path=storage_path,
    )

    updated_row = dict(purchase_row)
    updated_row["receipt_url"] = receipt_url
    updated_row["receipt_storage_path"] = storage_path
    return _map_stock_intake(updated_row)


@router.get("/stock-intakes/{intake_id}/receipt-url")
def generate_stock_intake_receipt_url(
    intake_id: str,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    resp = (
        ctx["client"].table("ingredient_purchases").select("id, store_id, receipt_storage_path").eq("id", intake_id).eq("store_id", store_id_resolved).limit(1).execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="stock_intake_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="stock_intake_not_found")
    storage_path = rows[0].get("receipt_storage_path")
    if not storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="receipt_not_uploaded")

    try:
        signed = create_signed_slip_url(
            settings.purchase_receipt_bucket,
            storage_path,
            expires_in=60,
            error_prefix="purchase_receipt",
        )
    except StorageUploadError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return signed


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


def _load_order_relation_maps(
    client: Client,
    store_id: str,
    rows: List[Dict[str, Any]],
) -> Tuple[Dict[str, Dict[str, Optional[str]]], Dict[str, str]]:
    customer_ids: Set[str] = set()
    channel_ids: Set[str] = set()
    for row in rows:
        cid = row.get("customer_id")
        if cid:
            customer_ids.add(str(cid))
        ch_id = row.get("channel_id")
        if ch_id:
            channel_ids.add(str(ch_id))

    customer_map: Dict[str, Dict[str, Optional[str]]] = {}
    if customer_ids:
        select_fields = ["display_name", "phone"]
        while True:
            query_fields = ", ".join(["id"] + select_fields) if select_fields else "id"
            try:
                resp = (
                    client.table("customers")
                    .select(query_fields)
                    .eq("store_id", store_id)
                    .in_("id", list(customer_ids))
                    .execute()
                )
            except Exception as exc:
                missing = _extract_missing_column(exc)
                if missing and missing in select_fields:
                    select_fields.remove(missing)
                    continue
                raise
            err = getattr(resp, "error", None)
            if err:
                missing = _extract_missing_column(err)
                if missing and missing in select_fields:
                    select_fields.remove(missing)
                    continue
                raise HTTPException(status_code=500, detail="customer_lookup_failed")
            for row in getattr(resp, "data", None) or []:
                cid = str(row.get("id")) if row.get("id") else None
                if not cid:
                    continue
                customer_map[cid] = {
                    "display_name": row.get("display_name"),
                    "phone": row.get("phone"),
                }
            break
        for cid in customer_ids:
            customer_map.setdefault(str(cid), {})
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


# ─── Planning Baseline Helpers ─────────────────────────────────────────────


_PLANNING_ASSUMPTION_DEFAULTS = {
    "expected_cups_per_month": 300,
    "operating_days_per_month": 20,
    "target_profit_monthly": 0.0,
    "overhead_allocation_method": "per_cup",
}

_OVERHEAD_PERIOD_MULTIPLIERS = {
    "daily": 30.0,
    "weekly": 4.345,
    "monthly": 1.0,
}


def _normalize_overhead_period(value: Any) -> str:
    if not value:
        return "monthly"
    text = str(value).strip().lower()
    return text if text in _OVERHEAD_PERIOD_MULTIPLIERS else "monthly"


def _load_active_overhead_expenses(client: Client, store_id: str) -> List[Dict[str, Any]]:
    select_cols = "id, name, category, amount, period, is_active"
    try:
        resp = (
            client.table("overhead_expenses")
            .select(select_cols)
            .eq("store_id", store_id)
            .eq("is_active", True)
            .execute()
        )
    except Exception as exc:  # pragma: no cover - supabase guard
        logger.warning(
            "overhead_expense_lookup_failed store=%s error=%s",
            _short_identifier(store_id),
            _safe_error_detail(exc),
        )
        return []

    err = getattr(resp, "error", None)
    if err:
        logger.warning(
            "overhead_expense_query_error store=%s detail=%s",
            _short_identifier(store_id),
            getattr(err, "message", err),
        )
        return []

    rows = getattr(resp, "data", None) or []
    sanitized: List[Dict[str, Any]] = []
    for row in rows:
        amount = _parse_float(row.get("amount"))
        period = _normalize_overhead_period(row.get("period"))
        sanitized.append({**row, "amount": amount, "period": period})
    return sanitized


def _summarize_overhead_expenses(expenses: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = 0.0
    category_breakdown: Dict[str, float] = {}
    for expense in expenses:
        amount = _parse_float(expense.get("amount"))
        period = _normalize_overhead_period(expense.get("period"))
        multiplier = _OVERHEAD_PERIOD_MULTIPLIERS.get(period, 1.0)
        monthly_amount = amount * multiplier
        total += monthly_amount

        category = (expense.get("category") or "uncategorized").strip() or "uncategorized"
        category_breakdown[category] = category_breakdown.get(category, 0.0) + monthly_amount

    return {
        "monthly_overhead": total,
        "expense_count": len(expenses),
        "category_breakdown": category_breakdown,
    }


def _normalize_planning_assumptions(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    defaults = dict(_PLANNING_ASSUMPTION_DEFAULTS)
    if not row:
        return defaults

    expected = int(_parse_float(row.get("expected_cups_per_month")))
    operating_days = int(_parse_float(row.get("operating_days_per_month")))
    target_profit = _parse_float(row.get("target_profit_monthly"))
    allocation = (row.get("overhead_allocation_method") or defaults["overhead_allocation_method"]).strip()

    if expected <= 0:
        expected = defaults["expected_cups_per_month"]
    if operating_days <= 0:
        operating_days = defaults["operating_days_per_month"]
    if not allocation:
        allocation = defaults["overhead_allocation_method"]

    return {
        "expected_cups_per_month": expected,
        "operating_days_per_month": operating_days,
        "target_profit_monthly": target_profit,
        "overhead_allocation_method": allocation,
    }


def _load_planning_assumptions(client: Client, store_id: str) -> Dict[str, Any]:
    select_cols = (
        "expected_cups_per_month, operating_days_per_month, "
        "target_profit_monthly, overhead_allocation_method"
    )
    try:
        resp = (
            client.table("planning_assumptions")
            .select(select_cols)
            .eq("store_id", store_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # pragma: no cover - supabase guard
        logger.warning(
            "planning_assumptions_lookup_failed store=%s error=%s",
            _short_identifier(store_id),
            _safe_error_detail(exc),
        )
        return dict(_PLANNING_ASSUMPTION_DEFAULTS)

    err = getattr(resp, "error", None)
    if err:
        logger.warning(
            "planning_assumptions_query_error store=%s detail=%s",
            _short_identifier(store_id),
            getattr(err, "message", err),
        )
        return dict(_PLANNING_ASSUMPTION_DEFAULTS)

    rows = getattr(resp, "data", None) or []
    row = rows[0] if rows else None
    return _normalize_planning_assumptions(row)


def _build_overhead_planning_summary(
    items: List[Dict[str, Any]],
    assumptions: Dict[str, Any],
    overhead_stats: Dict[str, Any],
) -> Dict[str, Any]:
    expected_cups = assumptions.get("expected_cups_per_month") or _PLANNING_ASSUMPTION_DEFAULTS["expected_cups_per_month"]
    operating_days = assumptions.get("operating_days_per_month") or _PLANNING_ASSUMPTION_DEFAULTS["operating_days_per_month"]

    if expected_cups <= 0:
        expected_cups = _PLANNING_ASSUMPTION_DEFAULTS["expected_cups_per_month"]
    if operating_days <= 0:
        operating_days = _PLANNING_ASSUMPTION_DEFAULTS["operating_days_per_month"]

    monthly_overhead = _parse_float(overhead_stats.get("monthly_overhead"))
    overhead_per_cup = monthly_overhead / expected_cups if expected_cups > 0 else 0.0

    gross_values: List[float] = []
    for entry in items:
        if entry.get("gross_profit") is None:
            continue
        gross_value = _parse_float(entry.get("gross_profit"))
        if gross_value > 0:
            gross_values.append(gross_value)

    average_gross_profit = sum(gross_values) / len(gross_values) if gross_values else 0.0

    if average_gross_profit > 0:
        break_even_cups_per_month: Optional[float] = monthly_overhead / average_gross_profit
        break_even_cups_per_day: Optional[float] = (
            break_even_cups_per_month / operating_days if operating_days > 0 else None
        )
    else:
        break_even_cups_per_month = None
        break_even_cups_per_day = None

    allocation_method = assumptions.get("overhead_allocation_method") or _PLANNING_ASSUMPTION_DEFAULTS[
        "overhead_allocation_method"
    ]

    return {
        "monthly_overhead": monthly_overhead,
        "expected_cups_per_month": expected_cups,
        "operating_days_per_month": operating_days,
        "overhead_per_cup": overhead_per_cup,
        "break_even_cups_per_month": break_even_cups_per_month,
        "break_even_cups_per_day": break_even_cups_per_day,
        "allocation_method": allocation_method,
        "target_profit_monthly": assumptions.get("target_profit_monthly") or 0.0,
    }


def _fetch_store_identity(client: Client, store_id: str) -> Dict[str, Optional[str]]:
    try:
        resp = client.table("stores").select("name, timezone").eq("id", store_id).limit(1).execute()
    except Exception:
        return {"name": None, "timezone": _normalize_timezone_name(None)}

    err = getattr(resp, "error", None)
    if err:
        return {"name": None, "timezone": _normalize_timezone_name(None)}

    rows = getattr(resp, "data", None) or []
    row = rows[0] if rows else {}
    name = row.get("name")
    tz_value = row.get("timezone")
    return {"name": name, "timezone": _normalize_timezone_name(tz_value)}


def _load_planning_products(client: Client, store_id: str) -> List[Dict[str, Any]]:
    select_cols = (
        "id, store_id, name, category_id, base_price, is_active, is_special, product_categories(name)"
    )
    products_resp = (
        client.table("products")
        .select(select_cols)
        .eq("store_id", store_id)
        .order("created_at", desc=False)
        .execute()
    )
    err = getattr(products_resp, "error", None)
    if err and _is_missing_column(err, "is_active"):
        select_cols = "id, store_id, name, category_id, base_price, product_categories(name)"
        products_resp = (
            client.table("products")
            .select(select_cols)
            .eq("store_id", store_id)
            .order("created_at", desc=False)
            .execute()
        )
        err = getattr(products_resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="product_query_failed")

    rows = getattr(products_resp, "data", None) or []
    mapped = [_map_product(row) for row in rows]
    return [product for product in mapped if product.get("is_active", True)]


def _summarize_ingredient_breakdown(
    breakdown: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], bool, bool, Dict[str, Any]]:
    summarized: List[Dict[str, Any]] = []
    missing_ingredient = False
    missing_cost = False
    issue_codes: Set[str] = set()
    purchase_derived_count = 0
    other_cost_count = 0

    for item in breakdown:
        ingredient_id = item.get("ingredient_id")
        ingredient_name = item.get("ingredient_name")
        quantity_used = _parse_float(item.get("quantity_used"))
        unit = item.get("unit") or item.get("ingredient_unit")
        cost_per_unit = _parse_float(item.get("cost_per_unit"))
        line_cost = _parse_float(item.get("line_cost"))
        cost_type = item.get("cost_type")
        cost_source = item.get("cost_source")
        ingredient_active = item.get("ingredient_is_active")
        row_issues = item.get("issues") or []

        if ingredient_id and not ingredient_name:
            missing_ingredient = True
        if ingredient_name and cost_per_unit <= 0:
            missing_cost = True
        if row_issues:
            issue_codes.update(str(code) for code in row_issues if code)

        if cost_source == "purchase_derived":
            purchase_derived_count += 1
        elif cost_source:
            other_cost_count += 1
        elif ingredient_name and cost_per_unit > 0:
            # Treat unknown sources as manual/other when cost exists
            other_cost_count += 1

        summarized.append(
            {
                "ingredient_id": ingredient_id,
                "name": ingredient_name,
                "cost_type": cost_type,
                "quantity_used": quantity_used,
                "unit": unit,
                "cost_per_unit": cost_per_unit,
                "line_cost": line_cost,
                "cost_source": cost_source,
                "is_active": ingredient_active,
                "issues": row_issues,
            }
        )

    meta = {
        "issue_codes": issue_codes,
        "purchase_derived_count": purchase_derived_count,
        "other_cost_count": other_cost_count,
        "ingredient_count": len(summarized),
    }

    return summarized, missing_ingredient, missing_cost, meta


def _safe_collect_product_addons_for_planning(client: Client, store_id: str, product_id: str) -> List[Dict[str, Any]]:
    try:
        return _collect_product_addons(client, store_id, product_id)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return []
        logger.warning(
            "planning_addon_fetch_failed store=%s product=%s detail=%s",
            _short_identifier(store_id),
            _short_identifier(product_id),
            getattr(exc, "detail", "unknown"),
        )
        return []
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning(
            "planning_addon_fetch_failed store=%s product=%s error=%s",
            _short_identifier(store_id),
            _short_identifier(product_id),
            _safe_error_detail(exc),
        )
        return []


def _summarize_addons(client: Client, store_id: str, product_id: str) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    addons: List[Dict[str, Any]] = []
    addon_rows = _safe_collect_product_addons_for_planning(client, store_id, product_id)
    gap_count = 0
    missing_recipe_count = 0
    missing_cost_count = 0
    for addon in addon_rows:
        if addon.get("is_active") is False:
            continue
        addon_id = str(addon.get("id")) if addon.get("id") else None
        if not addon_id:
            continue
        unit_cost = _parse_float(addon.get("unit_cost"))
        price_delta = _parse_float(addon.get("price"))
        has_recipe = bool(addon.get("has_recipe"))
        if not has_recipe:
            cost_status = "missing_addon_recipe"
            gap_count += 1
            missing_recipe_count += 1
        elif unit_cost <= 0:
            cost_status = "estimated"
            gap_count += 1
            missing_cost_count += 1
        else:
            cost_status = "complete"
        addons.append(
            {
                "addon_id": addon_id,
                "name": addon.get("name"),
                "price_delta": price_delta,
                "current_unit_cost": unit_cost,
                "cost_status": cost_status,
            }
        )

    meta = {
        "gap_count": gap_count,
        "missing_recipe_count": missing_recipe_count,
        "missing_cost_count": missing_cost_count,
    }
    return addons, meta


def _build_planning_product_entry(
    client: Client,
    store_id: str,
    product: Dict[str, Any],
    mix_percent: Optional[float],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    product_id = str(product.get("id"))
    base_price = _parse_float(product.get("base_price"))
    base_cost, breakdown, base_status = _calculate_recipe_cost(client, store_id, product_id)
    ingredient_breakdown, missing_ingredient, missing_cost, ingredient_meta = _summarize_ingredient_breakdown(breakdown)

    issue_codes = set(ingredient_meta.get("issue_codes", set()))
    if missing_ingredient:
        issue_codes.add("missing_ingredient")
    if missing_cost:
        issue_codes.add("missing_ingredient_cost")

    cost_status = base_status
    recipe_complete = cost_status == "complete"
    if not ingredient_breakdown:
        cost_status = "missing_recipe"
        recipe_complete = False
        issue_codes.add("missing_recipe")

    addons, addon_meta = _summarize_addons(client, store_id, product_id)
    has_addon_cost_gap = addon_meta.get("gap_count", 0) > 0

    if cost_status != "complete":
        issue_codes.add(cost_status)

    gross_profit = base_price - base_cost
    gross_margin_percent: Optional[float]
    if base_price > 0:
        gross_margin_percent = (gross_profit / base_price) * 100
    else:
        gross_margin_percent = None

    entry: Dict[str, Any] = {
        "product_id": product_id,
        "name": product.get("name"),
        "category": product.get("category_name"),
        "is_active": True,
        "base_price": base_price,
        "current_unit_cost": base_cost,
        "gross_profit": gross_profit,
        "gross_margin_percent": gross_margin_percent,
        "cost_status": cost_status,
        "recipe_complete": recipe_complete,
        "ingredient_breakdown": ingredient_breakdown,
        "addons": addons,
        "historical_mix_percent": mix_percent,
        "has_addon_cost_gap": has_addon_cost_gap,
        "addon_cost_status": "incomplete" if has_addon_cost_gap else "complete",
    }
    if issue_codes:
        entry["recipe_issue_codes"] = sorted(issue_codes)

    meta = {
        "issue_codes": issue_codes,
        "purchase_derived_count": ingredient_meta.get("purchase_derived_count", 0),
        "other_cost_count": ingredient_meta.get("other_cost_count", 0),
        "ingredient_count": ingredient_meta.get("ingredient_count", 0),
        "has_addon_cost_gap": has_addon_cost_gap,
        "missing_addon_recipe_count": addon_meta.get("missing_recipe_count", 0),
    }

    return entry, meta


def _collect_recent_mix(
    client: Client,
    store_id: str,
    lookback_days: int,
) -> Tuple[Dict[str, float], str]:
    since_dt = datetime.utcnow() - timedelta(days=lookback_days)
    since_iso = since_dt.isoformat()
    resp = (
        client.table("orders")
        .select("id, status, payment_status, created_at")
        .eq("store_id", store_id)
        .gte("created_at", since_iso)
        .order("created_at", desc=True)
        .limit(_PLANNING_MAX_MIX_ORDERS)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        return {}, "unavailable"

    rows = getattr(resp, "data", None) or []
    confirmed_orders: List[Dict[str, Any]] = []
    for row in rows:
        order_status_value = row.get("status") or row.get("order_status")
        payment_status_value = row.get("payment_status")
        if is_confirmed_sales_order(
            row,
            order_status=order_status_value,
            payment_status=payment_status_value,
        ):
            confirmed_orders.append(row)

    order_ids = [str(row.get("id")) for row in confirmed_orders if row.get("id")]
    if not order_ids:
        return {}, "unavailable"

    items_map = _load_order_items_map(client, order_ids)
    totals: Dict[str, int] = {}
    total_qty = 0
    for order_id in order_ids:
        for item in items_map.get(order_id, []):
            product_id = item.get("product_id")
            if not product_id:
                continue
            qty = int(item.get("quantity") or 0)
            if qty <= 0:
                continue
            pid = str(product_id)
            totals[pid] = totals.get(pid, 0) + qty
            total_qty += qty

    if total_qty == 0:
        return {}, "unavailable"

    mix_map = {pid: (qty / total_qty) * 100 for pid, qty in totals.items()}
    return mix_map, "order_items"


def _build_planning_payload(client: Client, store_id: str, lookback_days: int) -> Dict[str, Any]:
    store_identity = _fetch_store_identity(client, store_id)
    store_timezone = store_identity.get("timezone")
    tzinfo = _resolve_timezone(store_timezone)
    timezone_display = _format_timezone_offset(tzinfo)
    generated_at = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()

    mix_map, mix_source = _collect_recent_mix(client, store_id, lookback_days)
    products = _load_planning_products(client, store_id)
    items: List[Dict[str, Any]] = []
    product_metas: List[Dict[str, Any]] = []
    for product in products:
        mix_percent = mix_map.get(product.get("id")) if mix_map else None
        entry, meta = _build_planning_product_entry(client, store_id, product, mix_percent)
        items.append(entry)
        product_metas.append(meta)

    warnings: List[str] = []
    if mix_source != "order_items":
        warnings.append("historical_mix_unavailable")

    warning_summary = {
        "missing_recipe_products": 0,
        "missing_ingredient_products": 0,
        "missing_ingredient_cost_products": 0,
        "zero_quantity_recipe_products": 0,
        "missing_addon_recipe_count": 0,
        "addon_cost_gap_products": 0,
        "manual_cost_ingredients_count": 0,
        "purchase_derived_ingredients_count": 0,
    }

    has_blocking_gap = False
    for entry, meta in zip(items, product_metas):
        issue_codes = set(meta.get("issue_codes", set()))
        if "missing_recipe" in issue_codes:
            warning_summary["missing_recipe_products"] += 1
            has_blocking_gap = True
        if "missing_ingredient" in issue_codes:
            warning_summary["missing_ingredient_products"] += 1
            has_blocking_gap = True
        if "missing_ingredient_cost" in issue_codes:
            warning_summary["missing_ingredient_cost_products"] += 1
            has_blocking_gap = True
        if "zero_quantity" in issue_codes:
            warning_summary["zero_quantity_recipe_products"] += 1
            has_blocking_gap = True

        if entry.get("has_addon_cost_gap"):
            warning_summary["addon_cost_gap_products"] += 1
            has_blocking_gap = True
        warning_summary["missing_addon_recipe_count"] += meta.get("missing_addon_recipe_count", 0)

        warning_summary["purchase_derived_ingredients_count"] += meta.get("purchase_derived_count", 0)
        warning_summary["manual_cost_ingredients_count"] += meta.get("other_cost_count", 0)

        if entry.get("cost_status") != "complete":
            has_blocking_gap = True

    baseline_cost_source = _classify_baseline_cost_source(
        has_blocking_gap,
        warning_summary["purchase_derived_ingredients_count"],
        warning_summary["manual_cost_ingredients_count"],
    )

    overhead_expenses = _load_active_overhead_expenses(client, store_id)
    overhead_stats = _summarize_overhead_expenses(overhead_expenses)
    planning_assumptions = _load_planning_assumptions(client, store_id)
    overhead_payload = _build_overhead_planning_summary(items, planning_assumptions, overhead_stats)

    overhead_block = {
        **overhead_payload,
        "expense_count": overhead_stats.get("expense_count", 0),
    }
    category_breakdown = overhead_stats.get("category_breakdown") or {}
    if category_breakdown:
        overhead_block["category_breakdown"] = category_breakdown

    overhead_per_unit = overhead_block.get("overhead_per_cup")
    for entry in items:
        entry["direct_cost_per_unit"] = entry.get("current_unit_cost")
        entry["gross_profit_per_unit"] = entry.get("gross_profit")
        entry["overhead_per_unit"] = overhead_per_unit
        if overhead_per_unit is not None and entry.get("gross_profit") is not None:
            entry["net_profit_after_overhead_per_unit"] = entry["gross_profit"] - overhead_per_unit
        else:
            entry["net_profit_after_overhead_per_unit"] = None

    baseline = {
        "lookback_days": lookback_days,
        "mix_source": mix_source,
        "price_source": "products.base_price",
        "cost_source": baseline_cost_source,
        "overhead": overhead_block,
    }

    return {
        "store": {
            "id": store_id,
            "name": store_identity.get("name"),
            "timezone": store_timezone,
            "timezone_display": timezone_display,
            "generated_at": generated_at,
        },
        "baseline": baseline,
        "items": items,
        "warnings": warnings,
        "warning_summary": warning_summary,
    }


def _classify_baseline_cost_source(has_blocking_gap: bool, purchase_derived_count: int, manual_count: int) -> str:
    if has_blocking_gap:
        return "estimated"

    if purchase_derived_count <= 0 and manual_count <= 0:
        return "estimated"

    if purchase_derived_count > 0 and manual_count == 0:
        return "purchase_derived"

    if purchase_derived_count > 0 and manual_count > 0:
        return "mixed"

    return "manual"


_OVERHEAD_CATEGORIES = {
    "rent",
    "water",
    "electricity",
    "internet",
    "labor",
    "equipment",
    "transport",
    "marketing",
    "other",
}

_OVERHEAD_PERIODS = {"daily", "weekly", "monthly"}


def _sanitize_overhead_payload(payload: Dict[str, Any], partial: bool = False) -> Dict[str, Any]:
    data = {}
    if not partial or "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name_required")
        data["name"] = name

    if not partial or "category" in payload:
        category = (payload.get("category") or "").strip().lower()
        if category not in _OVERHEAD_CATEGORIES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="category_invalid")
        data["category"] = category

    if not partial or "period" in payload:
        period = (payload.get("period") or "").strip().lower()
        if period not in _OVERHEAD_PERIODS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="period_invalid")
        data["period"] = period

    if not partial or "amount" in payload:
        try:
            amount = float(payload.get("amount", 0))
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount_invalid")
        if amount < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount_non_negative")
        data["amount"] = amount

    if "is_active" in payload or not partial:
        is_active = payload.get("is_active")
        if is_active is None:
            is_active = True
        data["is_active"] = bool(is_active)

    if "note" in payload:
        data["note"] = (payload.get("note") or "").strip() or None
    elif not partial:
        data["note"] = None

    return data


def _sanitize_assumption_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    if "expected_cups_per_month" in payload:
        value = _parse_float(payload.get("expected_cups_per_month"))
        if value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expected_cups_positive")
        data["expected_cups_per_month"] = int(value)

    if "operating_days_per_month" in payload:
        value = _parse_float(payload.get("operating_days_per_month"))
        if value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="operating_days_positive")
        data["operating_days_per_month"] = int(value)

    if "target_profit_monthly" in payload:
        value = _parse_float(payload.get("target_profit_monthly"))
        if value < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_profit_non_negative")
        data["target_profit_monthly"] = value

    if "overhead_allocation_method" in payload:
        method = (payload.get("overhead_allocation_method") or "").strip().lower()
        if method != "per_cup":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="allocation_method_invalid")
        data["overhead_allocation_method"] = method

    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload_required")

    return data


def _fetch_overhead_row(client: Client, store_id: str, expense_id: str) -> Dict[str, Any]:
    resp = (
        client.table("overhead_expenses")
        .select("*")
        .eq("id", expense_id)
        .eq("store_id", store_id)
        .limit(1)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="overhead_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="overhead_not_found")
    return rows[0]


@router.get("/planning/overhead-expenses")
def list_overhead_expenses(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    resp = (
        ctx["client"]
        .table("overhead_expenses")
        .select("*")
        .eq("store_id", store_id_resolved)
        .order("created_at", desc=True)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="overhead_query_failed")
    rows = getattr(resp, "data", None) or []
    return {"items": rows}


@router.post("/planning/overhead-expenses", status_code=status.HTTP_201_CREATED)
def create_overhead_expense(
    payload: Dict[str, Any], authorization: Optional[str] = Header(None), store_id: Optional[str] = None
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_overhead_payload(payload, partial=False)
    data["store_id"] = store_id_resolved

    try:
        resp = ctx["client"].table("overhead_expenses").insert(data).execute()
    except Exception as exc:  # pragma: no cover - supabase guard
        raise HTTPException(status_code=500, detail=f"overhead_create_failed:{_safe_error_detail(exc)}") from exc

    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="overhead_create_failed")

    rows = getattr(resp, "data", None) or []
    return rows[0] if rows else data


@router.patch("/planning/overhead-expenses/{expense_id}")
def update_overhead_expense(
    expense_id: str,
    payload: Dict[str, Any],
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _fetch_overhead_row(ctx["client"], store_id_resolved, expense_id)
    data = _sanitize_overhead_payload(payload, partial=True)
    data["updated_at"] = datetime.utcnow().isoformat()

    resp = (
        ctx["client"]
        .table("overhead_expenses")
        .update(data)
        .eq("id", expense_id)
        .eq("store_id", store_id_resolved)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="overhead_update_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=500, detail="overhead_update_missing")
    return rows[0]


@router.delete("/planning/overhead-expenses/{expense_id}")
def deactivate_overhead_expense(
    expense_id: str,
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
    hard: bool = False,
) -> Dict[str, Any]:
    """Remove an overhead expense.

    Default (``hard=false``) is a *soft* delete: the row is kept and only
    ``is_active`` flips to ``False`` so it stops being averaged into the
    overhead-per-cup figure while history is preserved.

    ``hard=true`` performs a *true* delete. This is safe because no other table
    references ``overhead_expenses`` (no foreign keys / ``overhead_expense_id``
    columns) and the planning baseline recomputes overhead live from the active
    rows on every request -- it is never snapshotted onto orders or reports --
    so permanently removing a row cannot orphan or corrupt downstream data.
    Used when a recurring cost genuinely disappears from the business model
    (e.g. a cafe moves from a rented shop to selling from home).
    """
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    _fetch_overhead_row(ctx["client"], store_id_resolved, expense_id)

    if hard:
        resp = (
            ctx["client"]
            .table("overhead_expenses")
            .delete()
            .eq("id", expense_id)
            .eq("store_id", store_id_resolved)
            .execute()
        )
        err = getattr(resp, "error", None)
        if err:
            raise HTTPException(status_code=500, detail="overhead_delete_failed")
        return {"status": "deleted", "id": expense_id}

    data = {"is_active": False, "updated_at": datetime.utcnow().isoformat()}
    resp = (
        ctx["client"]
        .table("overhead_expenses")
        .update(data)
        .eq("id", expense_id)
        .eq("store_id", store_id_resolved)
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="overhead_deactivate_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=500, detail="overhead_deactivate_missing")
    return rows[0]


@router.get("/planning/assumptions")
def get_planning_assumptions_endpoint(
    authorization: Optional[str] = Header(None), store_id: Optional[str] = None
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    assumptions = _load_planning_assumptions(ctx["client"], store_id_resolved)
    return assumptions


@router.patch("/planning/assumptions")
def patch_planning_assumptions(
    payload: Dict[str, Any], authorization: Optional[str] = Header(None), store_id: Optional[str] = None
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    data = _sanitize_assumption_payload(payload)
    existing = _load_planning_assumptions(ctx["client"], store_id_resolved)

    upsert_payload = {**existing, **data, "store_id": store_id_resolved}

    resp = (
        ctx["client"]
        .table("planning_assumptions")
        .upsert(upsert_payload, on_conflict="store_id")
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise HTTPException(status_code=500, detail="assumptions_upsert_failed")

    rows = getattr(resp, "data", None) or []
    return rows[0] if rows else upsert_payload


@router.get("/planning/baseline")
def get_planning_baseline(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    try:
        payload = _build_planning_payload(
            ctx["client"],
            store_id_resolved,
            _PLANNING_MIX_LOOKBACK_DAYS,
        )
        return payload
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.exception(
            "planning_baseline_build_failed store=%s error=%s",
            _short_identifier(store_id_resolved),
            _safe_error_detail(exc),
        )
        raise HTTPException(status_code=500, detail=f"planning_baseline_failed:{_safe_error_detail(exc)}")


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
    customer_names: Optional[Dict[str, Dict[str, Optional[str]]]] = None,
    channel_names: Optional[Dict[str, str]] = None,
    latest_payment: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    customer_name = None
    channel_name = None
    if customer_names and row.get("customer_id"):
        customer_info = customer_names.get(str(row.get("customer_id")))
        if isinstance(customer_info, dict):
            candidate = sanitize_line_display_name(customer_info.get("display_name"))
            if candidate:
                customer_name = candidate
        elif isinstance(customer_info, str):
            candidate = sanitize_line_display_name(customer_info)
            if candidate:
                customer_name = candidate
    if channel_names and row.get("channel_id"):
        channel_name = channel_names.get(str(row.get("channel_id")))
    inline_customer_name = row.get("customer_name")
    inline_sanitized = sanitize_line_display_name(inline_customer_name)
    if inline_sanitized and not customer_name:
        customer_name = inline_sanitized
    order_no = row.get("order_no") or row.get("order_number")
    order_status = row.get("order_status") or row.get("status")
    normalized_status = normalize_order_status(order_status)
    archived = normalized_status in CANCELLED_ORDER_STATUSES or bool(row.get("cancelled_at"))
    linked_phone = None
    if customer_names and row.get("customer_id"):
        customer_info = customer_names.get(str(row.get("customer_id")))
        if isinstance(customer_info, dict):
            linked_phone = str(customer_info.get("phone") or "").strip() or None
    order_phone_value = str(row.get("customer_phone") or "").strip() or None
    if not customer_name:
        if linked_phone:
            customer_name = linked_phone
    if not customer_name and order_phone_value:
        customer_name = order_phone_value
    if not customer_name:
        customer_name = CUSTOMER_NAME_FALLBACK
    customer_phone = order_phone_value or linked_phone
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


def _build_dashboard_revenue_kpi(
    orders: List[Dict[str, Any]],
    tzinfo,
    *,
    range_ctx: Dict[str, Any],
    timezone_name: Optional[str] = None,
) -> Dict[str, Any]:
    tz = tzinfo or _DEFAULT_TZINFO
    start_dt = range_ctx.get("start")
    end_dt = range_ctx.get("end")
    all_time = bool(range_ctx.get("all_time"))

    total_sales_amount = 0.0
    total_sales_order_count = 0
    paid_sales_amount = 0.0
    paid_sales_order_count = 0
    pending_sales_amount = 0.0
    pending_sales_order_count = 0
    excluded_cancelled_order_count = 0

    for order in orders:
        status_value = normalize_order_status(order.get("status") or order.get("order_status"))
        payment_value = normalize_payment_status(order.get("payment_status"))
        created_at = _parse_iso_datetime(order.get("created_at"))
        created_local = created_at.astimezone(tz) if created_at else None
        if not all_time:
            if not created_local or not start_dt or not end_dt:
                continue
            if not (start_dt <= created_local < end_dt):
                continue

        if status_value in CANCELLED_ORDER_STATUSES:
            excluded_cancelled_order_count += 1
            continue

        amount = _parse_float(order.get("total_amount"))
        total_sales_amount += amount
        total_sales_order_count += 1

        if is_confirmed_sales_order(order, order_status=status_value, payment_status=payment_value):
            paid_sales_amount += amount
            paid_sales_order_count += 1
            continue

        is_pending_review = is_pending_review_order(order, order_status=status_value, payment_status=payment_value)
        is_pending_payment = is_pending_payment_order(order, order_status=status_value, payment_status=payment_value)
        if is_pending_review or is_pending_payment:
            pending_sales_amount += amount
            pending_sales_order_count += 1

    generated_at = datetime.now(tz).isoformat()
    tz_label = timezone_name or DEFAULT_BUSINESS_TIMEZONE

    return {
        "range": range_ctx.get("key", "all"),
        "range_label": range_ctx.get("label") or _REVENUE_RANGE_LABELS.get("all"),
        "start_date": range_ctx.get("start_date"),
        "end_date": range_ctx.get("end_date"),
        "all_time": all_time,
        "timezone": tz_label,
        "generated_at": generated_at,
        "total_sales_amount": total_sales_amount,
        "total_sales_order_count": total_sales_order_count,
        "paid_sales_amount": paid_sales_amount,
        "paid_sales_order_count": paid_sales_order_count,
        "pending_sales_amount": pending_sales_amount,
        "pending_sales_order_count": pending_sales_order_count,
        "excluded_cancelled_order_count": excluded_cancelled_order_count,
    }


@router.get("/dashboard-summary")
def get_dashboard_summary(
    authorization: Optional[str] = Header(None),
    store_id: Optional[str] = None,
    revenue_range: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    store_timezone = _get_store_timezone(ctx["client"], store_id_resolved)
    orders = _load_orders_for_dashboard(ctx["client"], store_id_resolved)
    today_start, today_end = _today_range(store_timezone)
    summary = _build_dashboard_summary(orders, today_start, today_end)
    tzinfo = today_start.tzinfo or _DEFAULT_TZINFO
    timezone_offset = _format_timezone_offset(tzinfo)
    timezone_display = f"{store_timezone} ({timezone_offset})"
    revenue_range_ctx = _resolve_revenue_range(revenue_range, tzinfo, start_date, end_date)
    revenue_kpi = _build_dashboard_revenue_kpi(
        orders,
        tzinfo,
        range_ctx=revenue_range_ctx,
        timezone_name=timezone_display,
    )

    response = {
        "store_id": store_id_resolved,
        "store_timezone": store_timezone,
        "store_timezone_offset": timezone_offset,
        "store_timezone_display": timezone_display,
        "dashboard_revenue_kpi": revenue_kpi,
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


_NOTIFY_ORDER_STATUSES = {
    "ready",
    "cancelled",
}


def _notify_order_status_change(
    client: Client,
    order_id: str,
    status_value: Optional[str],
    extra_payload: Optional[Dict[str, Any]] = None,
) -> None:
    normalized = normalize_order_status(status_value)
    if normalized not in _NOTIFY_ORDER_STATUSES:
        return
    payload = dict(extra_payload or {})
    if normalized == "cancelled":
        reason_text = str(payload.get("cancelled_reason") or "").strip()
        if not reason_text:
            reason_text = ORDER_CANCEL_REASON_FALLBACK
        payload["cancelled_reason"] = reason_text
    payload["status"] = normalized
    try:
        send_line_notification(client, order_id, None, None, normalized, payload)
    except Exception as exc:  # pragma: no cover - best effort logging
        logger.warning(
            "order_status_notification_failed order=%s status=%s detail=%s",
            order_id,
            normalized,
            _safe_error_detail(exc),
        )


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


@router.post("/kiosk/orders", status_code=status.HTTP_201_CREATED)
def create_kiosk_order(payload: KioskOrderCreate, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_staff_or_above(role)
    normalized_role = _normalize_store_role(role)
    is_staff = normalized_role == "staff"

    client = ctx["client"]
    sanitized_items = _sanitize_kiosk_order_items(payload.items or [])
    channel_id_value = _ensure_kiosk_channel(client, store_id_resolved)

    item_snapshots: List[Dict[str, Any]] = []
    for item in sanitized_items:
        _ensure_product_in_store(client, item["product_id"], store_id_resolved)
        snapshot = prepare_order_item_snapshot(
            client,
            store_id_resolved,
            product_id=item["product_id"],
            quantity=item["quantity"],
            channel_id=channel_id_value,
            raw_options=item.get("options"),
        )
        item_snapshots.append(snapshot)

    # ── FIX-A: Validate sale configuration BEFORE any persistence ────────
    # Reject missing recipes, invalid quantities, unresolved ingredients
    # before creating order/payment/stock.  No partial transaction.
    _validate_sale_configuration(item_snapshots)

    subtotal = sum(float(snapshot.get("total_price") or 0) for snapshot in item_snapshots)
    total_cost = sum(float(snapshot.get("total_cost") or 0) for snapshot in item_snapshots)
    channel_fee_value = resolve_channel_fee(client, store_id_resolved, channel_id_value, subtotal)
    discount_amount = 0.0
    total_amount = subtotal + channel_fee_value - discount_amount
    gross_profit = total_amount - total_cost - channel_fee_value

    customer_id, customer_name, customer_phone = _ensure_customer_record_for_kiosk(client, store_id_resolved, payload.customer)
    note_value = _strip_text(payload.note)
    order_no = generate_order_number(client)

    # ── FIX-B: Use client_order_id as the order primary key ──────────────
    # If the client provides a UUID, use it as orders.id.  The PRIMARY KEY
    # constraint is the durable idempotency primitive — two concurrent
    # requests with the same client_order_id cannot both insert.
    client_order_id = None
    if payload.client_order_id:
        client_order_id = str(payload.client_order_id).strip()
        # Validate UUID format (basic check)
        try:
            import uuid as _uuid
            _uuid.UUID(client_order_id)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="kiosk_order_invalid_client_order_id",
            )

    order_payload: Dict[str, Any] = {
        "store_id": store_id_resolved,
        "channel_id": channel_id_value,
        "order_type": "manual",
        "pickup_type": "walk_in",
        "status": "accepted",
        "payment_status": "paid",
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "total_amount": total_amount,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "note": note_value,
        "order_no": order_no,
    }
    if client_order_id:
        order_payload["id"] = client_order_id
    if customer_id:
        order_payload["customer_id"] = customer_id
    if customer_name and _orders_has_column(client, "customer_name"):
        order_payload["customer_name"] = customer_name
    if customer_phone and _orders_has_column(client, "customer_phone"):
        order_payload["customer_phone"] = customer_phone
    fee_column = None
    if _orders_has_column(client, "channel_fee"):
        fee_column = "channel_fee"
    elif _orders_has_column(client, "channel_fee_total"):
        fee_column = "channel_fee_total"
    if fee_column:
        order_payload[fee_column] = channel_fee_value
    if _orders_has_column(client, "order_source"):
        order_payload["order_source"] = "kiosk"
    if _orders_has_column(client, "channel"):
        order_payload["channel"] = "kiosk"
    if _orders_has_column(client, "order_status"):
        order_payload["order_status"] = "accepted"
    if _orders_has_column(client, "payment_method"):
        order_payload["payment_method"] = payload.payment_method

    attempt_data = {key: value for key, value in order_payload.items() if value is not None}
    order_resp = None
    max_attempts = len(attempt_data) + 1
    for _ in range(max_attempts):
        try:
            order_resp = client.table("orders").insert(attempt_data).execute()
            insert_err = getattr(order_resp, "error", None)
        except Exception as exc:
            insert_err = exc
        if not insert_err:
            break
        missing_column = _extract_missing_column(insert_err)
        if missing_column and missing_column in attempt_data:
            logger.warning("kiosk_order_missing_column column=%s", missing_column)
            attempt_data.pop(missing_column, None)
            continue
        if _is_unique_violation(insert_err, "order_no"):
            attempt_data["order_no"] = generate_order_number(client)
            continue
        # ── FIX-B: Handle orders_pkey duplicate (idempotent replay) ──────
        if client_order_id and _is_orders_pkey_violation(insert_err):
            logger.info(
                "kiosk_order_idempotent_replay store=%s client_order_id=%s",
                store_id_resolved,
                client_order_id,
            )
            return _handle_idempotent_replay(
                client,
                store_id_resolved,
                client_order_id,
                sanitized_items,
                is_staff,
            )
        raise HTTPException(status_code=500, detail="kiosk_order_create_failed")
    else:
        raise HTTPException(status_code=500, detail="kiosk_order_create_failed:max_attempts")

    order_rows = getattr(order_resp, "data", None) or []
    if not order_rows:
        raise HTTPException(status_code=500, detail="kiosk_order_create_missing")
    order_id = str(order_rows[0].get("id"))

    store_scope_supported = order_items_supports_store_scope(client)
    order_item_records: List[Dict[str, Any]] = []
    for snapshot in item_snapshots:
        record = build_order_item_record(
            snapshot,
            order_id=order_id,
            store_id=store_id_resolved if store_scope_supported else None,
            product_name=snapshot.get("product_name"),
        )
        order_item_records.append(prune_order_item_columns(client, record))

    items_resp = client.table("order_items").insert(order_item_records).execute()
    if getattr(items_resp, "error", None):
        raise HTTPException(status_code=500, detail="kiosk_order_items_failed")

    inserted_item_rows = getattr(items_resp, "data", None) or []

    _create_paid_payment(
        client,
        store_id_resolved,
        order_id,
        total_amount,
        payload.payment_method,
        ctx.get("user_id"),
    )

    recalculate_order_totals(client, store_id_resolved, order_id)
    _write_order_status_log(client, order_id, None, "accepted", ctx.get("user_id"), note_value)

    # ── Stock consumption (Healholic V1) ─────────────────────────────────
    # Order, order items, and paid payment now exist. Build the usage plan
    # from the immutable cost snapshots paired with the real order_item_ids,
    # then call the frozen SECURITY DEFINER RPC via the service-role client.
    # The RPC validates paid status and the partial unique index
    # uq_stock_used_order_item_ingredient is the final idempotency safety net.
    actor_id = ctx.get("user_id")
    stock_consumed = False
    stock_failure_detail: Optional[str] = None
    if inserted_item_rows and actor_id:
        # Pair each inserted order item row with its original snapshot by
        # position (insert order is preserved by PostgREST).
        usage_entries: List[Dict[str, Any]] = []
        for index, snapshot in enumerate(item_snapshots):
            item_row = inserted_item_rows[index] if index < len(inserted_item_rows) else {}
            usage_entries.append(
                {
                    "id": item_row.get("id"),
                    "quantity": snapshot.get("quantity"),
                    "snapshot": snapshot,
                }
            )
        try:
            usage_plan = build_usage_plan(usage_entries)
            if usage_plan:
                # FIX-C: consume_for_paid_order now retries transient
                # failures internally and raises StockSyncFailedError with
                # order context if all attempts fail.
                consume_for_paid_order(
                    client,
                    store_id=store_id_resolved,
                    order_id=order_id,
                    actor_id=actor_id,
                    usage_plan=usage_plan,
                    order_no=order_no,
                )
                stock_consumed = True
            else:
                # No usage produced (e.g. empty cart). Treat as no-op.
                stock_consumed = True
        except StockSyncFailedError as exc:
            # FIX-D: Structured partial-commit response with order context.
            # The order+payment are persisted but stock sync failed after
            # all retries.  Return a 503 with order_id so the client can
            # display a "do not resubmit" warning.
            logger.error(
                "kiosk_order_stock_sync_failed store=%s order=%s reason=%s",
                store_id_resolved,
                order_id,
                exc.reason,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "kiosk_order_stock_sync_failed",
                    "order_id": order_id,
                    "order_no": order_no,
                    "payment_status": "paid",
                    "stock_consumed": False,
                    "retryable": True,
                    "action": "do_not_resubmit",
                },
            )
        except StockUsageError as exc:
            # Non-transient stock error (e.g. missing_context).  The
            # order/payment are already persisted; surface a structured
            # error with order context.
            logger.error(
                "kiosk_order_stock_failed store=%s order=%s reason=%s detail=%s",
                store_id_resolved,
                order_id,
                exc.reason,
                exc.detail,
            )
            stock_failure_detail = exc.detail

    if stock_failure_detail:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "kiosk_order_stock_sync_failed",
                "order_id": order_id,
                "order_no": order_no,
                "payment_status": "paid",
                "stock_consumed": False,
                "retryable": True,
                "action": "do_not_resubmit",
            },
        )

    mapped_order = _map_created_order_with_items(client, store_id_resolved, order_id, is_staff)
    if stock_consumed and not stock_failure_detail:
        mapped_order["stock_consumed"] = True
    return mapped_order


def _handle_idempotent_replay(
    client: Client,
    store_id: str,
    order_id: str,
    incoming_items: List[Dict[str, Any]],
    is_staff: bool,
) -> Dict[str, Any]:
    """Handle a duplicate client_order_id by classifying and returning the
    existing order state.

    FIX-B idempotent replay states:
    - complete: return existing order with idempotent_replay=true (200)
    - partial_paid: return structured response (409) with order context
    - in_progress: return 409 kiosk_order_in_progress
    - payload mismatch: return 409 idempotency_key_conflict
    """
    classification = _classify_existing_order(client, store_id, order_id)
    state = classification.get("state")

    if state == "not_found":
        # Order exists in a different store — conflict
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "idempotency_key_conflict", "order_id": order_id},
        )

    # Compare incoming payload with existing order items
    payloads_match = _compare_payload_with_existing_order(client, store_id, order_id, incoming_items)
    if not payloads_match:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "idempotency_key_conflict", "order_id": order_id},
        )

    if state == "complete":
        # Return the existing completed order
        mapped = _map_created_order_with_items(client, store_id, order_id, is_staff)
        mapped["idempotent_replay"] = True
        mapped["stock_consumed"] = True
        return mapped
    elif state == "partial_paid":
        # Paid order without stock — recovery state
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "kiosk_order_stock_sync_failed",
                "order_id": order_id,
                "order_no": classification.get("order_no"),
                "payment_status": "paid",
                "stock_consumed": False,
                "retryable": True,
                "action": "do_not_resubmit",
            },
        )
    else:
        # in_progress — another request is still processing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "kiosk_order_in_progress",
                "order_id": order_id,
            },
        )


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
    cancelled_reason_for_notify: Optional[str] = None
    response: Dict[str, Any] = {"id": order_id, "status": "updated"}
    if new_status and str(new_status) != str(current.get("status")):
        notify_payload: Dict[str, Any] = {"note": data.get("note")}
        if str(new_status) == "cancelled":
            cancelled_reason_for_notify = data.get("cancelled_reason") or ORDER_CANCEL_REASON_FALLBACK
            notify_payload["cancelled_reason"] = cancelled_reason_for_notify
        _write_order_status_log(
            ctx["client"],
            order_id,
            str(current.get("status") or ""),
            str(new_status),
            ctx.get("user_id"),
            data.get("note"),
        )
        _notify_order_status_change(
            ctx["client"],
            order_id,
            str(new_status),
            notify_payload,
        )

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
            latest_payment_map = _load_latest_payments(ctx["client"], [str(current.get("id") or order_id)])
            latest_payment = latest_payment_map.get(str(current.get("id") or order_id))
            allowed, denial_reason = _staff_can_cancel_operational_order(
                current_status_normalized,
                current_payment_status,
                current.get("cancelled_at"),
                latest_payment=latest_payment,
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
    cancelled_reason_for_notify: Optional[str] = None
    if next_status_value == "cancelled":
        cancelled_reason = (payload.cancelled_reason or "").strip()
        cancelled_reason = cancelled_reason or status_note or "cancelled_via_status_update"
        cancelled_at_value = (payload.cancelled_at or "").strip() or datetime.utcnow().isoformat()
        update_data["cancelled_reason"] = cancelled_reason
        update_data["cancelled_at"] = cancelled_at_value
        cancelled_reason_for_notify = cancelled_reason

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

    notify_payload = {"note": status_note}
    if next_status_value == "cancelled":
        notify_payload["cancelled_reason"] = cancelled_reason_for_notify or ORDER_CANCEL_REASON_FALLBACK
    _notify_order_status_change(
        ctx["client"],
        order_id,
        next_status_value,
        notify_payload,
    )

    return {"id": order_id, "status": next_status_value}


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: str, payload: OrderCancelPayload, authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    current = _get_order_row(ctx["client"], order_id, store_id_resolved)
    if not _valid_order_transition(str(current.get("status") or ""), "cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_status_transition")

    reason_text = (payload.reason or "").strip() or ORDER_CANCEL_REASON_FALLBACK
    update_data = {
        "status": "cancelled",
        "cancelled_reason": reason_text,
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
    _notify_order_status_change(
        ctx["client"],
        order_id,
        "cancelled",
        {"cancelled_reason": reason_text},
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
    linked_display = None
    linked_phone = None
    if isinstance(customer_rel, dict):
        linked_display = sanitize_line_display_name(customer_rel.get("display_name"))
        linked_phone = str(customer_rel.get("phone") or "").strip() or None
    snapshot_name = None
    snapshot_phone = None
    if isinstance(order_rel, dict):
        snapshot_name = sanitize_line_display_name(order_rel.get("customer_name"))
        snapshot_phone = str(order_rel.get("customer_phone") or "").strip() or None
    customer_name = linked_display or snapshot_name or linked_phone or snapshot_phone or CUSTOMER_NAME_FALLBACK
    customer_phone = snapshot_phone or linked_phone
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
        if normalize_order_status(next_order_status) == "waiting_payment_review":
            _notify_order_status_change(client, order_id, next_order_status, {"note": note})


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

    send_line_notification(
        ctx["client"],
        order_id,
        None,
        None,
        "payment_approved",
        {"payment_id": payment_id, "note": note},
    )
    return {"id": payment_id, "status": "paid"}


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

    send_line_notification(
        ctx["client"],
        order_id,
        None,
        None,
        "payment_rejected",
        {"reject_reason": (payload.reason or "").strip() or PAYMENT_REJECT_REASON_FALLBACK},
    )

    return {
        "id": payment_id,
        "status": "rejected",
        "message": "ไม่ผ่านการตรวจสอบการชำระเงิน กรุณาตรวจสอบข้อมูลและส่งหลักฐานใหม่",
    }


# ─── Inventory Alerts (read-only) ─────────────────────────────────────────────

_NEAR_EXPIRY_DAYS = 3


def _classify_low_stock(ingredient_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    alerts: List[Dict[str, Any]] = []
    for row in ingredient_rows:
        is_active = row.get("is_active")
        if is_active is False:
            continue
        threshold = _safe_float(row.get("low_stock_threshold"))
        if threshold <= 0:
            continue
        current_stock = _safe_float(row.get("stock_on_hand") or row.get("current_stock"))
        if current_stock <= threshold:
            alerts.append({
                "ingredient_id": str(row.get("id")) if row.get("id") else None,
                "ingredient_name": row.get("name"),
                "current_stock": current_stock,
                "low_stock_threshold": threshold,
                "unit": row.get("unit"),
                "severity": "low_stock",
            })
    return alerts


def _classify_expiry(purchase_rows: List[Dict[str, Any]], now: datetime) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    near_expiry: List[Dict[str, Any]] = []
    expired: List[Dict[str, Any]] = []
    for row in purchase_rows:
        if not row.get("is_perishable"):
            continue
        expires_at_raw = row.get("expires_at")
        if not expires_at_raw:
            continue
        expires_dt = _parse_iso_datetime(expires_at_raw)
        if not expires_dt:
            continue
        ingredient_rel = row.get("ingredients") if isinstance(row, dict) else None
        ingredient_name = None
        if isinstance(ingredient_rel, dict):
            ingredient_name = ingredient_rel.get("name")
        ingredient_id = str(row.get("ingredient_id")) if row.get("ingredient_id") else None
        common = {
            "purchase_id": str(row.get("id")) if row.get("id") else None,
            "ingredient_id": ingredient_id,
            "ingredient_name": ingredient_name,
            "lot_code": row.get("lot_code"),
            "expires_at": expires_at_raw,
            "severity": "",
        }
        if expires_dt < now:
            days_overdue = (now - expires_dt).days
            entry = dict(common)
            entry["days_overdue"] = days_overdue
            entry["severity"] = "expired"
            expired.append(entry)
        elif expires_dt <= now + timedelta(days=_NEAR_EXPIRY_DAYS):
            days_until = (expires_dt - now).days
            entry = dict(common)
            entry["days_until_expiry"] = days_until
            entry["severity"] = "near_expiry"
            near_expiry.append(entry)
    return near_expiry, expired


def _fetch_inventory_alert_ingredients(client: Client, store_id: str) -> List[Dict[str, Any]]:
    stock_field = "stock_on_hand"
    include_is_active = True
    attempts = 0
    while attempts < 4:
        attempts += 1
        columns = ["id", "name", "unit", stock_field, "low_stock_threshold"]
        if include_is_active:
            columns.append("is_active")
        try:
            resp = (
                client.table("ingredients")
                .select(", ".join(columns))
                .eq("store_id", store_id)
                .execute()
            )
        except Exception as exc:
            resp = None
            exc_err = exc
        else:
            exc_err = getattr(resp, "error", None)
        if not exc_err:
            return getattr(resp, "data", None) or []
        if stock_field == "stock_on_hand" and _is_missing_column(exc_err, "stock_on_hand"):
            stock_field = "current_stock"
            continue
        if include_is_active and _is_missing_column(exc_err, "is_active"):
            include_is_active = False
            continue
        break
    return []


def _fetch_inventory_alert_purchases(client: Client, store_id: str) -> List[Dict[str, Any]]:
    select_cols = "id, ingredient_id, is_perishable, lot_code, expires_at, ingredients(id, name)"
    try:
        resp = (
            client.table("ingredient_purchases")
            .select(select_cols)
            .eq("store_id", store_id)
            .execute()
        )
    except Exception:
        return []
    err = getattr(resp, "error", None)
    if err:
        if _is_missing_column(err, "is_perishable"):
            try:
                resp = (
                    client.table("ingredient_purchases")
                    .select("id, ingredient_id, lot_code, expires_at, ingredients(id, name)")
                    .eq("store_id", store_id)
                    .execute()
                )
            except Exception:
                return []
            err = getattr(resp, "error", None)
            if err:
                return []
        else:
            return []
    return getattr(resp, "data", None) or []


@router.get("/inventory-alerts")
def get_inventory_alerts(authorization: Optional[str] = Header(None), store_id: Optional[str] = None) -> Dict[str, Any]:
    ctx = _get_ctx(authorization)
    store_id_resolved, role = _resolve_store_id(ctx["memberships"], store_id)
    _require_manager(role)

    ingredient_rows = _fetch_inventory_alert_ingredients(ctx["client"], store_id_resolved)
    purchase_rows = _fetch_inventory_alert_purchases(ctx["client"], store_id_resolved)
    now = datetime.now(timezone.utc)

    low_stock = _classify_low_stock(ingredient_rows)
    near_expiry, expired = _classify_expiry(purchase_rows, now)

    return {
        "low_stock": low_stock,
        "near_expiry": near_expiry,
        "expired": expired,
        "summary": {
            "low_stock_count": len(low_stock),
            "near_expiry_count": len(near_expiry),
            "expired_count": len(expired),
        },
    }
