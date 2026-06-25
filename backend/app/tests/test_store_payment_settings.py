import asyncio
import unittest
from io import BytesIO
from types import SimpleNamespace
from typing import Any, Dict, List
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app.api import store_admin


class FakeStorePaymentSettingsTable:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self._mode = "select"
        self._payload: Dict[str, Any] = {}
        self._filters: Dict[str, Any] = {}

    def select(self, *_args, **_kwargs):
        self._mode = "select"
        return self

    def insert(self, payload: Dict[str, Any]):
        self._mode = "insert"
        self._payload = payload
        return self

    def update(self, payload: Dict[str, Any]):
        self._mode = "update"
        self._payload = payload
        return self

    def eq(self, column: str, value: Any):
        self._filters[column] = value
        return self

    def limit(self, _value: int):
        return self

    def execute(self) -> SimpleNamespace:
        if self._mode == "select":
            store_id = self._filters.get("store_id")
            rows = [row for row in self._rows if row.get("store_id") == store_id]
            return SimpleNamespace(data=rows[:1], error=None)
        if self._mode == "insert":
            record = dict(self._payload)
            self._rows.append(record)
            return SimpleNamespace(data=[record], error=None)
        if self._mode == "update":
            store_id = self._filters.get("store_id")
            updated = None
            for row in self._rows:
                if row.get("store_id") == store_id:
                    row.update(self._payload)
                    updated = row
                    break
            return SimpleNamespace(data=[updated] if updated else [], error=None)
        raise AssertionError("unsupported operation")


class FakeClient:
    def __init__(self) -> None:
        self.rows: List[Dict[str, Any]] = []

    def table(self, name: str) -> FakeStorePaymentSettingsTable:
        if name != "store_payment_settings":
            raise AssertionError(f"unexpected table {name}")
        return FakeStorePaymentSettingsTable(self.rows)


class StorePaymentSettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeClient()

    def _build_upload(self, content: bytes, filename: str = "qr.png", content_type: str = "image/png") -> UploadFile:
        headers = {"content-type": content_type}
        return UploadFile(filename=filename, file=BytesIO(content), headers=headers)

    def test_manager_can_read_settings_with_qr(self) -> None:
        self.client.rows.append(
            {
                "store_id": "store-1",
                "promptpay_display_name": "PromptPay",
                "is_promptpay_enabled": True,
                "is_cash_enabled": False,
                "promptpay_qr_storage_path": "store-1/payment/qr/current.png",
                "promptpay_qr_file_name": "qr.png",
            }
        )
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin.create_signed_slip_url", return_value={"signed_url": "https://signed"}):
            response = store_admin.get_store_payment_settings(authorization="Bearer token")

        self.assertEqual(response["settings"]["promptpay_qr_url"], "https://signed")
        self.assertFalse(response["settings"]["is_cash_enabled"])

    def test_staff_can_read_defaults(self) -> None:
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")):
            response = store_admin.get_store_payment_settings(authorization="Bearer token")

        self.assertTrue(response["settings"]["is_cash_enabled"])
        self.assertTrue(response["settings"]["is_promptpay_enabled"])
        self.assertIsNone(response["settings"].get("promptpay_qr_url"))

    def test_staff_cannot_update_settings(self) -> None:
        payload = store_admin.StorePaymentSettingsUpdate(is_cash_enabled=False)
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_store_payment_settings(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.detail, "insufficient_role")

    def test_update_upserts_settings_and_enforces_methods(self) -> None:
        payload = store_admin.StorePaymentSettingsUpdate(
            promptpay_display_name="  My PromptPay  ",
            is_promptpay_enabled=False,
            is_cash_enabled=True,
        )
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")):
            response = store_admin.update_store_payment_settings(payload, authorization="Bearer token")

        stored = self.client.rows[0]
        self.assertFalse(stored["is_promptpay_enabled"])
        self.assertTrue(stored["is_cash_enabled"])
        self.assertEqual(stored["promptpay_display_name"], "My PromptPay")
        self.assertFalse(response["settings"]["is_promptpay_enabled"])

    def test_update_requires_one_payment_method(self) -> None:
        self.client.rows.append(
            {
                "store_id": "store-1",
                "promptpay_display_name": None,
                "is_promptpay_enabled": True,
                "is_cash_enabled": True,
                "promptpay_qr_storage_path": None,
                "promptpay_qr_file_name": None,
            }
        )
        payload = store_admin.StorePaymentSettingsUpdate(is_promptpay_enabled=False, is_cash_enabled=False)
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_store_payment_settings(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.detail, "one_payment_method_required")

    def test_staff_cannot_upload_qr(self) -> None:
        upload = self._build_upload(b"data")
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                asyncio.run(store_admin.upload_store_payment_qr(authorization="Bearer token", file=upload))

        self.assertEqual(ctx_err.exception.detail, "insufficient_role")

    def test_qr_upload_validates_type_and_size(self) -> None:
        upload = self._build_upload(b"data", content_type="application/pdf")
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                asyncio.run(store_admin.upload_store_payment_qr(authorization="Bearer token", file=upload))
        self.assertEqual(ctx_err.exception.detail, "file_type_not_allowed")

        upload_small = self._build_upload(b"1234")
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin._store_payment_qr_limit_bytes", return_value=2):
            with self.assertRaises(HTTPException) as size_err:
                asyncio.run(store_admin.upload_store_payment_qr(authorization="Bearer token", file=upload_small))
        self.assertEqual(size_err.exception.status_code, 413)

    def test_qr_upload_stores_path_and_generates_signed_url(self) -> None:
        upload = self._build_upload(b"binary-data", filename="PromptPay QR.JPG", content_type="image/jpeg")
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin.upload_payment_slip"), \
            patch("app.api.store_admin.create_signed_slip_url", return_value={"signed_url": "https://signed"}):
            response = asyncio.run(store_admin.upload_store_payment_qr(authorization="Bearer token", file=upload))

        stored = self.client.rows[0]
        self.assertEqual(stored["promptpay_qr_storage_path"], "store-1/payment/qr/current.jpg")
        self.assertEqual(stored["promptpay_qr_file_name"], "PromptPay-QR.jpg")
        self.assertEqual(response["settings"]["promptpay_qr_url"], "https://signed")

    def test_qr_delete_clears_fields(self) -> None:
        self.client.rows.append(
            {
                "store_id": "store-1",
                "promptpay_display_name": None,
                "is_promptpay_enabled": True,
                "is_cash_enabled": True,
                "promptpay_qr_storage_path": "store-1/payment/qr/current.png",
                "promptpay_qr_file_name": "qr.png",
            }
        )
        with patch("app.api.store_admin._get_ctx", return_value={"client": self.client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager")), \
            patch("app.api.store_admin.delete_storage_object") as delete_mock:
            response = store_admin.delete_store_payment_qr(authorization="Bearer token")

        stored = self.client.rows[0]
        self.assertIsNone(stored["promptpay_qr_storage_path"])
        self.assertIsNone(stored["promptpay_qr_file_name"])
        delete_mock.assert_called_once()
        self.assertIsNone(response["settings"]["promptpay_qr_url"])

    def test_public_request_blocked(self) -> None:
        with patch("app.api.store_admin._get_ctx", side_effect=HTTPException(status_code=401, detail="missing_token")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.get_store_payment_settings(authorization=None)
        self.assertEqual(ctx_err.exception.detail, "missing_token")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
