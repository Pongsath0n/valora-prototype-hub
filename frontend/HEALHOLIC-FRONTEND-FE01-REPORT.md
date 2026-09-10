# HEALHOLIC — FE-01 FRONTEND CONTRACT FOUNDATION REPORT

## Verdict

PASS WITH CONDITIONS

## Git

Branch: Healholic-graphic
Starting HEAD: 98ab1b673da95c7f547d00912beeb0bd15d9764e
Working tree before: clean (no uncommitted changes)
Working tree after: 16 modified files, 5 new files (all frontend-only)

## Backend Reference

V1:
healholic-backend-v1

V1.1:
healholic-backend-v1.1

Backend files modified:
NONE

## API Contract

Customer create:
- `POST /api/customer/orders` via `customerApi.createOrder`
- TypeScript contract updated: `CustomerOrderCreatePayload` now treats `customer.phone`, `pickup_time`, and `note` as OPTIONAL. `customer.name` remains REQUIRED.
- The frontend MUST NOT send `price`, `cost`, `total`, `_system`, `usage_breakdown`, or ingredient data. The type does not expose these fields.
- No `email`, LINE requirement, payment selection, or slip information is added to the create payload.

Incoming Queue:
- `GET /api/store-admin/orders/incoming` via `storeAdminApi.listIncomingQueue`
- Typed response: `IncomingQueueResponse` with `IncomingQueueOrder[]` and `store_id`.
- Each order exposes: `id`, `order_no`, `order_number`, `customer_name`, `customer_note`, `items`, `total_amount`, `created_at`, `status`, `payment_status`, `order_source`.
- Items are staff-safe (no `_system`, no cost/profit fields).

Production Queue:
- `GET /api/store-admin/orders/production` via `storeAdminApi.listProductionQueue` (V1.1)
- Typed response: `ProductionQueueResponse` with `ProductionQueueOrder[]` and `store_id`.
- Each order exposes: `id`, `order_no`, `order_number`, `order_source`, `customer_name`, `customer_note`, `items`, `total_amount`, `status`, `payment_status`, `payment_confirmed_at`.
- `payment_confirmed_at` is the canonical FIFO timestamp from `payments.confirmed_at`. The frontend does NOT derive FIFO from `created_at` or `updated_at`.
- Staff-safe: no slip fields, no `confirmed_by`, no `reject_reason`, no cost/profit fields, no `_system`, no `usage_breakdown`.

Finalize Payment:
- `POST /api/store-admin/orders/{order_id}/finalize-payment` via `storeAdminApi.finalizePayment`
- Typed request: `FinalizePaymentPayload` with `payment_method: "cash" | "promptpay"`.
- Typed response: `FinalizePaymentResponse` with `id`, `order_id`, `status`, `payment_status`, `result`, `payment_id`, `payment_method`.
- This is the canonical Self-order counter payment endpoint. Idempotent (`already_finalized`).

Cancellation:
- `POST /api/store-admin/orders/{order_id}/cancel` via `storeAdminApi.cancelOrder`
- Typed request: `OrderCancelPayload` with optional `reason`.
- Typed response: `{ id: string; status: string }`.
- The frontend does NOT use `/cancel-atomic` (verified: no references anywhere in `frontend/src`).
- Backend decides cancellation path from persisted status; frontend never chooses between direct vs atomic.

## Roles

profileRole:
- Exposed via `useProfileRole().profileRole` in `RoleContext`.
- Sourced from `profiles.role` (the `/me` response `role` field).
- Authorizes platform/system access (System Console: owner/admin).

storeRole:
- Exposed via `useProfileRole().currentStoreRole` in `RoleContext`.
- Sourced from `store_members.role` for the resolved store membership (matched by `store_id` from the `/me` response).
- Authorizes tenant/store operations (owner/manager/staff).

Owner capability source:
- `useIsStoreOwner()` hook in `guards.ts` checks `currentStoreRole === "owner"`, NOT `profileRole`.
- This aligns with the backend's `_require_owner_store_role` which checks `store_members.role`.

System role behavior:
- `SYSTEM_CONSOLE_ROLES` remains `["owner", "admin"]` based on `profileRole`.
- The backend's `_require_owner_profile` checks `profiles.role` for System Console access.
- System role behavior is separately represented and NOT conflated with store role.

## Paths

