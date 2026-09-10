import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const FRONTEND_SRC = resolve(__dirname, "..");

// ── FE-10 Legacy Frontend Cleanup Contract ──────────────────────────────────
// These tests verify that legacy code removed by FE-10 stays removed, and
// that canonical V1 flows (finalizePayment, cancelOrder, token-based status,
// Kiosk atomic checkout, LIFF redirects) remain intact.

function readFileSafe(rel: string): string {
  const path = join(FRONTEND_SRC, rel);
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function fileExists(rel: string): boolean {
  return existsSync(join(FRONTEND_SRC, rel));
}

function listDir(rel: string): string[] {
  const path = join(FRONTEND_SRC, rel);
  return existsSync(path) ? readdirSync(path) : [];
}

describe("FE-10 Legacy Frontend Cleanup Contract", () => {
  // ── LEG01-LEG10: Removed files ──────────────────────────────────────────
  describe("LEG01-LEG10 removed dead files", () => {
    it("LEG01 paymentGateway.ts is removed", () => {
      expect(fileExists("services/paymentGateway.ts")).toBe(false);
    });

    it("LEG02 usePayment.ts hook is removed", () => {
      expect(fileExists("hooks/usePayment.ts")).toBe(false);
    });

    it("LEG03 gateways/ directory is removed", () => {
      expect(fileExists("services/gateways")).toBe(false);
    });

    it("LEG04 PaymentSlipPreviewModal component is removed", () => {
      expect(fileExists("components/admin/PaymentSlipPreviewModal.tsx")).toBe(false);
    });

    it("LEG05 PaymentSlipPreviewModal test is removed", () => {
      expect(fileExists("components/admin/PaymentSlipPreviewModal.test.tsx")).toBe(false);
    });

    it("LEG06 paymentReview lib is removed", () => {
      expect(fileExists("lib/paymentReview.ts")).toBe(false);
    });

    it("LEG07 paymentReview test is removed", () => {
      expect(fileExists("lib/paymentReview.test.ts")).toBe(false);
    });

    it("LEG08 AdminPaymentDetail page is removed", () => {
      expect(fileExists("pages/admin/AdminPaymentDetail.tsx")).toBe(false);
    });
  });

  // ── LEG11-LEG20: Removed customer API methods ──────────────────────────
  describe("LEG11-LEG20 removed customer legacy methods", () => {
    const customerApi = readFileSafe("services/customerApi.ts");

    it("LEG11 customerApi.lookupOrderStatus is removed", () => {
      expect(customerApi).not.toMatch(/lookupOrderStatus/);
    });

    it("LEG12 customerApi.getPaymentInstructions is removed", () => {
      expect(customerApi).not.toMatch(/getPaymentInstructions/);
    });

    it("LEG13 customerApi.uploadPaymentSlip is removed", () => {
      expect(customerApi).not.toMatch(/uploadPaymentSlip/);
    });

    it("LEG14 PaymentInstructionsResponse type is removed", () => {
      expect(customerApi).not.toMatch(/PaymentInstructionsResponse/);
    });

    it("LEG15 OrderStatusPaymentSummary no longer carries slip fields", () => {
      expect(customerApi).not.toMatch(/slip_submitted/);
      expect(customerApi).not.toMatch(/can_upload_slip/);
      expect(customerApi).not.toMatch(/reject_reason/);
    });
  });

  // ── LEG21-LEG30: Removed staff legacy slip-review ──────────────────────
  describe("LEG21-LEG30 removed staff legacy slip-review", () => {
    const adminOrders = readFileSafe("pages/admin/AdminOrders.tsx");

    it("LEG21 AdminOrders no longer imports PaymentSlipPreviewModal", () => {
      expect(adminOrders).not.toMatch(/PaymentSlipPreviewModal/);
    });

    it("LEG22 AdminOrders no longer has payments tab", () => {
      expect(adminOrders).not.toMatch(/"payments"/);
      expect(adminOrders).not.toMatch(/รอตรวจสลิป/);
    });

    it("LEG23 AdminOrders no longer calls listPayments", () => {
      expect(adminOrders).not.toMatch(/listPayments/);
    });

    it("LEG24 AdminOrders no longer calls approvePayment/rejectPayment", () => {
      expect(adminOrders).not.toMatch(/approvePayment/);
      expect(adminOrders).not.toMatch(/rejectPayment/);
    });

    it("LEG25 AdminOrders no longer has exportPaymentsCsv", () => {
      expect(adminOrders).not.toMatch(/exportPaymentsCsv/);
    });

    it("LEG26 AdminOrderDetail no longer imports PaymentSlipPreviewModal", () => {
      const detail = readFileSafe("pages/admin/AdminOrderDetail.tsx");
      expect(detail).not.toMatch(/PaymentSlipPreviewModal/);
    });

    it("LEG27 AdminOrderDetail no longer imports paymentReview lib", () => {
      const detail = readFileSafe("pages/admin/AdminOrderDetail.tsx");
      expect(detail).not.toMatch(/from.*paymentReview/);
    });

    it("LEG28 AdminOrderDetail no longer calls approvePayment/rejectPayment", () => {
      const detail = readFileSafe("pages/admin/AdminOrderDetail.tsx");
      expect(detail).not.toMatch(/approvePayment/);
      expect(detail).not.toMatch(/rejectPayment/);
    });

    it("LEG29 AdminOrderDetail uses canonical cancelOrder, not PATCH cancelled", () => {
      const detail = readFileSafe("pages/admin/AdminOrderDetail.tsx");
      expect(detail).toMatch(/cancelOrder/);
      expect(detail).not.toMatch(/status:\s*["']cancelled["']/);
    });
  });

  // ── LEG31-LEG35: Removed storeAdminApi legacy methods ──────────────────
  describe("LEG31-LEG35 removed storeAdminApi legacy methods", () => {
    const api = readFileSafe("services/storeAdminApi.ts");

    it("LEG31 storeAdminApi.listPayments is removed", () => {
      expect(api).not.toMatch(/async\s+listPayments\b/);
    });

    it("LEG32 storeAdminApi.exportPaymentsCsv is removed", () => {
      expect(api).not.toMatch(/exportPaymentsCsv/);
    });

    it("LEG33 storeAdminApi.createOrderPayment is removed", () => {
      expect(api).not.toMatch(/createOrderPayment/);
    });

    it("LEG34 storeAdminApi.updatePayment is removed", () => {
      expect(api).not.toMatch(/async\s+updatePayment\b/);
    });

    it("LEG35 storeAdminApi.approvePayment/rejectPayment/submitPaymentSlip/getPaymentSlipPreview are removed", () => {
      expect(api).not.toMatch(/async\s+approvePayment\b/);
      expect(api).not.toMatch(/async\s+rejectPayment\b/);
      expect(api).not.toMatch(/submitPaymentSlip/);
      expect(api).not.toMatch(/getPaymentSlipPreview/);
    });
  });

  // ── LEG36-LEG40: Preserved canonical flows ─────────────────────────────
  describe("LEG36-LEG40 preserved canonical flows", () => {
    it("LEG36 customerApi.getOrderStatusByToken (canonical token status) is preserved", () => {
      const api = readFileSafe("services/customerApi.ts");
      expect(api).toMatch(/getOrderStatusByToken/);
    });

    it("LEG37 storeAdminApi.finalizePayment (canonical counter payment) is preserved", () => {
      const api = readFileSafe("services/storeAdminApi.ts");
      expect(api).toMatch(/finalizePayment/);
    });

    it("LEG38 storeAdminApi.cancelOrder (canonical cancellation) is preserved", () => {
      const api = readFileSafe("services/storeAdminApi.ts");
      expect(api).toMatch(/cancelOrder/);
    });

    it("LEG39 LIFF compatibility redirects are preserved in App.tsx", () => {
      const app = readFileSafe("App.tsx");
      expect(app).toMatch(/\/liff\//);
      expect(app).toMatch(/LiffLegacyRedirect/);
    });

    it("LEG40 Kiosk atomic checkout (kiosk_order_stock_sync_failed handling) is preserved", () => {
      const kiosk = readFileSafe("features/staff/kiosk/useKioskOrder.ts");
      expect(kiosk).toMatch(/kiosk_order_stock_sync_failed/);
    });
  });

  // ── LEG41-LEG45: Profit Planning semantics ─────────────────────────────
  describe("LEG41-LEG45 Profit Planning semantics preserved", () => {
    it("LEG41 scenarioDraftStorage uses healholic:profit-planning:draft key", () => {
      const storage = readFileSafe("services/scenarioDraftStorage.ts");
      expect(storage).toMatch(/healholic:profit-planning:draft/);
    });

    it("LEG42 planningBaselineAdapter is preserved", () => {
      expect(fileExists("services/planningBaselineAdapter.ts")).toBe(true);
    });

    it("LEG43 DataQualityBadge is preserved", () => {
      expect(fileExists("components/DataQualityBadge.tsx")).toBe(true);
    });

    it("LEG44 OwnerRoute guard for profit-planning is preserved in App.tsx", () => {
      const app = readFileSafe("App.tsx");
      expect(app).toMatch(/profit-planning/);
    });
  });

  // ── LEG46-LEG50: Realtime flag + Supabase ─────────────────────────────
  describe("LEG46-LEG50 Realtime flag and Supabase", () => {
    it("LEG46 Realtime feature flag default remains false", () => {
      const flags = readFileSafe("config/featureFlags.ts");
      expect(flags).toMatch(/VITE_ENABLE_STORE_ORDERS_REALTIME.*"false"/);
    });

    it("LEG47 useStoreOrdersRealtimeInvalidation hook is preserved", () => {
      expect(fileExists("hooks/useStoreOrdersRealtimeInvalidation.ts")).toBe(true);
    });
  });
});
