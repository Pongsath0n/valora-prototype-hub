# RBAC Smoke Checklist (Step 2B)

Use these quick checks before deployments touching RBAC or permissions.

## Identities
- **Owner**: `pongsathon.officialwork@gmail.com`
- **Staff**: `brewway.e2e@test.com`
- **Store**: `348544d2-9a2c-4ba4-8875-bc106fed752e`

## Backend APIs
1. **Owner /api/system access**
   - `curl -H "Authorization: Bearer <owner_token>" /api/system/health` → 200
   - Repeat with staff token → 403 (expect `owner_role_required`).
2. **Staff dashboard summary blocked**
   - `GET /api/store-admin/dashboard-summary?store_id=...` with staff token → 403.
3. **Staff orders + masking**
   - `GET /api/store-admin/orders?store_id=...` with staff token → 200, verify payload omits `total_cost`, `gross_profit`, `unit_cost`, `line_profit`.
4. **Staff payment queue**
   - `GET /api/store-admin/payments` with staff token → 200, `items` present, sensitive slip fields removed.
5. **Staff approve/reject**
   - `POST /api/store-admin/payments/{id}/approve` with staff token on pending payment → 200 and order status synced.
   - `POST .../reject` on pending review payment → 200.
6. **Staff order status transitions**
   - `PATCH /api/store-admin/orders/{id}/status` from `accepted`→`preparing` using staff token → 200.
   - Attempt to set `cancelled` as staff → 403 `insufficient_role_for_status`.

## Frontend Routes
1. Staff visiting `/app/dashboard` or `/app/reports` should see "Access Denied".
2. Staff can load `/store-admin/orders` and manage payment queue.
3. Managers can load both `/app/dashboard` and `/store-admin`.
4. Owner can access `/system/*` pages; staff navigate there should be blocked by guard.

Record any deviations before release.
