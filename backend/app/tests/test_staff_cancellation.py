import unittest
from types import SimpleNamespace
from typing import Optional, Tuple
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api.store_admin import OrderStatusUpdate, _staff_can_cancel_operational_order, update_order_status


class StaffCancellationRuleTests(unittest.TestCase):
    def _assert_denied(
        self,
        status: Optional[str],
        payment_status: Optional[str],
        cancelled_at: Optional[str] = None,
        expected_reason: str = "insufficient_role_for_status",
        **kwargs,
    ) -> Tuple[bool, Optional[str]]:
        allowed, reason = _staff_can_cancel_operational_order(status, payment_status, cancelled_at, **kwargs)
        self.assertFalse(allowed)
        self.assertEqual(reason, expected_reason)
        return allowed, reason

    def test_staff_can_cancel_pending_payment_unpaid_order(self):
        allowed, reason = _staff_can_cancel_operational_order("pending_payment", "unpaid", None)
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_staff_can_cancel_draft_unpaid_order(self):
        allowed, reason = _staff_can_cancel_operational_order("draft", "unpaid", None)
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_staff_can_cancel_pending_payment_with_pending_payment_status(self):
        allowed, reason = _staff_can_cancel_operational_order("pending_payment", "pending", None)
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_staff_cannot_cancel_progress_states(self):
        disallowed_statuses = ["accepted", "preparing", "ready", "ready_for_pickup"]
        for status in disallowed_statuses:
            with self.subTest(status=status):
                self._assert_denied(status, "unpaid")

    def test_staff_can_cancel_waiting_payment_review_without_slip(self):
        allowed, reason = _staff_can_cancel_operational_order(
            "waiting_payment_review",
            "pending_review",
            None,
            latest_payment={"slip_submitted": False, "status": "pending"},
        )
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_staff_can_cancel_waiting_payment_review_with_no_payment_record(self):
        allowed, reason = _staff_can_cancel_operational_order("waiting_payment_review", "pending_review", None, latest_payment=None)
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_staff_cannot_cancel_waiting_payment_review_with_slip(self):
        self._assert_denied(
            "waiting_payment_review",
            "pending_review",
            latest_payment={"slip_submitted": True, "status": "pending"},
        )

    def test_staff_cannot_cancel_waiting_payment_review_with_latest_pending_review(self):
        self._assert_denied(
            "waiting_payment_review",
            "pending_review",
            latest_payment={"slip_submitted": False, "status": "pending_review"},
        )

    def test_staff_cannot_cancel_waiting_payment_review_with_submitted_at(self):
        self._assert_denied(
            "waiting_payment_review",
            "pending_review",
            latest_payment={"status": "pending", "slip_submitted": False, "submitted_at": "2024-01-01T00:00:00Z"},
        )

    def test_staff_cannot_cancel_waiting_payment_review_with_slip_path(self):
        self._assert_denied(
            "waiting_payment_review",
            "pending_review",
            latest_payment={"status": "pending", "slip_storage_path": "s3://slip"},
        )

    def test_staff_cannot_cancel_when_payment_pending_review(self):
        self._assert_denied("pending_payment", "pending_review")
        self._assert_denied(
            "waiting_payment_review",
            "pending_review",
            latest_payment={"status": "pending_review", "slip_submitted": True},
        )

    def test_staff_cannot_cancel_paid_order(self):
        self._assert_denied("pending_payment", "paid", expected_reason="staff_cannot_cancel_paid_order")

    def test_staff_cannot_cancel_completed_order(self):
        self._assert_denied("completed", "unpaid", expected_reason="order_already_completed")

    def test_staff_cannot_cancel_archived_order(self):
        self._assert_denied("cancelled", "unpaid", expected_reason="order_already_archived")
        self._assert_denied("pending_payment", "unpaid", cancelled_at="2024-01-01T00:00:00Z", expected_reason="order_already_archived")

    def test_denied_cancellation_does_not_create_log(self):
        order_id = "order-denied"
        fake_ctx = {
            "client": object(),
            "memberships": [{"store_id": "store-1", "role": "staff"}],
            "user_id": "user-1",
        }

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch(
                "app.api.store_admin._get_order_row",
                return_value={
                    "id": order_id,
                    "status": "waiting_payment_review",
                    "payment_status": "unpaid",
                    "cancelled_at": None,
                },
            ), \
            patch("app.api.store_admin._load_latest_payments", return_value={order_id: {"slip_submitted": True}}), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            with self.assertRaises(HTTPException) as ctx_err:
                update_order_status(order_id, OrderStatusUpdate(status="cancelled"), authorization="Bearer token")
            self.assertEqual(ctx_err.exception.detail, "insufficient_role_for_status")
            mock_log.assert_not_called()

    def test_update_order_status_allows_staff_cancel_queue_flow(self):
        order_id = "order-queue"
        fake_ctx, orders_query = self._build_ctx(order_id)

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch(
                "app.api.store_admin._get_order_row",
                return_value={
                    "id": order_id,
                    "status": "pending_payment",
                    "payment_status": "pending",
                    "cancelled_at": None,
                },
            ), \
            patch("app.api.store_admin._load_latest_payments", return_value={order_id: {"slip_submitted": False}}), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            response = update_order_status(order_id, OrderStatusUpdate(status="cancelled"), authorization="Bearer token")

        self.assertEqual(response["status"], "cancelled")
        update_payload = orders_query.update.call_args[0][0]
        self.assertEqual(update_payload["status"], "cancelled")
        self.assertEqual(update_payload["cancelled_reason"], "cancelled_via_status_update")
        mock_log.assert_called_once()

    def test_update_order_status_allows_staff_cancel_detail_flow(self):
        order_id = "order-detail"
        fake_ctx, orders_query = self._build_ctx(order_id)

        with patch("app.api.store_admin._get_ctx", return_value=fake_ctx), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._require_staff_or_above"), \
            patch(
                "app.api.store_admin._get_order_row",
                return_value={
                    "id": order_id,
                    "status": "pending_payment",
                    "payment_status": "unpaid",
                    "cancelled_at": None,
                },
            ), \
            patch("app.api.store_admin._load_latest_payments", return_value={order_id: {"slip_submitted": False}}), \
            patch("app.api.store_admin._write_order_status_log") as mock_log:
            payload = OrderStatusUpdate(status="cancelled", cancelled_reason="cancelled_by_admin")
            response = update_order_status(order_id, payload, authorization="Bearer token")

        self.assertEqual(response["status"], "cancelled")
        update_payload = orders_query.update.call_args[0][0]
        self.assertEqual(update_payload["cancelled_reason"], "cancelled_by_admin")
        mock_log.assert_called_once()

    def _build_ctx(self, order_id: str):
        fake_client = MagicMock()
        orders_query = MagicMock()
        orders_query.update.return_value = orders_query
        orders_query.eq.return_value = orders_query
        orders_query.execute.return_value = SimpleNamespace(error=None, data=[{"id": order_id}])
        fake_client.table.return_value = orders_query
        fake_ctx = {
            "client": fake_client,
            "memberships": [{"store_id": "store-1", "role": "staff"}],
            "user_id": "user-1",
        }
        return fake_ctx, orders_query


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
