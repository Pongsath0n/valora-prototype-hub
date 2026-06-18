import logging
import mimetypes
import os
import re
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from supabase import Client

from app.core.config import settings
from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client
from app.services.cost_engine import build_order_item_record, mask_option_costs, prepare_order_item_snapshot
from app.services.order_item_columns import order_items_supports_store_scope, prune_order_item_columns
from app.services.line_service import mark_line_link_token_used, resolve_line_link_token
from app.services.order_totals import recalculate_order_totals
from app.services.storage import StorageUploadError, upload_payment_slip as storage_upload_payment_slip
from app.services.order_numbers import generate_order_number

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customer", tags=["customer"])


class CustomerPayload(BaseModel):
    name: str
    phone: str
    line_user_id: Optional[str] = None


class CustomerOrderItemPayload(BaseModel):
    product_id: str
    quantity: int
    options: Optional[Dict[str, Any]] = None


class CustomerOrderCreatePayload(BaseModel):
    customer: CustomerPayload
    items: List[CustomerOrderItemPayload]
    pickup_time: str
    note: Optional[str] = None
    store_id: Optional[str] = None
    line_link_token: Optional[str] = None


class CustomerOrderLookupPayload(BaseModel):
    order_no: str
    phone: str


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


def _generate_public_token() -> str:
    return secrets.token_urlsafe(32)


def _is_unique_violation(error: Any, column: str) -> bool:
    message = str(getattr(error, "message", error) or "")
    lowered = message.lower()
    return "duplicate key value" in lowered and column.lower() in lowered


def _normalize_phone(value: str) -> str:
    trimmed = str(value or "").strip()
    digits = re.sub(r"\D+", "", trimmed)
    return digits or trimmed


def _try_select_products(client: Client, store_id: Optional[str], product_id: Optional[str] = None) -> List[Dict[str, Any]]:
    include_categories = True
    active_filter_enabled = True
    while True:
        select_expr = "*"
        if include_categories:
            select_expr = "*, product_categories(name)"
        query = client.table("products").select(select_expr)
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
        if missing == "product_categories" and include_categories:
            include_categories = False
            continue

        message = str(getattr(err, "message", err))
        logger.error("customer_product_query_failed: %s", message)
        raise HTTPException(status_code=500, detail="customer_product_query_failed")


SWEETNESS_LEVELS: Tuple[int, ...] = (0, 25, 50, 75, 100)
DEFAULT_SWEETNESS = 100


def _coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _product_allows_sweetness_flag(row: Dict[str, Any]) -> bool:
    for key in ("allows_sweetness", "allow_sweetness", "sweetness_enabled"):
        if key in row and row[key] is not None:
            return bool(row[key])
    return True


def _product_default_sweetness_value(row: Dict[str, Any]) -> int:
    for key in ("sweetness_default", "default_sweetness"):
        if key in row and row[key] is not None:
            coerced = _coerce_int(row[key])
            if coerced in SWEETNESS_LEVELS:
                return coerced
    return DEFAULT_SWEETNESS


def _load_product_addons_map(client: Client, store_id: str, product_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    unique_ids = sorted({str(pid) for pid in product_ids if pid})
    if not unique_ids:
        return {}

    select_cols = [
        "id",
        "product_id",
        "store_id",
        "name",
        "code",
        "addon_type",
        "price",
        "max_quantity",
        "is_active",
    ]

    try:
        query = client.table("product_addons").select(", ".join(select_cols)).in_("product_id", unique_ids)
        if store_id:
            query = query.eq("store_id", store_id)
        query = query.eq("is_active", True)
        resp = query.execute()
        err = getattr(resp, "error", None)
    except Exception as exc:
        logger.warning(
            "customer_product_addon_query_failed store=%s detail=%s",
            _short_identifier(store_id),
            _safe_error_detail(exc),
        )
        return {}

    if err:
        logger.warning(
            "customer_product_addon_query_failed store=%s detail=%s",
            _short_identifier(store_id),
            _safe_error_detail(err),
        )
        return {}

    rows = getattr(resp, "data", None) or []
    addons_map: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        product_id = str(row.get("product_id") or "").strip()
        if not product_id or product_id not in unique_ids:
            continue
        row_store = str(row.get("store_id") or "").strip()
        if store_id and row_store and row_store != store_id:
            continue

        addon_id = row.get("id")
        if not addon_id:
            continue

        price_value = row.get("price")
        try:
            price = float(price_value or 0.0)
        except (TypeError, ValueError):
            price = 0.0

        max_quantity_value = row.get("max_quantity")
        max_quantity = _coerce_int(max_quantity_value)

        addon_entry = {
            "addon_id": str(addon_id),
            "code": row.get("code"),
            "name": row.get("name"),
            "price": price,
            "max_quantity": max_quantity,
            "addon_type": row.get("addon_type"),
        }
        addons_map.setdefault(product_id, []).append(addon_entry)

    return addons_map


def _resolve_store_id(client: Client, requested_store_id: Optional[str]) -> str:
    requested = str(requested_store_id or "").strip()
    if requested:
        rows = _try_select_products(client, requested)
        if rows:
            return requested
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="store_not_found_or_empty")

    default_store_id = str(settings.default_store_id or "").strip()
    if default_store_id:
        rows = _try_select_products(client, default_store_id)
        if rows:
            return default_store_id
        logger.warning(
            "customer_menu_default_store_empty store_id=%s",
            _short_identifier(default_store_id),
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="menu_not_available")

    rows = _try_select_products(client, None)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="menu_not_available")

    resolved = str(rows[0].get("store_id") or "").strip()
    if not resolved:
        raise HTTPException(status_code=500, detail="store_resolution_failed")
    return resolved


