"""G-audit: General PATCH /orders/{id} cancellation bypass tests.

Validates that PATCH /api/store-admin/orders/{order_id} (the general update
route, NOT the status-only route) requires Owner store role when the request
sets status to cancelled or voided.

Tests:
- G01: Manager PATCH /orders/{id} status=cancelled → 403 owner_role_required
- G02: Staff access remains according to existing route RBAC (manager+ only,
  so staff gets 403 insufficient_role for ANY update including non-cancellation)
- G03: Owner PATCH /orders/{id} status=cancelled → valid according to transition
- G04: Manager normal non-cancellation update → unchanged (allowed)
- G05: Manager PATCH /orders/{id} status=voided → 403 owner_role_required
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import store_admin
from app.api.store_admin import OrderUpdate


def _build_fake_ctx(role: str = "manager") -> Dict[str, Any]:
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


class G01ManagerPatchCancelledDeniedTests(unittest.TestCase):
    """G01: Manager PATCH /orders/{id} status=cancelled → 403 owner_role_required."""

    def test_manager_patch_cancelled_denied(self):
        fake_ctx = _build_fake_ctx("manager")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid",
            }), \
            patch("app.api.store_admin._sanitize_order_payload", return_value={
                "status": "cancelled", "cancelled_reason": "test",
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order(
                    "ord-1", OrderUpdate(status="cancelled", cancelled_reason="test"),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")
            mock_log.assert_not_called()


class G02StaffAccessUnchangedTests(unittest.TestCase):
    """G02: Staff access remains according to existing route RBAC.

    PATCH /orders/{id} requires manager+. Staff gets 403 insufficient_role
    for ANY update (including non-cancellation). This is the existing RBAC
    and is unchanged by the P0-1 fix.
    """

    def test_staff_denied_for_any_update(self):
        fake_ctx = _build_fake_ctx("staff")

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order(
                    "ord-1", OrderUpdate(note="test note"),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "insufficient_role")


class G03OwnerPatchCancelledAllowedTests(unittest.TestCase):
    """G03: Owner PATCH /orders/{id} status=cancelled → valid according to transition."""

    def test_owner_patch_cancelled_allowed(self):
        fake_ctx = _build_fake_ctx("owner")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid",
            }), \
            patch("app.api.store_admin._sanitize_order_payload", return_value={
                "status": "cancelled", "cancelled_reason": "owner_cancel",
            }), \
            patch("app.api.store_admin.recalculate_order_totals"), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin._notify_order_status_change"):
            response = store_admin.update_order(
                "ord-1", OrderUpdate(status="cancelled", cancelled_reason="owner_cancel"),
                authorization="Bearer token",
            )
            self.assertEqual(response["id"], "ord-1")

    def test_owner_patch_cancelled_invalid_transition_rejected(self):
        """Owner cannot cancel from a terminal status (invalid transition)."""
        fake_ctx = _build_fake_ctx("owner")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "completed",
                "payment_status": "paid",
            }), \
            patch("app.api.store_admin._sanitize_order_payload", return_value={
                "status": "cancelled",
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order(
                    "ord-1", OrderUpdate(status="cancelled"),
                    authorization="Bearer token",
                )
            # Owner passes role check, but transition is invalid.
            self.assertEqual(ctx_err.exception.status_code, 400)
            self.assertEqual(ctx_err.exception.detail, "invalid_status_transition")
            mock_log.assert_not_called()


class G04ManagerNonCancellationUpdateUnchangedTests(unittest.TestCase):
    """G04: Manager normal non-cancellation update → unchanged (allowed)."""

    def test_manager_note_update_allowed(self):
        fake_ctx = _build_fake_ctx("manager")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "accepted",
                "payment_status": "paid",
            }), \
            patch("app.api.store_admin._sanitize_order_payload", return_value={
                "note": "updated note",
            }), \
            patch("app.api.store_admin.recalculate_order_totals"):
            response = store_admin.update_order(
                "ord-1", OrderUpdate(note="updated note"),
                authorization="Bearer token",
            )
            self.assertEqual(response["id"], "ord-1")
            self.assertEqual(response["status"], "updated")

    def test_manager_status_preparing_allowed(self):
        """Manager can set non-cancellation status like preparing."""
        fake_ctx = _build_fake_ctx("manager")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "accepted",
                "payment_status": "paid",
            }), \
            patch("app.api.store_admin._sanitize_order_payload", return_value={
                "status": "preparing",
            }), \
            patch("app.api.store_admin.recalculate_order_totals"), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin._notify_order_status_change"):
            response = store_admin.update_order(
                "ord-1", OrderUpdate(status="preparing"),
                authorization="Bearer token",
            )
            self.assertEqual(response["id"], "ord-1")


class G05ManagerPatchVoidedDeniedTests(unittest.TestCase):
    """G05: Manager PATCH /orders/{id} status=voided → 403 owner_role_required."""

    def test_manager_patch_voided_denied(self):
        fake_ctx = _build_fake_ctx("manager")
        orders_query = _build_orders_query()
        fake_ctx["client"].table.return_value = orders_query

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._require_manager"), \
            patch("app.api.store_admin._get_order_row", return_value={
                "id": "ord-1", "status": "pending_payment",
                "payment_status": "unpaid",
            }), \
            patch("app.api.store_admin._sanitize_order_payload", return_value={
                "status": "voided",
            }), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_order(
                    "ord-1", OrderUpdate(status="voided"),
                    authorization="Bearer token",
                )
            self.assertEqual(ctx_err.exception.status_code, 403)
            self.assertEqual(ctx_err.exception.detail, "owner_role_required")
            mock_log.assert_not_called()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