Canonical customer paths:
- `/order` — Customer menu (P01)
- `/order/:productId` — Menu detail (P02)
- `/order/cart` — Cart (P03)
- `/order/confirm` — Order confirm (P04)
- `/order/success` — Order success (P05)
- `/order/status` — Order status (P06)

Legacy /liff redirects:
- `/liff/menu` → `/order` (P07)
- `/liff/menu/:id` → `/order/:id` with path param preserved in pathname (P08)
- `/liff/cart` → `/order/cart` (P09)
- `/liff/confirm` → `/order/confirm` (P10)
- `/liff/success` → `/order/success` (P11)
- All redirects preserve search params and hash (P12)

Stale API paths:
- No `/api/store/` (non-admin) prefix found anywhere in `frontend/src`.
- No `/cancel-atomic` usage found anywhere in `frontend/src`.
- Existing `/api/store-admin/` calls remain unchanged.

## Branding

Platform: Valora (unchanged — `PLATFORM_NAME` constant in `config/brand.ts`)
Store: Healholic (`STORE_DISPLAY_NAME` constant in `config/brand.ts`)
Customer-facing Brewway: REMOVED from all active customer pages.
Store identity source: `frontend/src/config/brand.ts` — centralized `STORE_DISPLAY_NAME = "Healholic"`.

Files updated to use centralized brand constant:
- `CustomerThemeLayout.tsx` — header brand name
- `CustomerMenu.tsx` — menu placeholder brand name
- `storeService.ts` — default store name
- `Settings.tsx` — default shop name input
- `AdminStoreSettings.tsx` — default shop name input

Remaining "Brewway" references are CSS class names (`brewway-customer`) and code comments only — not customer-visible text.

## Legacy Payment

Canonical V1:
- `POST /api/store-admin/orders/{order_id}/finalize-payment` — atomic counter payment finalization.
- This is the only canonical Self-order payment path for V1.

Legacy methods:
- `storeAdminApi.listPayments` — legacy payment queue listing.
- `storeAdminApi.exportPaymentsCsv` — legacy slip-review CSV export.
- `storeAdminApi.listOrderPayments` — legacy per-order payment listing.
- `storeAdminApi.createOrderPayment` — legacy manual payment row creation.
- `storeAdminApi.updatePayment` — legacy payment row update.
- `storeAdminApi.submitPaymentSlip` — legacy slip upload.
- `storeAdminApi.approvePayment` — legacy slip approval.
- `storeAdminApi.rejectPayment` — legacy slip rejection.
- `storeAdminApi.getPaymentSlipPreview` — legacy slip preview.
- `customerApi.getPaymentInstructions` — legacy bank-transfer instructions.
- `customerApi.uploadPaymentSlip` — legacy customer slip upload.
- All legacy methods are annotated with `@legacy OUT OF V1 FRONTEND SCOPE` JSDoc comments.

Active pages changed:
NONE — No active customer success/status pages were redesigned in FE-01.
Foundational changes only:
- Legacy payment service methods marked with `@legacy` annotations.
- Canonical `finalizePayment` service method added (not yet wired to UI — that is FE-02/FE-03 scope).
- Legacy slip-upload UI in `OrderSuccess.tsx` and `OrderStatusPage.tsx` remains active but is out of FE-01 scope.

## Tests

Previous:
174

Pre-closure:
215

Final:
Passed: 216
Failed: 0

Delta: +42 (pre-closure +41, P08 redirect fix +1)

New test files (by test ID):
- `frontend/src/services/__tests__/fe01-api-contract.test.ts` — 11 IDs (F01–F11), 14 `it()` calls
- `frontend/src/lib/__tests__/fe01-rbac.test.ts` — 6 IDs (R01–R06), 9 `it()` calls
- `frontend/src/App.fe01-routes.test.tsx` — 12 IDs (P01–P12), 14 `it()` calls
- `frontend/src/config/__tests__/fe01-brand.test.tsx` — 4 IDs (B01–B04), 5 `it()` calls

Explanation of +42 tests:
- 33 test IDs (F01–F11, R01–R06, P01–P12, B01–B04) were listed in the initial report.
- 8 additional `it()` calls come from IDs that contain multiple assertions:
  F01 (2), F02 (2), F11 (2), R02 (2), R03 (2), R04 (2), P12 (2), B02 (2).
- 1 additional `it()` call from the P08 redirect fix (search/hash preservation test).
- Total: 33 + 8 + 1 = 42 new `it()` calls.

## Build

Result: PASS (vite build completed in 13.16s)

