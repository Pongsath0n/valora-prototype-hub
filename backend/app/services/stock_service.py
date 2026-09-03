"""Canonical stock consumption service for Healholic V1.

Responsibilities:
- build_usage_plan(...): pure business calculation that turns paid order items
  (with their immutable cost snapshots) into an aggregated usage plan keyed by
  order_item_id + ingredient_id.
- consume_for_paid_order(...): calls the frozen SECURITY DEFINER RPC
  public.apply_order_stock_usage() with the usage plan.

Architecture:
    Frontend -> FastAPI -> Backend Service Role -> apply_order_stock_usage()

The frontend MUST NOT call the RPC directly. Python owns business calculation;
the database owns atomic persistence.

Contracts enforced here (frozen DB contract, do NOT change SQL):
- movement_type = "used" only in this phase (no "return" yet).
- quantity > 0 for "used" movements (physical direction is encoded by
  movement_type, not by sign).
- ONE "used" movement per (store_id, order_item_id, ingredient_id) — the
  application MUST aggregate recipe usage before persistence. The partial
  unique index uq_stock_used_order_item_ingredient is the final safety net.
- Each usage element contains: order_item_id, ingredient_id, quantity.
- movement_reason = "pos_sale" for this phase.
- created_by = authenticated staff/owner profile id.

Usage source: ORDER SNAPSHOT. The existing prepare_order_item_snapshot already
persists base_cost_breakdown and addon_cost_breakdown with ingredient_id and
quantity_used per unit. We derive stock usage from that immutable snapshot so
financial cost snapshot and physical usage stay aligned. No new schema is added
to snapshot recipes.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from supabase import Client

logger = logging.getLogger(__name__)

MOVEMENT_REASON_POS_SALE = "pos_sale"

# ── FIX-C: Bounded retry for transient stock RPC failures ───────────────
# The apply_order_stock_usage RPC is idempotent (verified by TF-02), so
# retrying after a transient transport/network error is safe.
_STOCK_RPC_MAX_RETRIES = 2  # initial attempt + 2 retries = 3 total
_STOCK_RPC_BACKOFF_MS = (100, 300)  # backoff between retries

# Reasons that indicate a transient/transport error (safe to retry).
# Domain/validation errors (missing_recipe, missing_context) must NOT retry.
_TRANSIENT_REASONS = frozenset({"rpc_exception", "rpc_error"})


class StockUsageError(RuntimeError):
    """Raised when a valid usage plan cannot be built or the stock RPC fails."""

    def __init__(self, detail: str, *, reason: str = "stock_usage_failed") -> None:
        super().__init__(detail)
        self.detail = detail
        self.reason = reason


class StockSyncFailedError(StockUsageError):
    """Raised when all bounded retry attempts fail AFTER order/payment persistence.

    Carries order context so the API can return a structured partial-commit
    response instead of a generic 500.
    """

    def __init__(
        self,
        detail: str,
        *,
        reason: str = "stock_sync_failed",
        order_id: str = "",
        order_no: str = "",
    ) -> None:
        super().__init__(detail, reason=reason)
        self.order_id = order_id
        self.order_no = order_no


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
        return 0


def _ingredient_id_from_detail(detail: Dict[str, Any]) -> Optional[str]:
    ingredient_id = detail.get("ingredient_id")
    if not ingredient_id:
        return None
    text = str(ingredient_id).strip()
    return text or None


def _quantity_from_detail(detail: Dict[str, Any]) -> float:
    quantity = _safe_float(detail.get("quantity_used"))
    if quantity <= 0:
        return 0.0
    return quantity


def build_usage_plan(
    order_items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Build an aggregated stock usage plan from persisted order item rows.

    Each order_items entry is expected to be a row from the `order_items`
    table (or an equivalent dict) containing at minimum:
      - id: the order_item_id
      - quantity: the order item quantity
      - options: the persisted options snapshot (dict with addons list) OR None

    The ingredient usage is derived from the immutable cost snapshot embedded in
    the order item's options snapshot:
      - base recipe rows live under options.cost_status / or are attached to the
        item by the caller as `base_cost_breakdown` and `addon_cost_breakdown`.

    Because the persisted `order_items.options` JSON does not always carry the
    full ingredient breakdown, the caller may pass the original
    `prepare_order_item_snapshot` result alongside each item via the optional
    `snapshot` key. This keeps financial cost snapshot and physical usage
    aligned without adding new schema.

    Aggregation rule: ONE usage row per (order_item_id, ingredient_id).
    Returns a list of {"order_item_id", "ingredient_id", "quantity"} dicts
    with quantity > 0.
    """
    if not order_items:
        return []

    aggregated: Dict[Tuple[str, str], float] = {}

    for entry in order_items:
        order_item_id = str(entry.get("id") or "").strip()
        if not order_item_id:
            continue
        item_quantity = _safe_int(entry.get("quantity"))
        if item_quantity <= 0:
            continue

        # The snapshot is the source of truth for per-unit ingredient usage.
        # Callers pass it under the "snapshot" key (the OrderItemSnapshot dict).
        snapshot = entry.get("snapshot") if isinstance(entry, dict) else None
        if not isinstance(snapshot, dict):
            # No snapshot available — cannot derive usage safely.
            logger.warning(
                "stock_usage_missing_snapshot order_item_id=%s",
                order_item_id,
            )
            raise StockUsageError(
                "missing_recipe_snapshot",
                reason="missing_recipe",
            )

        base_breakdown = snapshot.get("base_cost_breakdown")
        addon_breakdown = snapshot.get("addon_cost_breakdown")

        # 1. Base product recipe usage (per unit * item quantity).
        if not isinstance(base_breakdown, list) or not base_breakdown:
            raise StockUsageError(
                "missing_recipe_for_order_item",
                reason="missing_recipe",
            )

        for detail in base_breakdown:
            if not isinstance(detail, dict):
                continue
            ingredient_id = _ingredient_id_from_detail(detail)
            if not ingredient_id:
                continue
            per_unit_qty = _quantity_from_detail(detail)
            if per_unit_qty <= 0:
                continue
            total_qty = per_unit_qty * item_quantity
            if total_qty <= 0:
                continue
            key = (order_item_id, ingredient_id)
            aggregated[key] = aggregated.get(key, 0.0) + total_qty

        # 2. Addon recipe usage. Each addon breakdown detail carries the
        # per-unit quantity for one addon recipe row. The addon quantity
        # multiplier is already baked into the snapshot's addon cost breakdown
        # only when the snapshot was built with addon_qty; to stay correct we
        # re-derive addon usage from the addon snapshots (which carry the
        # selected addon quantity) multiplied by the per-unit addon recipe.
        addon_snapshots = []
        options_snapshot = snapshot.get("options_snapshot")
        if isinstance(options_snapshot, dict):
            addons = options_snapshot.get("addons")
            if isinstance(addons, list):
                addon_snapshots = [a for a in addons if isinstance(a, dict)]

        # Map addon_id -> selected addon quantity for this order item.
        addon_selected_qty: Dict[str, int] = {}
        for addon_snap in addon_snapshots:
            addon_id = str(addon_snap.get("addon_id") or "").strip()
            if not addon_id:
                continue
            addon_qty = _safe_int(addon_snap.get("quantity"))
            if addon_qty > 0:
                addon_selected_qty[addon_id] = addon_selected_qty.get(addon_id, 0) + addon_qty

        if isinstance(addon_breakdown, list):
            for detail in addon_breakdown:
                if not isinstance(detail, dict):
                    continue
                ingredient_id = _ingredient_id_from_detail(detail)
                if not ingredient_id:
                    continue
                per_unit_qty = _quantity_from_detail(detail)
                if per_unit_qty <= 0:
                    continue
                addon_id = str(detail.get("addon_id") or "").strip()
                addon_qty = addon_selected_qty.get(addon_id, 0)
                if addon_qty <= 0:
                    # No selected quantity resolved; skip to avoid over-consuming.
                    continue
                # per_unit_qty is per one unit of the addon; multiply by the
                # selected addon quantity and the order item quantity.
                total_qty = per_unit_qty * addon_qty * item_quantity
                if total_qty <= 0:
                    continue
                key = (order_item_id, ingredient_id)
                aggregated[key] = aggregated.get(key, 0.0) + total_qty

    usage_plan: List[Dict[str, Any]] = []
    for (order_item_id, ingredient_id), quantity in aggregated.items():
        if quantity <= 0:
            continue
        usage_plan.append(
            {
                "order_item_id": order_item_id,
                "ingredient_id": ingredient_id,
                "quantity": quantity,
            }
        )
    return usage_plan


