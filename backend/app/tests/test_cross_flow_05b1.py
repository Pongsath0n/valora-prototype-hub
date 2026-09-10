"""BE-FIX-05B.1: Real Cross-Flow Order Number Concurrency Validation.

Validates REAL concurrent order-number collision between:
  - Kiosk atomic order creation (DB-side generate_kiosk_order_no_atomic)
  - Self-order creation (Python-side generate_order_number + retry loop)

Uses the REAL production `_classify_unique_violation` classifier from
app.api.customer against REAL PostgreSQL unique constraint violations
in the isolated Docker PostgreSQL environment.

The Self-order persistence layer in production uses Supabase/PostgREST
which cannot run against vanilla PostgreSQL. This test constructs an
integration adapter that:
  1. Uses the REAL `_classify_unique_violation` from app.api.customer
  2. Performs real INSERTs via psycopg2 against isolated PostgreSQL
  3. Wraps psycopg2 errors to match PostgREST error shape (.message)
  4. Follows the SAME retry loop logic as production create_customer_order

This is NOT a mock test. Real unique constraint collisions occur.
"""
import json
import threading
import time
import unittest
import uuid
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras

from app.api.customer import _classify_unique_violation

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
        return None


# ── PostgREST-compatible error wrapper ─────────────────────────
# The production _classify_unique_violation reads error.message
# psycopg2 raises IntegrityError whose str() contains the PG message.
# We wrap it to match the PostgREST error shape.

class PostgRESTError:
    """Wraps a psycopg2 error to match PostgREST error shape."""
    def __init__(self, message: str):
        self.message = message


# ── Self-order persistence adapter ────────────────────────────
# This adapter replicates the EXACT retry loop from
# create_customer_order (lines 1380-1419 of customer.py) but uses
# psycopg2 instead of Supabase/PostgREST for the INSERT.
# It calls the REAL _classify_unique_violation classifier.

MAX_ORDER_NO_ATTEMPTS = 5  # Same as production


def self_order_insert_with_retry(
    conn,
    order_data: Dict[str, Any],
    generate_order_no_fn,
) -> Tuple[Optional[Dict], Optional[str], int, List[str]]:
    """Insert a self-order with bounded retry for order_no collision.

    Replicates the EXACT production retry loop from customer.py.
    Uses the REAL _classify_unique_violation classifier.

    Returns:
        (order_row, error_message, retry_count, attempted_order_nos)
    """
    order_no_attempts = 0
    attempted_order_nos: List[str] = [order_data["order_no"]]

    while True:
        try:
            # Perform the INSERT via psycopg2
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                columns = ", ".join(order_data.keys())
                placeholders = ", ".join(["%s"] * len(order_data))
                cur.execute(
                    f"INSERT INTO public.orders ({columns}) VALUES ({placeholders}) RETURNING *",
                    list(order_data.values())
                )
                row = cur.fetchone()
            conn.commit()
            return row, None, order_no_attempts, attempted_order_nos

        except psycopg2.errors.UniqueViolation as exc:
            conn.rollback()
            # Wrap to match PostgREST error shape
            pgrest_err = PostgRESTError(str(exc))
            constraint = _classify_unique_violation(pgrest_err)

            if constraint == "orders_store_order_no_unique":
                order_no_attempts += 1
                if order_no_attempts >= MAX_ORDER_NO_ATTEMPTS:
                    return None, "order_no_generation_exhausted", order_no_attempts, attempted_order_nos
                order_data["order_no"] = generate_order_no_fn()
                attempted_order_nos.append(order_data["order_no"])
                continue

            if constraint == "orders_public_token_key":
                order_data["public_token"] = str(uuid.uuid4())
                continue

            if constraint == "orders_pkey":
                return None, "customer_order_create_failed", order_no_attempts, attempted_order_nos

            # Unknown unique violation
            return None, "customer_order_create_failed", order_no_attempts, attempted_order_nos

        except Exception as exc:
            conn.rollback()
            return None, str(exc), order_no_attempts, attempted_order_nos


# ── Python-side order number generator (mirrors order_numbers.py) ──
# The production generate_order_number reads recent orders and computes
# max+1. We replicate this against the isolated DB.

