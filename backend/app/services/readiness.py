"""BE-FIX-02: Menu & addon readiness contract.

Derives product/addon readiness from existing data without adding
schema columns. A product is "customer-orderable" when it is active
AND has at least one valid recipe row. An addon is "customer-selectable"
when it is active AND max_quantity > 0 AND has at least one valid
addon recipe row.

A recipe row is valid when:
- ingredient_id is not null
- quantity_used > 0
- the referenced ingredient exists, belongs to the same store, and is active

This module uses the SAME canonical validation semantics as the cost
engine and usage snapshot — no parallel or conflicting rules.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from supabase import Client

logger = logging.getLogger(__name__)


def _safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_unit(value: Any) -> Optional[str]:
    """Normalize a unit string for comparison. Returns None if empty."""
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


def _units_compatible(recipe_unit: Any, ingredient_unit: Any) -> bool:
    """Check whether recipe unit is compatible with ingredient unit.

    BE-FIX-02B: Strict V1 contract. No unit conversion exists in the
    pipeline, so BOTH units MUST be present and MUST match after
    normalization (trim + lowercase). Missing unit on either side is
    NOT compatible.
    """
    ru = _normalize_unit(recipe_unit)
    iu = _normalize_unit(ingredient_unit)
    if ru is None or iu is None:
        return False
    return ru == iu


def batch_check_product_recipe_readiness(
    client: Client,
    store_id: str,
    product_ids: List[str],
) -> Dict[str, bool]:
    """Batch check whether each product has at least one valid recipe row.

    Returns ``{product_id: True/False}``. Uses 2 queries total regardless
    of product count (no N+1).
    """
    unique_ids = sorted({str(pid) for pid in product_ids if pid})
    if not unique_ids:
        return {}

    # 1. Batch load all recipe rows for these products.
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
        logger.warning("readiness_recipe_query_failed store=%s detail=%s", store_id, str(exc)[:200])
        return {pid: False for pid in unique_ids}

    if err:
        logger.warning("readiness_recipe_query_failed store=%s detail=%s", store_id, str(getattr(err, "message", err))[:200])
        return {pid: False for pid in unique_ids}

    recipe_rows = getattr(resp, "data", None) or []

    # 2. Batch load all referenced ingredients.
    ingredient_ids = set()
    for row in recipe_rows:
        ing_id = row.get("ingredient_id")
        if ing_id:
            ingredient_ids.add(str(ing_id))

    ingredients_map: Dict[str, Dict[str, Any]] = {}
    if ingredient_ids:
        try:
            ing_resp = (
                client.table("ingredients")
                .select("id, store_id, is_active, unit")
                .in_("id", list(ingredient_ids))
                .eq("store_id", store_id)
                .execute()
            )
            ing_err = getattr(ing_resp, "error", None)
        except Exception as exc:
            logger.warning("readiness_ingredient_query_failed store=%s detail=%s", store_id, str(exc)[:200])
            return {pid: False for pid in unique_ids}

        if ing_err:
            logger.warning("readiness_ingredient_query_failed store=%s detail=%s", store_id, str(getattr(ing_err, "message", ing_err))[:200])
            return {pid: False for pid in unique_ids}

        for ing_row in (getattr(ing_resp, "data", None) or []):
            if ing_row.get("id"):
                ingredients_map[str(ing_row["id"])] = ing_row

    # 3. Evaluate each product.
    # BE-FIX-02A: If ANY recipe row has a unit mismatch (both units exist
    # and differ), the product is NOT orderable — prevents partial stock
    # deduction when no unit conversion exists.
    readiness: Dict[str, bool] = {pid: False for pid in unique_ids}
    unit_mismatch_products: set = set()
    for row in recipe_rows:
        product_id = str(row.get("product_id") or "")
        if not product_id or product_id not in readiness:
            continue

        ingredient_id = str(row.get("ingredient_id") or "")
        if not ingredient_id:
            continue
        ingredient = ingredients_map.get(ingredient_id)
        if not ingredient:
            continue

        if not _units_compatible(row.get("unit"), ingredient.get("unit")):
            unit_mismatch_products.add(product_id)

    for row in recipe_rows:
        product_id = str(row.get("product_id") or "")
        if not product_id or product_id not in readiness:
            continue
        if readiness[product_id]:
            continue
        if product_id in unit_mismatch_products:
            continue

        ingredient_id = str(row.get("ingredient_id") or "")
        if not ingredient_id:
            continue

        ingredient = ingredients_map.get(ingredient_id)
        if not ingredient:
            continue
        if ingredient.get("is_active") is False:
            continue

        quantity_used = _safe_float(row.get("quantity_used"))
        if quantity_used <= 0:
            continue

        # At least one valid recipe row found.
        readiness[product_id] = True

    return readiness


def check_product_recipe_readiness(
    client: Client,
    store_id: str,
    product_id: str,
) -> bool:
    """Check a single product's recipe readiness."""
    return batch_check_product_recipe_readiness(client, store_id, [product_id]).get(product_id, False)


