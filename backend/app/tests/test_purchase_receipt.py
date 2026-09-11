"""Isolated tests for the Purchase Receipt lifecycle (PR01-PR24).

All tests use local fakes/mocks — no real Supabase or Storage calls.
Covers: upload validation, authorization, store scope, durable reference,
signed URL on demand, safe replace, delete, and transaction safety.
"""
import asyncio
import unittest
from io import BytesIO
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app.api import store_admin
from app.services.storage import StorageUploadError


STORE_ID = "store-1"
OTHER_STORE_ID = "store-2"
INTAKE_ID = "pur-1"
INGREDIENT_ID = "ing-1"


class FakeIntakeTable:
    """Fake ingredient_purchases table supporting select + update."""

    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self._mode = "select"
        self._columns = "*"
        self._filters: Dict[str, Any] = {}
        self._payload: Dict[str, Any] = {}
        self._limit_value: Optional[int] = None

    def select(self, columns: str = "*"):
        self._mode = "select"
        self._columns = columns
        return self

    def update(self, payload: Dict[str, Any]):
        self._mode = "update"
        self._payload = dict(payload)
        return self

    def eq(self, column: str, value: Any):
        self._filters[column] = value
        return self

    def limit(self, value: int):
        self._limit_value = value
        return self

    def execute(self) -> SimpleNamespace:
        if self._mode == "select":
            rows = [r for r in self._rows if self._matches(r)]
            if self._limit_value:
                rows = rows[: self._limit_value]
            return SimpleNamespace(data=[dict(r) for r in rows], error=None)
        if self._mode == "update":
            updated = None
            for r in self._rows:
                if self._matches(r):
                    r.update(self._payload)
                    updated = dict(r)
            return SimpleNamespace(data=[updated] if updated else [], error=None)
        raise AssertionError(f"unsupported mode {self._mode}")

    def _matches(self, row: Dict[str, Any]) -> bool:
        for col, val in self._filters.items():
            if str(row.get(col)) != str(val):
                return False
        return True


class FakeClient:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._table = FakeIntakeTable(rows)

    def table(self, name: str) -> FakeIntakeTable:
        if name != "ingredient_purchases":
            raise AssertionError(f"unexpected table {name}")
        return self._table


def _intake_row(
    *,
    store_id: str = STORE_ID,
    intake_id: str = INTAKE_ID,
    receipt_storage_path: Optional[str] = None,
    receipt_url: Optional[str] = None,
    payment_status: str = "paid",
) -> Dict[str, Any]:
    return {
        "id": intake_id,
        "store_id": store_id,
        "ingredient_id": INGREDIENT_ID,
        "quantity": 5,
        "normalized_quantity": 5,
        "purchase_unit": "g",
        "conversion_factor": 1,
        "total_cost": 100,
        "unit_cost_snapshot": 20,
        "supplier_name": "Supplier",
        "payment_status": payment_status,
        "paid_at": "2026-01-01T00:00:00Z",
        "due_date": None,
        "note": None,
        "receipt_url": receipt_url,
        "receipt_storage_path": receipt_storage_path,
        "created_at": "2026-01-01T00:00:00Z",
        "created_by": "user-1",
        "is_perishable": False,
        "lot_code": None,
        "expires_at": None,
        "expiry_note": None,
        "ingredients": {"id": INGREDIENT_ID, "name": "Milk", "unit": "g"},
    }


def _build_upload(content: bytes, filename: str = "receipt.jpg", content_type: str = "image/jpeg") -> UploadFile:
    headers = {"content-type": content_type}
    return UploadFile(filename=filename, file=BytesIO(content), headers=headers)


def _ctx(client: FakeClient, role: str = "manager") -> Dict[str, Any]:
    return {
        "client": client,
        "user_id": "user-1",
        "memberships": [{"store_id": STORE_ID, "role": role}],
        "profile": {"role": role},
    }