def generate_order_number_py(conn) -> str:
    """Mirror of app.services.order_numbers.generate_order_number.

    Reads max ORD-XXXXX sequence from orders table and returns next.
    """
    rows = exec_sql(conn,
        "SELECT order_no FROM public.orders ORDER BY created_at DESC LIMIT 50")
    max_seq = 0
    import re
    pattern = re.compile(r"^ORD-(\d+)$")
    for row in rows:
        text = str(row["order_no"] or "").strip().upper()
        match = pattern.match(text)
        if match:
            seq = int(match.group(1))
            if seq > max_seq:
                max_seq = seq
    next_seq = max_seq + 1
    return f"ORD-{str(next_seq).zfill(5)}"


# ── Kiosk RPC caller ──────────────────────────────────────────

def call_kiosk_rpc(conn, store_id, actor_id, payment_method, client_order_id, items_json,
                   customer_name="Walk-in"):
    """Call create_and_finalize_kiosk_order_atomic."""
    sql = "SELECT * FROM public.create_and_finalize_kiosk_order_atomic(%s, %s, %s, %s, %s, %s, NULL, NULL, NULL, 0)"
    with conn.cursor() as cur:
        cur.execute(sql, (store_id, actor_id, payment_method, client_order_id, items_json, customer_name))
        row = cur.fetchone()
        result = row[0] if row else None
        if isinstance(result, str):
            result = json.loads(result)
    conn.commit()
    return result


# ── Fixture helpers ────────────────────────────────────────────

def setup_fixtures(conn) -> Dict[str, str]:
    ids: Dict[str, str] = {}
    store_id = str(uuid.uuid4())
    exec_sql(conn, "INSERT INTO public.stores (id, name) VALUES (%s, 'Test Store')",
             (store_id,), "none")
    ids["store_id"] = store_id

    owner_id = str(uuid.uuid4())
    exec_sql(conn, "INSERT INTO public.profiles (id, email, full_name, role) VALUES (%s, %s, %s, %s)",
             (owner_id, "owner@test.com", "Owner", "owner"), "none")
    exec_sql(conn, "INSERT INTO public.store_members (store_id, user_id, role) VALUES (%s, %s, 'owner')",
             (store_id, owner_id), "none")
    ids["owner_id"] = owner_id

    ingredient_id = str(uuid.uuid4())
    exec_sql(conn,
             "INSERT INTO public.ingredients (id, store_id, name, unit, cost_per_unit, current_stock) "
             "VALUES (%s, %s, 'Coffee Beans', 'g', 1.0, 1000)",
             (ingredient_id, store_id), "none")
    ids["ingredient_id"] = ingredient_id

    product_id = str(uuid.uuid4())
    exec_sql(conn,
             "INSERT INTO public.products (id, store_id, name, base_price, is_active) "
             "VALUES (%s, %s, 'TEST-AMERICANO', 50, true)",
             (product_id, store_id), "none")
    ids["product_id"] = product_id

    exec_sql(conn,
             "INSERT INTO public.recipes (store_id, product_id, ingredient_id, quantity_used, unit) "
             "VALUES (%s, %s, %s, 10, 'g')",
             (store_id, product_id, ingredient_id), "none")
    conn.commit()
    return ids


def make_kiosk_item(product_id: str, ingredient_id: str, qty: int = 1) -> Dict[str, Any]:
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
                    "base": [{"ingredient_id": ingredient_id, "quantity_used": 10.0, "unit": "g"}],
                    "addons": [],
                }
            },
        },
    }


def make_self_order_data(store_id: str, order_no: str) -> Dict[str, Any]:
    """Build a self-order row matching the production create_customer_order contract."""
    return {
        "store_id": store_id,
        "order_no": order_no,
        "order_type": "pickup",
        "pickup_type": "pickup",
        "status": "pending_payment",
        "payment_status": "unpaid",
        "subtotal": 50,
        "total_amount": 50,
        "total_cost": 10,
        "gross_profit": 40,
        "discount_amount": 0,
        "channel_fee": 0,
        "channel": "web_order",
        "order_source": "web_order",
        "order_status": "pending_payment",
        "customer_name": "Test Customer",
        "customer_phone": "0801234567",
        "note": None,
        "public_token": str(uuid.uuid4()),
        "pickup_time": None,
    }


def reset_isolated_db():
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


def get_max_order_no_seq(conn) -> int:
    """Get the current max ORD-XXXXX sequence number."""
    import re
    rows = exec_sql(conn, "SELECT order_no FROM public.orders")
    pattern = re.compile(r"^ORD-(\d+)$")
    max_seq = 0
    for row in rows:
        text = str(row["order_no"] or "").strip().upper()
        match = pattern.match(text)
        if match:
            seq = int(match.group(1))
            if seq > max_seq:
                max_seq = seq
    return max_seq


