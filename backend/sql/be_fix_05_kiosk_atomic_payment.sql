-- =====================================================================
-- HEALHOLIC — BE-FIX-05 KIOSK ATOMIC PAYMENT MIGRATION (REV 3)
-- Production SQL Change Set — FINAL HARDENING after Product Owner review
-- =====================================================================
--
-- Purpose:
--   Install the BE-FIX-05 Kiosk atomic transaction functions.
--
-- IMPORTANT:
--   This SQL has NOT been applied to Production.
--   The Product Owner will manually review and execute it.
--
-- Safety:
--   - Installation is ADDITIVE / NON-DESTRUCTIVE.
--   - No existing business rows are modified.
--   - No test data is inserted.
--   - No existing functions are modified.
--   - The function bodies contain INSERT/UPDATE only as deferred logic
--     that executes when the RPC is later called during a real Kiosk sale.
--   - Installing CREATE FUNCTION does NOT execute the business transaction.
--
-- REV 2 CORRECTIONS (Product Owner review):
--   P0-1: confirmed_at loaded from payments (orders has no confirmed_at)
--   P0-2: order_no unique collision retries with bounded loop;
--         orders_pkey collision remains idempotency path
--   P1-1: already_finalized returns existing payment.method/id/confirmed_at
--   P1-2: actor membership validated BEFORE idempotent replay return
--   Additional: jsonb_typeof validation, zero payments before finalize,
--     no ingredient locks in outer RPC, no finalize modification
--
-- REV 3 FINAL HARDENING:
--   H-1: payment_method NULL validation (SQL NULL not in NOT IN)
--   H-2: idempotent paid-payment integrity (fail closed if missing)
--   H-3: installation wrapped in BEGIN/COMMIT transaction
--
-- Architecture:
--   create_and_finalize_kiosk_order_atomic
--       -> validate inputs (incl jsonb_typeof)
--       -> validate actor membership (BEFORE idempotency)
--       -> idempotency check (load from payments, NOT orders)
--       -> generate order_no (pg_advisory_xact_lock)
--       -> INSERT order (pending_payment / unpaid) with retry loop
--       -> INSERT order_items (with trusted usage snapshots)
--       -> CALL finalize_paid_order_atomic (REUSED, NOT MODIFIED)
--           -> lock order, validate actor, validate snapshots
--           -> lock ingredients deterministically (inside finalize)
--           -> validate stock, create paid payment (confirmed_at = now())
--           -> apply_order_stock_usage (stock movements + deduction)
--       -> load result from payments (canonical confirmed_at)
--       -> return committed result
--
--   If ANY step fails, the entire transaction rolls back.
--
-- =====================================================================

-- REV 3 hardening: wrap the COMPLETE installation in a single
-- transaction so that any statement failure rolls back the entire
-- installation (CREATE FUNCTION, COMMENT, REVOKE, GRANT). No business
-- RPC calls are made inside this installation transaction.
BEGIN;


