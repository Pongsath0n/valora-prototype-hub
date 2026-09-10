"""BE-FIX-05: Advisory stock availability for Kiosk UX.

Computes the maximum producible quantity for products and addons based
on current ingredient stock. This is ADVISORY ONLY — it does NOT reserve
stock, does NOT lock ingredients, and does NOT mutate anything.

The authoritative stock decision is made inside the atomic finalize
transaction (finalize_paid_order_atomic → apply_order_stock_usage).

Max producible quantity rule:
    For each required ingredient:
        capacity = floor(current_stock / required_per_serving)
    Product max = minimum capacity across all required ingredients

Example:
    Ingredient A: 100 available, 20 per serving → capacity 5
    Ingredient B:  30 available, 10 per serving → capacity 3
    Product max = 3

Unit contract (BE-FIX-02B):
    recipe unit and ingredient unit must both be present and must match
    after normalization (trim + lowercase). No unit conversion exists.
    Any mismatch → fail closed (max = 0).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from supabase import Client

from app.services.readiness import (
    _normalize_unit,
    _safe_float,
    _units_compatible,
)

logger = logging.getLogger(__name__)


def _safe_int(value: Any) -> int:
    try:
        if value is None or value == "":
            return 0
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _batch_load_ingredients(
    client: Client,
    store_id: str,
    ingredient_ids: List[str],
) -> Dict[str, Dict[str, Any]]:
    """Batch load ingredient rows (id, current_stock, unit, is_active)."""
    unique_ids = sorted({str(i) for i in ingredient_ids if i})
    if not unique_ids:
        return {}
    try:
        resp = (
            client.table("ingredients")
            .select("id, store_id, unit, current_stock, is_active")
            .in_("id", unique_ids)
            .eq("store_id", store_id)
            .execute()
        )
        err = getattr(resp, "error", None)
    except Exception as exc:
        logger.warning("availability_ingredient_query_failed store=%s detail=%s", store_id, str(exc)[:200])
        return {}

    if err:
        logger.warning("availability_ingredient_query_failed store=%s detail=%s", store_id, str(getattr(err, "message", err))[:200])
        return {}

    result: Dict[str, Dict[str, Any]] = {}
    for row in (getattr(resp, "data", None) or []):
        if row.get("id"):
            result[str(row["id"])] = row
    return result


def _batch_load_product_recipes(
    client: Client,
    store_id: str,
    product_ids: List[str],
) -> Dict[str, List[Dict[str, Any]]]:
    """Batch load recipe rows for multiple products. Returns {product_id: [rows]}."""
    unique_ids = sorted({str(p) for p in product_ids if p})
    if not unique_ids:
        return {}
    try:
        resp = (
            client.table("recipes")
            .select("product_id, ingredient_id, quantity_used, unit")
            .in_("product_id", unique_ids)
            .eq("store_id", store_id)
            .execute()
        )
        err = getattr(resp, "error", None)
    except Exception as exc:
        logger.warning("availability_recipe_query_failed store=%s detail=%s", store_id, str(exc)[:200])
        return {pid: [] for pid in unique_ids}

    if err:
        logger.warning("availability_recipe_query_failed store=%s detail=%s", store_id, str(getattr(err, "message", err))[:200])
        return {pid: [] for pid in unique_ids}

    result: Dict[str, List[Dict[str, Any]]] = {pid: [] for pid in unique_ids}
    for row in (getattr(resp, "data", None) or []):
        pid = str(row.get("product_id") or "")
        if pid:
            result.setdefault(pid, []).append(row)
    return result


def _batch_load_addon_recipes(
    client: Client,
    store_id: str,
    addon_ids: List[str],
) -> Dict[str, List[Dict[str, Any]]]:
    """Batch load addon recipe rows. Returns {addon_id: [rows]}."""
    unique_ids = sorted({str(a) for a in addon_ids if a})
    if not unique_ids:
        return {}
    try:
        resp = (
            client.table("product_addon_recipes")
            .select("addon_id, ingredient_id, quantity_used, unit")
            .in_("addon_id", unique_ids)
            .eq("store_id", store_id)
            .execute()
        )
        err = getattr(resp, "error", None)
    except Exception as exc:
        logger.warning("availability_addon_recipe_query_failed store=%s detail=%s", store_id, str(exc)[:200])
        return {aid: [] for aid in unique_ids}

    if err:
        logger.warning("availability_addon_recipe_query_failed store=%s detail=%s", store_id, str(getattr(err, "message", err))[:200])
        return {aid: [] for aid in unique_ids}

    result: Dict[str, List[Dict[str, Any]]] = {aid: [] for aid in unique_ids}
    for row in (getattr(resp, "data", None) or []):
        aid = str(row.get("addon_id") or "")
        if aid:
            result.setdefault(aid, []).append(row)
    return result


def _compute_max_producible(
    recipe_rows: List[Dict[str, Any]],
    ingredients_map: Dict[str, Dict[str, Any]],
) -> int:
    """Compute max producible quantity from recipe rows + ingredient stock.

    Returns 0 if:
    - no valid recipe rows
    - any ingredient is missing/inactive
    - any unit mismatch
    - any quantity_used <= 0
    - any ingredient has 0 or negative stock
    """
    if not recipe_rows:
        return 0

    max_qty: Optional[int] = None
    for row in recipe_rows:
        ingredient_id = str(row.get("ingredient_id") or "")
        if not ingredient_id:
            return 0

        ingredient = ingredients_map.get(ingredient_id)
        if not ingredient:
            return 0
        if ingredient.get("is_active") is False:
            return 0

        # BE-FIX-02B: strict unit contract — no conversion.
        if not _units_compatible(row.get("unit"), ingredient.get("unit")):
            return 0

        quantity_used = _safe_float(row.get("quantity_used"))
        if quantity_used <= 0:
            return 0

        current_stock = _safe_float(ingredient.get("current_stock"))
        if current_stock <= 0:
            return 0

        capacity = int(current_stock // quantity_used)
        if max_qty is None or capacity < max_qty:
            max_qty = capacity

    return max_qty if max_qty is not None and max_qty > 0 else 0


def batch_product_max_producible(
    client: Client,
    store_id: str,
    product_ids: List[str],
) -> Dict[str, int]:
    """Batch compute max producible quantity for products.

    Returns {product_id: max_qty}. Uses 2 queries total (no N+1).
    max_qty = 0 means unavailable.
    """
    unique_ids = sorted({str(p) for p in product_ids if p})
    if not unique_ids:
        return {}

    recipes_map = _batch_load_product_recipes(client, store_id, unique_ids)

    # Collect all ingredient IDs across all recipes.
    all_ingredient_ids: set = set()
    for rows in recipes_map.values():
        for row in rows:
            ing = row.get("ingredient_id")
            if ing:
                all_ingredient_ids.add(str(ing))

    ingredients_map = _batch_load_ingredients(client, store_id, list(all_ingredient_ids))

    result: Dict[str, int] = {}
    for pid in unique_ids:
        recipe_rows = recipes_map.get(pid, [])
        result[pid] = _compute_max_producible(recipe_rows, ingredients_map)
    return result


def product_max_producible(
    client: Client,
    store_id: str,
    product_id: str,
) -> int:
    """Compute max producible quantity for a single product."""
    return batch_product_max_producible(client, store_id, [product_id]).get(product_id, 0)


def batch_addon_max_producible(
    client: Client,
    store_id: str,
    addon_ids: List[str],
) -> Dict[str, int]:
    """Batch compute max producible quantity for addons.

    Returns {addon_id: max_qty}. Uses 2 queries total (no N+1).
    """
    unique_ids = sorted({str(a) for a in addon_ids if a})
    if not unique_ids:
        return {}

    recipes_map = _batch_load_addon_recipes(client, store_id, unique_ids)

    all_ingredient_ids: set = set()
    for rows in recipes_map.values():
        for row in rows:
            ing = row.get("ingredient_id")
            if ing:
                all_ingredient_ids.add(str(ing))

    ingredients_map = _batch_load_ingredients(client, store_id, list(all_ingredient_ids))

    result: Dict[str, int] = {}
    for aid in unique_ids:
        recipe_rows = recipes_map.get(aid, [])
        result[aid] = _compute_max_producible(recipe_rows, ingredients_map)
    return result


def addon_max_producible(
    client: Client,
    store_id: str,
    addon_id: str,
) -> int:
    """Compute max producible quantity for a single addon."""
    return batch_addon_max_producible(client, store_id, [addon_id]).get(addon_id, 0)


def compute_item_max_producible(
    client: Client,
    store_id: str,
    product_id: str,
    selected_addons: Optional[List[Dict[str, Any]]] = None,
) -> int:
    """Compute max producible quantity for a product + selected addons.

    Combines base recipe usage with addon usage. The minimum capacity
    across ALL required ingredients (base + addons) wins.

    selected_addons: list of {"addon_id": str, "quantity": int}

    Example (Extra Shot):
        Base: 10g coffee per serving
        Extra Shot: 10g coffee per addon unit
        Stock: 30g coffee
        1 drink + 1 extra shot = 20g → allowed (capacity = 30/20 = 1)
        2 drinks each + 1 extra shot = 40g → not allowed (capacity = 0)
    """
    # Aggregate required quantity per ingredient across base + addons.
    required: Dict[str, float] = {}

    # Load base recipe.
    base_recipes = _batch_load_product_recipes(client, store_id, [product_id]).get(product_id, [])
    if not base_recipes:
        return 0

    # Load addon recipes.
    addon_ids = [str(a.get("addon_id")) for a in (selected_addons or []) if a.get("addon_id")]
    addon_recipes_map = _batch_load_addon_recipes(client, store_id, addon_ids) if addon_ids else {}

    # Collect all ingredient IDs.
    all_ingredient_ids: set = set()
    for row in base_recipes:
        ing = row.get("ingredient_id")
        if ing:
            all_ingredient_ids.add(str(ing))
    for rows in addon_recipes_map.values():
        for row in rows:
            ing = row.get("ingredient_id")
            if ing:
                all_ingredient_ids.add(str(ing))

    ingredients_map = _batch_load_ingredients(client, store_id, list(all_ingredient_ids))

    # Validate base recipe rows and accumulate per-serving usage.
    base_usage: Dict[str, float] = {}
    for row in base_recipes:
        ingredient_id = str(row.get("ingredient_id") or "")
        if not ingredient_id:
            return 0
        ingredient = ingredients_map.get(ingredient_id)
        if not ingredient or ingredient.get("is_active") is False:
            return 0
        if not _units_compatible(row.get("unit"), ingredient.get("unit")):
            return 0
        quantity_used = _safe_float(row.get("quantity_used"))
        if quantity_used <= 0:
            return 0
        base_usage[ingredient_id] = base_usage.get(ingredient_id, 0.0) + quantity_used

    # Validate addon recipe rows and accumulate per-addon-unit usage.
    addon_usage: Dict[str, float] = {}
    for addon_entry in (selected_addons or []):
        aid = str(addon_entry.get("addon_id") or "")
        addon_qty = _safe_int(addon_entry.get("quantity"))
        if addon_qty <= 0:
            continue
        addon_recipe_rows = addon_recipes_map.get(aid, [])
        if not addon_recipe_rows:
            return 0
        for row in addon_recipe_rows:
            ingredient_id = str(row.get("ingredient_id") or "")
            if not ingredient_id:
                return 0
            ingredient = ingredients_map.get(ingredient_id)
            if not ingredient or ingredient.get("is_active") is False:
                return 0
            if not _units_compatible(row.get("unit"), ingredient.get("unit")):
                return 0
            quantity_used = _safe_float(row.get("quantity_used"))
            if quantity_used <= 0:
                return 0
            addon_usage[ingredient_id] = addon_usage.get(ingredient_id, 0.0) + (quantity_used * addon_qty)

    # Combine: per-serving total usage = base_usage + addon_usage
    # (addon_usage already multiplied by addon quantity per serving).
    combined: Dict[str, float] = {}
    for ing_id, qty in base_usage.items():
        combined[ing_id] = combined.get(ing_id, 0.0) + qty
    for ing_id, qty in addon_usage.items():
        combined[ing_id] = combined.get(ing_id, 0.0) + qty

    if not combined:
        return 0

    # Compute max servings: min(floor(stock / per_serving_usage))
    max_qty: Optional[int] = None
    for ing_id, per_serving in combined.items():
        ingredient = ingredients_map.get(ing_id)
        if not ingredient:
            return 0
        current_stock = _safe_float(ingredient.get("current_stock"))
        if current_stock <= 0:
            return 0
        capacity = int(current_stock // per_serving)
        if max_qty is None or capacity < max_qty:
            max_qty = capacity

    return max_qty if max_qty is not None and max_qty > 0 else 0
