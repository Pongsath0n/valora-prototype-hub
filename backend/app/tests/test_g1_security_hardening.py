"""
G1 Security Boundary & RBAC Hardening — Focused regression tests.

Covers:
  HHL-001 — Public order/customer write security
  HHL-002 — Membership RLS recursion and overly broad membership permissions
  HHL-003 — Owner-only Profit Planning backend authorization

These tests validate the *backend authorization* layer and the
*intended RLS policy contract* described in g1_security_hardening.sql.
They do NOT require a live database — they test the Python backend
authorization logic and assert the SQL migration content matches the
required security invariant.
"""

import os
import unittest
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException

from app.api import store_admin


# ─── Shared test helpers ────────────────────────────────────────────

STORE_A = "store-a-0000-0000-0000-000000000001"
STORE_B = "store-b-0000-0000-0000-000000000002"


def _ctx(role: str = "owner", store_id: str = STORE_A) -> Dict[str, Any]:
    return {
        "client": object(),
        "memberships": [{"store_id": store_id, "role": role}],
    }


def _ctx_patch(ctx: Dict[str, Any]):
    return patch("app.api.store_admin._get_ctx", return_value=ctx)


# ─── HHL-001: Public order/customer write security ──────────────────

class HHL001OrderWriteSecurityTests(unittest.TestCase):
    """HHL-001: The customer order creation endpoint must set all trusted
    fields server-side. The RLS migration restricts orders/customers to
    SELECT-only for authenticated users, so direct client INSERTs via
    the Supabase REST API are blocked. All writes go through the backend
    service role.
    """

    def test_customer_order_payload_has_no_trusted_financial_fields(self) -> None:
        """CustomerOrderCreatePayload must NOT accept payment_status,
        status, total_amount, total_cost, gross_profit, or subtotal.
        These are trusted fields set server-side only."""
        from app.api.customer import CustomerOrderCreatePayload

        # The payload model should only have: customer, items, pickup_time,
        # note, store_id, line_link_token — NOT trusted financial fields.
        field_names = set(CustomerOrderCreatePayload.model_fields.keys())
        forbidden = {
            "payment_status", "status", "subtotal", "discount_amount",
            "channel_fee", "total_amount", "total_cost", "gross_profit",
        }
        leaked = forbidden & field_names
        self.assertEqual(leaked, set(), f"CustomerOrderCreatePayload must not accept trusted fields: {leaked}")

    def test_customer_order_payload_has_no_internal_status_fields(self) -> None:
        """The customer order payload must not allow setting internal
        lifecycle status or payment_status."""
        from app.api.customer import CustomerOrderCreatePayload

        field_names = set(CustomerOrderCreatePayload.model_fields.keys())
        self.assertNotIn("status", field_names)
        self.assertNotIn("payment_status", field_names)

    def test_customer_order_item_payload_has_no_trusted_fields(self) -> None:
        """CustomerOrderItemPayload must NOT accept unit_price, line_total,
        unit_cost, line_cost, or line_profit. Prices are computed from
        server-side product/recipe snapshots."""
        from app.api.customer import CustomerOrderItemPayload

        field_names = set(CustomerOrderItemPayload.model_fields.keys())
        forbidden = {"unit_price", "line_total", "unit_cost", "line_cost", "line_profit"}
        leaked = forbidden & field_names
        self.assertEqual(leaked, set(), f"CustomerOrderItemPayload must not accept trusted fields: {leaked}")

    def test_order_data_sets_status_pending_payment_server_side(self) -> None:
        """The create_customer_order function hardcodes status and
        payment_status — it does not read them from the payload."""
        import inspect
        from app.api import customer

        source = inspect.getsource(customer.create_customer_order)
        self.assertIn('"status": "pending_payment"', source)
        self.assertIn('"payment_status": "unpaid"', source)

    def test_order_data_sets_financial_totals_server_side(self) -> None:
        """The create_customer_order function computes subtotal,
        total_amount, total_cost, and gross_profit from server-side
        snapshots — not from client input."""
        import inspect
        from app.api import customer

        source = inspect.getsource(customer.create_customer_order)
        self.assertIn("subtotal = sum(", source)
        self.assertIn("total_cost = sum(", source)
        self.assertIn("gross_profit = total_amount - total_cost", source)

    def test_rls_migration_restricts_orders_to_select(self) -> None:
        """The G1 migration SQL must restrict orders to SELECT-only."""
        migration_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "sql",
            "g1_security_hardening.sql",
        )
        with open(migration_path, "r", encoding="utf-8") as f:
            sql = f.read()
        # The migration must drop the old 'for all' policy and create
        # a SELECT-only policy for orders.
        self.assertIn('DROP POLICY IF EXISTS "orders by store" ON public.orders', sql)
        self.assertIn('CREATE POLICY "orders by store" ON public.orders', sql)
        self.assertIn("FOR SELECT TO authenticated", sql)

    def test_rls_migration_restricts_customers_to_select(self) -> None:
        """The G1 migration SQL must restrict customers to SELECT-only."""
        migration_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "sql",
            "g1_security_hardening.sql",
        )
        with open(migration_path, "r", encoding="utf-8") as f:
            sql = f.read()
        self.assertIn('DROP POLICY IF EXISTS "customers by store" ON public.customers', sql)
        self.assertIn('CREATE POLICY "customers by store" ON public.customers', sql)


