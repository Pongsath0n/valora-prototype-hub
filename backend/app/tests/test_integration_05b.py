"""BE-FIX-05B: Isolated Atomic Integration Validation.

Runs against the isolated Docker PostgreSQL on localhost:5433.
Tests the REAL transaction behavior of:
  - create_and_finalize_kiosk_order_atomic (cash + promptpay)
  - finalize_paid_order_atomic (self-order path)
  - apply_order_stock_usage (stock deduction)
  - Insufficient stock rollback
  - Concurrency races (self-order vs kiosk, kiosk vs kiosk)
  - Idempotency (double confirm, timeout replay, wrong method)
  - Security (unauthorized actor, invalid payment method)
  - Trusted snapshot failure
"""
import json
import os
import threading
import time
import unittest
import uuid
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras

# ── Connection config ──────────────────────────────────────────
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "healholic_test"
DB_USER = "postgres"
DB_PASSWORD = "testpass"

psycopg2.extras.register_uuid()


def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
    )


def exec_sql(conn, sql, params=None, fetch="all"):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        if fetch == "all":
            return cur.fetchall()
        elif fetch == "one":
            return cur.fetchone()
        elif fetch == "none":
            return None
        return None


def call_rpc(conn, func_name, args) -> Optional[Dict[str, Any]]:
    """Call a RPC function and return the JSONB result."""
    placeholders = ", ".join(["%s"] * len(args))
    sql = f"SELECT * FROM public.{func_name}({placeholders});"
    with conn.cursor() as cur:
        cur.execute(sql, args)
        row = cur.fetchone()
        if row:
            return row[0] if isinstance(row[0], dict) else json.loads(row[0])
    return None


def call_rpc_safe(conn, func_name, args) -> Tuple[Optional[Dict], Optional[str]]:
    """Call a RPC function, returning (result, error_message)."""
    try:
        result = call_rpc(conn, func_name, args)
        conn.commit()
        return result, None
    except Exception as exc:
        conn.rollback()
        return None, str(exc)


# ── Fixture helpers ────────────────────────────────────────────

def setup_fixtures(conn) -> Dict[str, str]:
    """Create minimal test fixtures. Returns IDs."""
    ids: Dict[str, str] = {}

    # Store
    store_id = str(uuid.uuid4())
    exec_sql(conn, "INSERT INTO public.stores (id, name) VALUES (%s, 'Test Store')",
             (store_id,), "none")
    ids["store_id"] = store_id

    # Owner
    owner_id = str(uuid.uuid4())
    exec_sql(conn, "INSERT INTO public.profiles (id, email, full_name, role) VALUES (%s, %s, %s, %s)",
             (owner_id, "owner@test.com", "Owner", "owner"), "none")
    exec_sql(conn, "INSERT INTO public.store_members (store_id, user_id, role) VALUES (%s, %s, 'owner')",
             (store_id, owner_id), "none")
    ids["owner_id"] = owner_id

    # Manager
    manager_id = str(uuid.uuid4())
    exec_sql(conn, "INSERT INTO public.profiles (id, email, full_name, role) VALUES (%s, %s, %s, %s)",
             (manager_id, "manager@test.com", "Manager", "manager"), "none")
    exec_sql(conn, "INSERT INTO public.store_members (store_id, user_id, role) VALUES (%s, %s, 'manager')",
             (store_id, manager_id), "none")
    ids["manager_id"] = manager_id

    # Staff
    staff_id = str(uuid.uuid4())
    exec_sql(conn, "INSERT INTO public.profiles (id, email, full_name, role) VALUES (%s, %s, %s, %s)",
             (staff_id, "staff@test.com", "Staff", "staff"), "none")
    exec_sql(conn, "INSERT INTO public.store_members (store_id, user_id, role) VALUES (%s, %s, 'staff')",
             (store_id, staff_id), "none")
    ids["staff_id"] = staff_id

    # Non-member
    non_member_id = str(uuid.uuid4())
    exec_sql(conn, "INSERT INTO public.profiles (id, email, full_name, role) VALUES (%s, %s, %s, %s)",
             (non_member_id, "outsider@test.com", "Outsider", "staff"), "none")
    ids["non_member_id"] = non_member_id

    # Ingredient
    ingredient_id = str(uuid.uuid4())
    exec_sql(conn,
             "INSERT INTO public.ingredients (id, store_id, name, unit, cost_per_unit, current_stock) "
             "VALUES (%s, %s, 'Coffee Beans', 'g', 1.0, 100)",
             (ingredient_id, store_id), "none")
    ids["ingredient_id"] = ingredient_id

    # Product
    product_id = str(uuid.uuid4())
    exec_sql(conn,
             "INSERT INTO public.products (id, store_id, name, base_price, is_active) "
             "VALUES (%s, %s, 'TEST-AMERICANO', 50, true)",
             (product_id, store_id), "none")
    ids["product_id"] = product_id

    # Recipe (10g per serving)
    exec_sql(conn,
             "INSERT INTO public.recipes (store_id, product_id, ingredient_id, quantity_used, unit) "
             "VALUES (%s, %s, %s, 10, 'g')",
             (store_id, product_id, ingredient_id), "none")

    conn.commit()
    return ids


