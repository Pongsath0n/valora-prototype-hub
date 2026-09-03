-- First Customer Production Hardening Migration
-- Applies minimal verified-safe schema hardening on top of the Brewway baseline.
-- This migration does NOT alter transaction logic, RLS design, or canonical model.

-- =============================================================================
-- 1. DROP DUPLICATE INDEX on store_members(store_id, user_id)
-- =============================================================================
-- The constraint-backed index store_members_store_id_user_id_key (from UNIQUE constraint)
-- is the canonical one. store_members_store_user_unique is a redundant duplicate.
-- Keeping both wastes disk space and slows down writes.

DROP INDEX IF EXISTS public.store_members_store_user_unique;

-- =============================================================================
-- 2. SET EXPLICIT search_path ON FUNCTIONS WITH MUTABLE search_path
-- =============================================================================
-- Security advisor flagged these functions as having a mutable search_path (WARN level).
-- Setting an explicit search_path prevents search_path manipulation attacks.
-- This does NOT change function logic — only adds a safe search_path configuration.

ALTER FUNCTION public.set_updated_at() SET search_path TO 'public';
ALTER FUNCTION public.calculate_order_item_totals() SET search_path TO 'public';
ALTER FUNCTION public.recalculate_order_totals(uuid) SET search_path TO 'public';
ALTER FUNCTION public.recalculate_order_after_item_change() SET search_path TO 'public';
ALTER FUNCTION public.sync_order_status_columns() SET search_path TO 'public';
ALTER FUNCTION public.sync_order_status_legacy_status() SET search_path TO 'public';
ALTER FUNCTION public.sync_payment_to_order() SET search_path TO 'public';
ALTER FUNCTION public.log_order_status_change() SET search_path TO 'public';
ALTER FUNCTION public.log_payment_status_change() SET search_path TO 'public';
ALTER FUNCTION public.is_store_member(uuid) SET search_path TO 'public';

-- Note: valora_set_updated_at(), valora_set_ingredient_purchase_unit_cost(),
-- and rls_auto_enable() already have explicit search_path set in the baseline migration.

-- =============================================================================
-- 3. REVOKE EXECUTE ON SECURITY DEFINER EVENT TRIGGER FUNCTION
-- =============================================================================
-- rls_auto_enable() is a SECURITY DEFINER event trigger function that auto-enables
-- RLS on new tables. It should never be callable via the REST API by anon or
-- authenticated users. Revoke EXECUTE to prevent public RPC access.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