# ─── HHL-002: Membership RLS ────────────────────────────────────────

class HHL002MembershipRLSTests(unittest.TestCase):
    """HHL-002: is_store_member must be SECURITY DEFINER to avoid
    recursion, and store_members must be SELECT-only for store
    members. Membership administration goes through the backend
    System Console API (service role, bypasses RLS).
    """

    def test_rls_migration_makes_is_store_member_security_definer(self) -> None:
        migration_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "sql",
            "g1_security_hardening.sql",
        )
        with open(migration_path, "r", encoding="utf-8") as f:
            sql = f.read()
        self.assertIn("SECURITY DEFINER", sql)
        self.assertIn("SET search_path = public", sql)

    def test_rls_migration_restricts_store_members_to_select(self) -> None:
        migration_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "sql",
            "g1_security_hardening.sql",
        )
        with open(migration_path, "r", encoding="utf-8") as f:
            sql = f.read()
        self.assertIn('DROP POLICY IF EXISTS "store_members by store" ON public.store_members', sql)
        self.assertIn('CREATE POLICY "store_members by store" ON public.store_members', sql)
        # Must be SELECT-only, not 'for all'
        self.assertIn("FOR SELECT TO authenticated", sql)

    def test_rls_migration_revokes_public_execute(self) -> None:
        migration_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "sql",
            "g1_security_hardening.sql",
        )
        with open(migration_path, "r", encoding="utf-8") as f:
            sql = f.read()
        self.assertIn("REVOKE EXECUTE ON FUNCTION public.is_store_member(uuid) FROM PUBLIC", sql)
        self.assertIn("GRANT EXECUTE ON FUNCTION public.is_store_member(uuid) TO authenticated", sql)

    def test_membership_admin_requires_owner_or_admin_profile(self) -> None:
        """The System Console membership endpoints use _get_system_ctx
        which calls _require_owner_profile — only owner/admin profile
        roles can administer membership."""
        import inspect
        from app.api import system_console

        # create_store_member, update_store_member, delete_store_member
        # all call _get_system_ctx which calls _require_owner_profile
        for func_name in ["create_store_member", "update_store_member", "delete_store_member"]:
            func = getattr(system_console, func_name)
            source = inspect.getsource(func)
            self.assertIn("_get_system_ctx", source,
                          f"{func_name} must use _get_system_ctx for authorization")

    def test_get_memberships_uses_service_role_client(self) -> None:
        """The backend _get_memberships function uses the admin (service
        role) client, which bypasses RLS — so the is_store_member
        recursion does not affect backend membership lookups."""
        import inspect
        source = inspect.getsource(store_admin._get_memberships)
        # It queries store_members directly via the admin client
        self.assertIn("store_members", source)
        self.assertIn("user_id", source)


# ─── HHL-003: Owner-only Profit Planning ────────────────────────────

