import { describe, expect, it } from "vitest";
import { mapCustomerOrderError } from "@/lib/customerErrors";

// ── CUST21/CUST22/CUST23/CUST24: error mapping ─────────────────────────────
describe("customerErrors mapping", () => {
  it("maps order_no_generation_exhausted", () => {
    expect(mapCustomerOrderError(new Error("order_no_generation_exhausted"))).toContain(
      "ไม่สามารถสร้างคำสั่งซื้อได้ในขณะนี้",
    );
  });

  it("maps order_number_generation_failed", () => {
    expect(mapCustomerOrderError(new Error("order_number_generation_failed"))).toContain(
      "ไม่สามารถสร้างคำสั่งซื้อได้ในขณะนี้",
    );
  });

  it("maps addon_not_available", () => {
    expect(mapCustomerOrderError(new Error("addon_not_available"))).toContain(
      "ตัวเลือกเพิ่มเติมที่เลือกไม่พร้อมให้บริการ",
    );
  });

  it("maps invalid_recipe_configuration", () => {
    expect(mapCustomerOrderError(new Error("invalid_recipe_configuration"))).toContain(
      "รายการที่เลือกไม่พร้อมให้บริการในขณะนี้",
    );
  });

  it("maps customer_name_required", () => {
    expect(mapCustomerOrderError(new Error("customer_name_required"))).toContain(
      "กรุณาระบุชื่อ",
    );
  });

  it("maps structured detail with code", () => {
    const err = new Error("unknown");
    (err as Error & { detail?: unknown }).detail = { code: "addon_not_available", message: "internal" };
    expect(mapCustomerOrderError(err)).toContain("ตัวเลือกเพิ่มเติมที่เลือกไม่พร้อมให้บริการ");
  });

  it("never exposes SQL/Postgres/Supabase internals", () => {
    const err = new Error("Postgres SQL error from Supabase function");
    const msg = mapCustomerOrderError(err);
    expect(msg).not.toContain("Postgres");
    expect(msg).not.toContain("SQL");
    expect(msg).not.toContain("Supabase");
  });

  it("returns a safe generic fallback for unknown long errors", () => {
    const err = new Error("x".repeat(300));
    expect(mapCustomerOrderError(err)).toContain("ไม่สามารถส่งคำสั่งซื้อได้");
  });
});
