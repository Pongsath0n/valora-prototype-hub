"""Focused tests for the Healholic V1 stock consumption service.

Covers:
1. Recipe usage calculation (base recipe).
2. quantity > 1 multiplication.
3. Addon recipe usage.
4. Duplicate ingredient aggregation within one order item.
5. Packaging/consumable usage (treated like any recipe component).
6. RPC payload structure.
7. Missing recipe/config failure.
8. consume_for_paid_order actor/store/order context.
9. Duplicate stock application returns safe result (idempotency contract).
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, List
from unittest.mock import patch

from app.services.stock_service import (
    MOVEMENT_REASON_POS_SALE,
    StockSyncFailedError,
    StockUsageError,
    build_usage_plan,
    consume_for_paid_order,
)


def _base_detail(ingredient_id: str, qty: float, unit: str = "g") -> Dict[str, Any]:
    return {
        "ingredient_id": ingredient_id,
        "quantity_used": qty,
        "unit": unit,
        "cost_per_unit": 1.0,
        "line_cost": qty,
        "ingredient_name": ingredient_id,
        "cost_type": "ingredient",
        "issues": [],
    }


def _addon_detail(ingredient_id: str, addon_id: str, qty: float) -> Dict[str, Any]:
    return {
        "ingredient_id": ingredient_id,
        "quantity_used": qty,
        "cost_per_unit": 1.0,
        "line_cost": qty,
        "ingredient_name": ingredient_id,
        "addon_id": addon_id,
    }


def _snapshot(
    *,
    quantity: int,
    base_breakdown: List[Dict[str, Any]],
    addon_breakdown: List[Dict[str, Any]] = None,
    addon_snapshots: List[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    options_snapshot: Dict[str, Any] = {"sweetness": 100, "addons": addon_snapshots or []}
    return {
        "product_id": "prod-1",
        "quantity": quantity,
        "base_cost_breakdown": base_breakdown,
        "addon_cost_breakdown": addon_breakdown or [],
        "options_snapshot": options_snapshot,
    }


class BuildUsagePlanTests(unittest.TestCase):
    def test_base_recipe_usage_for_single_item(self) -> None:
        snapshot = _snapshot(
            quantity=1,
            base_breakdown=[_base_detail("ing-coffee", 18.0, "g"), _base_detail("ing-milk", 150.0, "ml")],
        )
        plan = build_usage_plan([{"id": "oi-1", "quantity": 1, "snapshot": snapshot}])
        by_ing = {row["ingredient_id"]: row for row in plan}
        self.assertEqual(by_ing["ing-coffee"]["quantity"], 18.0)
        self.assertEqual(by_ing["ing-milk"]["quantity"], 150.0)
        for row in plan:
            self.assertEqual(row["order_item_id"], "oi-1")
            self.assertIn("ingredient_id", row)
            self.assertGreater(row["quantity"], 0)

    def test_quantity_greater_than_one_multiplies_base_recipe(self) -> None:
        snapshot = _snapshot(
            quantity=2,
            base_breakdown=[_base_detail("ing-coffee", 18.0, "g")],
        )
        plan = build_usage_plan([{"id": "oi-1", "quantity": 2, "snapshot": snapshot}])
        coffee = next(row for row in plan if row["ingredient_id"] == "ing-coffee")
        self.assertEqual(coffee["quantity"], 36.0)

    def test_addon_recipe_usage_multiplied_by_addon_qty_and_item_qty(self) -> None:
        # Latte x2, Extra Shot x1 per cup -> coffee usage = 18 * 1 * 2 = 36
        addon_snapshots = [{"addon_id": "addon-shot", "quantity": 1, "unit_price": 10, "unit_cost": 5}]
        snapshot = _snapshot(
            quantity=2,
            base_breakdown=[_base_detail("ing-coffee", 18.0, "g")],
            addon_breakdown=[_addon_detail("ing-coffee", "addon-shot", 18.0)],
            addon_snapshots=addon_snapshots,
        )
        plan = build_usage_plan([{"id": "oi-1", "quantity": 2, "snapshot": snapshot}])
        coffee = next(row for row in plan if row["ingredient_id"] == "ing-coffee")
        # base 18*2=36 + addon 18*1*2=36 = 72
        self.assertEqual(coffee["quantity"], 72.0)

    def test_duplicate_ingredient_aggregation_within_one_order_item(self) -> None:
        # Coffee appears in both base recipe and addon recipe for the same item.
        addon_snapshots = [{"addon_id": "addon-shot", "quantity": 1}]
        snapshot = _snapshot(
            quantity=1,
            base_breakdown=[_base_detail("ing-coffee", 18.0)],
            addon_breakdown=[_addon_detail("ing-coffee", "addon-shot", 18.0)],
            addon_snapshots=addon_snapshots,
        )
        plan = build_usage_plan([{"id": "oi-1", "quantity": 1, "snapshot": snapshot}])
        coffee_rows = [row for row in plan if row["ingredient_id"] == "ing-coffee"]
        self.assertEqual(len(coffee_rows), 1)
        self.assertEqual(coffee_rows[0]["quantity"], 36.0)
        self.assertEqual(coffee_rows[0]["order_item_id"], "oi-1")

    def test_packaging_and_consumable_components_are_consumed(self) -> None:
        snapshot = _snapshot(
            quantity=1,
            base_breakdown=[
                _base_detail("ing-coffee", 18.0, "g"),
                _base_detail("ing-milk", 150.0, "ml"),
                _base_detail("ing-cup", 1.0, "pcs"),
                _base_detail("ing-lid", 1.0, "pcs"),
            ],
        )
        plan = build_usage_plan([{"id": "oi-1", "quantity": 1, "snapshot": snapshot}])
        by_ing = {row["ingredient_id"]: row for row in plan}
        self.assertEqual(by_ing["ing-cup"]["quantity"], 1.0)
        self.assertEqual(by_ing["ing-lid"]["quantity"], 1.0)
        self.assertEqual(len(plan), 4)

    def test_missing_snapshot_raises_stock_usage_error(self) -> None:
        with self.assertRaises(StockUsageError) as ctx:
            build_usage_plan([{"id": "oi-1", "quantity": 1}])
        self.assertEqual(ctx.exception.reason, "missing_recipe")

    def test_missing_base_breakdown_raises_stock_usage_error(self) -> None:
        snapshot = {"quantity": 1, "base_cost_breakdown": [], "addon_cost_breakdown": [], "options_snapshot": {"addons": []}}
        with self.assertRaises(StockUsageError) as ctx:
            build_usage_plan([{"id": "oi-1", "quantity": 1, "snapshot": snapshot}])
        self.assertEqual(ctx.exception.reason, "missing_recipe")

    def test_empty_order_items_returns_empty_plan(self) -> None:
        self.assertEqual(build_usage_plan([]), [])

    def test_zero_quantity_item_is_skipped(self) -> None:
        snapshot = _snapshot(quantity=0, base_breakdown=[_base_detail("ing-coffee", 18.0)])
        plan = build_usage_plan([{"id": "oi-1", "quantity": 0, "snapshot": snapshot}])
        self.assertEqual(plan, [])


class _FakeRpcClient:
    def __init__(self, *, error: Any = None, data: Any = None, raise_exc: Exception = None) -> None:
        self.error = error
        self.data = data
        self.raise_exc = raise_exc
        self.last_call: Dict[str, Any] = {}
        self.call_count: int = 0

    class _RpcBuilder:
        def __init__(self, parent: "_FakeRpcClient", name: str, params: Dict[str, Any]) -> None:
            self.parent = parent
            self.name = name
            self.params = params

        def execute(self) -> SimpleNamespace:
            self.parent.call_count += 1
            self.parent.last_call = {"name": self.name, "params": self.params}
            if self.parent.raise_exc is not None:
                raise self.parent.raise_exc
            return SimpleNamespace(error=self.parent.error, data=self.parent.data)

    def rpc(self, name: str, params: Dict[str, Any]) -> "_RpcBuilder":
        return _FakeRpcClient._RpcBuilder(self, name, params)


class ConsumeForPaidOrderTests(unittest.TestCase):
    def _usage_plan(self) -> List[Dict[str, Any]]:
        return [
            {"order_item_id": "oi-1", "ingredient_id": "ing-coffee", "quantity": 36.0},
            {"order_item_id": "oi-1", "ingredient_id": "ing-milk", "quantity": 150.0},
        ]

    def test_successful_rpc_call_payload_structure(self) -> None:
        client = _FakeRpcClient(data={"applied": 2, "order_id": "ord-1"})
        result = consume_for_paid_order(
            client,
            store_id="store-1",
            order_id="ord-1",
            actor_id="actor-1",
            usage_plan=self._usage_plan(),
        )
        self.assertEqual(client.last_call["name"], "apply_order_stock_usage")
        params = client.last_call["params"]
        self.assertEqual(params["p_store_id"], "store-1")
        self.assertEqual(params["p_order_id"], "ord-1")
        self.assertEqual(params["p_actor_id"], "actor-1")
        self.assertEqual(len(params["p_usage"]), 2)
        self.assertEqual(params["p_usage"][0]["order_item_id"], "oi-1")
        self.assertEqual(params["p_usage"][0]["ingredient_id"], "ing-coffee")
        self.assertGreater(params["p_usage"][0]["quantity"], 0)
        self.assertEqual(result["applied"], 2)

    def test_missing_context_raises(self) -> None:
        client = _FakeRpcClient()
        with self.assertRaises(StockUsageError) as ctx:
            consume_for_paid_order(
                client,
                store_id="",
                order_id="ord-1",
                actor_id="actor-1",
                usage_plan=self._usage_plan(),
            )
        self.assertEqual(ctx.exception.reason, "missing_context")

    def test_empty_usage_plan_is_noop(self) -> None:
        client = _FakeRpcClient()
        result = consume_for_paid_order(
            client,
            store_id="store-1",
            order_id="ord-1",
            actor_id="actor-1",
            usage_plan=[],
        )
        self.assertEqual(result["applied"], 0)
        # RPC should not be invoked for empty plan.
        self.assertEqual(client.last_call, {})

    def test_rpc_exception_raises_stock_sync_failed_after_retries(self) -> None:
        # FIX-C: transient RPC exceptions are retried; after all retries
        # fail, StockSyncFailedError is raised with order context.
        client = _FakeRpcClient(raise_exc=RuntimeError("network down"))
        with patch("app.services.stock_service.time.sleep"):
            with self.assertRaises(StockSyncFailedError) as ctx:
                consume_for_paid_order(
                    client,
                    store_id="store-1",
                    order_id="ord-1",
                    actor_id="actor-1",
                    usage_plan=self._usage_plan(),
                    order_no="ORD-001",
                )
        self.assertEqual(ctx.exception.reason, "stock_sync_failed")
        self.assertEqual(ctx.exception.order_id, "ord-1")
        self.assertEqual(ctx.exception.order_no, "ORD-001")
        # Should have been called 3 times (initial + 2 retries)
        self.assertEqual(client.call_count, 3)

    def test_rpc_error_raises_stock_sync_failed_after_retries(self) -> None:
        # FIX-C: transient RPC errors are retried; after all retries
        # fail, StockSyncFailedError is raised with order context.
        client = _FakeRpcClient(error=SimpleNamespace(message="boom"))
        with patch("app.services.stock_service.time.sleep"):
            with self.assertRaises(StockSyncFailedError) as ctx:
                consume_for_paid_order(
                    client,
                    store_id="store-1",
                    order_id="ord-1",
                    actor_id="actor-1",
                    usage_plan=self._usage_plan(),
                    order_no="ORD-002",
                )
        self.assertEqual(ctx.exception.reason, "stock_sync_failed")
        self.assertEqual(ctx.exception.order_id, "ord-1")
        self.assertEqual(ctx.exception.order_no, "ORD-002")
        self.assertEqual(client.call_count, 3)

    def test_transient_rpc_error_succeeds_on_retry(self) -> None:
        # FIX-C: if the first attempt fails but the retry succeeds,
        # consume_for_paid_order returns normally.
        client = _FakeRpcClient(data={"applied": 2, "status": "ok"})
        # Make the first call raise, then succeed on retry
        original_raise_exc = client.raise_exc
        call_count = {"n": 0}

        original_rpc = client.rpc

        def flaky_rpc(name, params):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # First call: raise a transient exception
                client.raise_exc = RuntimeError("transient network blip")
            else:
                # Retry: succeed
                client.raise_exc = None
            return original_rpc(name, params)

        client.rpc = flaky_rpc
        with patch("app.services.stock_service.time.sleep"):
            result = consume_for_paid_order(
                client,
                store_id="store-1",
                order_id="ord-1",
                actor_id="actor-1",
                usage_plan=self._usage_plan(),
            )
        self.assertEqual(result["applied"], 2)
        self.assertEqual(call_count["n"], 2)

    def test_duplicate_application_is_safe_via_idempotent_plan(self) -> None:
        # The DB partial unique index uq_stock_used_order_item_ingredient is
        # the final safety net. From the application side, calling
        # consume_for_paid_order twice with the same plan is a retry; the RPC
        # is expected to no-op duplicates. Here we verify the application
        # builds the same plan and does not mutate quantities to negative.
        plan = self._usage_plan()
        client_a = _FakeRpcClient(data={"applied": 2})
        client_b = _FakeRpcClient(data={"applied": 0})  # second call no-ops
        consume_for_paid_order(client_a, store_id="store-1", order_id="ord-1", actor_id="actor-1", usage_plan=plan)
        consume_for_paid_order(client_b, store_id="store-1", order_id="ord-1", actor_id="actor-1", usage_plan=plan)
        # Both calls sent positive quantities only.
        for call_client in (client_a, client_b):
            for row in call_client.last_call["params"]["p_usage"]:
                self.assertGreater(row["quantity"], 0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