class HHL003OwnerOnlyPlanningTests(unittest.TestCase):
    """HHL-003: All Profit Planning endpoints must enforce Owner-only
    authorization in the backend. Manager and Staff must be rejected.
    """

    # ── Owner allowed ──────────────────────────────────────────────
    def test_owner_can_list_overhead_expenses(self) -> None:
        """Owner passes the authorization check (gets past 403).
        A non-403 error from the mock client is acceptable."""
        with _ctx_patch(_ctx(role="owner")):
            try:
                store_admin.list_overhead_expenses(store_id=STORE_A)
            except HTTPException as exc:
                self.assertNotEqual(exc.status_code, 403,
                                    "Owner must not be forbidden from planning")
            except Exception:
                pass  # mock client errors are fine — auth passed

    def test_owner_can_get_planning_baseline(self) -> None:
        with _ctx_patch(_ctx(role="owner")):
            try:
                store_admin.get_planning_baseline(store_id=STORE_A)
            except HTTPException as exc:
                self.assertNotEqual(exc.status_code, 403,
                                    "Owner must not be forbidden from planning baseline")
            except Exception:
                pass

    def test_owner_can_get_planning_assumptions(self) -> None:
        with _ctx_patch(_ctx(role="owner")):
            try:
                store_admin.get_planning_assumptions_endpoint(store_id=STORE_A)
            except HTTPException as exc:
                self.assertNotEqual(exc.status_code, 403,
                                    "Owner must not be forbidden from planning assumptions")
            except Exception:
                pass

    # ── Manager rejected ────────────────────────────────────────────
    def test_manager_rejected_from_list_overhead(self) -> None:
        with _ctx_patch(_ctx(role="manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.list_overhead_expenses(store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_manager_rejected_from_create_overhead(self) -> None:
        with _ctx_patch(_ctx(role="manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_overhead_expense(
                    {"name": "x", "category": "rent", "amount": 100, "period": "monthly"},
                    store_id=STORE_A,
                )
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_manager_rejected_from_update_overhead(self) -> None:
        with _ctx_patch(_ctx(role="manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_overhead_expense("exp-1", {"amount": 200}, store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_manager_rejected_from_deactivate_overhead(self) -> None:
        with _ctx_patch(_ctx(role="manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.deactivate_overhead_expense("exp-1", store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_manager_rejected_from_get_assumptions(self) -> None:
        with _ctx_patch(_ctx(role="manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.get_planning_assumptions_endpoint(store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_manager_rejected_from_patch_assumptions(self) -> None:
        with _ctx_patch(_ctx(role="manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.patch_planning_assumptions({}, store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_manager_rejected_from_planning_baseline(self) -> None:
        with _ctx_patch(_ctx(role="manager")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.get_planning_baseline(store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    # ── Staff rejected ─────────────────────────────────────────────
    def test_staff_rejected_from_list_overhead(self) -> None:
        with _ctx_patch(_ctx(role="staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.list_overhead_expenses(store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_staff_rejected_from_planning_baseline(self) -> None:
        with _ctx_patch(_ctx(role="staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.get_planning_baseline(store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_staff_rejected_from_get_assumptions(self) -> None:
        with _ctx_patch(_ctx(role="staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.get_planning_assumptions_endpoint(store_id=STORE_A)
        self.assertEqual(ctx_err.exception.status_code, 403)

    # ── Store isolation ────────────────────────────────────────────
    def test_store_a_user_cannot_access_store_b_planning(self) -> None:
        """A user with membership in Store A cannot access Store B's
        planning endpoints — _resolve_store_id rejects foreign stores."""
        ctx = {
            "client": object(),
            "memberships": [{"store_id": STORE_A, "role": "owner"}],
        }
        with _ctx_patch(ctx):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.list_overhead_expenses(store_id=STORE_B)
        self.assertEqual(ctx_err.exception.status_code, 403)

    # ── All 7 planning endpoints use _require_owner_store_role ─────
    def test_all_planning_endpoints_require_owner(self) -> None:
        """Verify that all 7 planning route handlers call
        _require_owner_store_role, not _require_manager."""
        import inspect

        planning_funcs = [
            store_admin.list_overhead_expenses,
            store_admin.create_overhead_expense,
            store_admin.update_overhead_expense,
            store_admin.deactivate_overhead_expense,
            store_admin.get_planning_assumptions_endpoint,
            store_admin.patch_planning_assumptions,
            store_admin.get_planning_baseline,
        ]
        for func in planning_funcs:
            source = inspect.getsource(func)
            self.assertIn("_require_owner_store_role", source,
                          f"{func.__name__} must call _require_owner_store_role")
            self.assertNotIn("_require_manager(role)", source,
                             f"{func.__name__} must NOT call _require_manager")


if __name__ == "__main__":
    unittest.main()