def make_kiosk_item(product_id: str, ingredient_id: str, qty: int = 1) -> Dict[str, Any]:
    """Build a trusted kiosk order item with usage snapshot."""
    return {
        "product_id": product_id,
        "product_name_snapshot": "TEST-AMERICANO",
        "quantity": qty,
        "unit_price": 50.0,
        "unit_cost": 10.0,
        "total_price": 50.0 * qty,
        "total_cost": 10.0 * qty,
        "line_profit": 40.0 * qty,
        "option_total": 0,
        "option_cost_total": 0,
        "options": {
            "sweetness": 100,
            "addons": [],
            "_system": {
                "usage_breakdown": {
                    "base": [
                        {"ingredient_id": ingredient_id, "quantity_used": 10.0, "unit": "g"}
                    ],
                    "addons": [],
                }
            },
        },
    }


def make_kiosk_items_json(items: List[Dict]) -> str:
    return json.dumps(items)


def set_stock(conn, ingredient_id: str, stock: float):
    exec_sql(conn, "UPDATE public.ingredients SET current_stock = %s WHERE id = %s",
             (stock, ingredient_id), "none")
    conn.commit()


def get_stock(conn, ingredient_id: str) -> float:
    row = exec_sql(conn, "SELECT current_stock FROM public.ingredients WHERE id = %s",
                  (ingredient_id,), "one")
    return float(row["current_stock"]) if row else -1


def count_rows(conn, table: str, where: str = "", params: tuple = ()) -> int:
    sql = f"SELECT COUNT(*) AS cnt FROM public.{table}"
    if where:
        sql += f" WHERE {where}"
    row = exec_sql(conn, sql, params, "one")
    return int(row["cnt"]) if row else 0


def reset_isolated_db():
    """Truncate all business tables for a clean test run."""
    conn = get_conn()
    try:
        for table in [
            "payment_status_logs", "order_status_logs", "stock_movements",
            "payments", "order_items", "orders",
            "recipes", "products", "ingredients",
            "customers", "sales_channels",
            "store_members", "profiles", "stores",
        ]:
            exec_sql(conn, f"TRUNCATE public.{table} RESTART IDENTITY CASCADE", None, "none")
        conn.commit()
    finally:
        conn.close()


# ── Test Classes ───────────────────────────────────────────────

