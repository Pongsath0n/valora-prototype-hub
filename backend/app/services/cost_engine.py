import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from supabase import Client

logger = logging.getLogger(__name__)

SWEETNESS_LEVELS: Tuple[int, ...] = (0, 25, 50, 75, 100)
DEFAULT_SWEETNESS = 100


class OrderItemSnapshot(Dict[str, Any]):
    """Structured snapshot describing a fully costed order item."""


def _safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="integer_required")


def _normalize_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _sweetness_label(value: int) -> str:
    if value == 0:
        return "ไม่หวาน"
    return f"หวาน {value}%"


def _mask_addon_cost(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(snapshot)
    cleaned.pop("unit_cost", None)
    cleaned.pop("total_cost", None)
    return cleaned


def mask_option_costs(options: Any) -> Any:
    if not isinstance(options, dict):
        return options
    sanitized = dict(options)
    addons = sanitized.get("addons")
    if isinstance(addons, list):
        sanitized_addons: List[Any] = []
        for addon in addons:
            if isinstance(addon, dict):
                sanitized_addons.append(_mask_addon_cost(addon))
            else:
                sanitized_addons.append(addon)
        sanitized["addons"] = sanitized_addons
    return sanitized


def _fetch_single_row(client: Client, table: str, **filters: Any) -> Dict[str, Any]:
    query = client.table(table).select("*")
    for column, value in filters.items():
        query = query.eq(column, value)
    resp = query.limit(1).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail=f"{table}_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{table[:-1]}_not_found")
    return rows[0]


def _fetch_product(client: Client, store_id: str, product_id: str) -> Dict[str, Any]:
    row = _fetch_single_row(client, "products", id=product_id)
    if store_id and str(row.get("store_id")) != str(store_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="store_mismatch")
    is_active = row.get("is_active")
    if is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="product_not_available")
    return row


def _resolve_product_price(client: Client, store_id: str, product_id: str, channel_id: Optional[str], base_price: float) -> float:
    if not channel_id:
        return base_price
    query = (
        client.table("channel_prices")
        .select("*")
        .eq("store_id", store_id)
        .eq("product_id", product_id)
        .eq("channel_id", channel_id)
        .limit(1)
    )
    resp = query.execute()
    error = getattr(resp, "error", None)
    if error:
        logger.warning("channel_price_lookup_failed: %s", getattr(error, "message", str(error)))
        return base_price
    rows = getattr(resp, "data", None) or []
    if not rows:
        return base_price
    row = rows[0]
    price_value = row.get("price")
    if price_value is None:
        price_value = row.get("selling_price")
    return _safe_float(price_value) or base_price


def _fetch_recipe_rows(client: Client, store_id: str, product_id: str) -> List[Dict[str, Any]]:
    query = client.table("recipes").select("*").eq("product_id", product_id)
    try:
        query = query.eq("store_id", store_id)
    except Exception:
        pass
    resp = query.execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="recipe_query_failed")
    return getattr(resp, "data", None) or []


def _fetch_ingredients_map(client: Client, store_id: str, ingredient_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not ingredient_ids:
        return {}
    query = client.table("ingredients").select("*").in_("id", ingredient_ids)
    try:
        query = query.eq("store_id", store_id)
    except Exception:
        pass
    resp = query.execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="ingredient_query_failed")
    rows = getattr(resp, "data", None) or []
    return {str(row.get("id")): row for row in rows if row.get("id")}


def _calculate_recipe_cost(client: Client, store_id: str, product_id: str) -> Tuple[float, List[Dict[str, Any]]]:
    recipe_rows = _fetch_recipe_rows(client, store_id, product_id)
    if not recipe_rows:
        logger.warning("recipe_missing_for_product store=%s product=%s", store_id, product_id)
        return 0.0, []
    ingredient_ids = [str(row.get("ingredient_id")) for row in recipe_rows if row.get("ingredient_id")]
    ingredients_map = _fetch_ingredients_map(client, store_id, ingredient_ids)
    total_cost = 0.0
    breakdown: List[Dict[str, Any]] = []
    for row in recipe_rows:
        ingredient_id = str(row.get("ingredient_id")) if row.get("ingredient_id") else None
        ingredient = ingredients_map.get(ingredient_id or "")
        quantity_used = _safe_float(row.get("quantity_used"))
        cost_per_unit = _safe_float((ingredient or {}).get("cost_per_unit"))
        line_cost = quantity_used * cost_per_unit
        total_cost += line_cost
        breakdown.append(
            {
                "ingredient_id": ingredient_id,
                "quantity_used": quantity_used,
                "unit": row.get("unit") or (ingredient or {}).get("unit"),
                "cost_per_unit": cost_per_unit,
                "line_cost": line_cost,
                "ingredient_name": (ingredient or {}).get("name"),
                "cost_type": (ingredient or {}).get("cost_type"),
            }
        )
    return total_cost, breakdown


