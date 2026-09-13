"""G2 — Order / Payment / Cancellation Invariants.

Focused tests for:
- HHL-004: Legacy payment approval is disabled (410 GONE).
- HHL-005: Legacy cancellation paths delegate to _cancel_order_business.
- HHL-006: Payment finalization vs cancellation race safety (conditional update).
- HHL-007: Finalized order items are immutable (add/update/delete rejected).
- HHL-013: Owner detail cancellation API contract (backend side).

All tests use mocks — no database connection required.
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, Optional
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import store_admin
from app.api.store_admin import (
    AtomicCancelPayload,
    FinalizePaymentPayload,
    OrderCancelPayload,
    OrderItemPayload,
    OrderItemUpdate,
    OrderStatusUpdate,
    OrderUpdate,
    PaymentApprovePayload,
)
from app.services.atomic_rpc import AtomicRPCError


# ── Helpers ──────────────────────────────────────────────────────────────


def _build_fake_ctx(role: str = "owner", user_id: str = "user-1") -> Dict[str, Any]:
    return {
        "client": MagicMock(),
        "user_id": user_id,
        "memberships": [{"store_id": "store-1", "role": role}],
    }


def _build_orders_query(data: list = None) -> MagicMock:
    q = MagicMock()
    q.update.return_value = q
    q.eq.return_value = q
    q.execute.return_value = SimpleNamespace(error=None, data=data or [{"id": "ord-1"}])
    return q


# =====================================================================
# HHL-004: Legacy payment approval is disabled
# =====================================================================


class HHL004ApprovePaymentDisabledTests(unittest.TestCase):
    """POST /payments/{payment_id}/approve is disabled (410 GONE)."""

    def test_approve_payment_returns_410_gone(self):
        """The legacy slip-approval route must return 410 GONE."""
        with self.assertRaises(HTTPException) as ctx_err:
            store_admin.approve_payment(
                "pay-1",
                PaymentApprovePayload(),
                authorization="Bearer token",
            )
        self.assertEqual(ctx_err.exception.status_code, 410)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "legacy_payment_approval_disabled")

    def test_approve_payment_does_not_consume_stock(self):
        """The disabled route must not touch the database or stock."""
        fake_ctx = _build_fake_ctx()
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx) as mock_ctx:
            with self.assertRaises(HTTPException):
                store_admin.approve_payment(
                    "pay-1",
                    PaymentApprovePayload(),
                    authorization="Bearer token",
                )
        # _get_ctx is never called — the route short-circuits before any logic.
        mock_ctx.assert_not_called()


# =====================================================================
# HHL-005: Legacy cancellation paths delegate to _cancel_order_business
# =====================================================================


class HHL005LegacyCancellationDelegationTests(unittest.TestCase):
    """Legacy cancellation routes delegate to _cancel_order_business."""

    def test_patch_status_cancelled_delegates_to_canonical(self):
        """PATCH /orders/{id}/status status=cancelled delegates to canonical."""
        fake_ctx = _build_fake_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._cancel_order_business", return_value={
                "id": "ord-1", "status": "cancelled", "result": "cancelled_unpaid",
            }) as mock_cancel:
            response = store_admin.update_order_status(
                "ord-1", OrderStatusUpdate(status="cancelled"),
                authorization="Bearer token",
            )
        mock_cancel.assert_called_once()
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["result"], "cancelled_unpaid")

    def test_patch_order_cancelled_delegates_to_canonical(self):
        """PATCH /orders/{id} status=cancelled delegates to canonical."""
        fake_ctx = _build_fake_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment", "payment_status": "unpaid",
            }), \
            patch("app.api.store_admin._sanitize_order_payload", return_value={
                "status": "cancelled", "cancelled_reason": "test",
            }), \
            patch("app.api.store_admin._cancel_order_business", return_value={
                "id": "ord-1", "status": "cancelled", "result": "cancelled_unpaid",
            }) as mock_cancel:
            response = store_admin.update_order(
                "ord-1", OrderUpdate(status="cancelled", cancelled_reason="test"),
                authorization="Bearer token",
            )
        mock_cancel.assert_called_once()
        self.assertEqual(response["status"], "cancelled")

    def test_delete_order_delegates_to_canonical(self):
        """DELETE /orders/{id} delegates to canonical cancellation."""
        fake_ctx = _build_fake_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._cancel_order_business", return_value={
                "id": "ord-1", "status": "cancelled", "result": "cancelled_unpaid",
            }) as mock_cancel:
            response = store_admin.delete_order("ord-1", authorization="Bearer token")
        mock_cancel.assert_called_once()
        self.assertEqual(response["status"], "archived")
        self.assertEqual(response["order_status"], "cancelled")
        self.assertTrue(response["archived"])

    def test_patch_status_cancelled_passes_reason_to_canonical(self):
        """The reason from the payload is passed to _cancel_order_business."""
        fake_ctx = _build_fake_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._cancel_order_business", return_value={
                "id": "ord-1", "status": "cancelled", "result": "cancelled_unpaid",
            }) as mock_cancel:
            store_admin.update_order_status(
                "ord-1",
                OrderStatusUpdate(status="cancelled", cancelled_reason="customer_request"),
                authorization="Bearer token",
            )
        _, kwargs = mock_cancel.call_args
        self.assertEqual(kwargs["reason"], "customer_request")


# =====================================================================
# HHL-006: Race safety — conditional update in _cancel_order_business
# =====================================================================


class HHL006RaceSafetyTests(unittest.TestCase):
    """Payment finalization vs cancellation race condition handling."""

    def _patch_cancel_common(self, order_row: Dict[str, Any]):
        """Return common patches for _cancel_order_business tests."""
        return [
            patch("app.api.store_admin._get_order_row", return_value=order_row),
            patch("app.api.store_admin._orders_has_column", return_value=False),
            patch("app.api.store_admin._write_order_status_log"),
        ]

    def test_cancel_wins_finalize_loses_pending_payment(self):
        """Cancel-first: conditional update succeeds, order → cancelled.

        The finalize RPC would later see cancelled status and reject.
        """
        order_row = {"id": "ord-1", "status": "pending_payment", "payment_status": "unpaid"}
        fake_client = MagicMock()
        # Conditional update succeeds (1 row affected).
        update_q = MagicMock()
        update_q.update.return_value = update_q
        update_q.eq.return_value = update_q
        update_q.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
        fake_client.table.return_value = update_q

        with patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._write_order_status_log"):
            result = store_admin._cancel_order_business(
                fake_client,
                order_id="ord-1",
                store_id="store-1",
                actor_id="user-1",
                reason=None,
            )
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(result["result"], "cancelled_unpaid")
        self.assertEqual(result["stock_returned"], 0)
        # Verify the conditional update used eq("status", "pending_payment").
        eq_calls = update_q.eq.call_args_list
        status_filters = [c for c in eq_calls if c.args and c.args[0] == "status"]
        self.assertTrue(any(c.args[1] == "pending_payment" for c in status_filters))

    def test_finalize_wins_cancel_loses_pending_payment(self):
        """Finalize-first: conditional update affects 0 rows, cancel detects it.

        The order is now accepted/paid (finalized). Cancel must NOT overwrite
        it. The conditional update returns 0 rows; cancel re-reads and raises
        409 order_finalized_concurrently.
        """
        # First read: pending_payment (before race).
        # Second read (after 0-row update): accepted (finalize won).
        order_row_first = {"id": "ord-1", "status": "pending_payment", "payment_status": "unpaid"}
        order_row_after = {"id": "ord-1", "status": "accepted", "payment_status": "paid"}

        fake_client = MagicMock()
        # Conditional update affects 0 rows (status changed by finalize).
        update_q = MagicMock()
        update_q.update.return_value = update_q
        update_q.eq.return_value = update_q
        update_q.execute.return_value = SimpleNamespace(error=None, data=[])
        fake_client.table.return_value = update_q

        get_order_row_side = [order_row_first, order_row_after]

        with patch("app.api.store_admin._get_order_row", side_effect=get_order_row_side), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin._cancel_order_business(
                    fake_client,
                    order_id="ord-1",
                    store_id="store-1",
                    actor_id="user-1",
                    reason=None,
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized_concurrently")
        # No stock log written — cancel lost the race.
        mock_log.assert_not_called()

    def test_cancel_wins_then_cancel_again_is_idempotent(self):
        """Duplicate cancel: already cancelled → already_cancelled (no stock)."""
        order_row = {"id": "ord-1", "status": "cancelled", "payment_status": "unpaid"}
        fake_client = MagicMock()

        with patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._write_order_status_log"):
            result = store_admin._cancel_order_business(
                fake_client,
                order_id="ord-1",
                store_id="store-1",
                actor_id="user-1",
                reason=None,
            )
        self.assertEqual(result["result"], "already_cancelled")
        self.assertEqual(result["status"], "cancelled")
        # No table update called for already-cancelled.
        fake_client.table.assert_not_called()

    def test_cancel_accepted_delegates_to_atomic_rpc(self):
        """Cancel accepted order uses the atomic RPC (stock return)."""
        order_row = {"id": "ord-1", "status": "accepted", "payment_status": "paid"}
        fake_client = MagicMock()

        rpc_result = {"result": "cancelled", "returned": 5, "already_returned": 0}

        with patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin.cancel_accepted_order", return_value=rpc_result):
            result = store_admin._cancel_order_business(
                fake_client,
                order_id="ord-1",
                store_id="store-1",
                actor_id="user-1",
                reason="wrong_order",
            )
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(result["stock_returned"], 5)
        self.assertEqual(result["result"], "cancelled")

    def test_cancel_completed_is_blocked(self):
        """Cancel a completed (finalized) order → 409 blocked."""
        order_row = {"id": "ord-1", "status": "completed", "payment_status": "paid"}
        fake_client = MagicMock()

        with patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin._cancel_order_business(
                    fake_client,
                    order_id="ord-1",
                    store_id="store-1",
                    actor_id="user-1",
                    reason=None,
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "invalid_status_for_cancellation")


# =====================================================================
# HHL-007: Finalized order items are immutable
# =====================================================================


class HHL007FinalizedOrderItemImmutabilityTests(unittest.TestCase):
    """Finalized orders reject item create/update/delete."""

    def _common_patches(self, order_status: str, role: str = "manager"):
        fake_ctx = _build_fake_ctx(role)
        # Derive a consistent payment_status for the order state:
        # pending_payment → unpaid; finalized/accepted → paid.
        if order_status == "pending_payment":
            payment_status = "unpaid"
        else:
            payment_status = "paid"
        order_row = {
            "id": "ord-1", "status": order_status,
            "payment_status": payment_status, "channel_id": None,
        }
        return fake_ctx, order_row

    def test_create_item_on_completed_order_rejected(self):
        """POST /orders/{id}/items on completed → 409 order_finalized."""
        fake_ctx, order_row = self._common_patches("completed")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_order_item(
                    "ord-1",
                    OrderItemPayload(product_id="prod-1", quantity=1),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized")

    def test_create_item_on_cancelled_order_rejected(self):
        """POST /orders/{id}/items on cancelled → 409 order_finalized."""
        fake_ctx, order_row = self._common_patches("cancelled")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_order_item(
                    "ord-1",
                    OrderItemPayload(product_id="prod-1", quantity=1),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized")

    def test_update_item_on_completed_order_rejected(self):
        """PATCH /order-items/{id} on completed order → 409 order_finalized."""
        fake_ctx, order_row = self._common_patches("completed")
        item_row = {"id": "item-1", "store_id": "store-1", "order_id": "ord-1", "product_id": "prod-1", "quantity": 2}

        exists_q = MagicMock()
        exists_q.select.return_value = exists_q
        exists_q.eq.return_value = exists_q
        exists_q.limit.return_value = exists_q
        exists_q.execute.return_value = SimpleNamespace(error=None, data=[item_row])

        fake_ctx["client"].table.return_value = exists_q

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._sanitize_order_item_payload", return_value={"quantity": 3}), \
            patch("app.api.store_admin.order_items_has_column", return_value=False), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order_item(
                    "item-1",
                    OrderItemUpdate(quantity=3),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized")

    def test_delete_item_on_completed_order_rejected(self):
        """DELETE /order-items/{id} on completed order → 409 order_finalized."""
        fake_ctx, order_row = self._common_patches("completed")
        item_row = {"id": "item-1", "store_id": "store-1", "order_id": "ord-1"}

        exists_q = MagicMock()
        exists_q.select.return_value = exists_q
        exists_q.eq.return_value = exists_q
        exists_q.limit.return_value = exists_q
        exists_q.execute.return_value = SimpleNamespace(error=None, data=[item_row])

        fake_ctx["client"].table.return_value = exists_q

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.delete_order_item("item-1", authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized")

    def test_create_item_on_pending_payment_allowed(self):
        """POST /orders/{id}/items on pending_payment → allowed (not finalized)."""
        fake_ctx, order_row = self._common_patches("pending_payment")
        orders_q = MagicMock()
        orders_q.update.return_value = orders_q
        orders_q.eq.return_value = orders_q
        orders_q.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
        insert_q = MagicMock()
        insert_q.insert.return_value = insert_q
        insert_q.execute.return_value = SimpleNamespace(error=None, data=[{"id": "item-1"}])

        def mock_table(name):
            if name == "order_items":
                return insert_q
            return orders_q

        fake_ctx["client"].table = mock_table

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row), \
            patch("app.api.store_admin._sanitize_order_item_payload", return_value={"product_id": "prod-1", "quantity": 1}), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value={"product_name": "Coffee", "base_cost_breakdown": []}), \
            patch("app.api.store_admin.build_order_item_record", return_value={"product_id": "prod-1", "quantity": 1}), \
            patch("app.api.store_admin.prune_order_item_columns", return_value={"product_id": "prod-1", "quantity": 1}), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.recalculate_order_totals"), \
            patch("app.api.store_admin._map_order_item", return_value={"id": "item-1"}):
            response = store_admin.create_order_item(
                "ord-1",
                OrderItemPayload(product_id="prod-1", quantity=1),
                authorization="Bearer token",
            )
        self.assertEqual(response["id"], "item-1")


# =====================================================================
# HHL-013: Owner detail cancellation API contract (backend side)
# =====================================================================


class HHL013CancelContractTests(unittest.TestCase):
    """The canonical /cancel endpoint accepts OrderCancelPayload (optional reason)."""

    def test_cancel_with_empty_payload_succeeds(self):
        """POST /cancel with empty OrderCancelPayload (reason=None) works."""
        fake_ctx = _build_fake_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._cancel_order_business", return_value={
                "id": "ord-1", "status": "cancelled", "result": "cancelled_unpaid",
            }) as mock_cancel:
            response = store_admin.cancel_order(
                "ord-1",
                OrderCancelPayload(),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        _, kwargs = mock_cancel.call_args
        self.assertIsNone(kwargs["reason"])

    def test_cancel_with_reason_succeeds(self):
        """POST /cancel with reason works and passes reason through."""
        fake_ctx = _build_fake_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._cancel_order_business", return_value={
                "id": "ord-1", "status": "cancelled", "result": "cancelled",
            }) as mock_cancel:
            response = store_admin.cancel_order(
                "ord-1",
                OrderCancelPayload(reason="customer_changed_mind"),
                authorization="Bearer token",
            )
        self.assertEqual(response["status"], "cancelled")
        _, kwargs = mock_cancel.call_args
        self.assertEqual(kwargs["reason"], "customer_changed_mind")

    def test_cancel_atomic_delegates_to_same_business_function(self):
        """POST /cancel-atomic delegates to _cancel_order_business (same as /cancel)."""
        fake_ctx = _build_fake_ctx("owner")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_owner_store_role"), \
            patch("app.api.store_admin._cancel_order_business", return_value={
                "id": "ord-1", "status": "cancelled", "result": "cancelled_unpaid",
            }) as mock_cancel:
            store_admin.cancel_order_atomic(
                "ord-1",
                AtomicCancelPayload(reason="test"),
                authorization="Bearer token",
            )
        mock_cancel.assert_called_once()


# =====================================================================
# HHL-004: Finalize payment endpoint preserves canonical behavior
# =====================================================================


class HHL004FinalizePaymentCanonicalTests(unittest.TestCase):
    """The canonical finalize-payment endpoint uses the atomic RPC."""

    def test_finalize_payment_calls_atomic_rpc(self):
        """POST /finalize-payment delegates to finalize_paid_order RPC."""
        fake_ctx = _build_fake_ctx("staff")
        rpc_result = {
            "result": "finalized",
            "payment_id": "pay-1",
            "payment_method": "cash",
        }
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin.finalize_paid_order", return_value=rpc_result) as mock_rpc:
            response = store_admin.finalize_order_payment(
                "ord-1",
                FinalizePaymentPayload(payment_method="cash"),
                authorization="Bearer token",
            )
        mock_rpc.assert_called_once()
        self.assertEqual(response["status"], "accepted")
        self.assertEqual(response["payment_status"], "paid")
        self.assertEqual(response["payment_id"], "pay-1")

    def test_finalize_payment_rejects_invalid_method(self):
        """POST /finalize-payment with invalid method → 400."""
        fake_ctx = _build_fake_ctx("staff")
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin.finalize_paid_order", side_effect=AtomicRPCError(
                "invalid_payment_method", reason="invalid_payment_method", http_status=400,
            )):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.finalize_order_payment(
                    "ord-1",
                    FinalizePaymentPayload(payment_method="cash"),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 400)


# =====================================================================
# HHL-007 (extended): Paid accepted orders are financially finalized
# =====================================================================


class HHL007PaidAcceptedFinalizedTests(unittest.TestCase):
    """A paid but not completed order (status=accepted, payment_status=paid)
    is financially finalized — stock has been consumed and payment recorded.

    Item create/update/delete must be rejected for this state.
    """

    def _common_patches(self, role: str = "manager"):
        fake_ctx = _build_fake_ctx(role)
        order_row = {
            "id": "ord-1", "status": "accepted",
            "payment_status": "paid", "channel_id": None,
        }
        return fake_ctx, order_row

    def test_create_item_on_accepted_paid_order_rejected(self):
        """POST /orders/{id}/items on accepted+paid → 409 order_finalized."""
        fake_ctx, order_row = self._common_patches()
        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_order_item(
                    "ord-1",
                    OrderItemPayload(product_id="prod-1", quantity=1),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized")

    def test_update_item_on_accepted_paid_order_rejected(self):
        """PATCH /order-items/{id} on accepted+paid order → 409 order_finalized."""
        fake_ctx, order_row = self._common_patches()
        item_row = {"id": "item-1", "store_id": "store-1", "order_id": "ord-1", "product_id": "prod-1", "quantity": 2}

        exists_q = MagicMock()
        exists_q.select.return_value = exists_q
        exists_q.eq.return_value = exists_q
        exists_q.limit.return_value = exists_q
        exists_q.execute.return_value = SimpleNamespace(error=None, data=[item_row])

        fake_ctx["client"].table.return_value = exists_q

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._sanitize_order_item_payload", return_value={"quantity": 3}), \
            patch("app.api.store_admin.order_items_has_column", return_value=False), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order_item(
                    "item-1",
                    OrderItemUpdate(quantity=3),
                    authorization="Bearer token",
                )
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized")

    def test_delete_item_on_accepted_paid_order_rejected(self):
        """DELETE /order-items/{id} on accepted+paid order → 409 order_finalized."""
        fake_ctx, order_row = self._common_patches()
        item_row = {"id": "item-1", "store_id": "store-1", "order_id": "ord-1"}

        exists_q = MagicMock()
        exists_q.select.return_value = exists_q
        exists_q.eq.return_value = exists_q
        exists_q.limit.return_value = exists_q
        exists_q.execute.return_value = SimpleNamespace(error=None, data=[item_row])

        fake_ctx["client"].table.return_value = exists_q

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin._get_order_row", return_value=order_row):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.delete_order_item("item-1", authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "order_finalized")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
