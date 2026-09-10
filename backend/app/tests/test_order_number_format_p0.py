"""N-audit: Order number format contract tests.

Validates that generate_order_number() ALWAYS returns the ORD-XXXXX format
(zero-padded to 5 digits). The legacy fallback format ORD-<timestamp>-<hex>
has been removed. On generator failure, the function raises HTTPException(500)
instead of returning a different visible format.

Tests:
- N01: normal generation → ORD-XXXXX
- N02: collision retry → ORD-XXXXX (retry happens at caller level, not generator)
- N03: generator failure → HTTPException, never returns timestamp/hex format
- N04: Kiosk format unchanged (kiosk uses DB-side generation, same ORD-XXXXX format)
"""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.services.order_numbers import generate_order_number


def _make_client_with_order_numbers(order_numbers):
    """Build a mock client whose orders table returns the given order_no rows."""
    fake_client = MagicMock()
    orders_table = MagicMock()
    orders_query = MagicMock()
    orders_query.select.return_value = orders_query
    orders_query.order.return_value = orders_query
    orders_query.limit.return_value = orders_query
    orders_query.execute.return_value = SimpleNamespace(
        error=None,
        data=[{"order_no": no} for no in order_numbers],
    )
    orders_table.select.return_value = orders_query
    fake_client.table.return_value = orders_table
    return fake_client


def _make_failing_client():
    """Build a mock client whose orders table query raises an error."""
    fake_client = MagicMock()
    orders_table = MagicMock()
    orders_query = MagicMock()
    orders_query.select.return_value = orders_query
    orders_query.order.return_value = orders_query
    orders_query.limit.return_value = orders_query
    orders_query.execute.return_value = SimpleNamespace(
        error=Exception("connection refused"),
        data=None,
    )
    orders_table.select.return_value = orders_query
    fake_client.table.return_value = orders_table
    return fake_client


class N01NormalGenerationTests(unittest.TestCase):
    """N01: normal generation → ORD-XXXXX."""

    def test_first_order_generates_ord_00001(self):
        client = _make_client_with_order_numbers([])
        result = generate_order_number(client)
        self.assertEqual(result, "ORD-00001")

    def test_increments_from_existing(self):
        client = _make_client_with_order_numbers(["ORD-00005", "ORD-00003", "ORD-00001"])
        result = generate_order_number(client)
        self.assertEqual(result, "ORD-00006")

    def test_handles_large_sequence(self):
        client = _make_client_with_order_numbers(["ORD-99999"])
        result = generate_order_number(client)
        self.assertEqual(result, "ORD-100000")

    def test_ignores_non_standard_formats(self):
        """Non-ORD-XXXXX formats in DB are ignored for sequence calculation."""
        client = _make_client_with_order_numbers(["ORD-20240101-ABCD", "ORD-00005"])
        result = generate_order_number(client)
        self.assertEqual(result, "ORD-00006")

    def test_format_matches_contract(self):
        r"""Result always matches ^ORD-\d{5,}$ (minimum 5 digits)."""
        import re
        pattern = re.compile(r"^ORD-\d{5,}$")
        client = _make_client_with_order_numbers([])
        result = generate_order_number(client)
        self.assertIsNotNone(pattern.match(result))


class N02CollisionRetryTests(unittest.TestCase):
    """N02: collision retry → ORD-XXXXX.

    The generator itself does not retry — the caller (customer.py / store_admin.py)
    handles unique constraint collisions by calling generate_order_number again.
    This test verifies that repeated calls produce sequential ORD-XXXXX numbers.
    """

    def test_repeated_calls_produce_sequential_numbers(self):
        client = _make_client_with_order_numbers(["ORD-00010"])
        first = generate_order_number(client)
        self.assertEqual(first, "ORD-00011")

        # Simulate a retry after a collision: the DB now has ORD-00011
        client = _make_client_with_order_numbers(["ORD-00010", "ORD-00011"])
        second = generate_order_number(client)
        self.assertEqual(second, "ORD-00012")

    def test_retry_always_uses_ord_format(self):
        """Every retry produces an ORD-XXXXX format, never timestamp/hex."""
        import re
        pattern = re.compile(r"^ORD-\d{5,}$")
        for existing_max in [0, 5, 10, 50, 99]:
            client = _make_client_with_order_numbers(
                [f"ORD-{i:05d}" for i in range(1, existing_max + 1)]
            )
            result = generate_order_number(client)
            self.assertIsNotNone(pattern.match(result), f"Failed for max={existing_max}")


class N03GeneratorFailureTests(unittest.TestCase):
    """N03: generator failure → HTTPException, never returns timestamp/hex format."""

    def test_generator_failure_raises_http_exception(self):
        client = _make_failing_client()
        with self.assertRaises(HTTPException) as ctx_err:
            generate_order_number(client)
        self.assertEqual(ctx_err.exception.status_code, 500)
        self.assertEqual(ctx_err.exception.detail, "order_number_generation_failed")

    def test_generator_failure_never_returns_timestamp_hex(self):
        """The legacy ORD-<timestamp>-<hex> format must NEVER be returned."""
        import re
        timestamp_pattern = re.compile(r"^ORD-\d{14}-[A-F0-9]{4}$")
        client = _make_failing_client()
        try:
            result = generate_order_number(client)
            # If no exception, result must NOT be timestamp/hex format
            self.assertIsNone(timestamp_pattern.match(result),
                              f"Unexpected fallback format: {result}")
        except HTTPException:
            # Expected — generator should raise, not return fallback
            pass

    def test_generator_failure_does_not_silently_succeed(self):
        """Generator failure must NOT silently return a different format."""
        client = _make_failing_client()
        # The function MUST raise, not return a string
        with self.assertRaises(HTTPException):
            generate_order_number(client)


class N04KioskFormatUnchangedTests(unittest.TestCase):
    """N04: Kiosk format unchanged.

    Kiosk order numbers are generated DB-side inside
    create_and_finalize_kiosk_order_atomic RPC using pg_advisory_xact_lock.
    The Python generate_order_number is NOT called for kiosk orders.
    This test verifies the Python generator still produces ORD-XXXXX for
    non-kiosk flows, and documents that kiosk uses DB-side generation.
    """

    def test_python_generator_still_ord_format(self):
        """The Python generator (used by self-order and manual order) still
        produces ORD-XXXXX."""
        client = _make_client_with_order_numbers(["ORD-00100"])
        result = generate_order_number(client)
        self.assertEqual(result, "ORD-00101")

    def test_kiosk_uses_db_side_generation(self):
        """Kiosk order numbers are generated inside the RPC, not by
        generate_order_number. This test documents the contract: the Python
        generator is NOT called for kiosk orders."""
        # The kiosk route calls create_and_finalize_kiosk_order_atomic which
        # calls generate_kiosk_order_no_atomic DB-side. The Python
        # generate_order_number is NOT invoked. This is by design.
        # We verify the Python generator is still correct for non-kiosk flows.
        client = _make_client_with_order_numbers(["ORD-00001"])
        result = generate_order_number(client)
        self.assertEqual(result, "ORD-00002")
        self.assertTrue(result.startswith("ORD-"))
        # Must be numeric suffix, not timestamp
        import re
        self.assertIsNotNone(re.match(r"^ORD-\d{5,}$", result))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
