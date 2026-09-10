"""Atomic server-side RPC wrappers for Healholic V1 payment finalization
and order cancellation.

These functions call the frozen SECURITY DEFINER RPCs via the service-role
Supabase client.  The frontend MUST NEVER call these RPCs directly.

RPCs wrapped:
- public.finalize_paid_order_atomic(p_store_id, p_order_id, p_actor_id, p_payment_method)
- public.cancel_accepted_order_atomic(p_store_id, p_order_id, p_actor_id, p_reason)
- public.create_and_finalize_kiosk_order_atomic(...)  [BE-FIX-05]

Error mapping: RPC ``RAISE EXCEPTION`` messages are parsed into structured
``AtomicRPCError`` instances with an HTTP-friendly ``reason`` code.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from supabase import Client

logger = logging.getLogger(__name__)


class AtomicRPCError(RuntimeError):
    """Raised when an atomic RPC returns an error or raises an exception."""

    def __init__(
        self,
        detail: str,
        *,
        reason: str = "rpc_failed",
        http_status: int = 500,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.reason = reason
        self.http_status = http_status


# ── Error code → HTTP status mapping ────────────────────────────────────
_ERROR_HTTP_MAP: Dict[str, int] = {
    "store_id_required": 400,
    "order_id_required": 400,
    "actor_id_required": 400,
    "client_order_id_required": 400,
    "items_required": 400,
    "invalid_payment_method": 400,
    "order_not_found_for_store": 404,
    "actor_not_member_of_store": 403,
    "ambiguous_payment_state": 409,
    "inconsistent_paid_payment_state": 409,
    "order_has_no_items": 400,
    "usage_snapshot_missing": 400,
    "usage_snapshot_empty": 400,
    "ingredient_not_found_for_store": 500,
    "invalid_order_status_for_finalization": 409,
    "invalid_payment_status_for_finalization": 409,
    "invalid_status_for_stock_return": 409,
    "insufficient_stock": 409,
    "idempotency_conflict": 409,
}

# Reasons that indicate a transient/transport error (safe to retry).
_TRANSIENT_REASONS = frozenset({"rpc_exception", "rpc_error"})


def _parse_rpc_error_message(message: str) -> tuple[str, str]:
    """Extract the error code and full message from a PostgREST error.

    PostgREST typically returns the PostgreSQL exception message in the
    ``message`` field.  The first token before any colon or space is
    usually the RAISE EXCEPTION code.
    """
    text = str(message or "").strip()
    if not text:
        return "rpc_error", "rpc_error"
    # Patterns like "insufficient_stock ingredient=... required=... available=..."
    m = re.match(r"^([a-z_]+)(?:\s|$|:)", text, re.IGNORECASE)
    if m:
        code = m.group(1).lower()
        return code, text
    return "rpc_error", text


def _map_error(detail: str) -> AtomicRPCError:
    code, message = _parse_rpc_error_message(detail)
    http_status = _ERROR_HTTP_MAP.get(code, 500)
    return AtomicRPCError(message, reason=code, http_status=http_status)


def finalize_paid_order(
    client: Client,
    *,
    store_id: str,
    order_id: str,
    actor_id: str,
    payment_method: str,
) -> Dict[str, Any]:
    """Call ``public.finalize_paid_order_atomic`` via the service-role client.

    Returns the RPC response dict on success.  Raises ``AtomicRPCError``
    on failure with an appropriate ``http_status``.
    """
    if payment_method not in ("cash", "promptpay"):
        raise AtomicRPCError(
            "invalid_payment_method",
            reason="invalid_payment_method",
            http_status=400,
        )

    payload = {
        "p_store_id": store_id,
        "p_order_id": order_id,
        "p_actor_id": actor_id,
        "p_payment_method": payment_method,
    }

    logger.info(
        "finalize_paid_order_rpc_begin store=%s order=%s actor=%s method=%s",
        store_id,
        order_id,
        actor_id,
        payment_method,
    )

    try:
        resp = client.rpc("finalize_paid_order_atomic", payload).execute()
    except Exception as exc:
        logger.error(
            "finalize_paid_order_rpc_exception store=%s order=%s detail=%s",
            store_id,
            order_id,
            str(exc)[:300],
        )
        raise AtomicRPCError(
            "finalize_rpc_exception",
            reason="rpc_exception",
            http_status=503,
        )

    error = getattr(resp, "error", None)
    if error:
        error_message = str(getattr(error, "message", error) or "")
        logger.error(
            "finalize_paid_order_rpc_error store=%s order=%s detail=%s",
            store_id,
            order_id,
            error_message[:300],
        )
        raise _map_error(error_message)

    data = getattr(resp, "data", None)
    if not isinstance(data, dict):
        logger.error(
            "finalize_paid_order_rpc_bad_response store=%s order=%s data=%s",
            store_id,
            order_id,
            str(data)[:200],
        )
        raise AtomicRPCError(
            "finalize_rpc_bad_response",
            reason="rpc_error",
            http_status=500,
        )

    logger.info(
        "finalize_paid_order_rpc_success store=%s order=%s result=%s",
        store_id,
        order_id,
        data.get("result"),
    )
    return data


def cancel_accepted_order(
    client: Client,
    *,
    store_id: str,
    order_id: str,
    actor_id: str,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Call ``public.cancel_accepted_order_atomic`` via the service-role client.

    Returns the RPC response dict on success.  Raises ``AtomicRPCError``
    on failure with an appropriate ``http_status``.
    """
    payload = {
        "p_store_id": store_id,
        "p_order_id": order_id,
        "p_actor_id": actor_id,
        "p_reason": reason,
    }

    logger.info(
        "cancel_accepted_order_rpc_begin store=%s order=%s actor=%s",
        store_id,
        order_id,
        actor_id,
    )

    try:
        resp = client.rpc("cancel_accepted_order_atomic", payload).execute()
    except Exception as exc:
        logger.error(
            "cancel_accepted_order_rpc_exception store=%s order=%s detail=%s",
            store_id,
            order_id,
            str(exc)[:300],
        )
        raise AtomicRPCError(
            "cancel_rpc_exception",
            reason="rpc_exception",
            http_status=503,
        )

    error = getattr(resp, "error", None)
    if error:
        error_message = str(getattr(error, "message", error) or "")
        logger.error(
            "cancel_accepted_order_rpc_error store=%s order=%s detail=%s",
            store_id,
            order_id,
            error_message[:300],
        )
        raise _map_error(error_message)

    data = getattr(resp, "data", None)
    if not isinstance(data, dict):
        logger.error(
            "cancel_accepted_order_rpc_bad_response store=%s order=%s data=%s",
            store_id,
            order_id,
            str(data)[:200],
        )
        raise AtomicRPCError(
            "cancel_rpc_bad_response",
            reason="rpc_error",
            http_status=500,
        )

    logger.info(
        "cancel_accepted_order_rpc_success store=%s order=%s result=%s",
        store_id,
        order_id,
        data.get("result"),
    )
    return data