## Lint

Before:
159 problems
135 errors
24 warnings

After:
Problems: 159
Errors: 135
Warnings: 24

New lint debt:
NO

## Production Safety

Writes:
NONE

## Files Changed

Modified:
- `frontend/src/App.tsx` — canonical `/order/*` routes + `/liff/*` compatibility redirects + `LiffLegacyRedirect` component
- `frontend/src/components/customer/CustomerThemeLayout.tsx` — brand name → `STORE_DISPLAY_NAME`, cart link → `/order/cart`
- `frontend/src/contexts/RoleContext.tsx` — `profileRole` + `currentStoreRole` separation, `storeId`, `storeName`
- `frontend/src/features/store/storeService.ts` — default store name → `STORE_DISPLAY_NAME`
- `frontend/src/lib/guards.ts` — `useIsStoreOwner()` hook
- `frontend/src/pages/PrivacyNotice.tsx` — link → `/order/confirm`
- `frontend/src/pages/Settings.tsx` — default shop name → `STORE_DISPLAY_NAME`
- `frontend/src/pages/admin/AdminStoreSettings.tsx` — default shop name → `STORE_DISPLAY_NAME`
- `frontend/src/pages/liff/Cart.tsx` — links → `/order`, `/order/confirm`
- `frontend/src/pages/liff/CustomerMenu.tsx` — link → `/order/:id`, brand → `STORE_DISPLAY_NAME`
- `frontend/src/pages/liff/MenuDetail.tsx` — nav → `/order`, `/order/cart`
- `frontend/src/pages/liff/OrderConfirm.tsx` — nav → `/order/success`, `/order`, `/order/cart`
- `frontend/src/pages/liff/OrderSuccess.tsx` — links → `/order`
- `frontend/src/pages/order/OrderStatusPage.tsx` — link → `/order`
- `frontend/src/services/customerApi.ts` — `CustomerOrderCreatePayload` optional fields, `@legacy` annotations
- `frontend/src/services/storeAdminApi.ts` — Incoming Queue, Production Queue, finalizePayment types + methods, `@legacy` annotations, error doc

New:
- `frontend/src/config/brand.ts` — centralized `PLATFORM_NAME` and `STORE_DISPLAY_NAME`
- `frontend/src/services/__tests__/fe01-api-contract.test.ts` — F01–F11 API contract tests
- `frontend/src/lib/__tests__/fe01-rbac.test.ts` — R01–R06 RBAC model tests
- `frontend/src/App.fe01-routes.test.tsx` — P01–P12 route tests
- `frontend/src/config/__tests__/fe01-brand.test.tsx` — B01–B04 brand tests

## Notes

### Audit document
`frontend/HEALHOLIC-FRONTEND-AUDIT-V1.md` was deleted by the user before FE-01 implementation. It is not restored.

### System stores endpoint — FE-GAP-14
FE-GAP-14: CLOSED — AUDIT FALSE POSITIVE.
The audit flagged `GET /api/system/stores` as potentially out-of-contract. Verification against the backend source (`backend/app/api/system_console.py` line 547) confirms the endpoint EXISTS and is part of the frozen V1 contract. No frontend changes were needed.

### Error type preservation
The existing `request()` helper in `storeAdminApi.ts` already preserves structured backend error codes. When the backend returns `{ detail: { code, message } }`, the `code` becomes the `Error.message` and the full `{ code, message }` object is attached as `err.detail`. This preserves codes like `owner_role_required`, `insufficient_stock`, `idempotency_conflict`, `invalid_status_for_cancellation`, etc. A documentation comment was added to make this explicit.

### Conditions
1. FE-01 is foundation-only. No Incoming Queue, Production Queue, Customer Success, Customer Status, or realtime UI was built. These belong to FE-02 and later phases.
2. Legacy slip-upload/payment-instruction UI remains active in `OrderSuccess.tsx` and `OrderStatusPage.tsx`. These pages were not redesigned in FE-01.
3. The `role` field in `RoleContext` is kept as a backward-compat alias for `profileRole`. Existing guards continue to work. New V1 code should use `profileRole` or `currentStoreRole` explicitly.
4. Profit Planning mock/local storage mixing was not addressed in FE-01 (out of scope).

## Final Recommendation

FE-01 CLOSED — READY FOR FE-02 CUSTOMER SELF-ORDER FLOW

STOP.

Do NOT start FE-02 automatically.
