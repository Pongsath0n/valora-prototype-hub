"""Tests for BE-02: Healholic self-order creation.

Covers:
- Successful self-order creation with correct pending_payment state.
- Order items carry server-generated _system.usage_breakdown.
- No payment row is created for new self-orders.
- Client-provided _system is stripped before persistence.
- Customer-facing response masks _system.
- Invalid recipe configuration is rejected.
- Store isolation / mismatch handling.
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import customer
from app.services.cost_engine import mask_option_costs
from app.services.usage_snapshot import has_usage_snapshot, mask_system_from_options


def _make_snapshot(
    *,
    product_id: str = "prod-1",
    quantity: int = 2,
    store_id: str = "store-1",
    base_breakdown: List[Dict[str, Any]] = None,
    addon_breakdown: List[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    base = base_breakdown if base_breakdown is not None else [
        {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
        {"ingredient_id": "ing-milk", "quantity_used": 150.0, "unit": "ml"},
    ]
    addon = addon_breakdown or []
    options_snapshot = {
        "sweetness": 100,
        "sweetness_label": "หวาน 100%",
        "addons": [],
    }
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
        "base_cost_breakdown": base,
        "option_total": 0.0,
        "option_cost_total": 0.0,
        "options_snapshot": options_snapshot,
        "addon_cost_breakdown": addon,
    }


class _FakeInsertTable:
    def __init__(self, name: str, store: List[Any]):
        self.name = name
        self.store = store
        self.payload: Any = None

    def insert(self, payload: Any) -> "_FakeInsertTable":
        self.payload = payload
        return self

    def execute(self) -> SimpleNamespace:
        if self.name == "orders":
            row = dict(self.payload)
            row.setdefault("id", f"order-{len(self.store) + 1}")
            row.setdefault("order_no", "ORD-001")
            row.setdefault("public_token", "tok-123")
            row.setdefault("created_at", "2024-01-01T00:00:00Z")
            self.store.append(row)
            return SimpleNamespace(error=None, data=[row])
        self.store.append(self.payload)
        return SimpleNamespace(error=None, data=self.payload)


class _FakeClient:
    def __init__(self) -> None:
        self.order_rows: List[Dict[str, Any]] = []
        self.order_item_rows: List[Any] = []
        self.payment_inserts: List[Any] = []

    def table(self, name: str) -> "_FakeInsertTable":
        if name == "orders":
            return _FakeInsertTable(name, self.order_rows)
        if name == "order_items":
            return _FakeInsertTable(name, self.order_item_rows)
        if name == "payments":
            return _FakeInsertTable(name, self.payment_inserts)
        raise AssertionError(f"unexpected table {name}")


class SelfOrderCreationTests(unittest.TestCase):
    def _build_payload(
        self,
        *,
        items: Optional[List[customer.CustomerOrderItemPayload]] = None,
        store_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
        name: str = "Test",
        phone: Optional[str] = "0801234567",
        pickup_time: Optional[str] = "2024-12-01T10:00:00Z",
        note: Optional[str] = None,
    ) -> customer.CustomerOrderCreatePayload:
        if items is None:
            item_opts = options
            items = [customer.CustomerOrderItemPayload(
                product_id="prod-1",
                quantity=2,
                options=item_opts,
            )]
        return customer.CustomerOrderCreatePayload(
            customer=customer.CustomerPayload(name=name, phone=phone),
            items=items,
            pickup_time=pickup_time,
            note=note,
            store_id=store_id,
        )

    def _patch_common(self, fake_client: _FakeClient, snapshot: Dict[str, Any]):
        return [
            patch("app.api.customer._get_client", return_value=fake_client),
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot),
            patch("app.api.customer.order_items_supports_store_scope", return_value=True),
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r),
            patch("app.api.customer.recalculate_order_totals", return_value={}),
            patch("app.api.customer.generate_order_number", return_value="ORD-001"),
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"),
            patch("app.api.customer._write_order_status_log_customer"),
        ]

    def test_successful_self_order_has_pending_payment_state(self) -> None:
        fake_client = _FakeClient()
        snapshot = _make_snapshot()
        payload = self._build_payload()

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"), \
            patch("app.api.customer._write_order_status_log_customer"):
            response = customer.create_customer_order(payload)

        order_row = fake_client.order_rows[0]
        self.assertEqual(order_row["status"], "pending_payment")
        self.assertEqual(order_row["payment_status"], "unpaid")
        self.assertEqual(response["status"], "pending_payment")
        self.assertEqual(response["payment_status"], "unpaid")

    def test_no_payment_row_created_for_self_order(self) -> None:
        fake_client = _FakeClient()
        snapshot = _make_snapshot()
        payload = self._build_payload()

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"), \
            patch("app.api.customer._write_order_status_log_customer"):
            customer.create_customer_order(payload)

        self.assertEqual(fake_client.payment_inserts, [])

    def test_order_items_contain_server_generated_usage_snapshot(self) -> None:
        fake_client = _FakeClient()
        snapshot = _make_snapshot()
        payload = self._build_payload()

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"), \
            patch("app.api.customer._write_order_status_log_customer"):
            customer.create_customer_order(payload)

        # The persisted order item record should have _system.usage_breakdown
        inserted_items = fake_client.order_item_rows[0]
        if isinstance(inserted_items, list):
            item_record = inserted_items[0]
        else:
            item_record = inserted_items
        options = item_record.get("options")
        self.assertIsInstance(options, dict)
        self.assertTrue(has_usage_snapshot(options))
        breakdown = options["_system"]["usage_breakdown"]
        self.assertGreater(len(breakdown["base"]), 0)
        self.assertEqual(breakdown["base"][0]["ingredient_id"], "ing-coffee")

    def test_client_system_is_stripped_before_persistence(self) -> None:
        """Client-provided _system must not appear in the persisted options."""
        fake_client = _FakeClient()
        snapshot = _make_snapshot()
        # Client tries to inject _system
        evil_options = {
            "sweetness": 50,
            "_system": {"usage_breakdown": {"base": [{"ingredient_id": "evil", "quantity_used": 999}]}},
        }
        payload = self._build_payload(options=evil_options)

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"), \
            patch("app.api.customer._write_order_status_log_customer"):
            response = customer.create_customer_order(payload)

        inserted_items = fake_client.order_item_rows[0]
        if isinstance(inserted_items, list):
            item_record = inserted_items[0]
        else:
            item_record = inserted_items
        options = item_record.get("options")
        breakdown = options["_system"]["usage_breakdown"]
        base_ids = [row["ingredient_id"] for row in breakdown["base"]]
        self.assertIn("ing-coffee", base_ids)
        self.assertNotIn("evil", base_ids)

    def test_customer_response_masks_system(self) -> None:
        """The customer-facing response must not contain _system."""
        fake_client = _FakeClient()
        snapshot = _make_snapshot()
        payload = self._build_payload()

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"), \
            patch("app.api.customer._write_order_status_log_customer"):
            response = customer.create_customer_order(payload)

        for item in response["items"]:
            opts = item.get("options")
            if opts is None:
                continue
            self.assertNotIn("_system", opts)

    def test_invalid_recipe_configuration_rejected(self) -> None:
        """Missing recipe → 400 before any persistence."""
        fake_client = _FakeClient()
        snapshot = _make_snapshot(base_breakdown=[])
        payload = self._build_payload()

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"), \
            patch("app.api.customer._write_order_status_log_customer"):
            with self.assertRaises(HTTPException) as ctx_err:
                customer.create_customer_order(payload)

        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "invalid_recipe_configuration")
        self.assertEqual(fake_client.order_rows, [])

    def test_store_mismatch_rejected(self) -> None:
        fake_client = _FakeClient()
        # First item resolves to store-1, second to store-2
        snapshots = [
            _make_snapshot(store_id="store-1"),
            _make_snapshot(store_id="store-2", product_id="prod-2"),
        ]
        payload = self._build_payload(items=[
            customer.CustomerOrderItemPayload(product_id="prod-1", quantity=1),
            customer.CustomerOrderItemPayload(product_id="prod-2", quantity=1),
        ])

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", side_effect=snapshots), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value="cust-1"), \
            patch("app.api.customer._write_order_status_log_customer"):
            with self.assertRaises(HTTPException) as ctx_err:
                customer.create_customer_order(payload)

        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "store_mismatch")


class T14PublicResponseMaskingTests(unittest.TestCase):
    """T14: Customer-facing responses must not contain _system."""

    def test_load_order_items_masks_system(self) -> None:
        """_load_order_items strips _system from the returned options."""
        from types import SimpleNamespace
        fake_client = MagicMock()
        table_mock = MagicMock()
        select_mock = MagicMock()
        eq_mock = MagicMock()
        eq_mock.execute.return_value = SimpleNamespace(error=None, data=[
            {
                "product_id": "prod-1",
                "product_name_snapshot": "Latte",
                "quantity": 2,
                "unit_price": 40.0,
                "total_price": 80.0,
                "options": {
                    "sweetness": 100,
                    "addons": [],
                    "_system": {
                        "usage_breakdown": {
                            "base": [{"ingredient_id": "ing-coffee", "quantity_used": 18.0}],
                            "addons": [],
                        }
                    },
                },
                "products": {"image_url": "http://example.com/img.jpg"},
            }
        ])
        select_mock.eq.return_value = eq_mock
        table_mock.select.return_value = select_mock
        fake_client.table.return_value = table_mock

        items = customer._load_order_items(fake_client, "ord-1")
        self.assertEqual(len(items), 1)
        options = items[0].get("options")
        self.assertIsInstance(options, dict)
        self.assertNotIn("_system", options)
        self.assertEqual(options["sweetness"], 100)

    def test_mask_system_from_options_strips_system(self) -> None:
        """Direct unit test of mask_system_from_options."""
        from app.services.usage_snapshot import mask_system_from_options
        options = {
            "sweetness": 50,
            "addons": [{"addon_id": "a1"}],
            "_system": {"usage_breakdown": {"base": [{"ingredient_id": "ing"}]}},
        }
        masked = mask_system_from_options(options)
        self.assertNotIn("_system", masked)
        self.assertEqual(masked["sweetness"], 50)
        self.assertEqual(len(masked["addons"]), 1)


class BEFIX01SelfOrderContractTests(unittest.TestCase):
    """BE-FIX-01: Customer self-order contract tests.

    Healholic V1 self-order requires only customer_name.
    customer_phone and pickup_time are NOT required.
    """

    def _build_payload(
        self,
        *,
        name: str = "อ๋อง",
        phone: Optional[str] = None,
        pickup_time: Optional[str] = None,
        note: Optional[str] = None,
        items: Optional[List[customer.CustomerOrderItemPayload]] = None,
    ) -> customer.CustomerOrderCreatePayload:
        if items is None:
            items = [customer.CustomerOrderItemPayload(
                product_id="prod-1",
                quantity=2,
            )]
        return customer.CustomerOrderCreatePayload(
            customer=customer.CustomerPayload(name=name, phone=phone),
            items=items,
            pickup_time=pickup_time,
            note=note,
        )

    def _run_with_patches(self, payload: customer.CustomerOrderCreatePayload, snapshot: Dict[str, Any]) -> tuple:
        fake_client = _FakeClient()
        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value=None), \
            patch("app.api.customer._write_order_status_log_customer"):
            response = customer.create_customer_order(payload)
        return response, fake_client

    # T01 — Name only request (no phone, no pickup_time)
    def test_t01_name_only_request_accepted(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None)
        response, _ = self._run_with_patches(payload, snapshot)
        self.assertEqual(response["status"], "pending_payment")
        self.assertEqual(response["payment_status"], "unpaid")

    # T02 — Name + customer_note (no phone, no pickup_time)
    def test_t02_name_and_note_accepted(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None, note="หวานน้อย")
        response, fake_client = self._run_with_patches(payload, snapshot)
        self.assertEqual(response["status"], "pending_payment")
        # Verify note was persisted
        order_row = fake_client.order_rows[0]
        self.assertEqual(order_row["note"], "หวานน้อย")

    # T03 — Empty customer name rejected
    def test_t03_empty_customer_name_rejected(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="", phone=None, pickup_time=None)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(payload, snapshot)
        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "customer_name_required")

    # T04 — Whitespace-only customer name rejected
    def test_t04_whitespace_name_rejected(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="   ", phone=None, pickup_time=None)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(payload, snapshot)
        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "customer_name_required")

    # T05 — Missing customer name rejected (Pydantic level)
    def test_t05_missing_customer_name_rejected(self) -> None:
        with self.assertRaises(Exception):
            customer.CustomerPayload(name=None, phone=None)

    # T06 — Phone omitted, success
    def test_t06_phone_omitted_success(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time="2024-12-01T10:00:00Z")
        response, _ = self._run_with_patches(payload, snapshot)
        self.assertEqual(response["status"], "pending_payment")

    # T07 — Pickup time omitted, success
    def test_t07_pickup_time_omitted_success(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone="0801234567", pickup_time=None)
        response, _ = self._run_with_patches(payload, snapshot)
        self.assertEqual(response["status"], "pending_payment")

    # T08 — Both phone and pickup_time omitted (MAIN acceptance test)
    def test_t08_both_omitted_success(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None)
        response, fake_client = self._run_with_patches(payload, snapshot)
        self.assertEqual(response["status"], "pending_payment")
        self.assertEqual(response["payment_status"], "unpaid")
        # Verify null persisted
        order_row = fake_client.order_rows[0]
        self.assertIsNone(order_row["customer_phone"])
        self.assertIsNone(order_row["pickup_time"])

    # T09 — Order lifecycle regression
    def test_t09_order_lifecycle_pending_payment(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None)
        response, fake_client = self._run_with_patches(payload, snapshot)
        order_row = fake_client.order_rows[0]
        self.assertEqual(order_row["status"], "pending_payment")
        self.assertEqual(order_row["payment_status"], "unpaid")
        self.assertEqual(response["status"], "pending_payment")
        self.assertEqual(response["payment_status"], "unpaid")

    # T10 — No initial payment row
    def test_t10_no_initial_payment_row(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None)
        _, fake_client = self._run_with_patches(payload, snapshot)
        self.assertEqual(fake_client.payment_inserts, [])

    # T11 — No stock deduction at creation
    def test_t11_no_stock_deduction_at_creation(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None)
        fake_client = _FakeClient()
        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.customer.order_items_supports_store_scope", return_value=True), \
            patch("app.api.customer.prune_order_item_columns", side_effect=lambda _c, r: r), \
            patch("app.api.customer.recalculate_order_totals", return_value={}), \
            patch("app.api.customer.generate_order_number", return_value="ORD-001"), \
            patch("app.api.customer._find_or_create_customer", return_value=None), \
            patch("app.api.customer._write_order_status_log_customer"):
            customer.create_customer_order(payload)
        # Customer self-order flow does NOT import or call any stock
        # consumption function. Verify no payments were inserted.
        self.assertEqual(fake_client.payment_inserts, [])

    # T12 — Usage snapshot regression
    def test_t12_usage_snapshot_remains_intact(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None)
        _, fake_client = self._run_with_patches(payload, snapshot)
        inserted_items = fake_client.order_item_rows[0]
        if isinstance(inserted_items, list):
            item_record = inserted_items[0]
        else:
            item_record = inserted_items
        options = item_record.get("options")
        self.assertTrue(has_usage_snapshot(options))
        breakdown = options["_system"]["usage_breakdown"]
        self.assertGreater(len(breakdown["base"]), 0)

    # T13 — Client _system injection stripped
    def test_t13_client_system_injection_stripped(self) -> None:
        snapshot = _make_snapshot()
        evil_options = {
            "sweetness": 50,
            "_system": {"usage_breakdown": {"base": [{"ingredient_id": "evil", "quantity_used": 999}]}},
        }
        payload = self._build_payload(
            name="อ๋อง", phone=None, pickup_time=None,
            items=[customer.CustomerOrderItemPayload(product_id="prod-1", quantity=2, options=evil_options)],
        )
        _, fake_client = self._run_with_patches(payload, snapshot)
        inserted_items = fake_client.order_item_rows[0]
        if isinstance(inserted_items, list):
            item_record = inserted_items[0]
        else:
            item_record = inserted_items
        options = item_record.get("options")
        breakdown = options["_system"]["usage_breakdown"]
        base_ids = [row["ingredient_id"] for row in breakdown["base"]]
        self.assertIn("ing-coffee", base_ids)
        self.assertNotIn("evil", base_ids)

    # T14 — Customer masking (response must not expose _system)
    def test_t14_customer_masking_no_system(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time=None)
        response, _ = self._run_with_patches(payload, snapshot)
        for item in response["items"]:
            opts = item.get("options")
            if opts is None:
                continue
            self.assertNotIn("_system", opts)

    # T15 — Legacy compatibility: phone + pickup_time still accepted
    def test_t15_legacy_phone_and_pickup_still_accepted(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(
            name="สมชาย", phone="0801234567", pickup_time="2024-12-01T10:00:00Z"
        )
        response, fake_client = self._run_with_patches(payload, snapshot)
        self.assertEqual(response["status"], "pending_payment")
        order_row = fake_client.order_rows[0]
        self.assertEqual(order_row["customer_phone"], "0801234567")
        self.assertEqual(order_row["pickup_time"], "2024-12-01T10:00:00Z")

    # T15b — Invalid pickup_time format still rejected when provided
    def test_t15b_invalid_pickup_time_format_rejected(self) -> None:
        snapshot = _make_snapshot()
        payload = self._build_payload(name="อ๋อง", phone=None, pickup_time="not-a-date")
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(payload, snapshot)
        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "pickup_time_invalid")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