def create_and_finalize_kiosk_order(
    client: Client,
    *,
    store_id: str,
    actor_id: str,
    payment_method: str,
    client_order_id: str,
    items: List[Dict[str, Any]],
    customer_name: Optional[str] = None,
    customer_phone: Optional[str] = None,
    note: Optional[str] = None,
    channel_id: Optional[str] = None,
    channel_fee: float = 0.0,
) -> Dict[str, Any]:
    """Call ``public.create_and_finalize_kiosk_order_atomic`` via the
    service-role client.

    This is the BE-FIX-05 Kiosk atomic transaction. It creates the
    order + items as pending_payment/unpaid, then reuses
    finalize_paid_order_atomic for payment + stock in the SAME
    transaction.

    Returns the RPC response dict on success.  Raises ``AtomicRPCError``
    on failure with an appropriate ``http_status``.

    The ``items`` list must contain trusted, server-generated order item
    records with ``_system.usage_breakdown`` already embedded in the
    ``options`` field.  Client-supplied ``_system`` must be stripped
    before calling this function.
    """
    if payment_method not in ("cash", "promptpay"):
        raise AtomicRPCError(
            "invalid_payment_method",
            reason="invalid_payment_method",
            http_status=400,
        )
    if not client_order_id:
        raise AtomicRPCError(
            "client_order_id_required",
            reason="client_order_id_required",
            http_status=400,
        )
    if not items:
        raise AtomicRPCError(
            "items_required",
            reason="items_required",
            http_status=400,
        )

    payload = {
        "p_store_id": store_id,
        "p_actor_id": actor_id,
        "p_payment_method": payment_method,
        "p_client_order_id": client_order_id,
        "p_items": items,
        "p_customer_name": customer_name,
        "p_customer_phone": customer_phone,
        "p_note": note,
        "p_channel_id": channel_id,
        "p_channel_fee": channel_fee,
    }

    logger.info(
        "kiosk_atomic_rpc_begin store=%s actor=%s method=%s client_order_id=%s items=%s",
        store_id,
        actor_id,
        payment_method,
        client_order_id,
        len(items),
    )

    try:
        resp = client.rpc("create_and_finalize_kiosk_order_atomic", payload).execute()
    except Exception as exc:
        logger.error(
            "kiosk_atomic_rpc_exception store=%s client_order_id=%s detail=%s",
            store_id,
            client_order_id,
            str(exc)[:300],
        )
        raise AtomicRPCError(
            "kiosk_atomic_rpc_exception",
            reason="rpc_exception",
            http_status=503,
        )

    error = getattr(resp, "error", None)
    if error:
        error_message = str(getattr(error, "message", error) or "")
        logger.error(
            "kiosk_atomic_rpc_error store=%s client_order_id=%s detail=%s",
            store_id,
            client_order_id,
            error_message[:300],
        )
        raise _map_error(error_message)

    data = getattr(resp, "data", None)
    if not isinstance(data, dict):
        logger.error(
            "kiosk_atomic_rpc_bad_response store=%s client_order_id=%s data=%s",
            store_id,
            client_order_id,
            str(data)[:200],
        )
        raise AtomicRPCError(
            "kiosk_atomic_rpc_bad_response",
            reason="rpc_error",
            http_status=500,
        )

    logger.info(
        "kiosk_atomic_rpc_success store=%s client_order_id=%s status=%s order_no=%s",
        store_id,
        client_order_id,
        data.get("status"),
        data.get("order_no"),
    )
    return data
