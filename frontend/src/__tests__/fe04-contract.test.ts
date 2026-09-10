import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── INQ39: Uses canonical /staff/orders route ──────────────────────────────
describe("INQ39 canonical /staff/orders route", () => {
  it("AdminOrders page is mounted at /staff/orders in App.tsx", () => {
    const full = path.resolve(process.cwd(), "src/App.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/path=["'`]\/staff\/orders["'`]/);
  });

  it("IncomingOrdersQueue is imported by AdminOrders page", () => {
    const full = path.resolve(process.cwd(), "src/pages/admin/AdminOrders.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/IncomingOrdersQueue/);
  });
});

// ── INQ40: No new /api/store stale prefix ──────────────────────────────────
describe("INQ40 no new /api/store stale prefix", () => {
  it("IncomingOrdersQueue does not use stale /api/store prefix", () => {
    const full = path.resolve(process.cwd(), "src/components/admin/IncomingOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    // The canonical endpoint is /api/store-admin/orders/incoming via the service.
    // The component itself should not hardcode any /api/store prefix.
    expect(content).not.toMatch(/\/api\/store["'/]/);
  });
});