def _map_customer_menu_item(row: Dict[str, Any], *, addons: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
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
        "allow_sweetness": _product_allows_sweetness_flag(row),
        "default_sweetness": _product_default_sweetness_value(row),
        "addons": list(addons or []),
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


def _update_customer_contact_fields(client: Client, customer_id: str, *, name: Optional[str], phone: Optional[str]) -> None:
    updates: Dict[str, Any] = {}
    if name:
        updates["display_name"] = name
    if phone:
        updates["phone"] = phone
    if not updates:
        return

    while updates:
        try:
            resp = client.table("customers").update(updates).eq("id", customer_id).execute()
            if getattr(resp, "error", None):
                raise resp.error
            return
        except Exception as exc:
            missing = _extract_missing_column(exc)
            if missing and missing in updates:
                updates.pop(missing, None)
                continue
            logger.debug("customer_contact_update_failed id=%s detail=%s", customer_id, getattr(exc, "message", str(exc)))
            return


def _ensure_customer_from_line_token(
    client: Client,
    store_id: str,
    token_row: Dict[str, Any],
    payload: CustomerPayload,
) -> Optional[str]:
    line_user_id = str(token_row.get("line_user_id") or "").strip()
    if not line_user_id:
        return None
    existing_customer_id = str(token_row.get("customer_id") or "").strip() or None
    display_name = str(payload.name or "").strip() or None
    normalized_phone = _normalize_phone(payload.phone)

    if existing_customer_id:
        _update_customer_contact_fields(client, existing_customer_id, name=display_name, phone=normalized_phone)
        return existing_customer_id

    lookup = (
        client.table("customers")
        .select("id")
        .eq("store_id", store_id)
        .eq("line_user_id", line_user_id)
        .limit(1)
        .execute()
    )
    if getattr(lookup, "error", None):
        logger.warning("customer_line_lookup_failed store=%s detail=%s", store_id, getattr(lookup.error, "message", lookup.error))
    else:
        rows = getattr(lookup, "data", None) or []
        if rows:
            customer_id = rows[0].get("id")
            if customer_id:
                _update_customer_contact_fields(client, customer_id, name=display_name, phone=normalized_phone)
                return customer_id

    create_data: Dict[str, Any] = {
        "store_id": store_id,
        "line_user_id": line_user_id,
    }
    if display_name:
        create_data["display_name"] = display_name
    if normalized_phone:
        create_data["phone"] = normalized_phone

    attempts = 0
    while attempts < 5:
        attempts += 1
        try:
            resp = client.table("customers").insert(create_data).execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
        if not err:
            rows = getattr(resp, "data", None) or []
            customer_id = rows[0].get("id") if rows else None
            if customer_id:
                return customer_id
            break
        if _is_unique_violation(err, "line_user_id"):
            lookup = (
                client.table("customers").select("id").eq("store_id", store_id).eq("line_user_id", line_user_id).limit(1).execute()
            )
            rows = getattr(lookup, "data", None) or []
            if rows:
                customer_id = rows[0].get("id")
                if customer_id:
                    _update_customer_contact_fields(client, customer_id, name=display_name, phone=normalized_phone)
                    return customer_id
            continue
        missing = _extract_missing_column(err)
        if missing and missing in create_data:
            create_data.pop(missing, None)
            continue
        logger.warning("customer_line_create_failed store=%s detail=%s", store_id, getattr(err, "message", str(err)))
        break
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
def _order_select_columns() -> List[str]:
    return [
        "id",
        "store_id",
        "order_no",
        "public_token",
        "status",
        "payment_status",
        "total_amount",
        "pickup_time",
        "created_at",
        "customer_id",
        "customer_name",
        "customer_phone",
    ]


def _fetch_single_order_row(
    client: Client,
    filters: Dict[str, Any],
    not_found_detail: str = "order_not_found",
) -> Dict[str, Any]:
    order_cols = _order_select_columns()
    while True:
        if not order_cols:
            raise HTTPException(status_code=500, detail="customer_order_lookup_failed")
        order_select = ", ".join(order_cols)
        query = client.table("orders").select(order_select)
        for key, value in filters.items():
            query = query.eq(key, value)
        query = query.limit(1)
        try:
            resp = query.execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
        if not err:
            rows = getattr(resp, "data", None) or []
            if not rows:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)
            return rows[0]
        missing = _extract_missing_column(err)
        if missing and missing in order_cols:
            order_cols = [c for c in order_cols if c != missing]
            continue
        if missing and missing in filters:
            logger.warning(
                "order_lookup_filter_missing_column",
                extra={
                    "missing_column": missing,
                    "filters": list(filters.keys()),
                },
            )
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)
        logger.error(
            "customer_order_lookup_failed: %s",
            getattr(err, "message", str(err)),
        )
        raise HTTPException(status_code=500, detail="customer_order_lookup_failed")