def batch_check_addon_recipe_readiness(
    client: Client,
    store_id: str,
    addon_ids: List[str],
) -> Dict[str, bool]:
    """Batch check whether each addon has at least one valid addon recipe row.

    Returns ``{addon_id: True/False}``. Uses 2 queries total.
    """
    unique_ids = sorted({str(aid) for aid in addon_ids if aid})
    if not unique_ids:
        return {}

    # 1. Batch load all addon recipe rows.
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
        logger.warning("readiness_addon_recipe_query_failed store=%s detail=%s", store_id, str(exc)[:200])
        return {aid: False for aid in unique_ids}

    if err:
        logger.warning("readiness_addon_recipe_query_failed store=%s detail=%s", store_id, str(getattr(err, "message", err))[:200])
        return {aid: False for aid in unique_ids}

    recipe_rows = getattr(resp, "data", None) or []

    # 2. Batch load all referenced ingredients.
    ingredient_ids = set()
    for row in recipe_rows:
        ing_id = row.get("ingredient_id")
        if ing_id:
            ingredient_ids.add(str(ing_id))

    ingredients_map: Dict[str, Dict[str, Any]] = {}
    if ingredient_ids:
        try:
            ing_resp = (
                client.table("ingredients")
                .select("id, store_id, is_active, unit")
                .in_("id", list(ingredient_ids))
                .eq("store_id", store_id)
                .execute()
            )
            ing_err = getattr(ing_resp, "error", None)
        except Exception as exc:
            logger.warning("readiness_addon_ingredient_query_failed store=%s detail=%s", store_id, str(exc)[:200])
            return {aid: False for aid in unique_ids}

        if ing_err:
            logger.warning("readiness_addon_ingredient_query_failed store=%s detail=%s", store_id, str(getattr(ing_err, "message", ing_err))[:200])
            return {aid: False for aid in unique_ids}

        for ing_row in (getattr(ing_resp, "data", None) or []):
            if ing_row.get("id"):
                ingredients_map[str(ing_row["id"])] = ing_row

    # 3. Evaluate each addon.
    # BE-FIX-02A: If ANY addon recipe row has a unit mismatch, the addon
    # is NOT selectable — prevents partial stock deduction.
    readiness: Dict[str, bool] = {aid: False for aid in unique_ids}
    unit_mismatch_addons: set = set()
    for row in recipe_rows:
        addon_id = str(row.get("addon_id") or "")
        if not addon_id or addon_id not in readiness:
            continue

        ingredient_id = str(row.get("ingredient_id") or "")
        if not ingredient_id:
            continue
        ingredient = ingredients_map.get(ingredient_id)
        if not ingredient:
            continue

        if not _units_compatible(row.get("unit"), ingredient.get("unit")):
            unit_mismatch_addons.add(addon_id)

    for row in recipe_rows:
        addon_id = str(row.get("addon_id") or "")
        if not addon_id or addon_id not in readiness:
            continue
        if readiness[addon_id]:
            continue
        if addon_id in unit_mismatch_addons:
            continue

        ingredient_id = str(row.get("ingredient_id") or "")
        if not ingredient_id:
            continue

        ingredient = ingredients_map.get(ingredient_id)
        if not ingredient:
            continue
        if ingredient.get("is_active") is False:
            continue

        quantity_used = _safe_float(row.get("quantity_used"))
        if quantity_used <= 0:
            continue

        readiness[addon_id] = True

    return readiness


def is_product_customer_orderable(
    product_row: Dict[str, Any],
    recipe_ready: bool,
) -> bool:
    """Check if a product is customer-orderable (active + recipe ready)."""
    if product_row.get("is_active") is False:
        return False
    return recipe_ready


def is_addon_customer_selectable(
    addon_row: Dict[str, Any],
    recipe_ready: bool,
) -> bool:
    """Check if an addon is customer-selectable.

    Requires: active AND max_quantity > 0 AND recipe ready.
    """
    if addon_row.get("is_active") is False:
        return False

    max_quantity = addon_row.get("max_quantity")
    if max_quantity is None:
        return False
    try:
        max_qty = int(max_quantity)
    except (TypeError, ValueError):
        return False
    if max_qty <= 0:
        return False

    return recipe_ready


def validate_addon_max_quantity(
    addon_row: Dict[str, Any],
    quantity: int,
) -> None:
    """Validate addon quantity against max_quantity.

    Raises HTTPException when:
    - max_quantity is NULL (addon not available)
    - max_quantity <= 0 (addon not available)
    - quantity > max_quantity

    Only called with quantity > 0 (zero quantities are skipped upstream).
    """
    from fastapi import HTTPException, status

    max_quantity = addon_row.get("max_quantity")
    if max_quantity is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="addon_quantity_exceeds_limit",
        )
    try:
        max_qty = int(max_quantity)
    except (TypeError, ValueError):
        max_qty = None
    if max_qty is None or max_qty <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="addon_quantity_exceeds_limit",
        )
    if quantity > max_qty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="addon_quantity_exceeds_limit",
        )
