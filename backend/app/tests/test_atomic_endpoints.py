"""Tests for BE-03 (atomic payment finalization) and BE-04 (cancellation
with stock return).

Covers:
- T07: PromptPay finalization success.
- T08: Duplicate finalize is safe (already_finalized).
- T09: Insufficient stock rejects finalization.
- T10: Cancel unpaid order (no stock return).
- T11: Cancel accepted order (stock return via RPC).
- T12: Duplicate cancel is safe (already_cancelled).
- T13: Cancel preparing order → 409.
- T15: Client injection protection (invalid payment method).
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, Optional, Tuple
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import store_admin
from app.services.atomic_rpc import (
    AtomicRPCError,
    cancel_accepted_order,
    finalize_paid_order,
)


# ── Service-level tests (atomic_rpc module) ─────────────────────────────


class _FakeRpcClient:
    def __init__(self, *, error: Any = None, data: Any = None, raise_exc: Exception = None) -> None:
        self.error = error
        self.data = data
        self.raise_exc = raise_exc
        self.last_call: Dict[str, Any] = {}

    class _RpcBuilder:
        def __init__(self, parent: "_FakeRpcClient", name: str, params: Dict[str, Any]) -> None:
            self.parent = parent
            self.name = name
            self.params = params

        def execute(self) -> SimpleNamespace:
            self.parent.last_call = {"name": self.name, "params": self.params}
            if self.parent.raise_exc is not None:
                raise self.parent.raise_exc
            return SimpleNamespace(error=self.parent.error, data=self.parent.data)

    def rpc(self, name: str, params: Dict[str, Any]) -> "_RpcBuilder":
        return _FakeRpcClient._RpcBuilder(self, name, params)


class FinalizePaidOrderServiceTests(unittest.TestCase):
    def test_successful_promptpay_finalize(self) -> None:
        client = _FakeRpcClient(data={"status": "ok", "result": "finalized", "order_id": "ord-1", "payment_id": "pay-1"})
        result = finalize_paid_order(
            client,
            store_id="store-1",
            order_id="ord-1",
            actor_id="actor-1",
            payment_method="promptpay",
        )
        self.assertEqual(result["result"], "finalized")
        self.assertEqual(client.last_call["name"], "finalize_paid_order_atomic")
        params = client.last_call["params"]
        self.assertEqual(params["p_payment_method"], "promptpay")
        self.assertEqual(params["p_store_id"], "store-1")

    def test_successful_cash_finalize(self) -> None:
        client = _FakeRpcClient(data={"status": "ok", "result": "finalized", "order_id": "ord-1"})
        result = finalize_paid_order(
            client,
            store_id="store-1",
            order_id="ord-1",
            actor_id="actor-1",
            payment_method="cash",
        )
        self.assertEqual(result["result"], "finalized")

    def test_already_finalized_is_safe(self) -> None:
        client = _FakeRpcClient(data={"status": "ok", "result": "already_finalized", "order_id": "ord-1"})
        result = finalize_paid_order(
            client,
            store_id="store-1",
            order_id="ord-1",
            actor_id="actor-1",
            payment_method="cash",
        )
        self.assertEqual(result["result"], "already_finalized")

    def test_insufficient_stock_raises_409(self) -> None:
        client = _FakeRpcClient(error=SimpleNamespace(message="insufficient_stock ingredient=abc required=10 available=5"))
        with self.assertRaises(AtomicRPCError) as ctx:
            finalize_paid_order(
                client,
                store_id="store-1",
                order_id="ord-1",
                actor_id="actor-1",
                payment_method="cash",
            )
        self.assertEqual(ctx.exception.reason, "insufficient_stock")
        self.assertEqual(ctx.exception.http_status, 409)

    def test_invalid_payment_method_rejected_before_rpc(self) -> None:
        client = _FakeRpcClient()
        with self.assertRaises(AtomicRPCError) as ctx:
            finalize_paid_order(
                client,
                store_id="store-1",
                order_id="ord-1",
                actor_id="actor-1",
                payment_method="credit_card",
            )
        self.assertEqual(ctx.exception.reason, "invalid_payment_method")
        self.assertEqual(ctx.exception.http_status, 400)
        # RPC should not be called.
        self.assertEqual(client.last_call, {})

    def test_order_not_found_raises_404(self) -> None:
        client = _FakeRpcClient(error=SimpleNamespace(message="order_not_found_for_store"))
        with self.assertRaises(AtomicRPCError) as ctx:
            finalize_paid_order(
                client,
                store_id="store-1",
                order_id="ord-missing",
                actor_id="actor-1",
                payment_method="cash",
            )
        self.assertEqual(ctx.exception.reason, "order_not_found_for_store")
        self.assertEqual(ctx.exception.http_status, 404)

    def test_usage_snapshot_missing_raises_400(self) -> None:
        client = _FakeRpcClient(error=SimpleNamespace(message="usage_snapshot_missing"))
        with self.assertRaises(AtomicRPCError) as ctx:
            finalize_paid_order(
                client,
                store_id="store-1",
                order_id="ord-1",
                actor_id="actor-1",
                payment_method="cash",
            )
        self.assertEqual(ctx.exception.reason, "usage_snapshot_missing")
        self.assertEqual(ctx.exception.http_status, 400)

    def test_rpc_exception_raises_503(self) -> None:
        client = _FakeRpcClient(raise_exc=RuntimeError("network down"))
        with self.assertRaises(AtomicRPCError) as ctx:
            finalize_paid_order(
                client,
                store_id="store-1",
                order_id="ord-1",
                actor_id="actor-1",
                payment_method="cash",
            )
        self.assertEqual(ctx.exception.reason, "rpc_exception")
        self.assertEqual(ctx.exception.http_status, 503)


class CancelAcceptedOrderServiceTests(unittest.TestCase):
    def test_successful_cancel_accepted(self) -> None:
        client = _FakeRpcClient(data={"status": "ok", "result": "cancelled", "order_id": "ord-1", "returned": 2, "already_returned": 0})
        result = cancel_accepted_order(
            client,
            store_id="store-1",
            order_id="ord-1",
            actor_id="actor-1",
            reason="customer_changed_mind",
        )
        self.assertEqual(result["result"], "cancelled")
        self.assertEqual(result["returned"], 2)
        params = client.last_call["params"]
        self.assertEqual(params["p_reason"], "customer_changed_mind")

    def test_already_cancelled_is_safe(self) -> None:
        client = _FakeRpcClient(data={"status": "ok", "result": "already_cancelled", "order_id": "ord-1"})
        result = cancel_accepted_order(
            client,
            store_id="store-1",
            order_id="ord-1",
            actor_id="actor-1",
        )
        self.assertEqual(result["result"], "already_cancelled")

    def test_preparing_status_raises_409(self) -> None:
        client = _FakeRpcClient(error=SimpleNamespace(message="invalid_status_for_stock_return: preparing"))
        with self.assertRaises(AtomicRPCError) as ctx:
            cancel_accepted_order(
                client,
                store_id="store-1",
                order_id="ord-1",
                actor_id="actor-1",
            )
        self.assertEqual(ctx.exception.reason, "invalid_status_for_stock_return")
        self.assertEqual(ctx.exception.http_status, 409)

    def test_order_not_found_raises_404(self) -> None:
        client = _FakeRpcClient(error=SimpleNamespace(message="order_not_found_for_store"))
        with self.assertRaises(AtomicRPCError) as ctx:
            cancel_accepted_order(
                client,
                store_id="store-1",
                order_id="ord-missing",
                actor_id="actor-1",
            )
        self.assertEqual(ctx.exception.reason, "order_not_found_for_store")
        self.assertEqual(ctx.exception.http_status, 404)


# ── Endpoint-level tests (store_admin module) ───────────────────────────


def _build_fake_ctx(
    *,
    user_id: str = "user-1",
    store_id: str = "store-1",
    role: str = "staff",
    order_status: str = "pending_payment",
) -> Tuple[Dict[str, Any], MagicMock]:
    fake_client = MagicMock()
    orders_query = MagicMock()
    orders_query.update.return_value = orders_query
    orders_query.eq.return_value = orders_query
    orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
    fake_client.table.return_value = orders_query
    fake_ctx = {
        "client": fake_client,
        "user_id": user_id,
        "memberships": [{"store_id": store_id, "role": role}],
    }
    # _get_order_row returns a dict with the current status
    order_row = {"id": "ord-1", "status": order_status, "payment_status": "unpaid"}
    return fake_ctx, orders_query, order_row


class FinalizePaymentEndpointTests(unittest.TestCase):
    def test_t07_promptpay_finalize_success(self) -> None:
        fake_ctx = {
            "client": MagicMock(),
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        rpc_result = {"status": "ok", "result": "finalized", "order_id": "ord-1", "payment_id": "pay-1", "payment_method": "promptpay"}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin.finalize_paid_order", return_value=rpc_result):
            response = store_admin.finalize_order_payment(
                "ord-1",
                store_admin.FinalizePaymentPayload(payment_method="promptpay"),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "accepted")
        self.assertEqual(response["payment_status"], "paid")
        self.assertEqual(response["result"], "finalized")
        self.assertEqual(response["payment_method"], "promptpay")

    def test_t08_duplicate_finalize_returns_already_finalized(self) -> None:
        fake_ctx = {
            "client": MagicMock(),
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        rpc_result = {"status": "ok", "result": "already_finalized", "order_id": "ord-1"}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin.finalize_paid_order", return_value=rpc_result):
            response = store_admin.finalize_order_payment(
                "ord-1",
                store_admin.FinalizePaymentPayload(payment_method="cash"),
                authorization="Bearer token",
            )
        self.assertEqual(response["result"], "already_finalized")

    def test_t09_insufficient_stock_rejected(self) -> None:
        fake_ctx = {
            "client": MagicMock(),
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin.finalize_paid_order", side_effect=AtomicRPCError(
                "insufficient_stock ingredient=abc required=10 available=5",
                reason="insufficient_stock",
                http_status=409,
            )):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.finalize_order_payment(
                    "ord-1",
                    store_admin.FinalizePaymentPayload(payment_method="cash"),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "insufficient_stock")

    def test_t15_invalid_payment_method_rejected(self) -> None:
        fake_ctx = {
            "client": MagicMock(),
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin.finalize_paid_order", side_effect=AtomicRPCError(
                "invalid_payment_method",
                reason="invalid_payment_method",
                http_status=400,
            )):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.finalize_order_payment(
                    "ord-1",
                    store_admin.FinalizePaymentPayload(payment_method="cash"),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 400)


class AtomicCancelEndpointTests(unittest.TestCase):
    def _build_ctx_with_order(self, order_status: str) -> Tuple[Dict[str, Any], MagicMock]:
        fake_client = MagicMock()
        orders_query = MagicMock()
        orders_query.update.return_value = orders_query
        orders_query.eq.return_value = orders_query
        orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
        fake_client.table.return_value = orders_query
        fake_ctx = {
            "client": fake_client,
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        order_row = {"id": "ord-1", "status": order_status, "payment_status": "unpaid"}
        return fake_ctx, orders_query, order_row

    def test_t10_cancel_unpaid_order_no_stock_return(self) -> None:
        fake_ctx, orders_query, order_row = self._build_ctx_with_order("pending_payment")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            response = store_admin.cancel_order_atomic(
                "ord-1",
                store_admin.AtomicCancelPayload(reason="customer_cancelled"),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled_unpaid")
        self.assertEqual(response["stock_returned"], 0)
        # Verify the order was updated to cancelled.
        update_payload = orders_query.update.call_args[0][0]
        self.assertEqual(update_payload["status"], "cancelled")
        self.assertEqual(update_payload["order_status"], "cancelled")
        mock_log.assert_called_once()

    def test_t11_cancel_accepted_order_with_stock_return(self) -> None:
        fake_ctx, _, order_row = self._build_ctx_with_order("accepted")
        rpc_result = {"status": "ok", "result": "cancelled", "order_id": "ord-1", "returned": 3, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result):
            response = store_admin.cancel_order_atomic(
                "ord-1",
                store_admin.AtomicCancelPayload(reason="wrong_order"),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled")
        self.assertEqual(response["stock_returned"], 3)

    def test_t12_duplicate_cancel_returns_already_cancelled(self) -> None:
        fake_ctx, _, order_row = self._build_ctx_with_order("cancelled")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            response = store_admin.cancel_order_atomic(
                "ord-1",
                store_admin.AtomicCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "already_cancelled")

    def test_t13_cancel_preparing_returns_409(self) -> None:
        fake_ctx, _, order_row = self._build_ctx_with_order("preparing")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order_atomic(
                    "ord-1",
                    store_admin.AtomicCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        # BE-FIX-03: Business function blocks preparing status before
        # calling the RPC, so the error code is the business-level code.
        self.assertEqual(detail["code"], "invalid_status_for_cancellation")
        # Verify the RPC was NOT called.
        mock_rpc.assert_not_called()


# ── BE-FIX-03: Canonical Cancellation API Consolidation ──────────────


class BEFIX03CanonicalCancelTests(unittest.TestCase):
    """BE-FIX-03: Canonical /cancel endpoint delegates to
    _cancel_order_business and routes based on persisted status."""

    def _build_ctx(self, order_status: str) -> Tuple[Dict[str, Any], MagicMock, Dict[str, Any]]:
        fake_client = MagicMock()
        orders_query = MagicMock()
        orders_query.update.return_value = orders_query
        orders_query.eq.return_value = orders_query
        orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
        fake_client.table.return_value = orders_query
        fake_ctx = {
            "client": fake_client,
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        order_row = {"id": "ord-1", "status": order_status, "payment_status": "unpaid", "store_id": "store-1"}
        return fake_ctx, orders_query, order_row

    def _call_cancel(self, fake_ctx, order_row, *, reason=None, extra_patches=None):
        patches = [
            patch("app.api.store_admin._get_ctx", return_value=fake_ctx),
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")),
            patch("app.api.store_admin._require_owner_store_role"),
            patch("app.api.store_admin._get_order_row", return_value=order_row),
            patch("app.api.store_admin._orders_has_column", return_value=True),
            patch("app.api.store_admin._write_order_status_log"),
        ]
        entered = []
        for p in patches:
            entered.append(p.__enter__())
        try:
            payload = store_admin.OrderCancelPayload(reason=reason) if reason else store_admin.OrderCancelPayload()
            return store_admin.cancel_order(
                "ord-1",
                payload,
                authorization="Bearer token",
            )
        finally:
            for p in patches:
                p.__exit__(None, None, None)

    # T01 — pending_payment cancel succeeds
    def test_t01_pending_payment_cancel_succeeds(self) -> None:
        fake_ctx, orders_query, order_row = self._build_ctx("pending_payment")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(reason="customer_cancelled"),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled_unpaid")
        self.assertEqual(response["stock_returned"], 0)
        update_payload = orders_query.update.call_args[0][0]
        self.assertEqual(update_payload["status"], "cancelled")
        self.assertEqual(update_payload["order_status"], "cancelled")
        mock_log.assert_called_once()

    # T02 — pending_payment: no atomic RPC, no stock return
    def test_t02_pending_payment_no_stock_return(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("pending_payment")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        mock_rpc.assert_not_called()

    # T03 — pending_payment with reason preserved
    def test_t03_pending_payment_reason_preserved(self) -> None:
        fake_ctx, orders_query, order_row = self._build_ctx("pending_payment")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log"):
            store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(reason="ลูกค้ายกเลิก"),
                authorization="Bearer token",
            )
        update_payload = orders_query.update.call_args[0][0]
        self.assertEqual(update_payload["cancelled_reason"], "ลูกค้ายกเลิก")

    # T04 — accepted cancel calls atomic RPC exactly once
    def test_t04_accepted_cancel_calls_atomic_rpc(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("accepted")
        rpc_result = {"status": "ok", "result": "cancelled", "order_id": "ord-1", "returned": 3, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result) as mock_rpc:
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(reason="wrong_order"),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled")
        self.assertEqual(response["stock_returned"], 3)
        mock_rpc.assert_called_once()

    # T05 — accepted: no manual stock return in Python
    def test_t05_accepted_no_manual_stock_return(self) -> None:
        fake_client = MagicMock()
        fake_ctx = {
            "client": fake_client,
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        order_row = {"id": "ord-1", "status": "accepted", "store_id": "store-1"}
        rpc_result = {"status": "ok", "result": "cancelled", "returned": 1, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result):
            store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        # The only table access should be _get_order_row's select, not
        # any stock_movements insert or ingredients update.
        table_calls = [str(c) for c in fake_client.table.call_args_list]
        for call in table_calls:
            self.assertNotIn("stock_movements", call)
            self.assertNotIn("ingredients", call)

    # T06 — accepted RPC result normalized
    def test_t06_accepted_rpc_result_normalized(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("accepted")
        rpc_result = {"status": "ok", "result": "cancelled", "returned": 5, "already_returned": 2}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result):
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled")
        self.assertEqual(response["stock_returned"], 5)
        self.assertEqual(response["already_returned"], 2)

    # T07 — preparing blocked
    def test_t07_preparing_blocked(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("preparing")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        mock_rpc.assert_not_called()

    # T08 — ready blocked
    def test_t08_ready_blocked(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("ready")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        mock_rpc.assert_not_called()

    # T09 — completed blocked
    def test_t09_completed_blocked(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("completed")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        mock_rpc.assert_not_called()

    # T10 — already cancelled is idempotent
    def test_t10_already_cancelled_idempotent(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("cancelled")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "already_cancelled")
        mock_rpc.assert_not_called()

    # T11 — accepted retry after RPC completed (order already cancelled)
    def test_t11_accepted_retry_no_second_rpc(self) -> None:
        # Simulate: first cancel succeeded, client retries, order is
        # now cancelled.
        fake_ctx, _, order_row = self._build_ctx("cancelled")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(response["result"], "already_cancelled")
        mock_rpc.assert_not_called()

    # T12 — wrong store returns 404 (no cross-store leakage)
    def test_t12_wrong_store_404(self) -> None:
        fake_ctx = {
            "client": MagicMock(),
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", side_effect=HTTPException(
                status_code=404, detail="order_not_found",
            )):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 404)

    # T13 — unauthorized actor rejected
    def test_t13_unauthorized_actor_rejected(self) -> None:
        fake_ctx = {
            "client": MagicMock(),
            "user_id": None,
            "memberships": [{"store_id": "store-1", "role": "staff"}],
        }
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization=None,
                )
        self.assertEqual(ctx_err.exception.status_code, 401)

    # T14 — client status ignored (backend uses persisted status)
    def test_t14_client_status_ignored(self) -> None:
        # The OrderCancelPayload only has `reason` — no status field.
        # Pydantic ignores extra fields by default, so a client cannot
        # inject status into the payload.
        payload = store_admin.OrderCancelPayload(reason="test", status="accepted")
        # Verify the payload does NOT carry a status field.
        self.assertFalse(hasattr(payload, "status"))
        self.assertEqual(payload.reason, "test")

    # T15 — response consistency across paths
    def test_t15_response_consistency(self) -> None:
        # All paths return {"id", "status", "result"} at minimum.
        # pending_payment
        fake_ctx, _, order_row = self._build_ctx("pending_payment")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log"):
            resp_pending = store_admin.cancel_order(
                "ord-1", store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        # accepted
        fake_ctx2, _, order_row2 = self._build_ctx("accepted")
        rpc_result = {"status": "ok", "result": "cancelled", "returned": 0, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx2), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row2), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result):
            resp_accepted = store_admin.cancel_order(
                "ord-1", store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        # cancelled
        fake_ctx3, _, order_row3 = self._build_ctx("cancelled")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx3), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row3):
            resp_cancelled = store_admin.cancel_order(
                "ord-1", store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        # All have id, status, result
        for resp in [resp_pending, resp_accepted, resp_cancelled]:
            self.assertIn("id", resp)
            self.assertIn("status", resp)
            self.assertIn("result", resp)
            self.assertEqual(resp["status"], "cancelled")

    # T16 — legacy cancel-atomic delegates to same business function
    def test_t16_legacy_cancel_atomic_delegates_to_canonical(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("accepted")
        rpc_result = {"status": "ok", "result": "cancelled", "returned": 2, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result) as mock_rpc:
            response = store_admin.cancel_order_atomic(
                "ord-1",
                store_admin.AtomicCancelPayload(reason="test"),
                authorization="Bearer token",
            )
        # Same response shape as canonical /cancel
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled")
        self.assertEqual(response["stock_returned"], 2)
        mock_rpc.assert_called_once()

    # T17 — unexpected status rejected
    def test_t17_unexpected_status_rejected(self) -> None:
        fake_ctx, _, order_row = self._build_ctx("voided")
        # voided is in CANCELLED_ORDER_STATUSES, so it should be
        # idempotent, not rejected. Let's use a truly unexpected status.
        order_row["status"] = "unknown_status"
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 400)
        mock_rpc.assert_not_called()


# ── BE-FIX-03B: Owner-Only Cancellation RBAC ─────────────────────────


class BEFIX03BOwnerOnlyRbacTests(unittest.TestCase):
    """BE-FIX-03B: Cancellation is Owner-only on both the canonical
    /cancel and the deprecated /cancel-atomic routes."""

    def _build_ctx(self, role: str) -> Dict[str, Any]:
        return {
            "client": MagicMock(),
            "user_id": "user-1",
            "memberships": [{"store_id": "store-1", "role": role}],
        }

    def _order_row(self, status: str) -> Dict[str, Any]:
        return {"id": "ord-1", "status": status, "payment_status": "unpaid", "store_id": "store-1"}

    # T01 — Owner can cancel pending_payment
    def test_t01_owner_can_cancel_pending_payment(self) -> None:
        fake_ctx = self._build_ctx("owner")
        fake_client = MagicMock()
        orders_query = MagicMock()
        orders_query.update.return_value = orders_query
        orders_query.eq.return_value = orders_query
        orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
        fake_client.table.return_value = orders_query
        fake_ctx["client"] = fake_client
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role") as mock_auth, \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("pending_payment")), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log"):
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        mock_auth.assert_called_once_with("owner")
        self.assertEqual(response["result"], "cancelled_unpaid")
        self.assertEqual(response["stock_returned"], 0)

    # T02 — Owner can cancel accepted (atomic RPC called once)
    def test_t02_owner_can_cancel_accepted(self) -> None:
        fake_ctx = self._build_ctx("owner")
        rpc_result = {"status": "ok", "result": "cancelled", "returned": 3, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role") as mock_auth, \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("accepted")), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result) as mock_rpc:
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(reason="wrong_order"),
                authorization="Bearer token",
            )
        mock_auth.assert_called_once_with("owner")
        mock_rpc.assert_called_once()
        self.assertEqual(response["result"], "cancelled")
        self.assertEqual(response["stock_returned"], 3)

    # T03 — Manager canonical /cancel rejected
    def test_t03_manager_canonical_cancel_rejected(self) -> None:
        fake_ctx = self._build_ctx("manager")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_owner_store_role", side_effect=HTTPException(
                status_code=403, detail="owner_role_required",
            )) as mock_auth, \
            patch("app.api.store_admin._get_order_row") as mock_get_order, \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 403)
        mock_auth.assert_called_once_with("manager")
        # No order lookup, no RPC, no mutation after RBAC rejection.
        mock_get_order.assert_not_called()
        mock_rpc.assert_not_called()

    # T04 — Staff canonical /cancel rejected
    def test_t04_staff_canonical_cancel_rejected(self) -> None:
        fake_ctx = self._build_ctx("staff")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role", side_effect=HTTPException(
                status_code=403, detail="owner_role_required",
            )) as mock_auth, \
            patch("app.api.store_admin._get_order_row") as mock_get_order, \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 403)
        mock_auth.assert_called_once_with("staff")
        mock_get_order.assert_not_called()
        mock_rpc.assert_not_called()

    # T05 — Manager deprecated /cancel-atomic rejected (no bypass)
    def test_t05_manager_deprecated_cancel_atomic_rejected(self) -> None:
        fake_ctx = self._build_ctx("manager")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_owner_store_role", side_effect=HTTPException(
                status_code=403, detail="owner_role_required",
            )) as mock_auth, \
            patch("app.api.store_admin._get_order_row") as mock_get_order, \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order_atomic(
                    "ord-1",
                    store_admin.AtomicCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 403)
        mock_auth.assert_called_once_with("manager")
        mock_get_order.assert_not_called()
        mock_rpc.assert_not_called()

    # T06 — Staff deprecated /cancel-atomic rejected (no bypass)
    def test_t06_staff_deprecated_cancel_atomic_rejected(self) -> None:
        fake_ctx = self._build_ctx("staff")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_owner_store_role", side_effect=HTTPException(
                status_code=403, detail="owner_role_required",
            )) as mock_auth, \
            patch("app.api.store_admin._get_order_row") as mock_get_order, \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order_atomic(
                    "ord-1",
                    store_admin.AtomicCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 403)
        mock_auth.assert_called_once_with("staff")
        mock_get_order.assert_not_called()
        mock_rpc.assert_not_called()

    # T07 — Owner deprecated /cancel-atomic allowed and delegates
    def test_t07_owner_deprecated_cancel_atomic_allowed(self) -> None:
        fake_ctx = self._build_ctx("owner")
        rpc_result = {"status": "ok", "result": "cancelled", "returned": 2, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role") as mock_auth, \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("accepted")), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result) as mock_rpc:
            response = store_admin.cancel_order_atomic(
                "ord-1",
                store_admin.AtomicCancelPayload(reason="test"),
                authorization="Bearer token",
            )
        mock_auth.assert_called_once_with("owner")
        mock_rpc.assert_called_once()
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled")

    # T08 — Owner preparing blocked
    def test_t08_owner_preparing_blocked(self) -> None:
        fake_ctx = self._build_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("preparing")), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        mock_rpc.assert_not_called()

    # T09 — Owner ready blocked
    def test_t09_owner_ready_blocked(self) -> None:
        fake_ctx = self._build_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("ready")), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        mock_rpc.assert_not_called()

    # T10 — Owner completed blocked
    def test_t10_owner_completed_blocked(self) -> None:
        fake_ctx = self._build_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("completed")), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1",
                    store_admin.OrderCancelPayload(),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        mock_rpc.assert_not_called()

    # T11 — Owner cancelled retry idempotent (no duplicate stock return)
    def test_t11_owner_cancelled_retry_idempotent(self) -> None:
        fake_ctx = self._build_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("cancelled")), \
            patch("app.api.store_admin.cancel_accepted_order") as mock_rpc:
            response = store_admin.cancel_order(
                "ord-1",
                store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(response["result"], "already_cancelled")
        mock_rpc.assert_not_called()

    # T12 — BE-FIX-03 routing regression (owner context)
    def test_t12_befix03_routing_regression(self) -> None:
        # pending_payment → direct
        fake_ctx = self._build_ctx("owner")
        fake_client = MagicMock()
        orders_query = MagicMock()
        orders_query.update.return_value = orders_query
        orders_query.eq.return_value = orders_query
        orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
        fake_client.table.return_value = orders_query
        fake_ctx["client"] = fake_client
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("pending_payment")), \
            patch("app.api.store_admin._orders_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log"):
            resp_pending = store_admin.cancel_order(
                "ord-1", store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(resp_pending["result"], "cancelled_unpaid")
        self.assertEqual(resp_pending["stock_returned"], 0)

        # accepted → atomic RPC
        fake_ctx2 = self._build_ctx("owner")
        rpc_result = {"status": "ok", "result": "cancelled", "returned": 1, "already_returned": 0}
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx2), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value=self._order_row("accepted")), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result) as mock_rpc:
            resp_accepted = store_admin.cancel_order(
                "ord-1", store_admin.OrderCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(resp_accepted["result"], "cancelled")
        mock_rpc.assert_called_once()

        # blocked states → 409
        for status_value in ("preparing", "ready", "completed"):
            fake_ctx3 = self._build_ctx("owner")
            with patch("app.api.store_admin._get_ctx", return_value=fake_ctx3), \
                patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
                patch("app.api.store_admin._require_owner_store_role"), \
                patch("app.api.store_admin._get_order_row", return_value=self._order_row(status_value)), \
                patch("app.api.store_admin.cancel_accepted_order"):
                with self.assertRaises(HTTPException) as ctx_err:
                    store_admin.cancel_order(
                        "ord-1", store_admin.OrderCancelPayload(),
                        authorization="Bearer token",
                    )
            self.assertEqual(ctx_err.exception.status_code, 409)

    # T13 — Operational permissions regression (payment confirmation still staff+)
    def test_t13_operational_permissions_regression(self) -> None:
        # Verify finalize-payment route still uses _require_staff_or_above
        # (NOT changed to owner-only).
        import inspect
        source = inspect.getsource(store_admin.finalize_order_payment)
        self.assertIn("_require_staff_or_above", source)
        self.assertNotIn("_require_owner_store_role", source)
        # Verify _require_manager and _require_staff_or_above helpers
        # still exist unchanged for other routes.
        self.assertTrue(hasattr(store_admin, "_require_manager"))
        self.assertTrue(hasattr(store_admin, "_require_staff_or_above"))
        self.assertTrue(hasattr(store_admin, "_require_owner_store_role"))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