def consume_for_paid_order(
    client: Client,
    *,
    store_id: str,
    order_id: str,
    actor_id: str,
    usage_plan: List[Dict[str, Any]],
    order_no: str = "",
) -> Dict[str, Any]:
    """Call the frozen RPC public.apply_order_stock_usage().

    The RPC is SECURITY DEFINER and EXECUTE is restricted to postgres /
    service_role. The backend service-role client is the only caller.

    Returns the RPC response data on success. Raises StockUsageError on
    failure so the caller can surface a controlled error instead of silently
    reporting a successful sale with stock updated.

    FIX-C: Transient RPC/transport errors are retried up to
    _STOCK_RPC_MAX_RETRIES times with bounded backoff.  The RPC is
    idempotent (verified by TF-02), so retrying after an uncertain
    commit state is safe.  Domain/validation errors are NOT retried.
    If all attempts fail, raises StockSyncFailedError with order context.
    """
    if not usage_plan:
        logger.info("stock_usage_empty_plan store=%s order=%s", store_id, order_id)
        return {"applied": 0, "order_id": order_id, "usage": []}

    if not store_id or not order_id or not actor_id:
        raise StockUsageError(
            "stock_usage_missing_context",
            reason="missing_context",
        )

    payload = {
        "p_store_id": store_id,
        "p_order_id": order_id,
        "p_actor_id": actor_id,
        "p_usage": usage_plan,
    }

    logger.info(
        "stock_usage_rpc_begin store=%s order=%s actor=%s rows=%s",
        store_id,
        order_id,
        actor_id,
        len(usage_plan),
    )

    last_error: Optional[StockUsageError] = None
    for attempt in range(1 + _STOCK_RPC_MAX_RETRIES):
        try:
            resp = client.rpc("apply_order_stock_usage", payload).execute()
        except Exception as exc:
            logger.error(
                "stock_usage_rpc_exception store=%s order=%s attempt=%s detail=%s",
                store_id,
                order_id,
                attempt,
                str(exc)[:300],
            )
            last_error = StockUsageError("stock_usage_rpc_failed", reason="rpc_exception")
        else:
            error = getattr(resp, "error", None)
            if error:
                logger.error(
                    "stock_usage_rpc_error store=%s order=%s attempt=%s detail=%s",
                    store_id,
                    order_id,
                    attempt,
                    str(getattr(error, "message", error))[:300],
                )
                last_error = StockUsageError("stock_usage_rpc_failed", reason="rpc_error")
            else:
                data = getattr(resp, "data", None)
                logger.info(
                    "stock_usage_rpc_success store=%s order=%s rows=%s attempt=%s",
                    store_id,
                    order_id,
                    len(usage_plan),
                    attempt,
                )
                return data if isinstance(data, dict) else {"applied": len(usage_plan), "order_id": order_id, "usage": usage_plan}

        # Decide whether to retry
        if last_error and last_error.reason in _TRANSIENT_REASONS and attempt < _STOCK_RPC_MAX_RETRIES:
            backoff_ms = _STOCK_RPC_BACKOFF_MS[min(attempt, len(_STOCK_RPC_BACKOFF_MS) - 1)]
            logger.info(
                "stock_usage_rpc_retry store=%s order=%s attempt=%s backoff_ms=%s",
                store_id,
                order_id,
                attempt + 1,
                backoff_ms,
            )
            time.sleep(backoff_ms / 1000.0)
            continue
        # Non-transient error or out of retries — stop
        break

    # All retries exhausted for a transient error → structured partial-commit
    if last_error and last_error.reason in _TRANSIENT_REASONS:
        raise StockSyncFailedError(
            "kiosk_order_stock_sync_failed",
            reason="stock_sync_failed",
            order_id=order_id,
            order_no=order_no,
        )
    # Non-transient error (missing_context, etc.) — raise as-is
    if last_error:
        raise last_error
    # Should not reach here, but safety net
    raise StockUsageError("stock_usage_unknown_failure", reason="unknown")
