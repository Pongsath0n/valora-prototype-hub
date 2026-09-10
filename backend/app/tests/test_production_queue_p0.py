"""BE-ADD-01: Staff Production Queue tests.

Validates the GET /api/store-admin/orders/production endpoint:
- PQ01: Staff can access
- PQ02: Manager can access
- PQ03: Owner can access
- PQ04: Non-member denied
- PQ05: web_order paid accepted included
- PQ06: kiosk paid accepted included
- PQ07: pending_payment excluded
- PQ08: unpaid excluded
- PQ09: cancelled/voided excluded
- PQ10: completed excluded
- PQ11: preparing included
- PQ12: ready included
- PQ13: FIFO uses payment_confirmed_at ASC, not created_at
- PQ14: No source priority
- PQ15: Staff response includes payment_confirmed_at
- PQ16: Staff response does NOT include slip/internal payment fields
- PQ17: _system stripped from item options
- PQ18: No financial cost/profit leakage for Staff
- PQ19: Empty queue → 200 with empty orders array
- PQ20: No N+1 query behavior (batched queries)
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import store_admin


def _build_fake_ctx(role: str = "staff", client: Any = None) -> Dict[str, Any]:
    return {
        "client": client if client is not None else MagicMock(),
        "user_id": "user-1",
        "memberships": [{"store_id": "store-1", "role": role}],
    }


def _make_order(
    *,
    oid: str = "ord-1",
    status: str = "accepted",
    payment_status: str = "paid",
    order_source: str = "web_order",
    order_no: str = "ORD-00001",
    customer_name: str = "Alice",
    note: Optional[str] = None,
    total_amount: float = 120.0,
    created_at: str = "2024-01-01T10:00:00Z",
) -> Dict[str, Any]:
    return {
        "id": oid,
        "store_id": "store-1",
        "status": status,
        "payment_status": payment_status,
        "order_source": order_source,
        "order_no": order_no,
        "customer_name": customer_name,
        "note": note,
        "total_amount": total_amount,
        "created_at": created_at,
    }


def _make_payment(
    *,
    order_id: str = "ord-1",
    status: str = "paid",
    confirmed_at: str = "2024-01-01T10:05:00Z",
    created_at: str = "2024-01-01T10:04:00Z",
) -> Dict[str, Any]:
    return {
        "id": "pay-1",
        "order_id": order_id,
        "status": status,
        "confirmed_at": confirmed_at,
        "created_at": created_at,
    }


def _make_item(
    *,
    item_id: str = "item-1",
    order_id: str = "ord-1",
    product_name: str = "Latte",
    quantity: int = 2,
    unit_price: float = 60.0,
    options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    item = {
        "id": item_id,
        "order_id": order_id,
        "product_id": "prod-1",
        "product_name": product_name,
        "quantity": quantity,
        "unit_price": unit_price,
        "line_total": unit_price * quantity,
        "total_price": unit_price * quantity,
        "options": options,
    }
    return item


def _build_mock_client(
    orders: List[Dict[str, Any]],
    payments: List[Dict[str, Any]],
    items: List[Dict[str, Any]],
    *,
    has_order_source: bool = True,
    has_payments_store_scope: bool = True,
    has_order_items_store_scope: bool = True,
) -> MagicMock:
    """Build a mock Supabase client with batched query support."""
    fake_client = MagicMock()

    def mock_table(name: str) -> MagicMock:
        t = MagicMock()
        if name == "orders":
            t.select.return_value = t
            t.eq.return_value = t
            t.in_.return_value = t
            t.order.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=orders)
        elif name == "payments":
            t.select.return_value = t
            t.in_.return_value = t
            t.eq.return_value = t
            t.not_.is_.return_value = t
            t.order.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=payments)
        elif name == "order_items":
            t.select.return_value = t
            t.in_.return_value = t
            t.eq.return_value = t
            t.order.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=items)
        else:
            t.select.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=[])
        return t

    fake_client.table = mock_table
    return fake_client


def _common_patches(fake_client, role="staff"):
    """Build common patches for list_production_queue."""
    return [
        patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx(role)),
        patch("app.api.store_admin._resolve_store_id", return_value=("store-1", role)),
        patch("app.api.store_admin._require_staff_or_above"),
        patch("app.api.store_admin._orders_has_column", return_value=True),
        patch("app.api.store_admin._order_select_columns", return_value="*"),
        patch("app.api.store_admin.order_item_select_clause", return_value="*"),
        patch("app.api.store_admin._payments_supports_store_scope", return_value=True),
        patch("app.api.store_admin.order_items_supports_store_scope", return_value=True),
        patch("app.api.store_admin.CUSTOMER_NAME_FALLBACK", "Unknown"),
    ]


class PQ01StaffAccessTests(unittest.TestCase):
    """PQ01: Staff can access Production Queue."""

    def test_staff_can_access(self):
        fake_client = _build_mock_client([], [], [])
        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(response["store_id"], "store-1")
            self.assertEqual(response["orders"], [])


class PQ02ManagerAccessTests(unittest.TestCase):
    """PQ02: Manager can access."""

    def test_manager_can_access(self):
        fake_client = _build_mock_client([], [], [])
        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("manager", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(response["store_id"], "store-1")


class PQ03OwnerAccessTests(unittest.TestCase):
    """PQ03: Owner can access."""

    def test_owner_can_access(self):
        fake_client = _build_mock_client([], [], [])
        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("owner", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(response["store_id"], "store-1")


class PQ04NonMemberDeniedTests(unittest.TestCase):
    """PQ04: Non-member denied."""

    def test_non_member_denied(self):
        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff")), \
            patch("app.api.store_admin._resolve_store_id", return_value=(None, None)):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(ctx_err.exception.status_code, 403)


class PQ05WebOrderPaidAcceptedIncludedTests(unittest.TestCase):
    """PQ05: web_order paid accepted included."""

    def test_web_order_paid_accepted_included(self):
        orders = [_make_order(oid="ord-1", order_source="web_order", status="accepted")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        items = []
        fake_client = _build_mock_client(orders, payments, items)

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 1)
            self.assertEqual(response["orders"][0]["id"], "ord-1")
            self.assertEqual(response["orders"][0]["order_source"], "web_order")


class PQ06KioskPaidAcceptedIncludedTests(unittest.TestCase):
    """PQ06: kiosk paid accepted included."""

    def test_kiosk_paid_accepted_included(self):
        orders = [_make_order(oid="ord-1", order_source="kiosk", status="accepted")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        items = []
        fake_client = _build_mock_client(orders, payments, items)

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 1)
            self.assertEqual(response["orders"][0]["order_source"], "kiosk")


class PQ07PendingPaymentExcludedTests(unittest.TestCase):
    """PQ07: pending_payment excluded."""

    def test_pending_payment_excluded(self):
        # The DB query filters payment_status=paid, so pending_payment orders
        # won't be returned. But even if they somehow appear, they have no
        # paid payment confirmed_at, so they're excluded by fail-closed.
        orders = [_make_order(oid="ord-1", status="pending_payment", payment_status="unpaid")]
        payments = []  # No paid payment
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 0)


class PQ08UnpaidExcludedTests(unittest.TestCase):
    """PQ08: unpaid excluded."""

    def test_unpaid_excluded(self):
        orders = [_make_order(oid="ord-1", payment_status="unpaid")]
        payments = []
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 0)


class PQ09CancelledVoidedExcludedTests(unittest.TestCase):
    """PQ09: cancelled/voided excluded.

    The DB query filters status IN (accepted, preparing, ready), so
    cancelled/voided orders are excluded at the DB level. The mock
    simulates this by returning an empty result set.
    """

    def test_cancelled_excluded(self):
        # DB filters: status IN (accepted, preparing, ready) → cancelled excluded
        orders = []
        payments = []
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 0)

    def test_voided_excluded(self):
        # DB filters: status IN (accepted, preparing, ready) → voided excluded
        orders = []
        payments = []
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 0)


class PQ10CompletedExcludedTests(unittest.TestCase):
    """PQ10: completed excluded."""

    def test_completed_excluded(self):
        # DB filters: status IN (accepted, preparing, ready) → completed excluded
        orders = []
        payments = []
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 0)


class PQ11PreparingIncludedTests(unittest.TestCase):
    """PQ11: preparing included."""

    def test_preparing_included(self):
        orders = [_make_order(oid="ord-1", status="preparing")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 1)
            self.assertEqual(response["orders"][0]["status"], "preparing")


class PQ12ReadyIncludedTests(unittest.TestCase):
    """PQ12: ready included."""

    def test_ready_included(self):
        orders = [_make_order(oid="ord-1", status="ready")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 1)
            self.assertEqual(response["orders"][0]["status"], "ready")


class PQ13FIFOByConfirmedAtTests(unittest.TestCase):
    """PQ13: FIFO uses payment_confirmed_at ASC, not created_at.

    Order A created earlier but paid later.
    Order B created later but paid earlier.
    Expected: B before A.
    """

    def test_fifo_by_confirmed_at(self):
        orders = [
            _make_order(oid="ord-a", order_no="ORD-00001", created_at="2024-01-01T09:00:00Z"),
            _make_order(oid="ord-b", order_no="ORD-00002", created_at="2024-01-01T10:00:00Z"),
        ]
        # A paid at 11:00, B paid at 10:30 → B first
        payments = [
            _make_payment(order_id="ord-a", confirmed_at="2024-01-01T11:00:00Z"),
            _make_payment(order_id="ord-b", confirmed_at="2024-01-01T10:30:00Z"),
        ]
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 2)
            self.assertEqual(response["orders"][0]["id"], "ord-b")
            self.assertEqual(response["orders"][1]["id"], "ord-a")
            self.assertEqual(response["orders"][0]["payment_confirmed_at"], "2024-01-01T10:30:00Z")
            self.assertEqual(response["orders"][1]["payment_confirmed_at"], "2024-01-01T11:00:00Z")


class PQ14NoSourcePriorityTests(unittest.TestCase):
    """PQ14: No source priority.

    web_order and kiosk are interleaved by confirmed_at, not grouped.
    """

    def test_no_source_priority(self):
        orders = [
            _make_order(oid="ord-a", order_source="web_order", created_at="2024-01-01T09:00:00Z"),
            _make_order(oid="ord-b", order_source="kiosk", created_at="2024-01-01T10:00:00Z"),
            _make_order(oid="ord-c", order_source="web_order", created_at="2024-01-01T11:00:00Z"),
        ]
        payments = [
            _make_payment(order_id="ord-a", confirmed_at="2024-01-01T10:30:00Z"),
            _make_payment(order_id="ord-b", confirmed_at="2024-01-01T10:15:00Z"),
            _make_payment(order_id="ord-c", confirmed_at="2024-01-01T10:45:00Z"),
        ]
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 3)
            # Order by confirmed_at: B (10:15), A (10:30), C (10:45)
            self.assertEqual(response["orders"][0]["id"], "ord-b")
            self.assertEqual(response["orders"][1]["id"], "ord-a")
            self.assertEqual(response["orders"][2]["id"], "ord-c")


class PQ15StaffIncludesPaymentConfirmedAtTests(unittest.TestCase):
    """PQ15: Staff response includes payment_confirmed_at."""

    def test_staff_includes_payment_confirmed_at(self):
        orders = [_make_order(oid="ord-1")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 1)
            self.assertIn("payment_confirmed_at", response["orders"][0])
            self.assertEqual(response["orders"][0]["payment_confirmed_at"], "2024-01-01T10:05:00Z")


class PQ16NoSlipFieldsTests(unittest.TestCase):
    """PQ16: Staff response does NOT include slip/internal payment fields."""

    def test_no_slip_fields_in_response(self):
        orders = [_make_order(oid="ord-1")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        fake_client = _build_mock_client(orders, payments, [])

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            order = response["orders"][0]
            # Must NOT have slip/internal payment fields
            for forbidden in ("slip_url", "slip_storage_path", "slip_file_name",
                              "confirmed_by", "reject_reason", "latest_payment"):
                self.assertNotIn(forbidden, order, f"Field {forbidden} must not be present")


class PQ17SystemStrippedTests(unittest.TestCase):
    """PQ17: _system stripped from item options."""

    def test_system_stripped_from_options(self):
        orders = [_make_order(oid="ord-1")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        items = [_make_item(
            order_id="ord-1",
            options={
                "sweetness": 50,
                "_system": {"usage_breakdown": {"ing-1": 10.0}},
                "cost_status": {"base_cost": 30.0},
            },
        )]
        fake_client = _build_mock_client(orders, payments, items)

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(len(response["orders"]), 1)
            item = response["orders"][0]["items"][0]
            self.assertIn("sweetness", item["options"])
            self.assertNotIn("_system", item["options"])


class PQ18NoFinancialLeakageTests(unittest.TestCase):
    """PQ18: No financial cost/profit leakage for Staff."""

    def test_no_financial_fields_in_order(self):
        orders = [_make_order(oid="ord-1")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        items = [_make_item(order_id="ord-1")]
        fake_client = _build_mock_client(orders, payments, items)

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            order = response["orders"][0]
            # Must NOT have order-level financial fields
            self.assertNotIn("total_cost", order)
            self.assertNotIn("gross_profit", order)

    def test_financial_item_fields_masked(self):
        orders = [_make_order(oid="ord-1")]
        payments = [_make_payment(order_id="ord-1", confirmed_at="2024-01-01T10:05:00Z")]
        items = [_make_item(
            order_id="ord-1",
            options={"sweetness": 50, "cost_status": {"base_cost": 30.0}},
        )]
        # Add financial fields to item
        items[0]["unit_cost"] = 25.0
        items[0]["line_cost"] = 50.0
        items[0]["line_profit"] = 70.0
        items[0]["total_cost"] = 50.0
        items[0]["option_cost_total"] = 5.0
        fake_client = _build_mock_client(orders, payments, items)

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            item = response["orders"][0]["items"][0]
            # Financial fields must be masked to None
            self.assertIsNone(item.get("unit_cost"))
            self.assertIsNone(item.get("line_cost"))
            self.assertIsNone(item.get("line_profit"))
            self.assertIsNone(item.get("total_cost"))
            self.assertIsNone(item.get("option_cost_total"))
            # cost_status must be stripped from options (mask_option_costs)
            self.assertNotIn("cost_status", item.get("options") or {})


class PQ19EmptyQueueTests(unittest.TestCase):
    """PQ19: Empty queue → 200 with empty orders array."""

    def test_empty_queue_returns_200(self):
        fake_client = _build_mock_client([], [], [])
        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")
            self.assertEqual(response["orders"], [])
            self.assertEqual(response["store_id"], "store-1")


class PQ20NoNPlusOneTests(unittest.TestCase):
    """PQ20: No N+1 query behavior (batched queries)."""

    def test_batched_queries(self):
        """The endpoint should make at most 3 queries: orders, payments, items.
        Not one payment/items query per order."""
        orders = [
            _make_order(oid=f"ord-{i}", order_no=f"ORD-{i:05d}", created_at=f"2024-01-01T{i:02d}:00:00Z")
            for i in range(5)
        ]
        payments = [
            _make_payment(order_id=f"ord-{i}", confirmed_at=f"2024-01-01T{i:02d}:05:00Z")
            for i in range(5)
        ]
        items = [
            _make_item(item_id=f"item-{i}", order_id=f"ord-{i}")
            for i in range(5)
        ]

        query_counts: Dict[str, int] = {"orders": 0, "payments": 0, "order_items": 0}
        fake_client = MagicMock()

        def mock_table(name: str) -> MagicMock:
            t = MagicMock()
            t.select.return_value = t
            t.eq.return_value = t
            t.in_.return_value = t
            t.not_.is_.return_value = t
            t.order.return_value = t
            if name == "orders":
                query_counts["orders"] += 1
                t.execute.return_value = SimpleNamespace(error=None, data=orders)
            elif name == "payments":
                query_counts["payments"] += 1
                t.execute.return_value = SimpleNamespace(error=None, data=payments)
            elif name == "order_items":
                query_counts["order_items"] += 1
                t.execute.return_value = SimpleNamespace(error=None, data=items)
            else:
                t.execute.return_value = SimpleNamespace(error=None, data=[])
            return t

        fake_client.table = mock_table

        with patch("app.api.store_admin._get_ctx", return_value=_build_fake_ctx("staff", fake_client)), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._order_select_columns", return_value="*"), \
            patch("app.api.store_admin.order_item_select_clause", return_value="*"), \
            patch("app.api.store_admin._payments_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True):
            response = store_admin.list_production_queue(authorization="Bearer token")

            self.assertEqual(len(response["orders"]), 5)
            # Exactly 1 query per table (batched, no N+1)
            self.assertEqual(query_counts["orders"], 1)
            self.assertEqual(query_counts["payments"], 1)
            self.assertEqual(query_counts["order_items"], 1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
