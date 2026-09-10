-- ISOLATED TEST SCHEMA for BE-FIX-05B Integration Validation
-- Recreated from production schema (read-only inspection).
-- This is NOT production data. Disposable Docker PostgreSQL only.

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────
CREATE TYPE public.store_role AS ENUM ('owner', 'manager', 'staff');

-- ── Tables ──────────────────────────────────────────────────────

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    store_id uuid,
    email text NOT NULL,
    full_name text,
    role text NOT NULL DEFAULT 'staff',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    currency text NOT NULL DEFAULT 'THB',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.store_role NOT NULL DEFAULT 'staff',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (store_id, user_id)
);

CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id uuid,
    name text NOT NULL,
    description text,
    image_url text,
    base_price numeric NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    is_special boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    allow_sweetness boolean NOT NULL DEFAULT false,
    default_sweetness integer NOT NULL DEFAULT 0,
    allow_extra_shot boolean NOT NULL DEFAULT false,
    extra_shot_price numeric NOT NULL DEFAULT 0,
    max_extra_shots integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ingredients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name text NOT NULL,
    unit text NOT NULL,
    cost_per_unit numeric NOT NULL DEFAULT 0,
    current_stock numeric NOT NULL DEFAULT 0,
    low_stock_threshold numeric NOT NULL DEFAULT 0,
    supplier_name text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    cost_type text NOT NULL DEFAULT 'ingredient',
    updated_at timestamptz NOT NULL DEFAULT now(),
    cost_source text NOT NULL DEFAULT 'manual',
    last_purchase_at timestamptz,
    cost_updated_at timestamptz
);

CREATE TABLE public.recipes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    quantity_used numeric NOT NULL DEFAULT 0,
    unit text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_id, ingredient_id)
);

CREATE TABLE public.sales_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'direct',
    fee_type text NOT NULL DEFAULT 'none',
    fee_value numeric NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    line_user_id text,
    display_name text,
    phone text,
    total_orders integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_no text NOT NULL,
    customer_id uuid REFERENCES public.customers(id),
    channel_id uuid REFERENCES public.sales_channels(id),
    order_type text NOT NULL DEFAULT 'manual',
    pickup_time timestamptz,
    status text NOT NULL DEFAULT 'draft',
    payment_status text NOT NULL DEFAULT 'unpaid',
    subtotal numeric NOT NULL DEFAULT 0,
    channel_fee numeric NOT NULL DEFAULT 0,
    total_amount numeric NOT NULL DEFAULT 0,
    total_cost numeric NOT NULL DEFAULT 0,
    gross_profit numeric NOT NULL DEFAULT 0,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    channel text NOT NULL DEFAULT 'web_order',
    order_status text NOT NULL DEFAULT 'pending_payment',
    pickup_type text NOT NULL DEFAULT 'pickup',
    discount_amount numeric NOT NULL DEFAULT 0,
    customer_note text,
    admin_note text,
    cancelled_reason text,
    cancelled_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    customer_name text,
    customer_phone text,
    order_source text NOT NULL DEFAULT 'web_order',
    public_token text
);

CREATE UNIQUE INDEX orders_store_order_no_unique ON public.orders (store_id, order_no);
CREATE UNIQUE INDEX orders_public_token_key ON public.orders (public_token);

CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity integer NOT NULL DEFAULT 1,
    unit_price numeric NOT NULL DEFAULT 0,
    unit_cost numeric NOT NULL DEFAULT 0,
    total_price numeric NOT NULL DEFAULT 0,
    total_cost numeric NOT NULL DEFAULT 0,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    product_name_snapshot text NOT NULL,
    line_profit numeric NOT NULL DEFAULT 0,
    options jsonb NOT NULL DEFAULT '{}'::jsonb,
    option_total numeric NOT NULL DEFAULT 0,
    option_cost_total numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    method text NOT NULL DEFAULT 'transfer',
    amount numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending',
    slip_url text,
    confirmed_by uuid,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    customer_id uuid,
    slip_file_name text,
    slip_storage_path text,
    submitted_at timestamptz,
    reject_reason text,
    verified_by_api boolean NOT NULL DEFAULT false,
    verification_provider text,
    verification_status text,
    verification_score numeric,
    api_response jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    movement_type text NOT NULL,
    quantity numeric NOT NULL,
    ref_order_id uuid,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    purchase_id uuid,
    order_item_id uuid,
    unit text,
    unit_cost_snapshot numeric,
    movement_reason text,
    created_by uuid
);

