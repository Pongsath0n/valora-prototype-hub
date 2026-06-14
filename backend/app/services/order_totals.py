import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from supabase import Client

from app.services.order_item_columns import order_items_supports_store_scope

logger = logging.getLogger(__name__)


def _safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _extract_missing_column(error: Any) -> Optional[str]:
    message = str(getattr(error, "message", error) or "")
    match = re.search(r'column\s+"([^"]+)"\s+does\s+not\s+exist', message, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    match = re.search(r"find the '([^']+)' column", message, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def _coalesce_amount(row: Dict[str, Any], key: str, qty_key: str, unit_key: str) -> float:
    if row.get(key) is not None:
        return _safe_float(row.get(key))
    return _safe_float(row.get(qty_key)) * _safe_float(row.get(unit_key))


def resolve_channel_fee(client: Client, store_id: str, channel_id: Optional[str], subtotal: float) -> float:
    if not channel_id:
        return 0.0
    query = (
        client.table("sales_channels")
        .select("fee_type, fee_value")
        .eq("id", channel_id)
        .eq("store_id", store_id)
        .limit(1)
    )
    try:
        resp = query.execute()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "channel_fee_lookup_failed store=%s channel=%s error=%s",
            store_id,
            channel_id,
            getattr(exc, "message", str(exc)),
        )
        return 0.0
    error = getattr(resp, "error", None)
    if error:
        logger.warning(
            "channel_fee_lookup_error store=%s channel=%s error=%s",
            store_id,
            channel_id,
            getattr(error, "message", str(error)),
        )
        return 0.0
    rows = getattr(resp, "data", None) or []
    if not rows:
        return 0.0
    fee_type = str(rows[0].get("fee_type") or "none")
    fee_value = _safe_float(rows[0].get("fee_value"))
    if fee_type == "percent":
        return subtotal * (fee_value / 100)
    if fee_type == "fixed":
        return fee_value
    return 0.0


def recalculate_order_totals(client: Client, store_id: str, order_id: str) -> Dict[str, float]:
    select_columns: List[str] = [
        "total_price",
        "total_cost",
        "line_profit",
        "option_total",
        "option_cost_total",
        "quantity",
        "unit_price",
        "unit_cost",
    ]
    optional_columns = set(select_columns)
    while True:
        query = client.table("order_items").select(", ".join(select_columns)).eq("order_id", order_id)
        if order_items_supports_store_scope(client):
            query = query.eq("store_id", store_id)
        resp = query.execute()
        error = getattr(resp, "error", None)
        if not error:
            break
        missing_col = _extract_missing_column(error)
        if missing_col and missing_col in optional_columns:
            select_columns = [col for col in select_columns if col != missing_col]
            optional_columns.discard(missing_col)
            if not select_columns:
                raise HTTPException(status_code=500, detail="order_totals_recalc_failed")
            continue
        raise HTTPException(status_code=500, detail="order_totals_recalc_failed")
    items = getattr(resp, "data", None) or []

    subtotal = 0.0
    total_cost = 0.0
    for row in items:
        subtotal += _coalesce_amount(row, "total_price", "quantity", "unit_price")
        total_cost += _coalesce_amount(row, "total_cost", "quantity", "unit_cost")

    order_query = (
        client.table("orders")
        .select("id, store_id, channel_id, discount_amount")
        .eq("id", order_id)
        .eq("store_id", store_id)
        .limit(1)
    )
    order_resp = order_query.execute()
    if getattr(order_resp, "error", None):
        raise HTTPException(status_code=500, detail="order_lookup_failed")
    order_rows = getattr(order_resp, "data", None) or []
    if not order_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order_not_found")
    order_row = order_rows[0]

    channel_fee = resolve_channel_fee(client, store_id, order_row.get("channel_id"), subtotal)
    discount_amount = _safe_float(order_row.get("discount_amount"))
    total_amount = subtotal + channel_fee - discount_amount
    gross_profit = total_amount - total_cost - channel_fee

    update_payload = {
        "subtotal": subtotal,
        "total_cost": total_cost,
        "channel_fee": channel_fee,
        "total_amount": total_amount,
        "gross_profit": gross_profit,
    }
    update_query = client.table("orders").update(update_payload).eq("id", order_id).eq("store_id", store_id)
    update_resp = update_query.execute()
    update_error = getattr(update_resp, "error", None)
    if update_error:
        if _extract_missing_column(update_error) == "channel_fee":
            fallback = dict(update_payload)
            fallback["channel_fee_total"] = fallback.pop("channel_fee")
            fallback_query = client.table("orders").update(fallback).eq("id", order_id).eq("store_id", store_id)
            fallback_resp = fallback_query.execute()
            if getattr(fallback_resp, "error", None):
                raise HTTPException(status_code=500, detail="order_totals_recalc_failed")
        else:
            raise HTTPException(status_code=500, detail="order_totals_recalc_failed")

    return update_payload