def _resolve_customer_display_name(
    client: Client,
    store_id: Optional[str],
    order_row: Dict[str, Any],
) -> Optional[str]:
    snapshot = str(order_row.get("customer_name") or "").strip()
    if snapshot:
        return snapshot
    customer_id = order_row.get("customer_id")
    if not customer_id or not store_id:
        return None

    select_cols = "id, display_name, name, full_name"
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
            customer_resp = None

        if not c_err:
            rows = getattr(customer_resp, "data", None) or []
            if rows:
                return (
                    rows[0].get("display_name")
                    or rows[0].get("name")
                    or rows[0].get("full_name")
                )
            return None

        missing = _extract_missing_column(c_err)
        if missing and missing in select_cols:
            select_cols = ", ".join([c.strip() for c in select_cols.split(",") if c.strip() != missing])
            if not select_cols:
                return None
            continue
        logger.warning("customer_lookup_failed: %s", getattr(c_err, "message", str(c_err)))
        return None


def _short_identifier(value: Optional[str]) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= 8:
        return text
    return f"{text[:4]}...{text[-4:]}"


def _safe_error_detail(err: Any) -> str:
    detail = getattr(err, "message", None) or getattr(err, "detail", None)
    if not detail and isinstance(err, dict):
        detail = err.get("message") or err.get("detail")
    if not detail and getattr(err, "args", None):
        detail = err.args[0]
    text = str(detail or err or "")
    return text[:500]


def _load_order_items(client: Client, order_id: str) -> List[Dict[str, Any]]:
    select_cols = [
        "product_id",
        "product_name_snapshot",
        "quantity",
        "unit_price",
        "total_price",
        "options",
        "products(image_url)",
    ]
    while True:
        query = client.table("order_items").select(", ".join(select_cols)).eq("order_id", order_id)
        try:
            resp = query.execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
        if not err:
            rows = getattr(resp, "data", None) or []
            items: List[Dict[str, Any]] = []
            for row in rows:
                product_name = (
                    row.get("product_name_snapshot")
                    or row.get("product_name")
                    or row.get("name")
                    or row.get("product_id")
                )
                product_rel = row.get("products") if isinstance(row, dict) else None
                product_image = None
                if isinstance(product_rel, dict):
                    product_image = product_rel.get("image_url")
                quantity = int(row.get("quantity") or 0)
                unit_price_value = row.get("unit_price")
                if unit_price_value is None:
                    unit_price_value = row.get("price") or row.get("unit_price_amount")
                unit_price = float(unit_price_value or 0.0)
                line_total = row.get("total_price") or row.get("line_total") or row.get("line_total_amount")
                if line_total is None and quantity and unit_price:
                    line_total = quantity * unit_price
                items.append(
                    {
                        "product_id": row.get("product_id"),
                        "product_name": product_name,
                        "quantity": quantity,
                        "line_total": float(line_total or 0.0),
                        "unit_price": unit_price,
                        "image_url": product_image,
                        "options": mask_option_costs(row.get("options")),
                    }
                )
            return items
        missing = _extract_missing_column(err)
        if missing and missing in select_cols:
            select_cols = [c for c in select_cols if c != missing]
            if not select_cols:
                logger.warning("order_items_lookup_missing_columns_exhausted")
                return []
            continue
        logger.warning(
            "order_items_lookup_failed: %s",
            getattr(err, "message", str(err)),
        )
        return []