class BEFIX05BIntegrationTests(unittest.TestCase):
    """BE-FIX-05B: Isolated Atomic Integration Validation."""

    @classmethod
    def setUpClass(cls):
        """Set up fixtures once for all tests."""
        reset_isolated_db()
        conn = get_conn()
        try:
            cls.ids = setup_fixtures(conn)
        finally:
            conn.close()

    @classmethod
    def tearDownClass(cls):
        reset_isolated_db()

    def setUp(self):
        """Reset stock before each test."""
        conn = get_conn()
        try:
            set_stock(conn, self.ids["ingredient_id"], 100)
            # Clean orders/payments/stock_movements
            exec_sql(conn, "DELETE FROM public.payment_status_logs", None, "none")
            exec_sql(conn, "DELETE FROM public.order_status_logs", None, "none")
            exec_sql(conn, "DELETE FROM public.stock_movements", None, "none")
            exec_sql(conn, "DELETE FROM public.payments", None, "none")
            exec_sql(conn, "DELETE FROM public.order_items", None, "none")
            exec_sql(conn, "DELETE FROM public.orders", None, "none")
            conn.commit()
        finally:
            conn.close()

    # ── T08: Basic Kiosk Cash Test ──────────────────────────────

    def test_t08_kiosk_cash_atomic(self):
        """T08: Kiosk cash sale → accepted/paid, stock deducted once."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNone(err, f"RPC failed: {err}")
            self.assertEqual(result["status"], "finalized")
            self.assertEqual(result["payment_method"], "cash")
            self.assertIsNotNone(result["confirmed_at"])
            self.assertEqual(result["idempotent_replay"], False)

            # Verify order
            order = exec_sql(conn, "SELECT * FROM public.orders WHERE id = %s",
                             (client_order_id,), "one")
            self.assertEqual(order["order_source"], "kiosk")
            self.assertEqual(order["status"], "accepted")
            self.assertEqual(order["payment_status"], "paid")

            # Verify exactly one paid payment
            self.assertEqual(count_rows(conn, "payments", "order_id = %s", (client_order_id,)), 1)
            payment = exec_sql(conn,
                "SELECT * FROM public.payments WHERE order_id = %s AND status = 'paid'",
                (client_order_id,), "one")
            self.assertEqual(payment["method"], "cash")
            self.assertIsNotNone(payment["confirmed_at"])

            # Verify stock deducted exactly once (100 - 10 = 90)
            self.assertAlmostEqual(get_stock(conn, self.ids["ingredient_id"]), 90)

            # Verify exactly one stock movement
            self.assertEqual(count_rows(conn, "stock_movements",
                "ref_order_id = %s AND movement_type = 'used'", (client_order_id,)), 1)
        finally:
            conn.close()

    # ── T09: Basic Kiosk PromptPay Test ─────────────────────────

    def test_t09_kiosk_promptpay_atomic(self):
        """T09: Kiosk promptpay sale → same atomic engine, accepted/paid."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "promptpay",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNone(err, f"RPC failed: {err}")
            self.assertEqual(result["status"], "finalized")
            self.assertEqual(result["payment_method"], "promptpay")
            self.assertIsNotNone(result["confirmed_at"])

            payment = exec_sql(conn,
                "SELECT * FROM public.payments WHERE order_id = %s AND status = 'paid'",
                (client_order_id,), "one")
            self.assertEqual(payment["method"], "promptpay")

            self.assertAlmostEqual(get_stock(conn, self.ids["ingredient_id"]), 90)
        finally:
            conn.close()

    # ── T10: Insufficient Stock Rollback ────────────────────────

    def test_t10_insufficient_stock_rollback(self):
        """T10: Insufficient stock → full rollback, no partial state."""
        conn = get_conn()
        try:
            set_stock(conn, self.ids["ingredient_id"], 5)  # Less than 10 required

            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNotNone(err, "Should have failed")
            self.assertIn("insufficient_stock", err)

            # Verify NO order exists
            self.assertEqual(count_rows(conn, "orders", "id = %s", (client_order_id,)), 0)
            # Verify NO order_items
            self.assertEqual(count_rows(conn, "order_items", "order_id = %s", (client_order_id,)), 0)
            # Verify NO payment
            self.assertEqual(count_rows(conn, "payments", "order_id = %s", (client_order_id,)), 0)
            # Verify NO stock movement
            self.assertEqual(count_rows(conn, "stock_movements", "ref_order_id = %s", (client_order_id,)), 0)
            # Verify stock unchanged
            self.assertAlmostEqual(get_stock(conn, self.ids["ingredient_id"]), 5)
        finally:
            conn.close()

    # ── T16: Idempotent Double Confirm ──────────────────────────

    def test_t16_idempotent_double_confirm(self):
        """T16: Double confirm with same client_order_id → already_finalized."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]

            # First call
            result1, err1 = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))
            self.assertIsNone(err1)
            self.assertEqual(result1["status"], "finalized")

            # Second call (replay)
            result2, err2 = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))
            self.assertIsNone(err2)
            self.assertEqual(result2["status"], "already_finalized")
            self.assertEqual(result2["order_id"], client_order_id)
            self.assertEqual(result2["payment_id"], result1["payment_id"])
            self.assertEqual(result2["payment_method"], "cash")
            self.assertEqual(result2["confirmed_at"], result1["confirmed_at"])

            # Verify only 1 order, 1 payment, 1 stock movement
            self.assertEqual(count_rows(conn, "orders", "id = %s", (client_order_id,)), 1)
            self.assertEqual(count_rows(conn, "payments", "order_id = %s", (client_order_id,)), 1)
            self.assertEqual(count_rows(conn, "stock_movements",
                "ref_order_id = %s AND movement_type = 'used'", (client_order_id,)), 1)
            self.assertAlmostEqual(get_stock(conn, self.ids["ingredient_id"]), 90)
        finally:
            conn.close()

    # ── T17: Retry with Different Payment Method ───────────────

    def test_t17_retry_different_payment_method(self):
        """T17: Replay with different method → canonical payment wins."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]

            # First call with cash
            result1, _ = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))
            self.assertEqual(result1["payment_method"], "cash")

            # Replay with promptpay
            result2, err2 = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "promptpay",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))
            self.assertIsNone(err2)
            self.assertEqual(result2["status"], "already_finalized")
            # Canonical payment method (cash) wins, NOT promptpay
            self.assertEqual(result2["payment_method"], "cash")
        finally:
            conn.close()

    # ── T18: Timeout / Response-Loss Replay ────────────────────

    def test_t18_timeout_replay(self):
        """T18: Simulate response loss → replay → already_finalized, no dup."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]

            # First call succeeds (simulate commit but caller loses response)
            result1, _ = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))
            self.assertEqual(result1["status"], "finalized")
            stock_after_first = get_stock(conn, self.ids["ingredient_id"])

            # Replay (caller retries after timeout)
            result2, err2 = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))
            self.assertIsNone(err2)
            self.assertEqual(result2["status"], "already_finalized")

            # Stock unchanged from after first commit
            self.assertAlmostEqual(get_stock(conn, self.ids["ingredient_id"]), stock_after_first)
            # No duplicate
            self.assertEqual(count_rows(conn, "orders", "id = %s", (client_order_id,)), 1)
            self.assertEqual(count_rows(conn, "payments", "order_id = %s", (client_order_id,)), 1)
        finally:
            conn.close()

    # ── T20: Unauthorized Actor ────────────────────────────────

    def test_t20_unauthorized_actor(self):
        """T20: Non-member actor → actor_not_member_of_store, no persistence."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["non_member_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNotNone(err)
            self.assertIn("actor_not_member_of_store", err)

            # No persistence
            self.assertEqual(count_rows(conn, "orders", "id = %s", (client_order_id,)), 0)
            self.assertEqual(count_rows(conn, "payments", "order_id = %s", (client_order_id,)), 0)
            self.assertEqual(count_rows(conn, "stock_movements", "ref_order_id = %s", (client_order_id,)), 0)
        finally:
            conn.close()

    # ── T21: Payment Method Validation ─────────────────────────

    def test_t21_null_payment_method(self):
        """T21: NULL payment method → invalid_payment_method."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], None,
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNotNone(err)
            self.assertIn("invalid_payment_method", err)
            self.assertEqual(count_rows(conn, "orders", "id = %s", (client_order_id,)), 0)
        finally:
            conn.close()

    def test_t21_invalid_payment_method(self):
        """T21b: Invalid string payment method → invalid_payment_method."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "credit_card",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNotNone(err)
            self.assertIn("invalid_payment_method", err)
        finally:
            conn.close()

    # ── T22: Trusted Snapshot Failure ─────────────────────────

    def test_t22_missing_usage_snapshot(self):
        """T22: Missing _system.usage_breakdown → finalize failure, rollback."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())
            # Item without _system.usage_breakdown
            items = [{
                "product_id": self.ids["product_id"],
                "product_name_snapshot": "TEST-AMERICANO",
                "quantity": 1,
                "unit_price": 50.0,
                "unit_cost": 10.0,
                "total_price": 50.0,
                "total_cost": 10.0,
                "line_profit": 40.0,
                "option_total": 0,
                "option_cost_total": 0,
                "options": {"sweetness": 100, "addons": []},  # NO _system!
            }]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNotNone(err, "Should fail on missing snapshot")
            self.assertIn("usage_snapshot_missing", err)

            # No partial order
            self.assertEqual(count_rows(conn, "orders", "id = %s", (client_order_id,)), 0)
            self.assertEqual(count_rows(conn, "payments", "order_id = %s", (client_order_id,)), 0)
        finally:
            conn.close()

    # ── T14: Order Number Concurrency ─────────────────────────

    def test_t14_order_number_concurrency(self):
        """T14: Multiple concurrent Kiosk transactions → unique order_no."""
        conn = get_conn()
        try:
            results: List[Optional[Dict]] = [None] * 5
            errors: List[Optional[str]] = [None] * 5
            threads = []

            def run_kiosk(idx: int):
                tconn = get_conn()
                try:
                    client_order_id = str(uuid.uuid4())
                    items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
                    r, e = call_rpc_safe(tconn, "create_and_finalize_kiosk_order_atomic", (
                        self.ids["store_id"], self.ids["owner_id"], "cash",
                        client_order_id, make_kiosk_items_json(items),
                        "Walk-in", None, None, None, 0
                    ))
                    results[idx] = r
                    errors[idx] = e
                finally:
                    tconn.close()

            for i in range(5):
                t = threading.Thread(target=run_kiosk, args=(i,))
                threads.append(t)

            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=30)

            # All should succeed (stock is 100, need 10 each = 50 total)
            successes = sum(1 for r in results if r and r.get("status") == "finalized")
            self.assertEqual(successes, 5, f"Only {successes}/5 succeeded")

            # All order_no values should be unique
            order_nos = [r["order_no"] for r in results if r and r.get("order_no")]
            self.assertEqual(len(order_nos), 5)
            self.assertEqual(len(set(order_nos)), 5, "Duplicate order_no values")

            # All should match ORD-XXXXX format
            import re
            for on in order_nos:
                self.assertTrue(re.match(r"^ORD-\d{5}$", on), f"Bad format: {on}")
        finally:
            conn.close()

    # ── T11: Self-order vs Kiosk Last-Stock Race ───────────────

    def test_t11_self_order_vs_kiosk_last_stock_race(self):
        """T11: Last-stock race between self-order and kiosk → one wins."""
        conn = get_conn()
        try:
            # Set stock to exactly 10 (one serving)
            set_stock(conn, self.ids["ingredient_id"], 10)

            # Pre-create self-order A (pending_payment / unpaid)
            self_order_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            items_json = make_kiosk_items_json(items)

            exec_sql(conn,
                "INSERT INTO public.orders (id, store_id, order_no, status, payment_status, "
                "order_type, pickup_type, order_source, channel, subtotal, total_amount, "
                "total_cost, gross_profit, discount_amount, channel_fee, customer_name, "
                "created_at, updated_at) "
                "VALUES (%s, %s, 'ORD-SO1', 'pending_payment', 'unpaid', 'pickup', 'pickup', "
                "'web_order', 'web_order', 50, 50, 10, 40, 0, 0, 'Test', now(), now())",
                (self_order_id, self.ids["store_id"]), "none")

            # Insert order_item with usage snapshot
            item_options = json.dumps(items[0]["options"])
            exec_sql(conn,
                "INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, "
                "unit_cost, total_price, total_cost, line_profit, product_name_snapshot, "
                "options, option_total, option_cost_total) "
                "VALUES (%s, %s, 1, 50, 10, 50, 10, 40, 'TEST-AMERICANO', %s::jsonb, 0, 0)",
                (self_order_id, self.ids["product_id"], item_options),
                "none")
            conn.commit()

            kiosk_client_order_id = str(uuid.uuid4())
            so_result: List[Optional[Dict]] = [None]
            kiosk_result: List[Optional[Dict]] = [None]
            so_error: List[Optional[str]] = [None]
            kiosk_error: List[Optional[str]] = [None]

            def run_self_order_finalize():
                tconn = get_conn()
                try:
                    r, e = call_rpc_safe(tconn, "finalize_paid_order_atomic", (
                        self.ids["store_id"], self_order_id, self.ids["owner_id"], "cash"
                    ))
                    so_result[0] = r
                    so_error[0] = e
                finally:
                    tconn.close()

            def run_kiosk_atomic():
                tconn = get_conn()
                try:
                    r, e = call_rpc_safe(tconn, "create_and_finalize_kiosk_order_atomic", (
                        self.ids["store_id"], self.ids["owner_id"], "cash",
                        kiosk_client_order_id, items_json,
                        "Walk-in", None, None, None, 0
                    ))
                    kiosk_result[0] = r
                    kiosk_error[0] = e
                finally:
                    tconn.close()

            t1 = threading.Thread(target=run_self_order_finalize)
            t2 = threading.Thread(target=run_kiosk_atomic)
            t1.start()
            t2.start()
            t1.join(timeout=30)
            t2.join(timeout=30)

            # Exactly one should succeed
            so_ok = so_result[0] is not None and so_result[0].get("status") == "ok"
            kiosk_ok = kiosk_result[0] is not None and kiosk_result[0].get("status") == "finalized"

            self.assertTrue(so_ok or kiosk_ok, "At least one should succeed")
            self.assertFalse(so_ok and kiosk_ok, "Both should NOT succeed")

            # The loser should get insufficient_stock
            if so_ok:
                self.assertIsNotNone(kiosk_error[0])
                self.assertIn("insufficient_stock", kiosk_error[0])
            else:
                self.assertIsNotNone(so_error[0])
                self.assertIn("insufficient_stock", so_error[0])

            # Final stock = 0
            self.assertAlmostEqual(get_stock(conn, self.ids["ingredient_id"]), 0)

            # Exactly 1 paid payment
            self.assertEqual(count_rows(conn, "payments", "status = 'paid'"), 1)
            # Exactly 1 used stock movement
            self.assertEqual(count_rows(conn, "stock_movements", "movement_type = 'used'"), 1)
            # No negative stock
            self.assertGreaterEqual(get_stock(conn, self.ids["ingredient_id"]), 0)
        finally:
            conn.close()

    # ── T13: Kiosk vs Kiosk Last-Stock Race ────────────────────

    def test_t13_kiosk_vs_kiosk_last_stock_race(self):
        """T13: Two concurrent Kiosk orders, stock for one → one wins."""
        conn = get_conn()
        try:
            set_stock(conn, self.ids["ingredient_id"], 10)  # One serving

            kiosk_a_id = str(uuid.uuid4())
            kiosk_b_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            items_json = make_kiosk_items_json(items)

            results: List[Optional[Dict]] = [None, None]
            errors: List[Optional[str]] = [None, None]

            def run_kiosk(idx: int, coid: str):
                tconn = get_conn()
                try:
                    r, e = call_rpc_safe(tconn, "create_and_finalize_kiosk_order_atomic", (
                        self.ids["store_id"], self.ids["owner_id"], "cash",
                        coid, items_json, "Walk-in", None, None, None, 0
                    ))
                    results[idx] = r
                    errors[idx] = e
                finally:
                    tconn.close()

            t1 = threading.Thread(target=run_kiosk, args=(0, kiosk_a_id))
            t2 = threading.Thread(target=run_kiosk, args=(1, kiosk_b_id))
            t1.start()
            t2.start()
            t1.join(timeout=30)
            t2.join(timeout=30)

            a_ok = results[0] is not None and results[0].get("status") == "finalized"
            b_ok = results[1] is not None and results[1].get("status") == "finalized"

            self.assertTrue(a_ok or b_ok, "At least one should succeed")
            self.assertFalse(a_ok and b_ok, "Both should NOT succeed")

            # Loser gets insufficient_stock
            if a_ok:
                self.assertIn("insufficient_stock", errors[1] or "")
            else:
                self.assertIn("insufficient_stock", errors[0] or "")

            self.assertAlmostEqual(get_stock(conn, self.ids["ingredient_id"]), 0)
            self.assertEqual(count_rows(conn, "payments", "status = 'paid'"), 1)
            self.assertEqual(count_rows(conn, "stock_movements", "movement_type = 'used'"), 1)
        finally:
            conn.close()

    # ── T23: Production Queue Timestamp ───────────────────────

    def test_t23_confirmed_at_non_null(self):
        """T23: Both flows produce non-null confirmed_at from payments."""
        conn = get_conn()
        try:
            # Kiosk flow
            kiosk_id = str(uuid.uuid4())
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            kiosk_result, _ = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                kiosk_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))
            self.assertIsNotNone(kiosk_result["confirmed_at"])

            # Verify confirmed_at comes from payments table
            kiosk_payment = exec_sql(conn,
                "SELECT confirmed_at FROM public.payments WHERE order_id = %s",
                (kiosk_id,), "one")
            self.assertIsNotNone(kiosk_payment["confirmed_at"])

            # Self-order flow (manual finalize)
            so_id = str(uuid.uuid4())
            exec_sql(conn,
                "INSERT INTO public.orders (id, store_id, order_no, status, payment_status, "
                "order_type, pickup_type, order_source, channel, subtotal, total_amount, "
                "total_cost, gross_profit, discount_amount, channel_fee, customer_name, "
                "created_at, updated_at) "
                "VALUES (%s, %s, 'ORD-SO2', 'pending_payment', 'unpaid', 'pickup', 'pickup', "
                "'web_order', 'web_order', 50, 50, 10, 40, 0, 0, 'Test', now(), now())",
                (so_id, self.ids["store_id"]), "none")
            so_item_options = json.dumps(items[0]["options"])
            exec_sql(conn,
                "INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, "
                "unit_cost, total_price, total_cost, line_profit, product_name_snapshot, "
                "options, option_total, option_cost_total) "
                "VALUES (%s, %s, 1, 50, 10, 50, 10, 40, 'TEST-AMERICANO', %s::jsonb, 0, 0)",
                (so_id, self.ids["product_id"], so_item_options),
                "none")
            conn.commit()

            so_result, so_err = call_rpc_safe(conn, "finalize_paid_order_atomic", (
                self.ids["store_id"], so_id, self.ids["owner_id"], "promptpay"
            ))
            self.assertIsNone(so_err, f"Self-order finalize failed: {so_err}")

            so_payment = exec_sql(conn,
                "SELECT confirmed_at FROM public.payments WHERE order_id = %s",
                (so_id,), "one")
            self.assertIsNotNone(so_payment["confirmed_at"])

            # Verify ORDER BY confirmed_at ASC works (FIFO safe)
            rows = exec_sql(conn,
                "SELECT order_id, confirmed_at FROM public.payments "
                "WHERE status = 'paid' ORDER BY confirmed_at ASC")
            self.assertEqual(len(rows), 2)
            self.assertIsNotNone(rows[0]["confirmed_at"])
            self.assertIsNotNone(rows[1]["confirmed_at"])
        finally:
            conn.close()

    # ── T19: Idempotency Integrity Failure ─────────────────────

    def test_t19_integrity_failure_missing_payment(self):
        """T19: accepted+paid order with missing payment → integrity error."""
        conn = get_conn()
        try:
            client_order_id = str(uuid.uuid4())

            # Manually create an accepted+paid order WITHOUT a payment row
            exec_sql(conn,
                "INSERT INTO public.orders (id, store_id, order_no, status, payment_status, "
                "order_type, pickup_type, order_source, channel, subtotal, total_amount, "
                "total_cost, gross_profit, discount_amount, channel_fee, customer_name, "
                "created_at, updated_at) "
                "VALUES (%s, %s, 'ORD-BAD', 'accepted', 'paid', 'pickup', 'pickup', "
                "'kiosk', 'kiosk', 50, 50, 10, 40, 0, 0, 'Test', now(), now())",
                (client_order_id, self.ids["store_id"]), "none")
            conn.commit()

            # Replay should fail with integrity error
            items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
            result, err = call_rpc_safe(conn, "create_and_finalize_kiosk_order_atomic", (
                self.ids["store_id"], self.ids["owner_id"], "cash",
                client_order_id, make_kiosk_items_json(items),
                "Walk-in", None, None, None, 0
            ))

            self.assertIsNotNone(err, "Should fail with integrity error")
            self.assertIn("finalized_order_missing_paid_payment", err)
            self.assertNotIn("already_finalized", err or "")
        finally:
            conn.close()

    # ── T24: SQL / Stock Invariants ────────────────────────────

    def test_t24_no_negative_stock_after_all_tests(self):
        """T24: After all tests, no ingredient has negative stock."""
        conn = get_conn()
        try:
            rows = exec_sql(conn,
                "SELECT id, name, current_stock FROM public.ingredients "
                "WHERE current_stock < 0")
            self.assertEqual(len(rows), 0, f"Negative stock found: {rows}")
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