def _product_allows_sweetness(product: Dict[str, Any]) -> bool:
    for key in ("allows_sweetness", "allow_sweetness", "sweetness_enabled"):
        if key in product and product[key] is not None:
            return bool(product[key])
    return True


def _product_default_sweetness(product: Dict[str, Any]) -> int:
    for key in ("sweetness_default", "default_sweetness"):
        if key in product and product[key] is not None:
            value = _safe_int(product[key])
            if value in SWEETNESS_LEVELS:
                return value
    return DEFAULT_SWEETNESS


def _normalize_sweetness(product: Dict[str, Any], requested: Optional[int]) -> int:
    allow_custom = _product_allows_sweetness(product)
    default_value = _product_default_sweetness(product)
    if requested is None:
        return default_value
    if requested not in SWEETNESS_LEVELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sweetness_invalid")
    if not allow_custom and requested != default_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sweetness_not_supported")
    return requested if allow_custom else default_value


def _normalize_addon_inputs(raw_addons: Any) -> Dict[str, int]:
    if raw_addons is None:
        return {}
    if not isinstance(raw_addons, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addons_invalid")
    aggregated: Dict[str, int] = {}
    for entry in raw_addons:
        if not isinstance(entry, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_invalid")
        addon_id = _normalize_string(entry.get("addon_id") or entry.get("id"))
        if not addon_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_id_required")
        quantity = entry.get("quantity")
        qty_value = _safe_int(quantity)
        if qty_value < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_quantity_invalid")
        if qty_value == 0:
            continue
        aggregated[addon_id] = aggregated.get(addon_id, 0) + qty_value
    return aggregated


def _fetch_addons(client: Client, addon_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not addon_ids:
        return {}
    resp = client.table("product_addons").select("*").in_("id", addon_ids).execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="addon_lookup_failed")
    rows = getattr(resp, "data", None) or []
    return {str(row.get("id")): row for row in rows if row.get("id")}


def _validate_addon(row: Dict[str, Any], store_id: str, product_id: str, quantity: int) -> None:
    row_store = row.get("store_id")
    if row_store is not None and str(row_store) != str(store_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_store_mismatch")
    row_product = row.get("product_id")
    if row_product is not None and str(row_product) != str(product_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_product_mismatch")
    if row.get("is_active") is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_not_available")
    max_quantity = row.get("max_quantity")
    if max_quantity is None:
        max_quantity = row.get("quantity_limit")
    if max_quantity is not None:
        try:
            max_quantity_val = int(max_quantity)
        except (TypeError, ValueError):
            max_quantity_val = None
        if max_quantity_val is not None and quantity > max_quantity_val:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="addon_quantity_exceeds_limit")


def _fetch_addon_recipe_rows(client: Client, store_id: str, addon_id: str) -> List[Dict[str, Any]]:
    query = client.table("product_addon_recipes").select("*").eq("addon_id", addon_id)
    try:
        query = query.eq("store_id", store_id)
    except Exception:
        pass
    resp = query.execute()
    error = getattr(resp, "error", None)
    if error:
        raise HTTPException(status_code=500, detail="addon_recipe_query_failed")
    return getattr(resp, "data", None) or []


def _calculate_addon_unit_cost(client: Client, store_id: str, addon_id: str) -> Tuple[float, List[Dict[str, Any]]]:
    recipe_rows = _fetch_addon_recipe_rows(client, store_id, addon_id)
    if not recipe_rows:
        logger.warning("addon_recipe_missing store=%s addon=%s", store_id, addon_id)
        return 0.0, []
    ingredient_ids = [str(row.get("ingredient_id")) for row in recipe_rows if row.get("ingredient_id")]
    ingredients_map = _fetch_ingredients_map(client, store_id, ingredient_ids)
    total_cost = 0.0
    breakdown: List[Dict[str, Any]] = []
    for row in recipe_rows:
        ingredient_id = str(row.get("ingredient_id")) if row.get("ingredient_id") else None
        ingredient = ingredients_map.get(ingredient_id or "")
        quantity_used = _safe_float(row.get("quantity_used"))
        cost_per_unit = _safe_float((ingredient or {}).get("cost_per_unit"))
        line_cost = quantity_used * cost_per_unit
        total_cost += line_cost
        breakdown.append(
            {
                "ingredient_id": ingredient_id,
                "quantity_used": quantity_used,
                "cost_per_unit": cost_per_unit,
                "line_cost": line_cost,
                "ingredient_name": (ingredient or {}).get("name"),
            }
        )
    return total_cost, breakdown


def _sanitize_note(raw_options: Any) -> Optional[str]:
    if not isinstance(raw_options, dict):
        return None
    return _normalize_string(raw_options.get("note"))


def _extract_requested_sweetness(raw_options: Any) -> Optional[int]:
    if not isinstance(raw_options, dict):
        return None
    value = raw_options.get("sweetness")
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sweetness_invalid")


def prepare_order_item_snapshot(
    client: Client,
    store_id: str,
    *,
    product_id: str,
    quantity: int,
    channel_id: Optional[str] = None,
    raw_options: Optional[Dict[str, Any]] = None,
) -> OrderItemSnapshot:
    if quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_positive")

    product = _fetch_product(client, store_id, product_id)
    resolved_store_id = str(product.get("store_id") or store_id or "").strip()
    if not resolved_store_id:
        raise HTTPException(status_code=500, detail="store_resolution_failed")
    base_price = _safe_float(product.get("base_price"))
    unit_price = _resolve_product_price(client, resolved_store_id, product_id, channel_id, base_price)
    base_cost, base_breakdown = _calculate_recipe_cost(client, resolved_store_id, product_id)

    requested_sweetness = _extract_requested_sweetness(raw_options)
    sweetness_value = _normalize_sweetness(product, requested_sweetness)
    note_value = _sanitize_note(raw_options)

    addon_inputs = raw_options.get("addons") if isinstance(raw_options, dict) else None
    addon_quantities = _normalize_addon_inputs(addon_inputs)
    addon_rows = _fetch_addons(client, list(addon_quantities.keys()))

    option_total = 0.0
    option_cost_total = 0.0
    addon_snapshots: List[Dict[str, Any]] = []
    addon_breakdown: List[Dict[str, Any]] = []
    for addon_id, addon_qty in addon_quantities.items():
        addon_row = addon_rows.get(addon_id)
        if not addon_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="addon_not_found")
        _validate_addon(addon_row, resolved_store_id, product_id, addon_qty)
        addon_price = addon_row.get("price")
        if addon_price is None:
            addon_price = addon_row.get("unit_price")
        addon_unit_price = _safe_float(addon_price)
        addon_unit_cost, addon_cost_breakdown = _calculate_addon_unit_cost(client, resolved_store_id, addon_id)
        addon_total_price = addon_unit_price * addon_qty
        addon_total_cost = addon_unit_cost * addon_qty
        option_total += addon_total_price
        option_cost_total += addon_total_cost
        addon_snapshots.append(
            {
                "addon_id": addon_id,
                "code": addon_row.get("code") or addon_row.get("reference"),
                "name": addon_row.get("name"),
                "quantity": addon_qty,
                "unit_price": addon_unit_price,
                "unit_cost": addon_unit_cost,
                "total_price": addon_total_price,
                "total_cost": addon_total_cost,
            }
        )
        addon_breakdown.extend(
            {
                **detail,
                "addon_id": addon_id,
            }
            for detail in addon_cost_breakdown
        )

    options_snapshot: Dict[str, Any] = {
        "sweetness": sweetness_value,
        "sweetness_label": _sweetness_label(sweetness_value),
        "addons": addon_snapshots,
    }
    if note_value:
        options_snapshot["note"] = note_value

    unit_cost = base_cost + option_cost_total
    unit_price_total = unit_price + option_total
    total_price = unit_price_total * quantity
    total_cost = unit_cost * quantity

    return OrderItemSnapshot(
        product_id=str(product_id),
        product_name=product.get("name"),
        store_id=resolved_store_id,
        quantity=quantity,
        unit_price=unit_price_total,
        unit_cost=unit_cost,
        total_price=total_price,
        total_cost=total_cost,
        line_profit=total_price - total_cost,
        base_price=unit_price,
        base_cost=base_cost,
        base_cost_breakdown=base_breakdown,
        option_total=option_total,
        option_cost_total=option_cost_total,
        options_snapshot=options_snapshot,
        addon_cost_breakdown=addon_breakdown,
    )


def build_order_item_record(
    snapshot: OrderItemSnapshot,
    *,
    order_id: str,
    store_id: Optional[str],
    product_name: Optional[str] = None,
) -> Dict[str, Any]:
    record = {
        "order_id": order_id,
        "product_id": snapshot["product_id"],
        "quantity": snapshot["quantity"],
        "unit_price": snapshot["unit_price"],
        "unit_cost": snapshot["unit_cost"],
        "line_total": snapshot["total_price"],
        "line_cost": snapshot["total_cost"],
        "line_profit": snapshot["line_profit"],
        "option_total": snapshot.get("option_total", 0.0),
        "option_cost_total": snapshot.get("option_cost_total", 0.0),
        "options": snapshot.get("options_snapshot"),
        "total_price": snapshot["total_price"],
        "total_cost": snapshot["total_cost"],
    }
    if store_id:
        record["store_id"] = store_id
    if product_name:
        record["product_name_snapshot"] = product_name
    elif snapshot.get("product_name"):
        record["product_name_snapshot"] = snapshot.get("product_name")
    return record
