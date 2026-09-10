"""BE-FIX-05A: Cross-flow order_no collision hardening for Self-order.

Tests that the Self-order /order path handles orders_store_order_no_unique
collisions with bounded retry, classifies PK collisions separately, and
preserves the self-order contract (pending_payment / unpaid / web_order,
no payment, no stock).
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException

from app.api import customer


def _make_snapshot(
    *,
    product_id: str = "prod-1",
    quantity: int = 2,
    store_id: str = "store-1",
) -> Dict[str, Any]:
    return {
        "product_id": product_id,
        "product_name": "Latte",
        "store_id": store_id,
        "quantity": quantity,
        "unit_price": 40.0,
        "unit_cost": 15.0,
        "total_price": 80.0,
        "total_cost": 30.0,
        "line_profit": 50.0,
        "base_price": 40.0,
        "base_cost": 15.0,
        "base_cost_breakdown": [
            {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
        ],
        "option_total": 0.0,
        "option_cost_total": 0.0,
        "options_snapshot": {"sweetness": 100, "addons": []},
        "addon_cost_breakdown": [],
    }


def _make_err(message: str) -> SimpleNamespace:
    """Create a fake PostgREST error object."""
    return SimpleNamespace(message=message)


class _CollidingOrdersTable:
    """Fake orders table that simulates unique constraint collisions.

    Returns errors in sequence based on the configured error schedule.
    """

    def __init__(
        self,
        *,
        success_on_attempt: int = 1,
        error_sequence: Optional[List[SimpleNamespace]] = None,
    ) -> None:
        self.success_on_attempt = success_on_attempt
        self.error_sequence = error_sequence or []
        self.attempt = 0
        self.payload: Any = None
        self.inserted_rows: List[Dict[str, Any]] = []

    def insert(self, payload: Any) -> "_CollidingOrdersTable":
        self.payload = payload
        return self

    def execute(self) -> SimpleNamespace:
        self.attempt += 1
        if self.attempt < self.success_on_attempt and self.attempt <= len(self.error_sequence):
            err = self.error_sequence[self.attempt - 1]
            return SimpleNamespace(error=err, data=None)
        # Success
        row = dict(self.payload)
        row.setdefault("id", "order-1")
        row.setdefault("order_no", row.get("order_no", "ORD-00001"))
        row.setdefault("public_token", "tok-1")
        row.setdefault("created_at", "2025-01-01T00:00:00Z")
        self.inserted_rows.append(row)
        return SimpleNamespace(error=None, data=[row])


class _FakeOrderItemsTable:
    def __init__(self) -> None:
        self.rows: List[Any] = []

    def insert(self, payload: Any) -> "_FakeOrderItemsTable":
        self.payload = payload
        return self

    def execute(self) -> SimpleNamespace:
        self.rows.append(self.payload)
        return SimpleNamespace(error=None, data=self.payload)


class _FakePaymentsTable:
    def __init__(self) -> None:
        self.rows: List[Any] = []

    def insert(self, payload: Any) -> "_FakePaymentsTable":
        self.rows.append(payload)
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(error=None, data=None)


class _FakeClient:
    def __init__(self, orders_table: Any) -> None:
        self._orders_table = orders_table
        self.order_item_rows: List[Any] = []
        self.payment_inserts: List[Any] = []

    def table(self, name: str) -> Any:
        if name == "orders":
            return self._orders_table
        if name == "order_items":
            return _FakeOrderItemsTable()
        if name == "payments":
            t = _FakePaymentsTable()
            self.payment_inserts = t.rows
            return t
        raise AssertionError(f"unexpected table {name}")


def _build_payload() -> customer.CustomerOrderCreatePayload:
    return customer.CustomerOrderCreatePayload(
        customer=customer.CustomerPayload(name="Test", phone="0801234567"),
        items=[customer.CustomerOrderItemPayload(product_id="prod-1", quantity=2)],
        pickup_time="2024-12-01T10:00:00Z",
        note=None,
    )


def _common_patches(fake_client: _FakeClient, order_numbers: List[str]):
    """Return common patch list for self-order creation."""
    snapshot = _make_snapshot()
    return [
        patch("app.api.customer._get_client", return_value=fake_client),
        patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot),
        patch("app.api.customer.order_items_supports_store_scope", return_value=True),
        patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r),
        patch("app.api.customer.recalculate_order_totals", return_value={}),
        patch("app.api.customer.generate_order_number", side_effect=order_numbers),
        patch("app.api.customer._find_or_create_customer", return_value="cust-1"),
        patch("app.api.customer._write_order_status_log_customer"),
    ]


def _run_with_patches(patches, payload):
    import contextlib
    with contextlib.ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        return customer.create_customer_order(payload)


class TestSelfOrderOrderNoCollision(unittest.TestCase):
    """BE-FIX-05A: Self-order order_no collision hardening tests."""

    # ── T01: Normal self-order (no collision) ───────────────────────

    def test_t01_normal_self_order_no_collision(self) -> None:
        """T01: No collision → one insert attempt, order created."""
        orders_table = _CollidingOrdersTable(success_on_attempt=1)
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00001"])
        response = _run_with_patches(patches, payload)

        self.assertEqual(orders_table.attempt, 1)
        self.assertEqual(response["status"], "pending_payment")
        self.assertEqual(response["payment_status"], "unpaid")
        self.assertEqual(orders_table.inserted_rows[0]["order_source"], "web_order")

    # ── T02: First order_no collision, second succeeds ──────────────

    def test_t02_first_collision_then_success(self) -> None:
        """T02: First attempt hits orders_store_order_no_unique, second succeeds."""
        err = _make_err(
            'duplicate key value violates unique constraint "orders_store_order_no_unique"'
        )
        orders_table = _CollidingOrdersTable(
            success_on_attempt=2,
            error_sequence=[err],
        )
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00021", "ORD-00022"])
        response = _run_with_patches(patches, payload)

        self.assertEqual(orders_table.attempt, 2)
        self.assertEqual(orders_table.inserted_rows[0]["order_no"], "ORD-00022")
        self.assertEqual(response["status"], "pending_payment")

    # ── T03: Multiple collisions, then success ───────────────────────

    def test_t03_multiple_collisions_then_success(self) -> None:
        """T03: Attempts 1-3 collide, attempt 4 succeeds."""
        err = _make_err(
            'duplicate key value violates unique constraint "orders_store_order_no_unique"'
        )
        orders_table = _CollidingOrdersTable(
            success_on_attempt=4,
            error_sequence=[err, err, err],
        )
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(
            fake_client,
            ["ORD-00021", "ORD-00022", "ORD-00023", "ORD-00024"],
        )
        response = _run_with_patches(patches, payload)

        self.assertEqual(orders_table.attempt, 4)
        self.assertEqual(orders_table.inserted_rows[0]["order_no"], "ORD-00024")
        self.assertEqual(response["status"], "pending_payment")

    # ── T04: Retry exhausted ────────────────────────────────────────

    def test_t04_retry_exhausted(self) -> None:
        """T04: All 5 attempts collide → safe 503 failure."""
        err = _make_err(
            'duplicate key value violates unique constraint "orders_store_order_no_unique"'
        )
        orders_table = _CollidingOrdersTable(
            success_on_attempt=99,
            error_sequence=[err, err, err, err, err, err, err, err, err, err],
        )
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(
            fake_client,
            ["ORD-00021", "ORD-00022", "ORD-00023", "ORD-00024", "ORD-00025", "ORD-00026"],
        )
        with self.assertRaises(HTTPException) as ctx_err:
            _run_with_patches(patches, payload)

        self.assertEqual(ctx_err.exception.status_code, 503)
        self.assertEqual(ctx_err.exception.detail, "order_no_generation_exhausted")
        # Should have attempted exactly 5 times (not infinite)
        self.assertEqual(orders_table.attempt, 5)

    # ── T05: PK collision not treated as order_no retry ─────────────

    def test_t05_pk_collision_not_treated_as_order_no_retry(self) -> None:
        """T05: orders_pkey collision → 500, no order_no retry."""
        err = _make_err(
            'duplicate key value violates unique constraint "orders_pkey"'
        )
        orders_table = _CollidingOrdersTable(
            success_on_attempt=99,
            error_sequence=[err],
        )
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00001", "ORD-00002"])
        with self.assertRaises(HTTPException) as ctx_err:
            _run_with_patches(patches, payload)

        self.assertEqual(ctx_err.exception.status_code, 500)
        self.assertEqual(ctx_err.exception.detail, "customer_order_create_failed")
        # Should NOT have retried with a new order_no
        self.assertEqual(orders_table.attempt, 1)

    # ── T06: Unknown unique constraint re-raised ────────────────────

    def test_t06_unknown_unique_constraint_reraised(self) -> None:
        """T06: Unknown unique violation → 500, no retry."""
        err = _make_err(
            'duplicate key value violates unique constraint "some_unknown_constraint"'
        )
        orders_table = _CollidingOrdersTable(
            success_on_attempt=99,
            error_sequence=[err],
        )
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00001", "ORD-00002"])
        with self.assertRaises(HTTPException) as ctx_err:
            _run_with_patches(patches, payload)

        self.assertEqual(ctx_err.exception.status_code, 500)
        self.assertEqual(ctx_err.exception.detail, "customer_order_create_failed")
        self.assertEqual(orders_table.attempt, 1)

    # ── T07: Order number format preserved ──────────────────────────

    def test_t07_order_number_format_preserved(self) -> None:
        """T07: All generated order numbers match ORD-XXXXX format."""
        import re
        orders_table = _CollidingOrdersTable(success_on_attempt=1)
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00001"])
        response = _run_with_patches(patches, payload)

        order_no = response["order_no"]
        self.assertIsNotNone(order_no)
        self.assertTrue(
            re.match(r"^ORD-\d{5}$", order_no),
            f"order_no {order_no} does not match ORD-XXXXX format",
        )

    # ── T08: Self-order contract preserved ──────────────────────────

    def test_t08_self_order_contract_preserved(self) -> None:
        """T08: Self-order remains web_order, pending_payment, unpaid."""
        orders_table = _CollidingOrdersTable(success_on_attempt=1)
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00001"])
        response = _run_with_patches(patches, payload)

        row = orders_table.inserted_rows[0]
        self.assertEqual(row["status"], "pending_payment")
        self.assertEqual(row["payment_status"], "unpaid")
        self.assertEqual(row["order_source"], "web_order")

    # ── T09: No payment row created ──────────────────────────────────

    def test_t09_no_payment_row_created(self) -> None:
        """T09: Self-order creation creates no payment row."""
        orders_table = _CollidingOrdersTable(success_on_attempt=1)
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00001"])
        _run_with_patches(patches, payload)

        self.assertEqual(fake_client.payment_inserts, [])

    # ── T10: No stock movement created ──────────────────────────────

    def test_t10_no_stock_movement_created(self) -> None:
        """T10: Self-order creation creates no stock movement.

        The customer self-order path does not import or call any
        stock-related functions. We verify by asserting that the
        fake client's table() method is never called with
        'stock_movements' or 'ingredients'.
        """
        orders_table = _CollidingOrdersTable(success_on_attempt=1)
        fake_client = _FakeClient(orders_table)
        # Track all table accesses
        accessed_tables: List[str] = []
        original_table = fake_client.table

        def tracking_table(name: str) -> Any:
            accessed_tables.append(name)
            return original_table(name)

        fake_client.table = tracking_table  # type: ignore
        payload = _build_payload()
        patches = _common_patches(fake_client, ["ORD-00001"])
        _run_with_patches(patches, payload)

        self.assertNotIn("stock_movements", accessed_tables)
        self.assertNotIn("ingredients", accessed_tables)


class TestCrossFlowOrderNoCollision(unittest.TestCase):
    """BE-FIX-05A: Cross-flow design test (Kiosk vs Self-order)."""

    def test_cross_flow_kiosk_takes_ord_21_self_order_retries(self) -> None:
        """Cross-flow: Kiosk obtains ORD-00021, Self-order retries to ORD-00022.

        Scenario:
        - Kiosk obtains ORD-00021 via DB-side generate_kiosk_order_no_atomic
        - Self-order first attempts ORD-00021
        - Self-order INSERT receives orders_store_order_no_unique
        - Self-order regenerates ORD-00022
        - Self-order succeeds

        This is mocked/unit-tested. No Production writes.
        """
        err = _make_err(
            'duplicate key value violates unique constraint "orders_store_order_no_unique"'
        )
        orders_table = _CollidingOrdersTable(
            success_on_attempt=2,
            error_sequence=[err],
        )
        fake_client = _FakeClient(orders_table)
        payload = _build_payload()
        # First attempt: ORD-00021 (collides with Kiosk)
        # Second attempt: ORD-00022 (succeeds)
        patches = _common_patches(fake_client, ["ORD-00021", "ORD-00022"])
        response = _run_with_patches(patches, payload)

        self.assertEqual(orders_table.attempt, 2)
        self.assertEqual(orders_table.inserted_rows[0]["order_no"], "ORD-00022")
        self.assertEqual(response["status"], "pending_payment")
        self.assertEqual(response["payment_status"], "unpaid")


class TestClassifyUniqueViolation(unittest.TestCase):
    """Unit tests for _classify_unique_violation helper."""

    def test_classify_order_no_unique(self) -> None:
        err = _make_err(
            'duplicate key value violates unique constraint "orders_store_order_no_unique"'
        )
        self.assertEqual(
            customer._classify_unique_violation(err),
            "orders_store_order_no_unique",
        )

    def test_classify_pkey(self) -> None:
        err = _make_err(
            'duplicate key value violates unique constraint "orders_pkey"'
        )
        self.assertEqual(customer._classify_unique_violation(err), "orders_pkey")

    def test_classify_public_token(self) -> None:
        err = _make_err(
            'duplicate key value violates unique constraint "orders_public_token_key"'
        )
        self.assertEqual(
            customer._classify_unique_violation(err),
            "orders_public_token_key",
        )

    def test_classify_unknown(self) -> None:
        err = _make_err(
            'duplicate key value violates unique constraint "some_other_constraint"'
        )
        self.assertEqual(customer._classify_unique_violation(err), "unknown")

    def test_classify_not_unique(self) -> None:
        err = _make_err("connection refused")
        self.assertEqual(customer._classify_unique_violation(err), "not_unique")

    def test_classify_fallback_order_no_in_message(self) -> None:
        """Fallback: message contains 'order_no' but not the constraint name."""
        err = _make_err("duplicate key value violates order_no")
        self.assertEqual(
            customer._classify_unique_violation(err),
            "orders_store_order_no_unique",
        )

    def test_classify_fallback_public_token_in_message(self) -> None:
        """Fallback: message contains 'public_token' but not the constraint name."""
        err = _make_err("duplicate key value violates public_token")
        self.assertEqual(
            customer._classify_unique_violation(err),
            "orders_public_token_key",
        )


if __name__ == "__main__":
    unittest.main()