def _load_latest_payment(client: Client, order_id: str) -> Optional[Dict[str, Any]]:
    select_cols = [
        "id",
        "status",
        "method",
        "amount",
        "slip_url",
        "slip_storage_path",
        "slip_file_name",
        "submitted_at",
        "customer_id",
        "reject_reason",
    ]
    while True:
        query = (
            client.table("payments")
            .select(", ".join(select_cols))
            .eq("order_id", order_id)
            .order("created_at", desc=True)
            .limit(1)
        )
        try:
            resp = query.execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            resp = None
            err = exc
        if not err:
            rows = getattr(resp, "data", None) or []
            return rows[0] if rows else None
        missing = _extract_missing_column(err)
        if missing and missing in select_cols:
            select_cols = [c for c in select_cols if c != missing]
            continue
        logger.warning("payment_lookup_failed: %s", getattr(err, "message", str(err)))
        return None


def _create_initial_payment(
    client: Client,
    order_id: str,
    customer_id: Optional[str],
    amount: float,
) -> None:
    payload: Dict[str, Any] = {
        "order_id": order_id,
        "customer_id": customer_id,
        "amount": amount,
        "method": "transfer",
        "status": "pending",
    }
    attempt_payload = dict(payload)
    for _ in range(2):
        try:
            resp = client.table("payments").insert(attempt_payload).execute()
            err = getattr(resp, "error", None)
        except Exception as exc:
            err = exc
        if not err:
            return
        missing = _extract_missing_column(err)
        if missing and missing in attempt_payload:
            attempt_payload.pop(missing, None)
            continue
        logger.warning("initial_payment_create_failed: %s", getattr(err, "message", str(err)))
        return


def _has_submitted_slip(payment_row: Optional[Dict[str, Any]]) -> bool:
    if not payment_row:
        return False
    return bool(
        payment_row.get("slip_url")
        or payment_row.get("slip_storage_path")
        or payment_row.get("slip_file_name")
        or payment_row.get("submitted_at")
    )


def _payment_status_allows_upload(payment_status: str, slip_submitted: bool) -> bool:
    normalized = (payment_status or "").lower()
    if normalized in {"paid"}:
        return False
    if normalized in {"pending", "unpaid", "rejected"}:
        return True
    if normalized == "pending_review":
        return not slip_submitted
    return False


