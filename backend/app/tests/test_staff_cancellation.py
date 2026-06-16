import unittest
from typing import Optional, Tuple

from app.api.store_admin import _staff_can_cancel_operational_order


class StaffCancellationRuleTests(unittest.TestCase):
    def _assert_denied(
        self,
        status: Optional[str],
        payment_status: Optional[str],
        cancelled_at: Optional[str] = None,
        expected_reason: str = "insufficient_role_for_status",
    ) -> Tuple[bool, Optional[str]]:
        allowed, reason = _staff_can_cancel_operational_order(status, payment_status, cancelled_at)
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

    def test_staff_cannot_cancel_progress_states(self):
        disallowed_statuses = ["accepted", "preparing", "ready", "ready_for_pickup"]
        for status in disallowed_statuses:
            with self.subTest(status=status):
                self._assert_denied(status, "unpaid")

    def test_staff_cannot_cancel_waiting_payment_review(self):
        self._assert_denied("waiting_payment_review", "unpaid")

    def test_staff_cannot_cancel_when_payment_pending_review(self):
        self._assert_denied("pending_payment", "pending_review")

    def test_staff_cannot_cancel_paid_order(self):
        self._assert_denied("pending_payment", "paid", expected_reason="staff_cannot_cancel_paid_order")

    def test_staff_cannot_cancel_completed_order(self):
        self._assert_denied("completed", "unpaid", expected_reason="order_already_completed")

    def test_staff_cannot_cancel_archived_order(self):
        self._assert_denied("cancelled", "unpaid", expected_reason="order_already_archived")
        self._assert_denied("pending_payment", "unpaid", cancelled_at="2024-01-01T00:00:00Z", expected_reason="order_already_archived")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
