import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

from app.api.customer import _update_customer_contact_fields


class CustomerLineNamePolicyTests(unittest.TestCase):
    def _build_select_table(self, existing_name: str | None) -> MagicMock:
        table = MagicMock()
        table.select.return_value = table
        table.eq.return_value = table
        table.limit.return_value = table
        table.execute.return_value = SimpleNamespace(error=None, data=[{"display_name": existing_name}])
        return table

    class _UpdateTableStub:
        def __init__(self) -> None:
            self.payload: dict | None = None

        def update(self, payload: dict) -> "CustomerLineNamePolicyTests._UpdateTableStub":
            self.payload = payload
            return self

        def eq(self, *_args: Any, **_kwargs: Any) -> "CustomerLineNamePolicyTests._UpdateTableStub":
            return self

        def execute(self) -> SimpleNamespace:
            return SimpleNamespace(error=None)

    def _build_update_table(self) -> "CustomerLineNamePolicyTests._UpdateTableStub":
        return CustomerLineNamePolicyTests._UpdateTableStub()

    def test_placeholder_mock_customer_does_not_override_line_display_name(self) -> None:
        client = MagicMock()
        update_table = self._build_update_table()
        client.table.return_value = update_table

        _update_customer_contact_fields(
            client,
            customer_id="cust-1",
            name="Mock Customer",
            phone="0812345678",
            line_name_lock=True,
        )

        self.assertNotIn("display_name", update_table.payload or {})
        self.assertEqual((update_table.payload or {}).get("phone"), "0812345678")

    def test_placeholder_test_customer_does_not_override_line_display_name(self) -> None:
        client = MagicMock()
        update_table = self._build_update_table()
        client.table.return_value = update_table

        _update_customer_contact_fields(
            client,
            customer_id="cust-2",
            name="Test Customer",
            phone="0999999999",
            line_name_lock=True,
        )

        self.assertNotIn("display_name", update_table.payload or {})
        self.assertEqual((update_table.payload or {}).get("phone"), "0999999999")

    def test_meaningful_name_updates_when_existing_missing(self) -> None:
        client = MagicMock()
        update_table = self._build_update_table()
        client.table.return_value = update_table

        _update_customer_contact_fields(
            client,
            customer_id="cust-3",
            name="Jane Doe",
            phone="0800000000",
            line_name_lock=False,
        )

        self.assertEqual((update_table.payload or {}).get("display_name"), "Jane Doe")
        self.assertEqual((update_table.payload or {}).get("phone"), "0800000000")


if __name__ == "__main__":
    unittest.main()
