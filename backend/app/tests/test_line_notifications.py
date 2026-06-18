import base64
import hashlib
import hmac
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.services.line_service import verify_line_signature
from app.services.notification_sender import send_line_notification


class LineSignatureTests(unittest.TestCase):
    def test_verify_line_signature_valid(self) -> None:
        channel_secret = "secret-key"
        body = b'{"test":true}'
        signature = base64.b64encode(hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()).decode()
        self.assertTrue(verify_line_signature(body, signature, channel_secret))

    def test_verify_line_signature_invalid(self) -> None:
        self.assertFalse(verify_line_signature(b"payload", "invalid", "secret"))


class LineNotificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_status_url = settings.line_status_url
        settings.line_status_url = "https://status.example.com/order/status"

    def tearDown(self) -> None:
        settings.line_status_url = self._original_status_url

    def _build_client(self, order_row: dict) -> MagicMock:
        table = MagicMock()
        table.select.return_value = table
        table.eq.return_value = table
        table.limit.return_value = table
        table.execute.return_value = SimpleNamespace(error=None, data=[order_row])
        client = MagicMock()
        client.table.return_value = table
        return client

    @patch("app.services.notification_sender._has_success_notification", return_value=False)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_send_line_notification_skips_without_identity(self, mock_send_push, mock_log, mock_dedupe) -> None:
        client = self._build_client({"order_no": "ORD-001", "public_token": "tok", "customer_id": "cust"})
        result = send_line_notification(client, "order-id", None, None, "ready", {})
        mock_dedupe.assert_called_once_with(client, "order-id", "ready")
        mock_send_push.assert_not_called()
        mock_log.assert_called_once()
        self.assertEqual(result["send_status"], "skipped")

    @patch("app.services.notification_sender._has_success_notification", return_value=False)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_send_line_notification_success(self, mock_send_push, mock_log, mock_dedupe) -> None:
        mock_send_push.return_value = {"attempted": True, "status": 200}
        client = self._build_client(
            {
                "order_no": "ORD-002",
                "public_token": "pub-token",
                "customer_id": "cust",
                "customers": {"line_user_id": "Uxxxxx"},
                "total_amount": 150.0,
            }
        )
        result = send_line_notification(client, "order-id", None, None, "ready", {})
        mock_dedupe.assert_called_once_with(client, "order-id", "ready")
        mock_send_push.assert_called_once()
        mock_log.assert_called_once()
        self.assertEqual(result["send_status"], "success")

    @patch("app.services.notification_sender._has_success_notification", return_value=False)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_policy_blocks_non_customer_value_statuses(self, mock_send_push, mock_log, mock_dedupe) -> None:
        client = self._build_client({"order_no": "ORD-003", "public_token": "tok"})
        for status in ("accepted", "preparing", "completed"):
            with self.subTest(status=status):
                send_line_notification(client, "order-id", None, None, status, {})
        mock_send_push.assert_not_called()
        mock_log.assert_not_called()
        mock_dedupe.assert_not_called()

    @patch("app.services.notification_sender._has_success_notification", return_value=True)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_duplicate_status_suppressed(self, mock_send_push, mock_log, mock_dedupe) -> None:
        client = self._build_client({"order_no": "ORD-004", "public_token": "tok", "customer_id": "cust"})
        result = send_line_notification(client, "order-id", None, None, "ready", {})
        mock_dedupe.assert_called_once_with(client, "order-id", "ready")
        mock_send_push.assert_not_called()
        mock_log.assert_not_called()
        self.assertEqual(result["reason"], "duplicate_suppressed")

    @patch("app.services.notification_sender._has_success_notification", return_value=False)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_payment_approved_message_has_no_amount(self, mock_send_push, mock_log, _) -> None:
        mock_send_push.return_value = {"attempted": True, "status": 200}
        client = self._build_client(
            {
                "order_no": "ORD-005",
                "public_token": "tok",
                "customer_id": "cust",
                "customers": {"line_user_id": "Uxxxxx"},
                "total_amount": 175.0,
            }
        )
        result = send_line_notification(client, "order-id", None, None, "payment_approved", {})
        self.assertNotIn("ยอดรวม", result["notification_message"])
        self.assertIn("ร้านได้รับการชำระเงินเรียบร้อยแล้ว", result["notification_message"])
        mock_send_push.assert_called_once()
        mock_log.assert_called_once()

    @patch("app.services.notification_sender._has_success_notification", return_value=False)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_ready_message_has_no_amount(self, mock_send_push, mock_log, _) -> None:
        mock_send_push.return_value = {"attempted": True, "status": 200}
        client = self._build_client(
            {
                "order_no": "ORD-006",
                "public_token": "tok",
                "customer_id": "cust",
                "customers": {"line_user_id": "Uxxxxx"},
                "total_amount": 220.0,
            }
        )
        result = send_line_notification(client, "order-id", None, None, "ready", {})
        self.assertNotIn("ยอดรวม", result["notification_message"])
        self.assertIn("เครื่องดื่มของคุณพร้อมรับแล้ว", result["notification_message"])
        mock_send_push.assert_called_once()
        mock_log.assert_called_once()

    @patch("app.services.notification_sender._has_success_notification", return_value=False)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_payment_rejected_omits_internal_reason(self, mock_send_push, mock_log, _) -> None:
        mock_send_push.return_value = {"attempted": True, "status": 200}
        client = self._build_client(
            {
                "order_no": "ORD-007",
                "public_token": "tok",
                "customer_id": "cust",
                "customers": {"line_user_id": "Uxxxxx"},
            }
        )
        result = send_line_notification(
            client,
            "order-id",
            None,
            None,
            "payment_rejected",
            {"reject_reason": "internal note"},
        )
        self.assertNotIn("internal note", result["notification_message"])
        self.assertIn("สลิปการชำระเงินยังไม่ผ่านการตรวจสอบ", result["notification_message"])
        mock_send_push.assert_called_once()
        mock_log.assert_called_once()

    @patch("app.services.notification_sender._has_success_notification", return_value=False)
    @patch("app.services.notification_sender.log_line_notification")
    @patch("app.services.notification_sender.send_line_push")
    def test_cancelled_message_includes_customer_reason(self, mock_send_push, mock_log, _) -> None:
        mock_send_push.return_value = {"attempted": True, "status": 200}
        client = self._build_client(
            {
                "order_no": "ORD-008",
                "public_token": "tok",
                "customer_id": "cust",
                "customers": {"line_user_id": "Uxxxxx"},
            }
        )
        result = send_line_notification(
            client,
            "order-id",
            None,
            None,
            "cancelled",
            {"cancelled_reason": "สินค้าหมด"},
        )
        self.assertIn("สินค้าหมด", result["notification_message"])
        mock_send_push.assert_called_once()
        mock_log.assert_called_once()
