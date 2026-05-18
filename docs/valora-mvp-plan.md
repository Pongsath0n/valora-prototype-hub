# Valora Engine MVP Plan (Phase-based)

## 1) Development Plan

### Phase 0 — Foundation Alignment
- Keep existing React/Tailwind UI and business calculation code where reusable.
- Introduce domain-driven folder boundaries (`features`, `services`, `lib`, `types`).
- Prepare Supabase-first schema and RLS for multi-tenant `store_id` model.
- Define explicit enums for order/payment/channel fee logic.

### Phase 1 — Store Setup (Implementation starts now)
- Add normalized `stores` and `profiles` linkage.
- Add `store_members` role model (`owner`, `manager`, `staff`).
- Refactor settings/store profile screen to load/save store setup via service layer.
- Keep local fallback for development mode while Supabase wiring is rolling out.

### Phase 2 — Master Data
- Product categories, products (menu), ingredients.
- Stock baseline fields and low-stock threshold.

### Phase 3 — Costing
- Recipes with ingredient usage per product.
- Deterministic menu-cost calculation.

### Phase 4 — Commercial Channels
- Sales channels and channel pricing rules.
- Channel fee calculations (`percent`, `fixed`, `none`).

### Phase 5 — Transactions
- Manual POS order creation, order items, status workflow.
- Payment records and payment statuses.

### Phase 6 — Inventory Movement & Profit
- Stock deduction on accepted/completed order transitions.
- Conditional restore policy for cancellations.
- Order-level gross profit computation.

### Phase 7 — Owner Dashboard + Reports
- Today KPIs, channel/menu profitability, low stock, recent orders.
- CSV export endpoints/actions.

## 2) Proposed Folder Structure

```txt
src/
  app/ or pages/                 # UI routes (migrate to Next.js app router later)
  components/                    # Shared UI components
  features/
    auth/
    store/
    menu/
    ingredient/
    recipe/
    channel/
    order/
    payment/
    dashboard/
    report/
  services/
    db/                          # Supabase data access adapters/repositories
    calc/                        # Profit and costing engines (pure functions)
  lib/
    supabase.ts
    guards.ts
    format.ts
  types/
    domain.ts
    db.ts
```

## 3) Database Schema Plan (Supabase)

Core tables:
- `stores`, `profiles`, `store_members`
- `product_categories`, `products`
- `ingredients`, `recipes`
- `sales_channels`, `channel_prices`
- `customers`, `orders`, `order_items`, `payments`
- `stock_movements`

Rules:
- All major business tables carry `store_id`.
- RLS policies scoped through `store_members`.
- Enums for `order_status`, `payment_status`, `channel_fee_type`, `stock_movement_type`.
- Timestamp + `created_by` fields for auditability.

## 4) Task Order
1. Schema migration + RLS baseline.
2. Store setup module.
3. Menu management.
4. Ingredient and stock management.
5. Recipe costing.
6. Sales channel management.
7. Channel pricing.
8. Manual order/POS.
9. Order status + payment status.
10. Stock movement automation.
11. Profit engine integration.
12. Dashboard + reports/CSV.
13. LINE OA/LIFF-ready order adapter boundary.

## First Phase Scope in this commit
- Added Supabase schema v2 SQL for full MVP entities and policies.
- Added store setup service abstraction with Supabase-first behavior and local fallback.
- Refactored settings page to load/save store profile asynchronously via the new service.
