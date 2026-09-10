"""P0-1: Cancellation bypass prevention tests.

Validates that ALL cancellation-equivalent operations require Owner store role:
- C01: Staff PATCH status=cancelled → 403 owner_role_required
- C02: Manager PATCH status=cancelled → 403 owner_role_required
- C03: Owner PATCH status=cancelled → allowed if transition is valid
- C04: Staff PATCH status=voided → 403 owner_role_required
- C05: Manager DELETE/archive → 403 owner_role_required
- C06: Owner DELETE/archive → existing behavior preserved
- C07: Staff operational transitions (accepted/preparing/ready/completed) preserved
- C08: Canonical /cancel remains Owner-only
- C09: Deprecated /cancel-atomic remains Owner-only
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, Optional, Tuple
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import store_admin
from app.api.store_admin import OrderStatusUpdate, OrderCancelPayload


def _build_fake_ctx(role: str = "staff") -> Dict[str, Any]:
    return {
        "client": MagicMock(),
        "user_id": "user-1",
        "memberships": [{"store_id": "store-1", "role": role}],
    }


def _build_orders_query() -> MagicMock:
    orders_query = MagicMock()
    orders_query.update.return_value = orders_query
    orders_query.eq.return_value = orders_query
    orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])
    return orders_query


class C01StaffPatchCancelledDeniedTests(unittest.TestCase):
    """C01: Staff PATCH status=cancelled → 403 owner_role_required."""

    def test_staff_patch_cancelled_denied(self):
        fake_ctx = _build_fake_ctx("staff")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid", "cancelled_at": None,
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order_status(
                    "ord-1", OrderStatusUpdate(status="cancelled"),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")
            mock_log.assert_not_called()


class C02ManagerPatchCancelledDeniedTests(unittest.TestCase):
    """C02: Manager PATCH status=cancelled → 403 owner_role_required."""

    def test_manager_patch_cancelled_denied(self):
        fake_ctx = _build_fake_ctx("manager")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid", "cancelled_at": None,
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order_status(
                    "ord-1", OrderStatusUpdate(status="cancelled"),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")
            mock_log.assert_not_called()


class C03OwnerPatchCancelledAllowedTests(unittest.TestCase):
    """C03: Owner PATCH status=cancelled → allowed if transition is valid."""

    def test_owner_patch_cancelled_allowed(self):
        fake_ctx = _build_fake_ctx("owner")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid", "cancelled_at": None,
            }), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin._notify_order_status_change"):
            response = store_admin.update_order_status(
                "ord-1", OrderStatusUpdate(status="cancelled"),
                authorization="Bearer token",
            )
            self.assertEqual(response["status"], "cancelled")

    def test_owner_patch_cancelled_invalid_transition_still_rejected(self):
        """Owner cannot cancel from a terminal status (invalid transition)."""
        fake_ctx = _build_fake_ctx("owner")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "completed",
                "payment_status": "paid", "cancelled_at": None,
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order_status(
                    "ord-1", OrderStatusUpdate(status="cancelled"),
                    authorization="Bearer token",
                )
            # Owner passes the role check, but the transition is invalid.
            self.assertEqual(ctx_err.exception.status_code, 400)
            self.assertEqual(ctx_err.exception.detail, "invalid_status_transition")
            mock_log.assert_not_called()


class C04StaffPatchVoidedDeniedTests(unittest.TestCase):
    """C04: Staff PATCH status=voided → 403 owner_role_required."""

    def test_staff_patch_voided_denied(self):
        fake_ctx = _build_fake_ctx("staff")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid", "cancelled_at": None,
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order_status(
                    "ord-1", OrderStatusUpdate(status="voided"),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")
            mock_log.assert_not_called()


class C05ManagerDeleteDeniedTests(unittest.TestCase):
    """C05: Manager DELETE/archive → 403 owner_role_required."""

    def test_manager_delete_denied(self):
        fake_ctx = _build_fake_ctx("manager")
        fake_client = MagicMock()
        fake_ctx["client"] = fake_client

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid",
            }):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.delete_order("ord-1", authorization="Bearer token")
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")


class C06OwnerDeleteAllowedTests(unittest.TestCase):
    """C06: Owner DELETE/archive → existing behavior preserved."""

    def test_owner_delete_cancelled_order(self):
        fake_ctx = _build_fake_ctx("owner")
        fake_client = MagicMock()
        fake_ctx["client"] = fake_client

        orders_query = MagicMock()
        orders_query.update.return_value = orders_query
        orders_query.eq.return_value = orders_query
        orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": "ord-1"}])

        payments_query = MagicMock()
        payments_query.select.return_value = payments_query
        payments_query.eq.return_value = payments_query
        payments_query.execute.return_value = SimpleNamespace(error=None, data=[])

        def mock_table(name):
            if name == "orders":
                return orders_query
            elif name == "payments":
                return payments_query
            return MagicMock()

        fake_client.table = mock_table

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid",
            }), \
            patch("app.api.store_admin._payments_has_column", return_value=True), \
            patch("app.api.store_admin._write_order_status_log"):
            response = store_admin.delete_order("ord-1", authorization="Bearer token")
            self.assertEqual(response["status"], "archived")
            self.assertIn(response["order_status"], ["cancelled", "voided"])


class C07StaffOperationalTransitionsPreservedTests(unittest.TestCase):
    """C07: Staff operational transitions (accepted/preparing/ready/completed) preserved."""

    def _test_staff_operational_transition(self, target_status: str):
        fake_ctx = _build_fake_ctx("staff")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "accepted",
                "payment_status": "paid", "cancelled_at": None,
            }), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin._notify_order_status_change"):
            response = store_admin.update_order_status(
                "ord-1", OrderStatusUpdate(status=target_status),
                authorization="Bearer token",
            )
            self.assertEqual(response["status"], target_status)

    def test_staff_can_set_preparing(self):
        self._test_staff_operational_transition("preparing")

    def test_staff_can_set_ready(self):
        self._test_staff_operational_transition("ready")

    def test_staff_can_set_completed(self):
        self._test_staff_operational_transition("completed")

    def test_staff_invalid_transition_still_rejected(self):
        """completed → accepted is not a valid transition, so it's rejected
        by the transition validator, not by the role check."""
        fake_ctx = _build_fake_ctx("staff")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "completed",
                "payment_status": "paid", "cancelled_at": None,
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order_status(
                    "ord-1", OrderStatusUpdate(status="accepted"),
                    authorization="Bearer token",
                )
            # Invalid transition, not role denial.
            self.assertEqual(ctx_err.exception.status_code, 400)
            self.assertEqual(ctx_err.exception.detail, "invalid_status_transition")
            mock_log.assert_not_called()


class C08CanonicalCancelOwnerOnlyTests(unittest.TestCase):
    """C08: Canonical /cancel remains Owner-only."""

    def test_staff_cancel_denied(self):
        """Staff calling /cancel should get 403 owner_role_required."""
        fake_ctx = _build_fake_ctx("staff")

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1", OrderCancelPayload(),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")

    def test_manager_cancel_denied(self):
        """Manager calling /cancel should get 403 owner_role_required."""
        fake_ctx = _build_fake_ctx("manager")

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order(
                    "ord-1", OrderCancelPayload(),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")


class C09DeprecatedCancelAtomicOwnerOnlyTests(unittest.TestCase):
    """C09: Deprecated /cancel-atomic remains Owner-only."""

    def test_staff_cancel_atomic_denied(self):
        """Staff calling /cancel-atomic should get 403 owner_role_required."""
        fake_ctx = _build_fake_ctx("staff")

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order_atomic(
                    "ord-1", OrderCancelPayload(),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")

    def test_manager_cancel_atomic_denied(self):
        """Manager calling /cancel-atomic should get 403 owner_role_required."""
        fake_ctx = _build_fake_ctx("manager")

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.cancel_order_atomic(
                    "ord-1", OrderCancelPayload(),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