def _build_payment_summary(payment_row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not payment_row:
        return {
            "status": "pending",
            "method": "transfer",
            "amount": 0.0,
            "slip_submitted": False,
            "last_submitted_at": None,
            "reject_reason": None,
            "can_upload_slip": True,
        }
    slip_present = _has_submitted_slip(payment_row)
    status_value = payment_row.get("status") or "pending"
    return {
        "status": status_value,
        "method": payment_row.get("method") or "transfer",
        "amount": float(payment_row.get("amount") or 0.0),
        "slip_submitted": slip_present,
        "last_submitted_at": payment_row.get("submitted_at"),
        "reject_reason": payment_row.get("reject_reason"),
        "can_upload_slip": _payment_status_allows_upload(status_value, slip_present),
    }


def _build_customer_order_status_response(
    client: Client,
    order_row: Dict[str, Any],
) -> Dict[str, Any]:
    order_id = str(order_row.get("id"))
    store_id = str(order_row.get("store_id") or "").strip() or None
    customer_name = _resolve_customer_display_name(client, store_id, order_row)
    items = _load_order_items(client, order_id) or []
    payment_row = _load_latest_payment(client, order_id)
    payment_summary = _build_payment_summary(payment_row)

    order_status = order_row.get("status") or order_row.get("order_status") or "pending_payment"
    payment_status = order_row.get("payment_status") or "unpaid"

    pickup_time = order_row.get("pickup_time")
    if pickup_time is not None:
        pickup_time = str(pickup_time)

    created_at = order_row.get("created_at")
    if created_at is not None:
        created_at = str(created_at)

    return {
        "order_no": order_row.get("order_no") or order_row.get("order_number"),
        "order_status": str(order_status),
        "payment_status": str(payment_status),
        "pickup_time": pickup_time,
        "total_amount": float(order_row.get("total_amount") or 0.0),
        "created_at": created_at,
        "customer_name": customer_name,
        "items": [
            {
                "product_name": item.get("product_name"),
                "quantity": item.get("quantity"),
                "line_total": item.get("line_total"),
                "image_url": item.get("image_url"),
            }
            for item in items
        ],
        "payment": payment_summary,
        "public_token": order_row.get("public_token"),
    }


def _resolve_payment_instruction_payload() -> Dict[str, Any]:
    note_lines = [
        line.strip()
        for line in (settings.payment_note_lines or "").splitlines()
        if line.strip()
    ]
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    return {
        "enabled": bool(settings.payment_instructions_enabled),
        "method_label": settings.payment_method_label or "โอนผ่านบัญชีธนาคาร",
        "bank_name": settings.payment_bank_name or None,
        "account_name": settings.payment_account_name or None,
        "account_number": settings.payment_account_number or None,
        "promptpay_id": settings.payment_promptpay_id or None,
        "note_lines": note_lines,
        "allowed_file_types": allowed_types,
        "max_file_mb": settings.payment_slip_max_mb or 5.0,
    }


def _is_payment_upload_allowed(payment_row: Dict[str, Any], order_row: Dict[str, Any]) -> str:
    payment_status = str((payment_row or {}).get("status") or "pending").lower()
    order_payment_status = str(order_row.get("payment_status") or "unpaid").lower()
    slip_submitted = _has_submitted_slip(payment_row)

    allowed_states = {"pending", "unpaid", "rejected"}
    if payment_status == "paid" or order_payment_status == "paid":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="payment_already_paid")

    if payment_status == "pending_review" or order_payment_status == "pending_review":
        if slip_submitted:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="payment_under_review")
        return payment_status

    if payment_status in allowed_states or order_payment_status in allowed_states:
        return payment_status

    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="payment_upload_not_allowed")


def _validate_upload_file(file: UploadFile, max_mb: float, allowed_types: List[str]) -> bytes:
    if not file:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_required")
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_file")
    limit_bytes = int(max_mb * 1024 * 1024)
    if len(content) > limit_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file_too_large")

    mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0]
    if mime_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_type_not_allowed")
    return content


def _generate_slip_storage_key(order_id: str, filename: str) -> str:
    _, ext = os.path.splitext(filename or "")
    ext = ext.lower() or ".jpg"
    random_suffix = uuid4().hex[:8]
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"{order_id}/{timestamp}-{random_suffix}{ext}"


def _ensure_payment_row(
    client: Client,
    order_id: str,
    customer_id: Optional[str],
    amount: float,
) -> Dict[str, Any]:
    payment_row = _load_latest_payment(client, order_id)
    if payment_row:
        return payment_row
    _create_initial_payment(client, order_id, customer_id, amount)
    payment_row = _load_latest_payment(client, order_id)
    if not payment_row:
        raise HTTPException(status_code=500, detail="payment_initialization_failed")
    return payment_row


def _write_payment_status_log_customer(
    client: Client,
    payment_id: str,
    order_id: str,
    from_status: Optional[str],
    to_status: str,
) -> None:
    payload = {
        "payment_id": payment_id,
        "order_id": order_id,
        "from_status": from_status,
        "to_status": to_status,
        "changed_by": None,
        "changed_by_type": "customer",
        "note": None,
    }
    try:
        client.table("payment_status_logs").insert(payload).execute()
    except Exception:
        trimmed = {k: v for k, v in payload.items() if k not in {"changed_by", "changed_by_type", "note"}}
        try:
            client.table("payment_status_logs").insert(trimmed).execute()
        except Exception as exc:
            logger.warning("customer_payment_status_log_failed: %s", getattr(exc, "message", exc))


def _write_order_status_log_customer(
    client: Client,
    order_id: str,
    from_status: Optional[str],
    to_status: str,
) -> None:
    payload = {
        "order_id": order_id,
        "from_status": from_status,
        "to_status": to_status,
        "changed_by": None,
        "changed_by_type": "customer",
        "note": None,
    }
    try:
        client.table("order_status_logs").insert(payload).execute()
    except Exception:
        trimmed = {k: v for k, v in payload.items() if k not in {"changed_by", "changed_by_type", "note"}}
        try:
            client.table("order_status_logs").insert(trimmed).execute()
        except Exception as exc:
            logger.warning("customer_order_status_log_failed: %s", getattr(exc, "message", exc))


