import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const FRONTEND_SRC = resolve(__dirname, "..");

function readFileSafe(rel: string): string {
  const path = join(FRONTEND_SRC, rel);
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function fileExists(rel: string): boolean {
  return existsSync(join(FRONTEND_SRC, rel));
}

// ── FE-11 Final Frontend Quality Contract Tests (Q01-Q20) ──────────────────
// These tests verify the final V1 frontend quality invariants after FE-11
// stabilization. They cover canonical flows, legacy removal, role RBAC,
// transaction safety, polling/Realtime defaults, branding, and Supabase
// guardrails.

describe("FE-11 Final Frontend Quality Contract (Q01-Q20)", () => {
  // ── Q01: Full Customer canonical route flow ────────────────────────────
  describe("Q01 Customer canonical route flow", () => {
    it("App.tsx defines all canonical /order/* routes", () => {
      const app = readFileSafe("App.tsx");
      expect(app).toMatch(/path="\/order"/);
      expect(app).toMatch(/path="\/order\/:productId"/);
      expect(app).toMatch(/path="\/order\/cart"/);
      expect(app).toMatch(/path="\/order\/confirm"/);
      expect(app).toMatch(/path="\/order\/success"/);
      expect(app).toMatch(/path="\/order\/status"/);
      expect(app).toMatch(/path="\/privacy"/);
    });
  });

  // ── Q02: Customer contains no legacy payment/slip path ──────────────────
  describe("Q02 Customer no legacy payment/slip", () => {
    it("customerApi has no slip/payment-instruction methods", () => {
      const api = readFileSafe("services/customerApi.ts");
      expect(api).not.toMatch(/uploadPaymentSlip/);
      expect(api).not.toMatch(/getPaymentInstructions/);
      expect(api).not.toMatch(/PaymentInstructionsResponse/);
    });
  });

  // ── Q03: Customer status remains token-only ───────────────────────────
  describe("Q03 Customer status token-only", () => {
    it("customerApi.getOrderStatusByToken is preserved", () => {
      const api = readFileSafe("services/customerApi.ts");
      expect(api).toMatch(/getOrderStatusByToken/);
    });

    it("customerApi has no phone-based lookup", () => {
      const api = readFileSafe("services/customerApi.ts");
      expect(api).not.toMatch(/lookupOrderStatus/);
    });
  });

  // ── Q04: Staff Incoming canonical flow ────────────────────────────────
  describe("Q04 Staff Incoming canonical flow", () => {
    it("IncomingOrdersQueue uses listIncomingQueue", () => {
      const comp = readFileSafe("components/admin/IncomingOrdersQueue.tsx");
      expect(comp).toMatch(/listIncomingQueue/);
    });

    it("IncomingOrdersQueue polls at 15 seconds", () => {
      const comp = readFileSafe("components/admin/IncomingOrdersQueue.tsx");
      expect(comp).toMatch(/15_000/);
    });
  });

  // ── Q05: Staff payment fail-closed ────────────────────────────────────
  describe("Q05 Staff payment fail-closed", () => {
    it("CounterPaymentDialog uses finalizePayment (not direct payment creation)", () => {
      const comp = readFileSafe("components/admin/CounterPaymentDialog.tsx");
      expect(comp).toMatch(/finalizePayment/);
      expect(comp).not.toMatch(/createOrderPayment/);
    });
  });

  // ── Q06: Production sequential status flow ────────────────────────────
  describe("Q06 Production sequential status flow", () => {
    it("ProductionOrdersQueue uses listProductionQueue", () => {
      const comp = readFileSafe("components/admin/ProductionOrdersQueue.tsx");
      expect(comp).toMatch(/listProductionQueue/);
    });

    it("ProductionOrdersQueue polls at 15 seconds", () => {
      const comp = readFileSafe("components/admin/ProductionOrdersQueue.tsx");
      expect(comp).toMatch(/15_000/);
    });
  });

  // ── Q07: Owner cancellation role/status matrix ────────────────────────
  describe("Q07 Owner cancellation role/status matrix", () => {
    it("OwnerCancelDialog is preserved", () => {
      expect(fileExists("components/admin/OwnerCancelDialog.tsx")).toBe(true);
    });

    it("storeAdminApi.cancelOrder is preserved", () => {
      const api = readFileSafe("services/storeAdminApi.ts");
      expect(api).toMatch(/cancelOrder/);
    });

    it("IncomingOrdersQueue uses OwnerCancelDialog (owner-only)", () => {
      const comp = readFileSafe("components/admin/IncomingOrdersQueue.tsx");
      expect(comp).toMatch(/OwnerCancelDialog/);
      expect(comp).toMatch(/useIsStoreOwner/);
    });
  });

  // ── Q08: Profit Planning remains Owner-only ───────────────────────────
  describe("Q08 Profit Planning Owner-only", () => {
    it("App.tsx guards /owner/profit-planning with OwnerRoute", () => {
      const app = readFileSafe("App.tsx");
      // Extract the route line for profit-planning
      const line = app.split("\n").find((l) => l.includes('path="/owner/profit-planning"'));
      expect(line).toBeTruthy();
      expect(line).toMatch(/OwnerRoute/);
    });
  });

  // ── Q09: Platform admin + store manager cannot use Owner controls ─────
  describe("Q09 Platform admin + store manager RBAC", () => {
    it("guards.ts useOwnerGuard checks currentStoreRole === owner (not profileRole)", () => {
      const guards = readFileSafe("lib/guards.ts");
      expect(guards).toMatch(/currentStoreRole/);
      expect(guards).toMatch(/"owner"/);
    });

    it("App.tsx OwnerRoute uses useOwnerGuard", () => {
      const app = readFileSafe("App.tsx");
      // Find the OwnerRoute function block (from "function OwnerRoute" to the next "function")
      const startIdx = app.indexOf("function OwnerRoute");
      const endIdx = app.indexOf("function", startIdx + 1);
      const block = app.slice(startIdx, endIdx > 0 ? endIdx : undefined);
      expect(block).toMatch(/useOwnerGuard/);
    });
  });

  // ── Q10: Profile owner + store manager cannot use Owner controls ──────
  describe("Q10 Profile owner + store manager RBAC", () => {
    it("RoleContext exposes currentStoreRole separately from profileRole", () => {
      const ctx = readFileSafe("contexts/RoleContext.tsx");
      expect(ctx).toMatch(/currentStoreRole/);
      expect(ctx).toMatch(/profileRole/);
    });

    it("guards use currentStoreRole for store-owner checks", () => {
      const guards = readFileSafe("lib/guards.ts");
      expect(guards).toMatch(/currentStoreRole/);
    });
  });

  // ── Q11: Realtime flag remains false by default ───────────────────────
  describe("Q11 Realtime flag default false", () => {
    it("featureFlags defaults VITE_ENABLE_STORE_ORDERS_REALTIME to false", () => {
      const flags = readFileSafe("config/featureFlags.ts");
      expect(flags).toMatch(/VITE_ENABLE_STORE_ORDERS_REALTIME.*"false"/);
    });
  });

  // ── Q12: 15-second polling remains fallback ───────────────────────────
  describe("Q12 15-second polling fallback", () => {
    it("OrderStatusPage polls at 15 seconds", () => {
      const page = readFileSafe("pages/order/OrderStatusPage.tsx");
      expect(page).toMatch(/15_000/);
    });

    it("IncomingOrdersQueue polls at 15 seconds", () => {
      const comp = readFileSafe("components/admin/IncomingOrdersQueue.tsx");
      expect(comp).toMatch(/15_000/);
    });

    it("ProductionOrdersQueue polls at 15 seconds", () => {
      const comp = readFileSafe("components/admin/ProductionOrdersQueue.tsx");
      expect(comp).toMatch(/15_000/);
    });
  });

  // ── Q13: No stale /api/store business prefix ──────────────────────────
  describe("Q13 No stale /api/store prefix", () => {
    it("customerApi uses /api/customer/ prefix (not /api/store/)", () => {
      const api = readFileSafe("services/customerApi.ts");
      expect(api).toMatch(/\/api\/customer\//);
      expect(api).not.toMatch(/\/api\/store\//);
    });
  });

  // ── Q14: No active /cancel-atomic ─────────────────────────────────────
  describe("Q14 No /cancel-atomic", () => {
    it("storeAdminApi has no cancel-atomic endpoint", () => {
      const api = readFileSafe("services/storeAdminApi.ts");
      expect(api).not.toMatch(/cancel-atomic/);
    });
  });

  // ── Q15: No active PATCH cancelled ────────────────────────────────────
  describe("Q15 No PATCH cancelled", () => {
    it("AdminOrderDetail uses cancelOrder (not PATCH status=cancelled)", () => {
      const page = readFileSafe("pages/admin/AdminOrderDetail.tsx");
      expect(page).toMatch(/cancelOrder/);
      expect(page).not.toMatch(/status:\s*["']cancelled["']/);
    });
  });

  // ── Q16: No active customer phone/slip/payment flow ───────────────────
  describe("Q16 No customer phone/slip/payment flow", () => {
    it("OrderStatusPage has no slip upload controls in code (comments OK)", () => {
      const page = readFileSafe("pages/order/OrderStatusPage.tsx");
      // Strip comments before checking
      const codeOnly = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(codeOnly).not.toMatch(/uploadPaymentSlip/);
      expect(codeOnly).not.toMatch(/getPaymentInstructions/);
    });

    it("OrderConfirmPage has no slip upload controls", () => {
      const page = readFileSafe("pages/liff/OrderConfirm.tsx");
      expect(page).not.toMatch(/uploadPaymentSlip/);
    });
  });

  // ── Q17: Kiosk atomic service remains canonical ──────────────────────
  describe("Q17 Kiosk atomic service canonical", () => {
    it("useKioskOrder uses client_order_id idempotency", () => {
      const hook = readFileSafe("features/staff/kiosk/useKioskOrder.ts");
      expect(hook).toMatch(/client_order_id/);
    });

    it("useKioskOrder handles kiosk_order_stock_sync_failed", () => {
      const hook = readFileSafe("features/staff/kiosk/useKioskOrder.ts");
      expect(hook).toMatch(/kiosk_order_stock_sync_failed/);
    });
  });

  // ── Q18: No frontend stock mutation ───────────────────────────────────
  describe("Q18 No frontend stock mutation", () => {
    it("useKioskOrder does not deduct stock client-side", () => {
      const hook = readFileSafe("features/staff/kiosk/useKioskOrder.ts");
      expect(hook).not.toMatch(/deductStock|mutateStock|stock_deduct/);
    });
  });

  // ── Q19: No direct business Supabase CRUD/RPC ────────────────────────
  describe("Q19 No direct business Supabase", () => {
    it("customerApi has no supabase.from() calls", () => {
      const api = readFileSafe("services/customerApi.ts");
      expect(api).not.toMatch(/supabase\.from\(/);
      expect(api).not.toMatch(/supabase\.rpc\(/);
    });

    it("storeAdminApi has no supabase.from() calls", () => {
      const api = readFileSafe("services/storeAdminApi.ts");
      expect(api).not.toMatch(/supabase\.from\(/);
      expect(api).not.toMatch(/supabase\.rpc\(/);
    });
  });

  // ── Q20: No visible Brewway in canonical surfaces ─────────────────────
  describe("Q20 No visible Brewway", () => {
    it("OrderStatusPage has no Brewway string", () => {
      const page = readFileSafe("pages/order/OrderStatusPage.tsx");
      expect(page).not.toMatch(/Brewway/);
    });

    it("IncomingOrdersQueue has no Brewway string", () => {
      const comp = readFileSafe("components/admin/IncomingOrdersQueue.tsx");
      expect(comp).not.toMatch(/Brewway/);
    });

    it("CounterPaymentDialog has no Brewway string", () => {
      const comp = readFileSafe("components/admin/CounterPaymentDialog.tsx");
      expect(comp).not.toMatch(/Brewway/);
    });

    it("AdminOrderDetail has no Brewway string", () => {
      const page = readFileSafe("pages/admin/AdminOrderDetail.tsx");
      expect(page).not.toMatch(/Brewway/);
    });
  });
});