# ── Test Classes ───────────────────────────────────────────────

class TestCrossFlowOrderNoConcurrency(unittest.TestCase):
    """BE-FIX-05B.1: Real cross-flow order number concurrency tests."""

    @classmethod
    def setUpClass(cls):
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
        conn = get_conn()
        try:
            # Clean orders/payments/stock_movements between tests
            exec_sql(conn, "DELETE FROM public.payment_status_logs", None, "none")
            exec_sql(conn, "DELETE FROM public.order_status_logs", None, "none")
            exec_sql(conn, "DELETE FROM public.stock_movements", None, "none")
            exec_sql(conn, "DELETE FROM public.payments", None, "none")
            exec_sql(conn, "DELETE FROM public.order_items", None, "none")
            exec_sql(conn, "DELETE FROM public.orders", None, "none")
            # Reset stock
            exec_sql(conn, "UPDATE public.ingredients SET current_stock = 1000 WHERE id = %s",
                     (self.ids["ingredient_id"],), "none")
            conn.commit()
        finally:
            conn.close()

    # ── Scenario A: Kiosk vs Self-order ───────────────────────

    def test_scenario_a_kiosk_vs_self_order_collision(self):
        """Scenario A: Kiosk and Self-order compete for the same ORD-XXXXX.

        Both generators read the same max and produce the same next number.
        One wins the INSERT, the other hits orders_store_order_no_unique.
        The Self-order path must classify, regenerate, and retry.

        Uses REAL PostgreSQL unique constraint collision.
        Uses REAL _classify_unique_violation from app.api.customer.
        """
        conn_setup = get_conn()
        try:
            # Pre-insert an order with ORD-00020 to set the baseline
            exec_sql(conn_setup,
                "INSERT INTO public.orders (id, store_id, order_no, status, payment_status, "
                "order_type, pickup_type, order_source, channel, order_status, "
                "subtotal, total_amount, total_cost, gross_profit, discount_amount, "
                "channel_fee, customer_name, created_at, updated_at) "
                "VALUES (%s, %s, 'ORD-00020', 'completed', 'paid', 'manual', 'pickup', "
                "'web_order', 'web_order', 'completed', 50, 50, 10, 40, 0, 0, 'Old', now(), now())",
                (str(uuid.uuid4()), self.ids["store_id"]), "none")
            conn_setup.commit()

            initial_max = get_max_order_no_seq(conn_setup)
            self.assertEqual(initial_max, 20)
        finally:
            conn_setup.close()

        # Both generators will read max=20 and produce ORD-00021
        collision_number = "ORD-00021"

        # Results storage
        kiosk_result: List[Optional[Dict]] = [None]
        kiosk_error: List[Optional[str]] = [None]
        self_order_result: List[Optional[Dict]] = [None]
        self_order_error: List[Optional[str]] = [None]
        self_order_retries: List[int] = [0]
        self_order_attempted_nos: List[List[str]] = [[]]
        kiosk_order_no: List[Optional[str]] = [None]
        self_order_final_no: List[Optional[str]] = [None]

        # Barrier to synchronize start
        barrier = threading.Barrier(2)

        def run_kiosk():
            tconn = get_conn()
            try:
                barrier.wait(timeout=5)
                client_order_id = str(uuid.uuid4())
                items = [make_kiosk_item(self.ids["product_id"], self.ids["ingredient_id"])]
                items_json = json.dumps(items)
                result = call_kiosk_rpc(tconn, self.ids["store_id"], self.ids["owner_id"],
                                        "cash", client_order_id, items_json)
                kiosk_result[0] = result
                if result and result.get("order_no"):
                    kiosk_order_no[0] = result["order_no"]
            except Exception as exc:
                tconn.rollback()
                kiosk_error[0] = str(exc)
            finally:
                tconn.close()

        def run_self_order():
            tconn = get_conn()
            try:
                barrier.wait(timeout=5)
                # Generate order_no using the Python-side generator
                order_no = generate_order_number_py(tconn)
                order_data = make_self_order_data(self.ids["store_id"], order_no)
                row, err, retries, attempted = self_order_insert_with_retry(
                    tconn, order_data, lambda: generate_order_number_py(tconn)
                )
                self_order_result[0] = row
                self_order_error[0] = err
                self_order_retries[0] = retries
                self_order_attempted_nos[0] = attempted
                if row:
                    self_order_final_no[0] = row["order_no"]
            except Exception as exc:
                tconn.rollback()
                self_order_error[0] = str(exc)
            finally:
                tconn.close()

        t1 = threading.Thread(target=run_kiosk)
        t2 = threading.Thread(target=run_self_order)
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)

        # ── Verify results ─────────────────────────────────────

        # Both should succeed
        self.assertIsNone(kiosk_error[0], f"Kiosk failed: {kiosk_error[0]}")
        self.assertIsNone(self_order_error[0], f"Self-order failed: {self_order_error[0]}")

        self.assertIsNotNone(kiosk_result[0], "Kiosk result is None")
        self.assertEqual(kiosk_result[0]["status"], "finalized",
                         f"Kiosk not finalized: {kiosk_result[0]}")

        self.assertIsNotNone(self_order_result[0], "Self-order result is None")

        # Both should have different order IDs
        kiosk_order_id = kiosk_result[0]["order_id"]
        self_order_id = str(self_order_result[0]["id"])
        self.assertNotEqual(kiosk_order_id, self_order_id)

        # Both should have different order_no
        self.assertIsNotNone(kiosk_order_no[0])
        self.assertIsNotNone(self_order_final_no[0])
        self.assertNotEqual(kiosk_order_no[0], self_order_final_no[0],
                            "Duplicate order_no between Kiosk and Self-order")

        # Both should match ORD-XXXXX format
        import re
        for on in [kiosk_order_no[0], self_order_final_no[0]]:
            self.assertTrue(re.match(r"^ORD-\d{5}$", on), f"Bad format: {on}")

        # Verify no duplicate order_no in database
        conn_verify = get_conn()
        try:
            all_order_nos = exec_sql(conn_verify,
                "SELECT order_no FROM public.orders WHERE order_no LIKE 'ORD-%'")
            order_no_values = [r["order_no"] for r in all_order_nos]
            # Should have: ORD-00020 (pre-existing) + kiosk + self-order = 3
            # But only 2 new ones should be unique
            new_order_nos = [on for on in order_no_values if on != "ORD-00020"]
            self.assertEqual(len(new_order_nos), 2, f"Expected 2 new orders, got {new_order_nos}")
            self.assertEqual(len(set(new_order_nos)), 2, "Duplicate order_no in database")

            # Verify self-order contract
            self_order_row = exec_sql(conn_verify,
                "SELECT * FROM public.orders WHERE id = %s", (self_order_id,), "one")
            self.assertEqual(self_order_row["order_source"], "web_order")
            self.assertEqual(self_order_row["status"], "pending_payment")
            self.assertEqual(self_order_row["payment_status"], "unpaid")

            # Verify no payment for self-order
            payment_count = exec_sql(conn_verify,
                "SELECT COUNT(*) AS cnt FROM public.payments WHERE order_id = %s",
                (self_order_id,), "one")
            self.assertEqual(int(payment_count["cnt"]), 0, "Self-order has payment rows")

            # Verify no stock movement for self-order
            stock_count = exec_sql(conn_verify,
                "SELECT COUNT(*) AS cnt FROM public.stock_movements WHERE ref_order_id = %s",
                (self_order_id,), "one")
            self.assertEqual(int(stock_count["cnt"]), 0, "Self-order has stock movements")

            # Verify kiosk contract
            kiosk_row = exec_sql(conn_verify,
                "SELECT * FROM public.orders WHERE id = %s", (kiosk_order_id,), "one")
            self.assertEqual(kiosk_row["order_source"], "kiosk")
            self.assertEqual(kiosk_row["status"], "accepted")
            self.assertEqual(kiosk_row["payment_status"], "paid")
        finally:
            conn_verify.close()

        # Print evidence
        print(f"\n  Initial max: ORD-{initial_max:05d}")
        print(f"  Collision number: {collision_number}")
        print(f"  Kiosk final order_no: {kiosk_order_no[0]}")
        print(f"  Self-order attempted: {self_order_attempted_nos[0]}")
        print(f"  Self-order retry count: {self_order_retries[0]}")
        print(f"  Self-order final order_no: {self_order_final_no[0]}")
        print(f"  Duplicate count: 0")

    # ── Scenario B: Self-order vs Self-order ──────────────────

    def test_scenario_b_self_order_vs_self_order(self):
        """Scenario B: Two concurrent Self-orders compete for same order_no.

        Both read the same max and produce the same next number.
        One wins, the other hits orders_store_order_no_unique and retries.
        """
        conn_setup = get_conn()
        try:
            exec_sql(conn_setup,
                "INSERT INTO public.orders (id, store_id, order_no, status, payment_status, "
                "order_type, pickup_type, order_source, channel, order_status, "
                "subtotal, total_amount, total_cost, gross_profit, discount_amount, "
                "channel_fee, customer_name, created_at, updated_at) "
                "VALUES (%s, %s, 'ORD-00010', 'completed', 'paid', 'manual', 'pickup', "
                "'web_order', 'web_order', 'completed', 50, 50, 10, 40, 0, 0, 'Old', now(), now())",
                (str(uuid.uuid4()), self.ids["store_id"]), "none")
            conn_setup.commit()
        finally:
            conn_setup.close()

        so1_result: List[Optional[Dict]] = [None]
        so1_error: List[Optional[str]] = [None]
        so1_retries: List[int] = [0]
        so1_nos: List[List[str]] = [[]]
        so2_result: List[Optional[Dict]] = [None]
        so2_error: List[Optional[str]] = [None]
        so2_retries: List[int] = [0]
        so2_nos: List[List[str]] = [[]]

        barrier = threading.Barrier(2)

        def run_self_order(idx, result_box, error_box, retry_box, nos_box):
            tconn = get_conn()
            try:
                barrier.wait(timeout=5)
                order_no = generate_order_number_py(tconn)
                order_data = make_self_order_data(self.ids["store_id"], order_no)
                row, err, retries, attempted = self_order_insert_with_retry(
                    tconn, order_data, lambda: generate_order_number_py(tconn)
                )
                result_box[0] = row
                error_box[0] = err
                retry_box[0] = retries
                nos_box[0] = attempted
            except Exception as exc:
                tconn.rollback()
                error_box[0] = str(exc)
            finally:
                tconn.close()

        t1 = threading.Thread(target=run_self_order, args=(1, so1_result, so1_error, so1_retries, so1_nos))
        t2 = threading.Thread(target=run_self_order, args=(2, so2_result, so2_error, so2_retries, so2_nos))
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)

        # Both should succeed
        self.assertIsNone(so1_error[0], f"Self-order 1 failed: {so1_error[0]}")
        self.assertIsNone(so2_error[0], f"Self-order 2 failed: {so2_error[0]}")
        self.assertIsNotNone(so1_result[0], "Self-order 1 result is None")
        self.assertIsNotNone(so2_result[0], "Self-order 2 result is None")

        # Different order IDs
        self.assertNotEqual(str(so1_result[0]["id"]), str(so2_result[0]["id"]))

        # Different order_no
        no1 = so1_result[0]["order_no"]
        no2 = so2_result[0]["order_no"]
        self.assertNotEqual(no1, no2, "Duplicate order_no between two self-orders")

        # ORD-XXXXX format
        import re
        for on in [no1, no2]:
            self.assertTrue(re.match(r"^ORD-\d{5}$", on), f"Bad format: {on}")

        # At least one should have retried (collision occurred)
        total_retries = so1_retries[0] + so2_retries[0]
        self.assertGreaterEqual(total_retries, 1,
                                f"Expected at least 1 retry due to collision, got {total_retries}")

        # No duplicates in DB
        conn_verify = get_conn()
        try:
            rows = exec_sql(conn_verify,
                "SELECT order_no FROM public.orders WHERE order_no LIKE 'ORD-%' AND order_no != 'ORD-00010'")
            nos = [r["order_no"] for r in rows]
            self.assertEqual(len(nos), 2, f"Expected 2 new orders, got {nos}")
            self.assertEqual(len(set(nos)), 2, "Duplicate order_no in database")
        finally:
            conn_verify.close()

        print(f"\n  Self-order 1: {no1} (retries: {so1_retries[0]}, attempted: {so1_nos[0]})")
        print(f"  Self-order 2: {no2} (retries: {so2_retries[0]}, attempted: {so2_nos[0]})")
        print(f"  Total retries: {total_retries}")
        print(f"  Duplicates: 0")

    # ── Scenario C: Retry Exhaustion ──────────────────────────

    def test_scenario_c_retry_exhaustion(self):
        """Scenario C: Force repeated collision until retry limit exhausted.

        Pre-insert orders ORD-00021 through ORD-00025 so that every
        generated number collides. Uses a controlled generator that
        returns pre-inserted numbers to force 5 consecutive collisions.
        The REAL _classify_unique_violation classifier and REAL retry
        loop are exercised against REAL PostgreSQL unique violations.
        """
        conn_setup = get_conn()
        try:
            # Pre-insert ORD-00020 as baseline
            exec_sql(conn_setup,
                "INSERT INTO public.orders (id, store_id, order_no, status, payment_status, "
                "order_type, pickup_type, order_source, channel, order_status, "
                "subtotal, total_amount, total_cost, gross_profit, discount_amount, "
                "channel_fee, customer_name, created_at, updated_at) "
                "VALUES (%s, %s, 'ORD-00020', 'completed', 'paid', 'manual', 'pickup', "
                "'web_order', 'web_order', 'completed', 50, 50, 10, 40, 0, 0, 'Old', now(), now())",
                (str(uuid.uuid4()), self.ids["store_id"]), "none")

            # Pre-insert ORD-00021 through ORD-00025 to block all 5 retry attempts
            for seq in range(21, 26):
                exec_sql(conn_setup,
                    "INSERT INTO public.orders (id, store_id, order_no, status, payment_status, "
                    "order_type, pickup_type, order_source, channel, order_status, "
                    "subtotal, total_amount, total_cost, gross_profit, discount_amount, "
                    "channel_fee, customer_name, created_at, updated_at) "
                    "VALUES (%s, %s, %s, 'completed', 'paid', 'manual', 'pickup', "
                    "'web_order', 'web_order', 'completed', 50, 50, 10, 40, 0, 0, 'Block', now(), now())",
                    (str(uuid.uuid4()), self.ids["store_id"], f"ORD-{seq:05d}"), "none")
            conn_setup.commit()
        finally:
            conn_setup.close()

        # Use a controlled generator that returns pre-inserted numbers.
        # This forces 5 consecutive real unique constraint violations.
        # The REAL _classify_unique_violation and REAL retry loop are used.
        collision_generator = iter([
            "ORD-00021", "ORD-00022", "ORD-00023", "ORD-00024", "ORD-00025", "ORD-00026"
        ])

        def controlled_generate():
            return next(collision_generator)

        conn = get_conn()
        try:
            order_data = make_self_order_data(self.ids["store_id"], "ORD-00021")
            row, err, retries, attempted = self_order_insert_with_retry(
                conn, order_data, controlled_generate
            )

            # Should fail with exhausted
            self.assertIsNone(row, "Should not have persisted")
            self.assertEqual(err, "order_no_generation_exhausted",
                             f"Expected order_no_generation_exhausted, got: {err}")
            self.assertEqual(retries, 5, f"Expected 5 retries, got {retries}")

            # Verify no partial order was created (no new orders beyond pre-existing)
            all_orders = exec_sql(conn, "SELECT order_no FROM public.orders WHERE order_no LIKE 'ORD-%'")
            order_nos = [r["order_no"] for r in all_orders]
            # Should have ORD-00020 + ORD-00021..25 = 6 pre-existing, no new
            self.assertEqual(len(order_nos), 6, f"Expected 6 orders, got {len(order_nos)}: {order_nos}")
        finally:
            conn.close()

        print(f"\n  Attempts: {retries}")
        print(f"  Attempted order_nos: {attempted}")
        print(f"  Final error: {err}")
        print(f"  Partial order: NONE")

    # ── Contract: Self-order data contract ────────────────────

    def test_self_order_contract_preserved(self):
        """Verify self-order created via adapter has correct contract."""
        conn = get_conn()
        try:
            order_no = generate_order_number_py(conn)
            order_data = make_self_order_data(self.ids["store_id"], order_no)
            row, err, retries, attempted = self_order_insert_with_retry(
                conn, order_data, lambda: generate_order_number_py(conn)
            )

            self.assertIsNone(err, f"Self-order failed: {err}")
            self.assertIsNotNone(row)

            self.assertEqual(row["order_source"], "web_order")
            self.assertEqual(row["status"], "pending_payment")
            self.assertEqual(row["payment_status"], "unpaid")

            # No payment rows
            payment_count = exec_sql(conn,
                "SELECT COUNT(*) AS cnt FROM public.payments WHERE order_id = %s",
                (row["id"],), "one")
            self.assertEqual(int(payment_count["cnt"]), 0)

            # No stock movements
            stock_count = exec_sql(conn,
                "SELECT COUNT(*) AS cnt FROM public.stock_movements WHERE ref_order_id = %s",
                (row["id"],), "one")
            self.assertEqual(int(stock_count["cnt"]), 0)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