def _update_payment_after_upload(
    client: Client,
    order_id: str,
    payment_row: Dict[str, Any],
    file_meta: Dict[str, Any],
    order_previous_status: str,
) -> None:
    update_payload = {
        "status": "pending_review",
        "slip_url": file_meta.get("public_url"),
        "slip_storage_path": file_meta.get("path"),
        "slip_file_name": file_meta.get("file_name"),
        "submitted_at": datetime.utcnow().isoformat(),
        "reject_reason": None,
    }
    payment_id = str(payment_row.get("id"))
    logger.info(
        "payment_slip_payment_update order=%s payment=%s",
        _short_identifier(order_id),
        _short_identifier(payment_id),
    )
    resp = client.table("payments").update(update_payload).eq("id", payment_id).eq("order_id", order_id).execute()
    update_err = getattr(resp, "error", None)
    if update_err:
        logger.error(
            "payment_slip_payment_update_failed order=%s payment=%s detail=%s",
            _short_identifier(order_id),
            _short_identifier(payment_id),
            _safe_error_detail(update_err),
        )
        raise HTTPException(status_code=500, detail="payment_update_failed")

    order_update = (
        client.table("orders")
        .update({"payment_status": "pending_review", "status": "waiting_payment_review"})
        .eq("id", order_id)
        .execute()
    )
    order_error = getattr(order_update, "error", None)
    if order_error:
        logger.error(
            "payment_slip_order_status_update_failed order=%s detail=%s",
            _short_identifier(order_id),
            _safe_error_detail(order_error),
        )
        raise HTTPException(status_code=500, detail="order_payment_status_sync_failed")

    logger.info(
        "payment_slip_order_status_updated order=%s payment=%s",
        _short_identifier(order_id),
        _short_identifier(payment_id),
    )

    _write_payment_status_log_customer(
        client,
        payment_id,
        order_id,
        str(payment_row.get("status") or "pending"),
        "pending_review",
    )
    _write_order_status_log_customer(
        client,
        order_id,
        order_previous_status,
        "waiting_payment_review",
    )


def _order_response(client: Client, store_id: str, order_id: str) -> Dict[str, Any]:
    order_cols = [
        "id",
        "order_no",
        "status",
        "payment_status",
        "total_amount",
        "pickup_time",
        "created_at",
        "customer_id",
        "customer_name",
    ]
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
        "items": [
            {
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name"),
                "quantity": item.get("quantity"),
                "unit_price": item.get("unit_price"),
                "line_total": item.get("line_total"),
            }
            for item in items
        ],
    }