class PurchaseReceiptUploadTests(unittest.TestCase):
    """PR01-PR11: upload, validation, durable reference."""

    def _run(self, coro):
        return asyncio.run(coro)

    def test_pr01_valid_jpeg_accepted(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock, \
             patch("app.api.store_admin.delete_storage_object") as delete_mock:
            result = self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"jpeg-data")))
        upload_mock.assert_called_once()
        self.assertEqual(upload_mock.call_args.args[0], "purchase-receipts")
        self.assertIsNotNone(result.receipt_storage_path)
        # No old receipt → no cleanup delete
        delete_mock.assert_not_called()

    def test_pr02_valid_png_accepted(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object"):
            result = self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"png", "r.png", "image/png")))
        self.assertIsNotNone(result.receipt_storage_path)

    def test_pr03_valid_webp_accepted(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object"):
            result = self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"webp", "r.webp", "image/webp")))
        self.assertIsNotNone(result.receipt_storage_path)

    def test_pr04_oversize_rejected(self):
        client = FakeClient([_intake_row()])
        big = b"x" * (5 * 1024 * 1024 + 1)
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock:
            with self.assertRaises(HTTPException) as exc:
                self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(big)))
        self.assertEqual(exc.exception.status_code, 413)
        upload_mock.assert_not_called()

    def test_pr05_unsupported_mime_rejected(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock:
            with self.assertRaises(HTTPException) as exc:
                self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"x", "r.pdf", "application/pdf")))
        self.assertEqual(exc.exception.detail, "file_type_not_allowed")
        upload_mock.assert_not_called()

    def test_pr06_unauthenticated_rejected(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", side_effect=HTTPException(status_code=401, detail="missing_token")):
            with self.assertRaises(HTTPException) as exc:
                self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization=None, file=_build_upload(b"x")))
        self.assertEqual(exc.exception.status_code, 401)

    def test_pr07_cross_store_rejected(self):
        client = FakeClient([_intake_row(store_id=OTHER_STORE_ID)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock:
            with self.assertRaises(HTTPException) as exc:
                self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"x")))
        # Intake belongs to other store → select returns no rows → 404
        self.assertEqual(exc.exception.status_code, 404)
        upload_mock.assert_not_called()

    def test_pr08_missing_intake_rejected(self):
        client = FakeClient([])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock:
            with self.assertRaises(HTTPException) as exc:
                self._run(store_admin.upload_stock_intake_receipt("missing-id", authorization="t", file=_build_upload(b"x")))
        self.assertEqual(exc.exception.status_code, 404)
        upload_mock.assert_not_called()

    def test_pr09_purchase_receipts_bucket_used(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock, \
             patch("app.api.store_admin.delete_storage_object"):
            self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"x")))
        self.assertEqual(upload_mock.call_args.args[0], "purchase-receipts")

    def test_pr10_receipt_storage_path_persisted(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object"):
            result = self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"x")))
        stored = client._table._rows[0]
        self.assertIsNotNone(stored["receipt_storage_path"])
        self.assertEqual(stored["receipt_storage_path"], result.receipt_storage_path)

    def test_pr11_signed_url_not_persisted_as_durable(self):
        client = FakeClient([_intake_row(receipt_url="https://old-signed-url")])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object"):
            self._run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"x")))
        stored = client._table._rows[0]
        # receipt_url must be cleared to None — no signed URL persisted
        self.assertIsNone(stored["receipt_url"])
        self.assertIsNotNone(stored["receipt_storage_path"])


class PurchaseReceiptViewTests(unittest.TestCase):
    """PR12-PR14: view / signed URL on demand."""

    def test_pr12_fresh_signed_url_generated_on_view(self):
        client = FakeClient([_intake_row(receipt_storage_path="store-1/ingredient-purchases/pur-1/old.jpg")])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.create_signed_slip_url", return_value={"signed_url": "https://fresh-signed", "expires_in": 60}) as signed_mock:
            result = store_admin.generate_stock_intake_receipt_url(INTAKE_ID, authorization="t")
        signed_mock.assert_called_once()
        self.assertEqual(result["signed_url"], "https://fresh-signed")

    def test_pr13_view_authorization_enforced(self):
        client = FakeClient([_intake_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "staff")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.generate_stock_intake_receipt_url(INTAKE_ID, authorization="t")
        self.assertEqual(exc.exception.detail, "insufficient_role")

    def test_pr14_missing_receipt_returns_error(self):
        client = FakeClient([_intake_row(receipt_storage_path=None)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.generate_stock_intake_receipt_url(INTAKE_ID, authorization="t")
        self.assertEqual(exc.exception.status_code, 404)
        self.assertEqual(exc.exception.detail, "receipt_not_uploaded")


class PurchaseReceiptReplaceTests(unittest.TestCase):
    """PR15-PR19: safe replace lifecycle."""

    def test_pr15_replacement_uploads_new_unique_path(self):
        old_path = "store-1/ingredient-purchases/pur-1/old.jpg"
        client = FakeClient([_intake_row(receipt_storage_path=old_path)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock, \
             patch("app.api.store_admin.delete_storage_object") as delete_mock:
            result = asyncio.run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"new")))
        new_path = upload_mock.call_args.args[1]
        self.assertNotEqual(new_path, old_path)
        self.assertEqual(result.receipt_storage_path, new_path)
        stored = client._table._rows[0]
        self.assertEqual(stored["receipt_storage_path"], new_path)

    def test_pr16_successful_replacement_cleans_old_object(self):
        old_path = "store-1/ingredient-purchases/pur-1/old.jpg"
        client = FakeClient([_intake_row(receipt_storage_path=old_path)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object") as delete_mock:
            asyncio.run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"new")))
        delete_mock.assert_called_once()
        self.assertEqual(delete_mock.call_args.args[1], old_path)

    def test_pr17_db_update_failure_cleans_newly_uploaded(self):
        client = FakeClient([_intake_row(receipt_storage_path="store-1/old.jpg")])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock, \
             patch("app.api.store_admin.delete_storage_object") as delete_mock, \
             patch("app.api.store_admin._update_purchase_receipt_fields", side_effect=HTTPException(status_code=500, detail="purchase_receipt_update_failed")):
            with self.assertRaises(HTTPException) as exc:
                asyncio.run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"new")))
        self.assertEqual(exc.exception.detail, "purchase_receipt_update_failed")
        new_path = upload_mock.call_args.args[1]
        # Newly uploaded object should be cleaned up
        delete_mock.assert_called_once()
        self.assertEqual(delete_mock.call_args.args[1], new_path)

    def test_pr18_db_update_failure_preserves_previous_receipt_path(self):
        old_path = "store-1/ingredient-purchases/pur-1/old.jpg"
        client = FakeClient([_intake_row(receipt_storage_path=old_path)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object"), \
             patch("app.api.store_admin._update_purchase_receipt_fields", side_effect=HTTPException(status_code=500, detail="purchase_receipt_update_failed")):
            with self.assertRaises(HTTPException):
                asyncio.run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"new")))
        # DB row should still point to old path (update never succeeded)
        stored = client._table._rows[0]
        self.assertEqual(stored["receipt_storage_path"], old_path)

    def test_pr19_cleanup_failure_does_not_corrupt_new_db_reference(self):
        old_path = "store-1/ingredient-purchases/pur-1/old.jpg"
        client = FakeClient([_intake_row(receipt_storage_path=old_path)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip") as upload_mock, \
             patch("app.api.store_admin.delete_storage_object", side_effect=StorageUploadError("cleanup_failed")):
            result = asyncio.run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"new")))
        new_path = upload_mock.call_args.args[1]
        # DB must point to new path despite old-object cleanup failure
        self.assertEqual(result.receipt_storage_path, new_path)
        stored = client._table._rows[0]
        self.assertEqual(stored["receipt_storage_path"], new_path)


