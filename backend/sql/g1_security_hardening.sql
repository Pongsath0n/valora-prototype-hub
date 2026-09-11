-- =====================================================================
-- HEALHOLIC — G1 SECURITY HARDENING MIGRATION (HHL-001, HHL-002)
-- Production SQL Change Set — Security Boundary & RBAC Hardening
-- =====================================================================
--
-- Purpose:
--   1. HHL-002: Fix is_store_member RLS recursion by converting the
--      function to SECURITY DEFINER with a locked search_path.
--   2. HHL-002: Restrict store_members to SELECT-only for store members;
--      all membership administration goes through the backend (service
--      role), which bypasses RLS.
--   3. HHL-001: Restrict orders and customers to SELECT-only for store
--      members; all writes go through the backend (service role),
--      which bypasses RLS and sets trusted fields server-side.
--
-- IMPORTANT:
--   This SQL must be reviewed and executed manually via the Supabase
--   SQL editor by the Product Owner. It was not applied automatically.
--
-- Safety:
--   - No existing business rows are modified.
--   - No test data is inserted.
--   - No tables, columns, or constraints are created or dropped.
--   - Only RLS policies and one helper function are changed.
--   - The is_store_member function body is unchanged; only its security
--     mode and search_path are hardened.
--   - All writes continue to work through the backend service role
--     (which bypasses RLS).
--   - Idempotent: safe to run multiple times.
--
-- Verification (after applying):
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--     WHERE proname = 'is_store_member';
--   Expected: prosecdef = true, proconfig = '{search_path=public}'
--
--   SELECT tablename, policyname, cmd FROM pg_policies
--     WHERE schemaname = 'public'
--     AND tablename IN ('orders', 'customers', 'store_members');
--   Expected: cmd = 'SELECT' for all three tables.
-- =====================================================================

BEGIN;

-- ── HHL-002: Fix is_store_member recursion ─────────────────────────
--
-- The original function is SECURITY INVOKER (default). When called from
-- the store_members RLS policy, it queries store_members, which
-- triggers RLS again, calling is_store_member again → infinite
-- recursion (stack depth exceeded).
--
-- Converting to SECURITY DEFINER with a locked search_path makes the
-- inner query bypass RLS, breaking the recursion cycle. The function
-- body is unchanged — it remains a read-only EXISTS check.
--
-- Security hardening:
--   - SECURITY DEFINER: runs with the function owner's privileges
--   - SET search_path = public: prevents search_path injection
--   - Function body is read-only (SELECT ... EXISTS): cannot modify data

CREATE OR REPLACE FUNCTION public.is_store_member(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = _store_id
      AND sm.user_id = auth.uid()
  );
$$;

-- Ensure the function is owned by postgres (the Supabase superuser)
ALTER FUNCTION public.is_store_member(uuid) OWNER TO postgres;

-- Revoke execute from public and grant only to authenticated users
REVOKE EXECUTE ON FUNCTION public.is_store_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid) TO authenticated;

-- ── HHL-002: Restrict store_members to SELECT-only ──────────────────
--
-- The original policy was `for all` which allowed any store member to
-- INSERT/UPDATE/DELETE membership rows. Membership administration is
-- handled exclusively through the backend System Console API
-- (POST/PATCH/DELETE /api/system/store-members) which requires
-- owner/admin profile role and uses the service role key (bypasses
-- RLS).

DROP POLICY IF EXISTS "store_members by store" ON public.store_members;
CREATE POLICY "store_members by store" ON public.store_members
  FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));

-- ── HHL-001: Restrict orders to SELECT-only ─────────────────────────
--
-- The original policy was `for all` which allowed any authenticated
-- store member to directly INSERT orders with arbitrary trusted
-- fields (payment_status, total_amount, total_cost, gross_profit,
-- status, etc.) via the Supabase REST API, bypassing backend
-- validation. All order creation and mutation goes through the
-- backend (service role), which sets trusted fields server-side.

DROP POLICY IF EXISTS "orders by store" ON public.orders;
CREATE POLICY "orders by store" ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));

-- ── HHL-001: Restrict customers to SELECT-only ─────────────────────
--
-- Same rationale as orders: the backend handles all customer creation
-- and mutation via the service role, setting trusted fields
-- server-side.

DROP POLICY IF EXISTS "customers by store" ON public.customers;
CREATE POLICY "customers by store" ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));

COMMIT;
