import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── PROD02: Canonical endpoint /api/store-admin/orders/production ──────────
describe("FE-05 contract", () => {
  it("storeAdminApi exposes listProductionQueue pointing to /orders/production", () => {
    const full = path.resolve(process.cwd(), "src/services/storeAdminApi.ts");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/listProductionQueue/);
    expect(content).toMatch(/\/api\/store-admin\/orders\/production/);
  });

  it("ProductionOrdersQueue is imported by AdminOrders page", () => {
    const full = path.resolve(process.cwd(), "src/pages/admin/AdminOrders.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/ProductionOrdersQueue/);
  });

  it("AdminOrders page exposes a production tab", () => {
    const full = path.resolve(process.cwd(), "src/pages/admin/AdminOrders.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/key:\s*["'`]production["'`]/);
    expect(content).toMatch(/คิวผลิต/);
  });

  it("ProductionQueueOrder type includes payment_confirmed_at", () => {
    const full = path.resolve(process.cwd(), "src/services/storeAdminApi.ts");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/payment_confirmed_at/);
  });
});
