from typing import Any, Dict, List, Optional

from supabase import Client

_ORDER_ITEMS_COLUMN_CACHE: Dict[str, Optional[bool]] = {}


def _is_missing_column(error: Any, column: str) -> bool:
    message = str(getattr(error, "message", "") or error or "").lower()
    column_lower = column.lower()
    return column_lower in message and ("column" in message or "does not exist" in message or "undefined" in message)


def order_items_has_column(client: Client, column: str) -> bool:
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


def order_items_supports_store_scope(client: Client) -> bool:
    return order_items_has_column(client, "store_id")


def order_item_select_clause(client: Client) -> str:
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
    if order_items_supports_store_scope(client):
        columns.insert(1, "store_id")
    optional_columns = [
        "product_name_snapshot",
        "line_total",
        "line_cost",
        "line_profit",
        "option_total",
        "option_cost_total",
        "options",
        "total_price",
        "total_cost",
    ]
    for column in optional_columns:
        if order_items_has_column(client, column):
            columns.append(column)
    return ", ".join(columns)


def prune_order_item_columns(client: Client, data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    if not order_items_supports_store_scope(client):
        payload.pop("store_id", None)
    optional_cols = [
        "product_name_snapshot",
        "line_total",
        "line_cost",
        "line_profit",
        "option_total",
        "option_cost_total",
        "options",
        "total_price",
        "total_cost",
    ]
    for col in optional_cols:
        if not order_items_has_column(client, col):
            payload.pop(col, None)
    return payload