class PurchaseReceiptTransactionSafetyTests(unittest.TestCase):
    """PR20-PR21: receipt ops must not touch stock/cost/payment."""

    def test_pr20_receipt_operation_does_not_modify_payment_status(self):
        client = FakeClient([_intake_row(payment_status="paid", receipt_storage_path="old.jpg")])
        original_payment_status = client._table._rows[0]["payment_status"]
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object"):
            asyncio.run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"new")))
        stored = client._table._rows[0]
        self.assertEqual(stored["payment_status"], original_payment_status)
        # No other financial fields changed
        self.assertEqual(stored["total_cost"], 100)
        self.assertEqual(stored["unit_cost_snapshot"], 20)

    def test_pr21_receipt_operation_does_not_modify_stock_or_cost(self):
        client = FakeClient([_intake_row(receipt_storage_path="old.jpg")])
        original_quantity = client._table._rows[0]["quantity"]
        original_total_cost = client._table._rows[0]["total_cost"]
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip"), \
             patch("app.api.store_admin.delete_storage_object"):
            asyncio.run(store_admin.upload_stock_intake_receipt(INTAKE_ID, authorization="t", file=_build_upload(b"new")))
        stored = client._table._rows[0]
        self.assertEqual(stored["quantity"], original_quantity)
        self.assertEqual(stored["total_cost"], original_total_cost)


class PurchaseReceiptDeleteTests(unittest.TestCase):
    """PR22-PR24: delete receipt lifecycle."""

    def test_pr22_delete_receipt_preserves_stock_intake(self):
        path = "store-1/ingredient-purchases/pur-1/receipt.jpg"
        client = FakeClient([_intake_row(receipt_storage_path=path)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.delete_storage_object") as delete_mock:
            result = store_admin.delete_stock_intake_receipt(INTAKE_ID, authorization="t")
        self.assertEqual(result["status"], "receipt_deleted")
        stored = client._table._rows[0]
        # Stock intake row still exists with all financial data intact
        self.assertEqual(stored["id"], INTAKE_ID)
        self.assertEqual(stored["quantity"], 5)
        self.assertEqual(stored["total_cost"], 100)
        self.assertEqual(stored["payment_status"], "paid")
        delete_mock.assert_called_once()

    def test_pr23_delete_receipt_clears_receipt_reference(self):
        path = "store-1/ingredient-purchases/pur-1/receipt.jpg"
        client = FakeClient([_intake_row(receipt_storage_path=path, receipt_url="https://stale")])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.delete_storage_object"):
            store_admin.delete_stock_intake_receipt(INTAKE_ID, authorization="t")
        stored = client._table._rows[0]
        self.assertIsNone(stored["receipt_storage_path"])
        self.assertIsNone(stored["receipt_url"])

    def test_pr24_cross_store_delete_rejected(self):
        path = "store-2/ingredient-purchases/pur-1/receipt.jpg"
        client = FakeClient([_intake_row(store_id=OTHER_STORE_ID, receipt_storage_path=path)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.delete_storage_object") as delete_mock:
            with self.assertRaises(HTTPException) as exc:
                store_admin.delete_stock_intake_receipt(INTAKE_ID, authorization="t")
        # Intake belongs to other store → select returns no rows → 404
        self.assertEqual(exc.exception.status_code, 404)
        delete_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