@router.get("/menu")
def list_menu(store_id: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    client = _get_client()
    store_id_resolved = _resolve_store_id(client, store_id)
    rows = _try_select_products(client, store_id_resolved)
    product_ids = [str(r.get("id")) for r in rows if r.get("id")]
    addons_map = _load_product_addons_map(client, store_id_resolved, product_ids)
    items = [
        _map_customer_menu_item(r, addons=addons_map.get(str(r.get("id")) or "", []))
        for r in rows
        if bool(r.get("is_active", True))
    ]
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
    addons_map = _load_product_addons_map(client, store_id_resolved, [str(row.get("id"))])
    return _map_customer_menu_item(row, addons=addons_map.get(str(row.get("id")) or "", []))


@router.post("/orders")
def create_customer_order(payload: CustomerOrderCreatePayload) -> Dict[str, Any]:
    if not payload.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_items_required")

    pickup_time = str(payload.pickup_time or "").strip()
    customer_name = str(payload.customer.name or "").strip()
    customer_phone = str(payload.customer.phone or "").strip()
    normalized_phone = _normalize_phone(customer_phone)
    if not pickup_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pickup_time_required")
    if not customer_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer_name_required")
    if not normalized_phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer_phone_required")
    try:
        datetime.fromisoformat(pickup_time.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pickup_time_invalid")

    client = _get_client()

    resolved_store_id = payload.store_id
    prepared_items: List[Dict[str, Any]] = []
    item_snapshots: List[Dict[str, Any]] = []

    for item in payload.items:
        quantity = int(item.quantity or 0)
        if quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_positive")

        snapshot = prepare_order_item_snapshot(
            client,
            resolved_store_id or payload.store_id or "",
            product_id=item.product_id,
            quantity=quantity,
            channel_id=None,
            raw_options=item.options,
        )
        snapshot_store_id = str(snapshot.get("store_id") or "").strip()
        if not snapshot_store_id:
            raise HTTPException(status_code=500, detail="store_resolution_failed")
        if resolved_store_id and str(resolved_store_id) != snapshot_store_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="store_mismatch")
        resolved_store_id = snapshot_store_id
        item_snapshots.append(snapshot)
        prepared_items.append(
            {
                "product_id": snapshot.get("product_id"),
                "product_name": snapshot.get("product_name"),
                "quantity": snapshot.get("quantity"),
                "unit_price": float(snapshot.get("unit_price") or 0),
                "line_total": float(snapshot.get("total_price") or 0),
                "options": mask_option_costs(snapshot.get("options_snapshot")),
            }
        )

    if not resolved_store_id:
        raise HTTPException(status_code=500, detail="store_resolution_failed")

    subtotal = sum(float(snapshot.get("total_price") or 0) for snapshot in item_snapshots)
    total_amount = subtotal
    total_cost = sum(float(snapshot.get("total_cost") or 0) for snapshot in item_snapshots)
    gross_profit = total_amount - total_cost

    raw_line_link_token = str(payload.line_link_token or "").strip()
    line_token_row: Optional[Dict[str, Any]] = None
    line_token_customer_id: Optional[str] = None
    if raw_line_link_token:
        try:
            line_token_row = resolve_line_link_token(client, raw_token=raw_line_link_token, store_id=resolved_store_id)
        except Exception as exc:
            logger.warning("line_link_token_resolve_failed store=%s detail=%s", resolved_store_id, exc)
            line_token_row = None
        if line_token_row:
            line_token_customer_id = _ensure_customer_from_line_token(client, resolved_store_id, line_token_row, payload.customer)

    customer_id: Optional[str] = line_token_customer_id
    if not customer_id:
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
        "order_no": generate_order_number(client),
        "public_token": _generate_public_token(),
        "customer_name": customer_name,
        "customer_phone": normalized_phone,
    }
    max_attempts = 5
    attempts = 0
    while True:
        attempts += 1
        order_resp = client.table("orders").insert(order_data).execute()
        order_err = getattr(order_resp, "error", None)
        if not order_err:
            break
        if _is_unique_violation(order_err, "order_no"):
            order_data["order_no"] = generate_order_number(client)
            if attempts < max_attempts:
                continue
        if _is_unique_violation(order_err, "public_token"):
            order_data["public_token"] = _generate_public_token()
            if attempts < max_attempts:
                continue
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
    store_scope_supported = order_items_supports_store_scope(client)
    for snapshot in item_snapshots:
        record = build_order_item_record(
            snapshot,
            order_id=order_id,
            store_id=resolved_store_id if store_scope_supported else None,
            product_name=snapshot.get("product_name"),
        )
        item_rows.append(prune_order_item_columns(client, record))
    _insert_order_items(client, resolved_store_id, order_id, item_rows)
    totals = recalculate_order_totals(client, resolved_store_id, order_id)
    if totals:
        order_row.update(totals)
    _create_initial_payment(
        client,
        order_id,
        customer_id,
        float(order_row.get("total_amount") or total_amount),
    )
    try:
        _write_order_status_log_customer(
            client,
            order_id,
            None,
            str(order_row.get("status") or "pending_payment"),
        )
    except Exception as exc:  # pragma: no cover - non-critical
        logger.warning("customer_initial_order_log_failed: %s", getattr(exc, "message", str(exc)))

    if line_token_customer_id and line_token_row:
        try:
            mark_line_link_token_used(client, line_token_row.get("id"))
        except Exception as exc:  # pragma: no cover - best effort
            logger.warning("line_link_token_mark_used_failed token=%s detail=%s", line_token_row.get("id"), exc)

    return {
        "order_id": order_id,
        "order_no": order_row.get("order_no"),
        "order_number": order_row.get("order_no"),
        "public_token": order_row.get("public_token"),
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
                "options": item.get("options"),
            }
            for item in prepared_items
        ],
    }


@router.get("/orders/status")
def get_customer_order_status(token: str = Query(default="")) -> Dict[str, Any]:
    token_value = str(token or "").strip()
    if not token_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="token_required")

    client = _get_client()
    order_row = _fetch_single_order_row(
        client,
        {"public_token": token_value},
        not_found_detail="order_not_found",
    )
    return _build_customer_order_status_response(client, order_row)