-- ---------------------------------------------------------------------
-- Helper: generate a race-safe, store-scoped order number.
-- Format: ORD-XXXXX (zero-padded to 5 digits, matching the existing
-- Python-side generate_order_number format).
-- Uses pg_advisory_xact_lock on a per-store hash so that concurrent
-- Kiosk confirmations for the same store serialize their reads of
-- MAX(order_no sequence). The lock is automatically released at
-- transaction commit/rollback.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_kiosk_order_no_atomic(
    p_store_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_lock_key bigint;
    v_max_seq bigint;
    v_next_seq bigint;
    v_order_no text;
begin
    if p_store_id is null then
        raise exception 'store_id_required';
    end if;

    -- Per-store advisory transaction lock.
    -- Hash the store UUID into a stable bigint so each store has its
    -- own lock key. This serializes order_no generation within a store
    -- while allowing different stores to proceed concurrently.
    v_lock_key := hashtext(p_store_id::text);

    -- Acquire a transaction-scoped advisory lock. Automatically
    -- released on COMMIT or ROLLBACK.
    perform pg_advisory_xact_lock(v_lock_key);

    -- Find the maximum existing sequence number for this store.
    -- Only consider order_no values matching the ORD-NNNNN pattern.
    select coalesce(
        max(
            case
                when order_no ~ '^ORD-(\d+)$'
                    then substring(order_no from '^ORD-(\d+)$')::bigint
                else 0
            end
        ),
        0
    )
    into v_max_seq
    from public.orders
    where store_id = p_store_id;

    v_next_seq := v_max_seq + 1;
    if v_next_seq < 1 then
        v_next_seq := 1;
    end if;

    v_order_no := 'ORD-' || lpad(v_next_seq::text, 5, '0');

    return v_order_no;
end;
$function$;

COMMENT ON FUNCTION public.generate_kiosk_order_no_atomic(uuid)
    IS 'BE-FIX-05: Race-safe, store-scoped order number generator for Kiosk atomic transactions. Format: ORD-XXXXX. Uses pg_advisory_xact_lock for concurrency safety.';


-- ---------------------------------------------------------------------
-- Outer RPC: create a Kiosk order + items, then finalize atomically.
--
-- Reuses (does NOT modify) finalize_paid_order_atomic for:
--   - order locking
--   - actor/store membership validation (also validated in outer RPC)
--   - payment method validation
--   - usage snapshot validation
--   - ingredient aggregation
--   - deterministic ingredient locking
--   - insufficient-stock guard
--   - paid payment creation (confirmed_at = now())
--   - order -> accepted / paid transition
--   - apply_order_stock_usage (stock movements + deduction)
--
-- The outer RPC does NOT:
--   - lock ingredients
--   - create payment rows before finalize (ZERO payments before finalize)
--   - duplicate stock logic
--   - duplicate payment logic
--   - modify finalize_paid_order_atomic
--
-- Idempotency:
--   p_client_order_id is used as orders.id (PRIMARY KEY).
--   - orders_pkey collision -> idempotency path (already_finalized or
--     idempotency_conflict)
--   - orders_store_order_no_unique collision -> regenerate order_no and
--     retry INSERT with bounded loop (NOT idempotency_conflict)
--
-- REV 2 corrections:
--   P0-1: confirmed_at loaded from payments (orders has no confirmed_at)
--   P0-2: order_no unique collision retries with bounded loop
--   P1-1: already_finalized returns existing payment.method/id/confirmed_at
--   P1-2: actor membership validated BEFORE idempotent replay return
--   Additional: jsonb_typeof validation, zero payments before finalize
--
-- Inputs:
--   p_store_id        - store UUID
--   p_actor_id        - authenticated staff/manager/owner UUID
--   p_payment_method  - 'cash' or 'promptpay'
--   p_client_order_id - UUID used as orders.id (idempotency key)
--   p_items           - JSONB array of trusted order item records
--   p_customer_name   - optional walk-in customer name
--   p_customer_phone  - optional walk-in customer phone
--   p_note            - optional order note
--   p_channel_id      - optional sales channel UUID
--   p_channel_fee     - optional channel fee (numeric)
--
-- Returns: JSONB with order_id, order_no, payment_id, payment_method,
--          status, payment_status, total_amount, confirmed_at,
--          idempotent_replay
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_and_finalize_kiosk_order_atomic(
    p_store_id uuid,
    p_actor_id uuid,
    p_payment_method text,
    p_client_order_id uuid,
    p_items jsonb,
    p_customer_name text default null,
    p_customer_phone text default null,
    p_note text default null,
    p_channel_id uuid default null,
    p_channel_fee numeric default 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_order_id uuid;
    v_order_no text;
    v_finalize_result jsonb;
    v_payment_id uuid;
    v_payment_method_out text;
    v_total_amount numeric;
    v_confirmed_at timestamptz;
    v_existing_order_status text;
    v_existing_payment_status text;
    v_existing_order_no text;
    v_existing_payment_id uuid;
    v_existing_payment_method text;
    v_existing_confirmed_at timestamptz;
    v_existing_total_amount numeric;
    v_item jsonb;
    v_item_count int;
    v_insert_attempt int;
    v_max_attempts int := 5;
    v_inserted boolean;
    v_constraint_name text;
begin
    -- ── Input validation ──────────────────────────────────────────
    if p_store_id is null then
        raise exception 'store_id_required';
    end if;
    if p_actor_id is null then
        raise exception 'actor_id_required';
    end if;
    if p_client_order_id is null then
        raise exception 'client_order_id_required';
    end if;
    -- REV 3 hardening: SQL NULL does not evaluate TRUE in NOT IN (...),
    -- so an explicit NULL check is required before the membership test.
    if p_payment_method is null
       or p_payment_method not in ('cash', 'promptpay')
    then
        raise exception 'invalid_payment_method';
    end if;

    -- P0-2 additional hardening: validate jsonb_typeof before
    -- jsonb_array_length (which raises on non-array input).
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'items_required';
    end if;
    if jsonb_array_length(p_items) = 0 then
        raise exception 'items_required';
    end if;

    -- ── P1-2: DB membership guard BEFORE idempotent replay ────────
    -- Validate p_actor_id membership in p_store_id BEFORE any
    -- idempotent replay return. Do not rely solely on FastAPI
    -- authorization. This prevents a non-member from receiving
    -- idempotent replay data.
    if not exists (
        select 1
        from public.store_members
        where store_id = p_store_id
          and user_id = p_actor_id
    ) then
        raise exception 'actor_not_member_of_store';
    end if;

    -- ── Idempotency: check if order already exists ─────────────────
    -- If p_client_order_id already exists as orders.id, classify the
    -- existing state and return an idempotent result without mutating.
    -- P0-1: Load confirmed_at, method, id from payments (NOT orders).
    -- P1-1: Return existing payment data, not p_payment_method.
    select status, payment_status, order_no
    into v_existing_order_status, v_existing_payment_status, v_existing_order_no
    from public.orders
    where id = p_client_order_id
      and store_id = p_store_id
    limit 1;

    if found then
        if v_existing_order_status = 'accepted' and v_existing_payment_status = 'paid' then
            -- P0-1 + P1-1: Load canonical payment data from payments table.
            select id, method, confirmed_at
            into v_existing_payment_id, v_existing_payment_method, v_existing_confirmed_at
            from public.payments
            where order_id = p_client_order_id
              and status = 'paid'
            limit 1;

            -- Load total_amount from orders (this column exists).
            select total_amount
            into v_existing_total_amount
            from public.orders
            where id = p_client_order_id
            limit 1;

            -- P1-1: Return EXISTING payment data, not p_payment_method.
            -- REV 3 hardening: fail closed if canonical paid payment is
            -- missing any required field. An accepted+paid order without
            -- a canonical paid payment row is an integrity violation.
            if v_existing_payment_id is null
               or v_existing_payment_method is null
               or v_existing_confirmed_at is null
            then
                raise exception 'finalized_order_missing_paid_payment';
            end if;

            return jsonb_build_object(
                'status', 'already_finalized',
                'order_id', p_client_order_id,
                'order_no', v_existing_order_no,
                'payment_id', v_existing_payment_id,
                'payment_method', v_existing_payment_method,
                'payment_status', 'paid',
                'order_status', 'accepted',
                'total_amount', coalesce(v_existing_total_amount, 0),
                'confirmed_at', v_existing_confirmed_at,
                'idempotent_replay', true
            );
        else
            -- Existing order is in an unexpected/incomplete state.
            -- Do NOT mutate. Return a safe conflict.
            return jsonb_build_object(
                'status', 'idempotency_conflict',
                'order_id', p_client_order_id,
                'order_no', v_existing_order_no,
                'order_status', v_existing_order_status,
                'payment_status', v_existing_payment_status,
                'idempotent_replay', false
            );
        end if;
    end if;

    -- ── INSERT order with bounded retry for order_no collision ────
    -- P0-2: Distinguish unique constraint failures:
    --   orders_pkey (id collision) -> idempotency_conflict
    --   orders_store_order_no_unique (order_no collision) -> retry
    --
    -- The order is created as pending_payment / unpaid.
    -- ZERO payment rows are created here — finalize creates the paid
    -- payment row itself.
    v_order_id := p_client_order_id;
    v_inserted := false;
    v_insert_attempt := 0;

    <<order_insert_loop>>
    loop
        v_insert_attempt := v_insert_attempt + 1;
        if v_insert_attempt > v_max_attempts then
            raise exception 'order_no_generation_exhausted';
        end if;

        -- Generate a fresh order_no each iteration.
        v_order_no := public.generate_kiosk_order_no_atomic(p_store_id);

        begin
            insert into public.orders (
                id,
                store_id,
                order_no,
                order_type,
                pickup_type,
                status,
                payment_status,
                order_source,
                channel,
                channel_id,
                subtotal,
                total_amount,
                total_cost,
                gross_profit,
                discount_amount,
                channel_fee,
                customer_name,
                customer_phone,
                note,
                created_at,
                updated_at
            ) values (
                p_client_order_id,
                p_store_id,
                v_order_no,
                'manual',
                'walk_in',
                'pending_payment',
                'unpaid',
                'kiosk',
                'kiosk',
                p_channel_id,
                0,
                0,
                0,
                0,
                0,
                coalesce(p_channel_fee, 0),
                p_customer_name,
                p_customer_phone,
                p_note,
                now(),
                now()
            );

            v_inserted := true;
            exit order_insert_loop;

        exception
            when unique_violation then
                -- Distinguish which constraint was violated.
                -- Use GET STACKED DIAGNOSTICS for the constraint name.
                get stacked diagnostics v_constraint_name = constraint_name;

                -- Also check SQLERRM as fallback (some PG versions
                -- report index name in the message for unique indexes).
                if v_constraint_name = 'orders_pkey'
                   or sqlerrm like '%orders_pkey%'
                then
                    -- P0-2: client_order_id collision = idempotency path.
                    -- Another transaction inserted this id first.
                    -- Re-classify the existing state.
                    select status, payment_status, order_no
                    into v_existing_order_status, v_existing_payment_status, v_existing_order_no
                    from public.orders
                    where id = p_client_order_id
                      and store_id = p_store_id
                    limit 1;

                    if v_existing_order_status = 'accepted' and v_existing_payment_status = 'paid' then
                        -- P0-1 + P1-1: Load from payments.
                        select id, method, confirmed_at
                        into v_existing_payment_id, v_existing_payment_method, v_existing_confirmed_at
                        from public.payments
                        where order_id = p_client_order_id
                          and status = 'paid'
                        limit 1;

                        select total_amount
                        into v_existing_total_amount
                        from public.orders
                        where id = p_client_order_id
                        limit 1;

                        -- REV 3 hardening: fail closed if canonical paid
                        -- payment is missing any required field.
                        if v_existing_payment_id is null
                           or v_existing_payment_method is null
                           or v_existing_confirmed_at is null
                        then
                            raise exception 'finalized_order_missing_paid_payment';
                        end if;

                        return jsonb_build_object(
                            'status', 'already_finalized',
                            'order_id', p_client_order_id,
                            'order_no', v_existing_order_no,
                            'payment_id', v_existing_payment_id,
                            'payment_method', v_existing_payment_method,
                            'payment_status', 'paid',
                            'order_status', 'accepted',
                            'total_amount', coalesce(v_existing_total_amount, 0),
                            'confirmed_at', v_existing_confirmed_at,
                            'idempotent_replay', true
                        );
                    else
                        return jsonb_build_object(
                            'status', 'idempotency_conflict',
                            'order_id', p_client_order_id,
                            'order_no', v_existing_order_no,
                            'order_status', v_existing_order_status,
                            'payment_status', v_existing_payment_status,
                            'idempotent_replay', false
                        );
                    end if;
                elsif v_constraint_name = 'orders_store_order_no_unique'
                      or sqlerrm like '%orders_store_order_no_unique%'
                then
                    -- P0-2: order_no collision with another creator.
                    -- Regenerate order_no and retry the INSERT.
                    -- Do NOT report as idempotency_conflict.
                    -- Continue the loop to retry.
                    continue order_insert_loop;
                else
                    -- Unknown unique violation — re-raise.
                    raise;
                end if;
        end;
    end loop;

    if not v_inserted then
        raise exception 'order_insert_failed';
    end if;

    -- ── INSERT order_items ──────────────────────────────────────────
    -- Each item in p_items is a trusted, server-generated record with
    -- _system.usage_breakdown already embedded by the backend.
    -- The order_items insert triggers compute per-line totals
    -- and update the parent order's subtotal/total_amount/total_cost.
    v_item_count := 0;
    for v_item in select jsonb_array_elements(p_items) loop
        insert into public.order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            unit_cost,
            total_price,
            total_cost,
            line_profit,
            product_name_snapshot,
            options,
            option_total,
            option_cost_total
        ) values (
            v_order_id,
            nullif(v_item->>'product_id', '')::uuid,
            coalesce((v_item->>'quantity')::int, 1),
            coalesce((v_item->>'unit_price')::numeric, 0),
            coalesce((v_item->>'unit_cost')::numeric, 0),
            coalesce((v_item->>'total_price')::numeric, 0),
            coalesce((v_item->>'total_cost')::numeric, 0),
            coalesce((v_item->>'line_profit')::numeric, 0),
            v_item->>'product_name_snapshot',
            coalesce(v_item->'options', '{}'::jsonb),
            coalesce((v_item->>'option_total')::numeric, 0),
            coalesce((v_item->>'option_cost_total')::numeric, 0)
        );
        v_item_count := v_item_count + 1;
    end loop;

    if v_item_count = 0 then
        raise exception 'order_has_no_items';
    end if;

    -- ── Apply channel fee if provided ──────────────────────────────
    -- The order_items insert trigger has already updated
    -- subtotal/total_amount/total_cost. We now apply the channel fee
    -- on top of the recalculated totals.
    if p_channel_id is not null and coalesce(p_channel_fee, 0) <> 0 then
        update public.orders
        set channel_fee = coalesce(p_channel_fee, 0),
            total_amount = greatest(
                (select sum(total_price) from public.order_items where order_id = v_order_id)
                - discount_amount,
                0
            ),
            gross_profit = greatest(
                (select sum(total_price) from public.order_items where order_id = v_order_id)
                - discount_amount,
                0
            )
            - (select coalesce(sum(total_cost), 0) from public.order_items where order_id = v_order_id)
            - coalesce(p_channel_fee, 0),
            updated_at = now()
        where id = v_order_id;
    end if;

    -- ── Verify ZERO payment rows before finalize ───────────────────
    -- Additional hardening: ensure no payment rows exist before
    -- calling finalize. finalize_paid_order_atomic expects
    -- zero or one existing payment row; we guarantee zero.
    perform 1
    from public.payments
    where order_id = v_order_id
    limit 1;
    if found then
        raise exception 'unexpected_payment_row_before_finalize';
    end if;

    -- ── CALL finalize_paid_order_atomic (REUSED, NOT MODIFIED) ─────
    -- This nested call executes within the SAME transaction. Any
    -- exception raised here propagates and rolls back the entire
    -- transaction (order, items, payment, stock, logs).
    -- finalize_paid_order_atomic owns:
    --   - order locking (FOR UPDATE)
    --   - actor membership validation (redundant with our check, safe)
    --   - payment method validation
    --   - usage snapshot validation
    --   - ingredient aggregation
    --   - deterministic ingredient locking (ORDER BY ingredient_id)
    --   - insufficient-stock guard
    --   - paid payment creation (confirmed_at = now())
    --   - order -> accepted/paid transition (via trigger)
    --   - apply_order_stock_usage (stock movements + deduction)
    --
    -- The outer RPC does NOT lock ingredients — that is owned by
    -- finalize_paid_order_atomic.
    select * into v_finalize_result
    from public.finalize_paid_order_atomic(
        p_store_id,
        v_order_id,
        p_actor_id,
        p_payment_method
    );

    -- ── P0-1: Load canonical result from payments ──────────────────
    -- confirmed_at is loaded from payments (orders has no confirmed_at).
    -- method and id are also loaded from the canonical paid payment.
    select id, method, confirmed_at
    into v_payment_id, v_payment_method_out, v_confirmed_at
    from public.payments
    where order_id = v_order_id
      and status = 'paid'
    limit 1;

    -- Load total_amount from orders (this column exists).
    select total_amount
    into v_total_amount
    from public.orders
    where id = v_order_id
    limit 1;

    -- ── Return committed result ─────────────────────────────────────
    return jsonb_build_object(
        'status', 'finalized',
        'order_id', v_order_id,
        'order_no', v_order_no,
        'payment_id', v_payment_id,
        'payment_method', v_payment_method_out,
        'payment_status', 'paid',
        'order_status', 'accepted',
        'total_amount', coalesce(v_total_amount, 0),
        'confirmed_at', v_confirmed_at,
        'idempotent_replay', false
    );
end;
$function$;

COMMENT ON FUNCTION public.create_and_finalize_kiosk_order_atomic(
    uuid, uuid, text, uuid, jsonb, text, text, text, uuid, numeric
) IS 'BE-FIX-05 (rev 3): Atomic Kiosk order creation + payment finalization. Creates order + items as pending_payment/unpaid, then reuses finalize_paid_order_atomic for payment + stock. Idempotent via p_client_order_id as orders.id. confirmed_at loaded from payments. order_no collision retries with bounded loop. Payment method NULL validation. Idempotent paid-payment integrity check.';


-- ---------------------------------------------------------------------
-- Security: restrict EXECUTE to postgres and service_role only.
-- Frontend / anon / authenticated must NOT call this RPC directly.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.generate_kiosk_order_no_atomic(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_kiosk_order_no_atomic(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_kiosk_order_no_atomic(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_kiosk_order_no_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.generate_kiosk_order_no_atomic(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_and_finalize_kiosk_order_atomic(
    uuid, uuid, text, uuid, jsonb, text, text, text, uuid, numeric
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_and_finalize_kiosk_order_atomic(
    uuid, uuid, text, uuid, jsonb, text, text, text, uuid, numeric
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_and_finalize_kiosk_order_atomic(
    uuid, uuid, text, uuid, jsonb, text, text, text, uuid, numeric
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_finalize_kiosk_order_atomic(
    uuid, uuid, text, uuid, jsonb, text, text, text, uuid, numeric
) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_and_finalize_kiosk_order_atomic(
    uuid, uuid, text, uuid, jsonb, text, text, text, uuid, numeric
) TO service_role;

-- =====================================================================
-- End of BE-FIX-05 SQL Change Set (Rev 3 — Final Hardening)
-- =====================================================================

COMMIT;
-- =====================================================================
