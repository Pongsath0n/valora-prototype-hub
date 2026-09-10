"""Server-generated stock usage snapshot for Healholic V1 order items.

The frozen RPC ``public.finalize_paid_order_atomic`` reads the immutable
per-unit ingredient usage from ``order_items.options -> '_system' ->
'usage_breakdown'``.  This module is the **only** place that produces
that structure, so client-submitted ``_system`` data can never reach the
database.

Snapshot contract (consumed by the RPC):
    options._system.usage_breakdown.base = [
        {"ingredient_id": uuid, "quantity_used": float, "unit": str}, ...
    ]
    options._system.usage_breakdown.addons = [
        {"ingredient_id": uuid, "addon_id": uuid, "quantity_used": float, "unit": str}, ...
    ]

``quantity_used`` is **per unit** of the order item (for base) or per
unit of the addon (for addons).  The RPC multiplies by ``oi.quantity``
and, for addons, by the selected addon quantity from
``options.addons[].quantity``.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_SYSTEM_KEY = "_system"
_USAGE_BREAKDOWN_KEY = "usage_breakdown"


class UsageSnapshotError(RuntimeError):
    """Raised when a valid usage snapshot cannot be built."""

    def __init__(self, detail: str, *, reason: str = "usage_snapshot_failed") -> None:
        super().__init__(detail)
        self.detail = detail
        self.reason = reason


def strip_client_system(options: Any) -> Any:
    """Remove any client-supplied ``_system`` key from *options*.

    Returns a shallow copy when *options* is a dict; otherwise returns
    the value unchanged.  This must be called **before** the server
    embeds its own ``_system`` snapshot.
    """
    if not isinstance(options, dict):
        return options
    cleaned = dict(options)
    cleaned.pop(_SYSTEM_KEY, None)
    return cleaned


def _safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _clean_ingredient_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _build_base_usage(base_breakdown: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract per-unit base recipe usage from the cost breakdown.

    BE-FIX-02B: Fail-closed. If ANY entry has ``unit_mismatch=True``,
    raise ``UsageSnapshotError`` — no partial snapshots are produced.
    """
    if any(isinstance(d, dict) and d.get("unit_mismatch") for d in base_breakdown):
        raise UsageSnapshotError(
            "invalid_recipe_configuration",
            reason="unit_mismatch",
        )
    usage: List[Dict[str, Any]] = []
    for detail in base_breakdown:
        if not isinstance(detail, dict):
            continue
        ingredient_id = _clean_ingredient_id(detail.get("ingredient_id"))
        if not ingredient_id:
            continue
        quantity_used = _safe_float(detail.get("quantity_used"))
        if quantity_used <= 0:
            continue
        entry: Dict[str, Any] = {
            "ingredient_id": ingredient_id,
            "quantity_used": quantity_used,
        }
        unit = detail.get("unit")
        if unit:
            entry["unit"] = unit
        usage.append(entry)
    if not usage:
        raise UsageSnapshotError(
            "missing_recipe_for_order_item",
            reason="missing_recipe",
        )
    return usage


def _build_addon_usage(addon_breakdown: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract per-unit addon recipe usage from the addon cost breakdown.

    BE-FIX-02B: Fail-closed. If ANY entry has ``unit_mismatch=True``,
    raise ``UsageSnapshotError`` — no partial snapshots are produced.
    """
    if any(isinstance(d, dict) and d.get("unit_mismatch") for d in addon_breakdown):
        raise UsageSnapshotError(
            "addon_not_available",
            reason="unit_mismatch",
        )
    usage: List[Dict[str, Any]] = []
    for detail in addon_breakdown:
        if not isinstance(detail, dict):
            continue
        ingredient_id = _clean_ingredient_id(detail.get("ingredient_id"))
        if not ingredient_id:
            continue
        addon_id = _clean_ingredient_id(detail.get("addon_id"))
        if not addon_id:
            continue
        quantity_used = _safe_float(detail.get("quantity_used"))
        if quantity_used <= 0:
            continue
        entry: Dict[str, Any] = {
            "ingredient_id": ingredient_id,
            "addon_id": addon_id,
            "quantity_used": quantity_used,
        }
        unit = detail.get("unit")
        if unit:
            entry["unit"] = unit
        usage.append(entry)
    return usage


def build_usage_breakdown(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Build the ``usage_breakdown`` dict from a cost-engine snapshot.

    Raises ``UsageSnapshotError`` when the base recipe is missing or
    has no valid ingredient rows.
    """
    base_breakdown = snapshot.get("base_cost_breakdown")
    if not isinstance(base_breakdown, list) or not base_breakdown:
        raise UsageSnapshotError(
            "missing_recipe_for_order_item",
            reason="missing_recipe",
        )

    addon_breakdown = snapshot.get("addon_cost_breakdown")
    if not isinstance(addon_breakdown, list):
        addon_breakdown = []

    return {
        "base": _build_base_usage(base_breakdown),
        "addons": _build_addon_usage(addon_breakdown),
    }


def embed_usage_snapshot(
    options_snapshot: Dict[str, Any],
    snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    """Return a copy of *options_snapshot* with the server-generated
    ``_system.usage_breakdown`` embedded.

    Any pre-existing ``_system`` key (e.g. from a client) is discarded
    before embedding.
    """
    cleaned = strip_client_system(options_snapshot)
    if not isinstance(cleaned, dict):
        cleaned = {}
    breakdown = build_usage_breakdown(snapshot)
    cleaned[_SYSTEM_KEY] = {_USAGE_BREAKDOWN_KEY: breakdown}
    return cleaned


def has_usage_snapshot(options: Any) -> bool:
    """Check whether *options* already carries a server-generated
    ``_system.usage_breakdown``.
    """
    if not isinstance(options, dict):
        return False
    system = options.get(_SYSTEM_KEY)
    if not isinstance(system, dict):
        return False
    breakdown = system.get(_USAGE_BREAKDOWN_KEY)
    return isinstance(breakdown, dict) and "base" in breakdown


def mask_system_from_options(options: Any) -> Any:
    """Strip ``_system`` from *options* for customer-facing responses."""
    if not isinstance(options, dict):
        return options
    cleaned = dict(options)
    cleaned.pop(_SYSTEM_KEY, None)
    return cleaned