CREATE UNIQUE INDEX uq_stock_used_order_item_ingredient
    ON public.stock_movements (store_id, order_item_id, ingredient_id)
    WHERE movement_type = 'used' AND order_item_id IS NOT NULL;

CREATE UNIQUE INDEX uq_stock_returned_order_item_ingredient
    ON public.stock_movements (store_id, order_item_id, ingredient_id)
    WHERE movement_type = 'return' AND order_item_id IS NOT NULL;

CREATE TABLE public.order_status_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid,
    changed_by_type text NOT NULL DEFAULT 'system',
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_status_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    order_id uuid,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid,
    changed_by_type text NOT NULL DEFAULT 'system',
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Trigger Functions ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_order_status_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.order_status := NEW.status;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_order_status_legacy_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  if new.order_status is distinct from old.order_status then
    new.status = new.order_status;
  elsif new.status is distinct from old.status then
    new.order_status = new.status;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  if old.order_status is distinct from new.order_status then
    insert into public.order_status_logs (
      order_id, from_status, to_status, changed_by_type, note
    ) values (
      new.id, old.order_status, new.order_status, 'system',
      'Auto log from orders.order_status update'
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_payment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  if old.status is distinct from new.status then
    insert into public.payment_status_logs (
      payment_id, order_id, from_status, to_status, changed_by_type, note
    ) values (
      new.id, new.order_id, old.status, new.status, 'system',
      'Auto log from payments.status update'
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_payment_to_order()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  if new.status = 'paid' then
    update public.orders
    set
      payment_status = 'paid',
      order_status = case
        when order_status in ('draft', 'pending_payment', 'waiting_payment_review') then 'accepted'
        else order_status
      end,
      status = case
        when status in ('draft', 'pending_payment', 'waiting_payment_review') then 'accepted'
        else status
      end,
      updated_at = now()
    where id = new.order_id;
  elsif new.status = 'rejected' then
    update public.orders
    set
      payment_status = 'rejected',
      order_status = 'pending_payment',
      status = 'pending_payment',
      updated_at = now()
    where id = new.order_id;
  elsif new.status in ('pending', 'pending_review') then
    update public.orders
    set
      payment_status = 'pending_review',
      order_status = 'waiting_payment_review',
      status = 'waiting_payment_review',
      updated_at = now()
    where id = new.order_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_order_item_totals()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  new.total_price = new.quantity * new.unit_price;
  new.total_cost = new.quantity * new.unit_cost;
  new.line_profit = new.total_price - new.total_cost;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_order_totals(target_order_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  update public.orders
  set
    subtotal = coalesce((
      select sum(total_price) from public.order_items where order_id = target_order_id
    ), 0),
    total_cost = coalesce((
      select sum(total_cost) from public.order_items where order_id = target_order_id
    ), 0),
    total_amount = greatest(
      coalesce((
        select sum(total_price) from public.order_items where order_id = target_order_id
      ), 0) - discount_amount,
      0
    ),
    gross_profit =
      greatest(
        coalesce((
          select sum(total_price) from public.order_items where order_id = target_order_id
        ), 0) - discount_amount,
        0
      )
      - coalesce((
          select sum(total_cost) from public.order_items where order_id = target_order_id
        ), 0)
      - channel_fee,
    updated_at = now()
  where id = target_order_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_order_after_item_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_order_totals(old.order_id);
    return old;
  else
    perform public.recalculate_order_totals(new.order_id);
    return new;
  end if;
end;
$function$;

-- ── Triggers ───────────────────────────────────────────────────

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sync_order_status_columns
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION sync_order_status_columns();

CREATE TRIGGER trg_sync_order_status_legacy_status
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION sync_order_status_legacy_status();

CREATE TRIGGER trg_log_order_status_change
  AFTER UPDATE OF order_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_log_payment_status_change
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION log_payment_status_change();

CREATE TRIGGER trg_sync_payment_to_order
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION sync_payment_to_order();

CREATE TRIGGER trg_calculate_order_item_totals
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION calculate_order_item_totals();

CREATE TRIGGER trg_recalculate_order_after_item_insert
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_order_after_item_change();

CREATE TRIGGER trg_recalculate_order_after_item_update
  AFTER UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_order_after_item_change();

CREATE TRIGGER trg_recalculate_order_after_item_delete
  AFTER DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_order_after_item_change();

CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Frozen RPCs (from production, unmodified) ──────────────────

CREATE OR REPLACE FUNCTION public.finalize_paid_order_atomic(
    p_store_id uuid, p_order_id uuid, p_actor_id uuid, p_payment_method text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order_status text;
    v_order_payment_status text;
    v_total_amount numeric;
    v_payment_count integer;
    v_payment_id uuid;
    v_payment_status text;
    v_item_count integer;
    v_missing_snapshot_count integer;
    v_usage jsonb;
    v_req record;
    v_current_stock numeric;
    v_stock_result jsonb;
BEGIN
    IF p_store_id IS NULL THEN RAISE EXCEPTION 'store_id_required'; END IF;
    IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id_required'; END IF;
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'actor_id_required'; END IF;
    IF p_payment_method NOT IN ('cash', 'promptpay') THEN
        RAISE EXCEPTION 'invalid_payment_method';
    END IF;

    SELECT status, payment_status, total_amount
    INTO v_order_status, v_order_payment_status, v_total_amount
    FROM public.orders
    WHERE id = p_order_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found_for_store'; END IF;

    IF v_order_status = 'accepted' AND v_order_payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'status', 'ok', 'result', 'already_finalized', 'order_id', p_order_id
        );
    END IF;

    IF v_order_status <> 'pending_payment' THEN
        RAISE EXCEPTION 'invalid_order_status_for_finalization: %', v_order_status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.store_members
        WHERE store_id = p_store_id AND user_id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'actor_not_member_of_store';
    END IF;

    SELECT COUNT(*) INTO v_payment_count
    FROM public.payments WHERE order_id = p_order_id;

    IF v_payment_count > 1 THEN RAISE EXCEPTION 'ambiguous_payment_state'; END IF;

    IF v_payment_count = 1 THEN
        SELECT id, status INTO v_payment_id, v_payment_status
        FROM public.payments WHERE order_id = p_order_id FOR UPDATE;
        IF v_payment_status = 'paid' THEN
            RAISE EXCEPTION 'inconsistent_paid_payment_state';
        END IF;
        IF v_payment_status NOT IN ('pending', 'pending_review') THEN
            RAISE EXCEPTION 'invalid_payment_status_for_finalization: %', v_payment_status;
        END IF;
    END IF;

    SELECT COUNT(*), COUNT(*) FILTER (
        WHERE options #> '{_system,usage_breakdown}' IS NULL
    ) INTO v_item_count, v_missing_snapshot_count
    FROM public.order_items WHERE order_id = p_order_id;

    IF v_item_count = 0 THEN RAISE EXCEPTION 'order_has_no_items'; END IF;
    IF v_missing_snapshot_count > 0 THEN RAISE EXCEPTION 'usage_snapshot_missing'; END IF;

    WITH oi AS (
        SELECT id, quantity, options FROM public.order_items WHERE order_id = p_order_id
    ),
    base_usage AS (
        SELECT oi.id AS order_item_id,
            (b ->> 'ingredient_id')::uuid AS ingredient_id,
            ((b ->> 'quantity_used')::numeric * oi.quantity) AS quantity
        FROM oi
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(oi.options #> '{_system,usage_breakdown,base}', '[]'::jsonb)
        ) b
    ),
    addon_usage AS (
        SELECT oi.id AS order_item_id,
            (a ->> 'ingredient_id')::uuid AS ingredient_id,
            (
                (a ->> 'quantity_used')::numeric *
                COALESCE(
                    (SELECT (selected ->> 'quantity')::numeric
                     FROM jsonb_array_elements(
                         COALESCE(oi.options -> 'addons', '[]'::jsonb)
                     ) selected
                     WHERE selected ->> 'addon_id' = a ->> 'addon_id'
                     LIMIT 1),
                    0
                ) * oi.quantity
            ) AS quantity
        FROM oi
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(oi.options #> '{_system,usage_breakdown,addons}', '[]'::jsonb)
        ) a
    ),
    movement_usage AS (
        SELECT order_item_id, ingredient_id, SUM(quantity) AS quantity
        FROM (SELECT * FROM base_usage UNION ALL SELECT * FROM addon_usage) x
        WHERE quantity > 0
        GROUP BY order_item_id, ingredient_id
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'order_item_id', order_item_id,
                'ingredient_id', ingredient_id,
                'quantity', quantity
            ) ORDER BY order_item_id, ingredient_id
        ), '[]'::jsonb
    ) INTO v_usage
    FROM movement_usage;

    IF v_usage = '[]'::jsonb THEN RAISE EXCEPTION 'usage_snapshot_empty'; END IF;

    FOR v_req IN
        SELECT (entry ->> 'ingredient_id')::uuid AS ingredient_id,
               SUM((entry ->> 'quantity')::numeric) AS required_quantity
        FROM jsonb_array_elements(v_usage) entry
        GROUP BY (entry ->> 'ingredient_id')::uuid
        ORDER BY (entry ->> 'ingredient_id')::uuid
    LOOP
        SELECT current_stock INTO v_current_stock
        FROM public.ingredients
        WHERE id = v_req.ingredient_id AND store_id = p_store_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ingredient_not_found_for_store: %', v_req.ingredient_id;
        END IF;

        IF v_current_stock < v_req.required_quantity THEN
            RAISE EXCEPTION 'insufficient_stock ingredient=% required=% available=%',
                v_req.ingredient_id, v_req.required_quantity, v_current_stock;
        END IF;
    END LOOP;

    IF v_payment_count = 0 THEN
        INSERT INTO public.payments (order_id, method, amount, status, confirmed_by, confirmed_at)
        VALUES (p_order_id, p_payment_method, COALESCE(v_total_amount, 0), 'paid', p_actor_id, now())
        RETURNING id INTO v_payment_id;

        INSERT INTO public.payment_status_logs
            (payment_id, order_id, from_status, to_status, changed_by, changed_by_type, note)
        VALUES (v_payment_id, p_order_id, NULL, 'paid', p_actor_id, 'admin',
            'Counter payment confirmed');
    ELSE
        UPDATE public.payments
        SET method = p_payment_method, amount = COALESCE(v_total_amount, 0),
            status = 'paid', confirmed_by = p_actor_id, confirmed_at = now()
        WHERE id = v_payment_id;
    END IF;

    SELECT public.apply_order_stock_usage(p_store_id, p_order_id, p_actor_id, v_usage)
    INTO v_stock_result;

    RETURN jsonb_build_object(
        'status', 'ok', 'result', 'finalized', 'order_id', p_order_id,
        'payment_id', v_payment_id, 'payment_method', p_payment_method,
        'stock', v_stock_result
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_order_stock_usage(
    p_store_id uuid, p_order_id uuid, p_actor_id uuid, p_usage jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_payment_status text;
    v_entry jsonb;
    v_order_item_id uuid;
    v_ingredient_id uuid;
    v_quantity numeric;
    v_unit text;
    v_unit_cost numeric;
    v_movement_id uuid;
    v_applied_count integer := 0;
    v_existing_count integer := 0;
BEGIN
    IF p_store_id IS NULL THEN RAISE EXCEPTION 'store_id_required'; END IF;
    IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id_required'; END IF;
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'actor_id_required'; END IF;
    IF p_usage IS NULL OR jsonb_typeof(p_usage) <> 'array' THEN
        RAISE EXCEPTION 'usage_plan_must_be_json_array';
    END IF;

    SELECT payment_status INTO v_payment_status
    FROM public.orders WHERE id = p_order_id AND store_id = p_store_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found_for_store'; END IF;
    IF v_payment_status <> 'paid' THEN RAISE EXCEPTION 'order_not_paid'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.store_members
        WHERE store_id = p_store_id AND user_id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'actor_not_member_of_store';
    END IF;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_usage) LOOP
        BEGIN
            v_order_item_id := (v_entry ->> 'order_item_id')::uuid;
            v_ingredient_id := (v_entry ->> 'ingredient_id')::uuid;
            v_quantity := (v_entry ->> 'quantity')::numeric;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'invalid_usage_entry: %', v_entry;
        END;

        IF v_order_item_id IS NULL THEN RAISE EXCEPTION 'usage_order_item_id_required'; END IF;
        IF v_ingredient_id IS NULL THEN RAISE EXCEPTION 'usage_ingredient_id_required'; END IF;
        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'usage_quantity_must_be_positive';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.order_items
            WHERE id = v_order_item_id AND order_id = p_order_id
        ) THEN
            RAISE EXCEPTION 'order_item_not_found_for_order: %', v_order_item_id;
        END IF;

        SELECT unit, cost_per_unit INTO v_unit, v_unit_cost
        FROM public.ingredients
        WHERE id = v_ingredient_id AND store_id = p_store_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ingredient_not_found_for_store: %', v_ingredient_id;
        END IF;

        v_movement_id := NULL;

        INSERT INTO public.stock_movements (
            store_id, ingredient_id, movement_type, quantity,
            ref_order_id, order_item_id, unit, unit_cost_snapshot,
            movement_reason, created_by
        ) VALUES (
            p_store_id, v_ingredient_id, 'used', v_quantity,
            p_order_id, v_order_item_id, v_unit, COALESCE(v_unit_cost, 0),
            'pos_sale', p_actor_id
        )
        ON CONFLICT (store_id, order_item_id, ingredient_id)
        WHERE movement_type = 'used' AND order_item_id IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_movement_id;

        IF v_movement_id IS NULL THEN
            v_existing_count := v_existing_count + 1;
            CONTINUE;
        END IF;

        UPDATE public.ingredients
        SET current_stock = current_stock - v_quantity, updated_at = now()
        WHERE id = v_ingredient_id AND store_id = p_store_id;

        v_applied_count := v_applied_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'ok', 'store_id', p_store_id, 'order_id', p_order_id,
        'applied', v_applied_count, 'already_applied', v_existing_count
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_accepted_order_atomic(
    p_store_id uuid, p_order_id uuid, p_actor_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order_status text;
    v_ingredient record;
    v_used record;
    v_return_id uuid;
    v_returned integer := 0;
    v_already_returned integer := 0;
BEGIN
    IF p_store_id IS NULL THEN RAISE EXCEPTION 'store_id_required'; END IF;
    IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id_required'; END IF;
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'actor_id_required'; END IF;

    SELECT status INTO v_order_status
    FROM public.orders WHERE id = p_order_id AND store_id = p_store_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found_for_store'; END IF;

    IF v_order_status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'status', 'ok', 'result', 'already_cancelled', 'order_id', p_order_id
        );
    END IF;

    IF v_order_status <> 'accepted' THEN
        RAISE EXCEPTION 'invalid_status_for_stock_return: %', v_order_status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.store_members
        WHERE store_id = p_store_id AND user_id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'actor_not_member_of_store';
    END IF;

    FOR v_ingredient IN
        SELECT DISTINCT ingredient_id
        FROM public.stock_movements
        WHERE store_id = p_store_id AND ref_order_id = p_order_id
          AND movement_type = 'used' AND order_item_id IS NOT NULL
        ORDER BY ingredient_id
    LOOP
        PERFORM 1 FROM public.ingredients
        WHERE id = v_ingredient.ingredient_id AND store_id = p_store_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ingredient_not_found_for_store: %', v_ingredient.ingredient_id;
        END IF;
    END LOOP;

    FOR v_used IN
        SELECT order_item_id, ingredient_id, quantity, unit, unit_cost_snapshot
        FROM public.stock_movements
        WHERE store_id = p_store_id AND ref_order_id = p_order_id
          AND movement_type = 'used' AND order_item_id IS NOT NULL
        ORDER BY ingredient_id, order_item_id
    LOOP
        v_return_id := NULL;

        INSERT INTO public.stock_movements (
            store_id, ingredient_id, movement_type, quantity,
            ref_order_id, order_item_id, unit, unit_cost_snapshot,
            movement_reason, created_by
        ) VALUES (
            p_store_id, v_used.ingredient_id, 'return', v_used.quantity,
            p_order_id, v_used.order_item_id, v_used.unit, v_used.unit_cost_snapshot,
            'order_cancelled', p_actor_id
        )
        ON CONFLICT (store_id, order_item_id, ingredient_id)
        WHERE movement_type = 'return' AND order_item_id IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_return_id;

        IF v_return_id IS NULL THEN
            v_already_returned := v_already_returned + 1;
            CONTINUE;
        END IF;

        UPDATE public.ingredients
        SET current_stock = current_stock + v_used.quantity, updated_at = now()
        WHERE id = v_used.ingredient_id AND store_id = p_store_id;

        v_returned := v_returned + 1;
    END LOOP;

    UPDATE public.orders
    SET status = 'cancelled', order_status = 'cancelled',
        cancelled_reason = NULLIF(BTRIM(p_reason), ''),
        cancelled_at = now(), updated_at = now()
    WHERE id = p_order_id AND store_id = p_store_id;

    RETURN jsonb_build_object(
        'status', 'ok', 'result', 'cancelled', 'order_id', p_order_id,
        'returned', v_returned, 'already_returned', v_already_returned
    );
END;
$function$;

-- Grant execute on frozen RPCs
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;