@router.post("/orders/lookup")
def lookup_customer_order(payload: CustomerOrderLookupPayload) -> Dict[str, Any]:
    order_no = str(payload.order_no or "").strip()
    phone = _normalize_phone(payload.phone)
    if not order_no or not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lookup_fields_required")

    client = _get_client()
    order_row = _fetch_single_order_row(
        client,
        {"order_no": order_no, "customer_phone": phone},
        not_found_detail="order_not_found",
    )
    return _build_customer_order_status_response(client, order_row)


@router.get("/orders/{order_id}")
def get_customer_order(order_id: str, token: Optional[str] = Query(default=None), store_id: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    try:
        UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")

    token_value = str(token or "").strip()
    if not token_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="token_required")

    client = _get_client()
    lookup_query = client.table("orders").select("id, store_id, public_token").eq("id", order_id).limit(1)
    if store_id:
        lookup_query = lookup_query.eq("store_id", store_id)
    lookup = lookup_query.execute()
    if getattr(lookup, "error", None):
        raise HTTPException(status_code=500, detail="customer_order_lookup_failed")
    rows = getattr(lookup, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
    row = rows[0]
    resolved_token = str(row.get("public_token") or "").strip()
    if not resolved_token or resolved_token != token_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="token_invalid")
    store_id_resolved = str(row.get("store_id") or "").strip()
    if not store_id_resolved:
        raise HTTPException(status_code=500, detail="store_resolution_failed")

    return _order_response(client, store_id_resolved, order_id)


@router.get("/payment-instructions")
def get_payment_instructions() -> Dict[str, Any]:
    return _resolve_payment_instruction_payload()


@router.post("/orders/status/slip")
async def upload_payment_slip_endpoint(
    public_token: str = Form(...),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    token_value = str(public_token or "").strip()
    if not token_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="token_required")

    client = _get_client()
    order_row = _fetch_single_order_row(client, {"public_token": token_value}, not_found_detail="order_not_found")
    order_id = str(order_row.get("id"))
    order_previous_status = str(order_row.get("status") or order_row.get("order_status") or "pending_payment")
    payment_row = _ensure_payment_row(
        client,
        order_id,
        order_row.get("customer_id"),
        float(order_row.get("total_amount") or 0.0),
    )

    _is_payment_upload_allowed(payment_row, order_row)

    instructions = _resolve_payment_instruction_payload()
    if not instructions.get("enabled"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="payment_instruction_disabled")

    allowed_types = instructions.get("allowed_file_types") or ["image/jpeg", "image/png", "image/webp"]
    max_mb = float(instructions.get("max_file_mb") or settings.payment_slip_max_mb or 5.0)

    file_bytes = _validate_upload_file(file, max_mb, allowed_types)
    storage_key = _generate_slip_storage_key(order_id, file.filename or "slip.jpg")
    file_size = len(file_bytes)
    logger.info(
        "payment_slip_upload_begin order=%s bucket=%s key=%s size=%s type=%s",
        _short_identifier(order_id),
        settings.payment_slip_bucket or "",
        _short_identifier(storage_key),
        file_size,
        file.content_type or "unknown",
    )

    try:
        upload_result = storage_upload_payment_slip(
            bucket=settings.payment_slip_bucket,
            path=storage_key,
            data=file_bytes,
            content_type=file.content_type or "application/octet-stream",
        )
        logger.info(
            "payment_slip_storage_uploaded order=%s key=%s public_url=%s",
            _short_identifier(order_id),
            _short_identifier(storage_key),
            bool(upload_result.get("public_url")),
        )
    except StorageUploadError as exc:
        logger.error(
            "payment_slip_storage_failed order=%s key=%s detail=%s",
            _short_identifier(order_id),
            _short_identifier(storage_key),
            _safe_error_detail(exc),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    _update_payment_after_upload(client, order_id, payment_row, upload_result, order_previous_status)

    refreshed_order_row = _fetch_single_order_row(
        client,
        {"public_token": token_value},
        not_found_detail="order_not_found",
    )
    status_payload = _build_customer_order_status_response(client, refreshed_order_row)
    logger.info(
        "payment_slip_upload_completed order=%s payment_status=%s slip_submitted=%s",
        _short_identifier(order_id),
        status_payload.get("payment", {}).get("status"),
        status_payload.get("payment", {}).get("slip_submitted"),
    )
    return status_payload

