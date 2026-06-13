import logging
import re
from datetime import datetime
from typing import Any, List, Optional
from uuid import uuid4

from supabase import Client

logger = logging.getLogger(__name__)

_ORDER_NUMBER_PATTERN = re.compile(r"^ORD-(\d+)$")
_ORDER_NUMBER_PREFIX = "ORD-"
_MIN_WIDTH = 5
_RECENT_SCAN_LIMIT = 50


def _extract_sequence(value: Any) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip().upper()
    match = _ORDER_NUMBER_PATTERN.match(text)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _fetch_recent_order_numbers(client: Client) -> List[str]:
    query = client.table("orders").select("order_no").order("created_at", desc=True).limit(_RECENT_SCAN_LIMIT)
    resp = query.execute()
    err = getattr(resp, "error", None)
    if err:
        raise err
    rows = getattr(resp, "data", None) or []
    return [str(row.get("order_no") or "") for row in rows]


def _determine_next_sequence(client: Client) -> int:
    rows = _fetch_recent_order_numbers(client)
    max_seq = 0
    for value in rows:
        seq = _extract_sequence(value)
        if seq and seq > max_seq:
            max_seq = seq
    return max_seq + 1 if max_seq >= 0 else 1


def _format_sequence(seq: int) -> str:
    padded = str(max(seq, 1)).zfill(_MIN_WIDTH)
    return f"{_ORDER_NUMBER_PREFIX}{padded}"


def _fallback_order_number() -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    suffix = uuid4().hex[:4].upper()
    return f"{_ORDER_NUMBER_PREFIX}{timestamp}-{suffix}"


def generate_order_number(client: Client) -> str:
    """Generate the next customer-facing order number in ORD-00001 format."""
    try:
        next_seq = _determine_next_sequence(client)
        return _format_sequence(next_seq)
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("order_number_sequence_failed: %s", getattr(exc, "message", str(exc)))
        return _fallback_order_number()
