import { describe, expect, it } from "vitest";
import { adaptPlanningBaseline, buildFallbackBaselineFromMenu } from "../planningBaselineAdapter";
import type { PlanningBaselineResponse } from "../storeAdminApi";
import type { MenuRow } from "../types";

describe("planningBaselineAdapter", () => {
  it("maps metadata fields and uses backend costs for weighted averages", () => {
    const response: PlanningBaselineResponse = {
      store: {
        id: "store-001",
        generated_at: "2024-05-02T10:00:00Z",
      },
      baseline: {
        lookback_days: 30,
        mix_source: "order_items",
        price_source: "products.base_price",
        cost_source: "purchase_derived",
      },
      items: [
        {
          product_id: "p1",
          name: "Latte",
          base_price: 100,
          current_unit_cost: 40,
          cost_status: "complete",
          recipe_complete: true,
          historical_mix_percent: 60,
        },
        {
          product_id: "p2",
          name: "Mocha",
          base_price: 80,
          current_unit_cost: 50,
          cost_status: "complete",
          recipe_complete: true,
          historical_mix_percent: 40,
        },
      ],
      warnings: [],
    };

    const result = adaptPlanningBaseline(response);

    expect(result.generatedAt).toBe("2024-05-02T10:00:00Z");
    expect(result.priceSource).toBe("products.base_price");
    expect(result.costSource).toBe("purchase_derived");
    expect(result.mixSource).toBe("order_items");
    expect(result.lookbackDays).toBe(30);
    expect(result.averagePrice).toBeCloseTo(92);
    expect(result.averageCost).toBeCloseTo(44);
    expect(result.dataQualityLevel).toBe("confirmed");
    expect(result.derivedWarnings).toEqual([]);
    expect(result.hasAddonCostGaps).toBe(false);
    expect(result.warningSummary).toBeUndefined();
  });

  it("flags manual/estimated costs, missing recipes, and mix fallbacks with warnings", () => {
    const response: PlanningBaselineResponse = {
      store: {
        id: "store-002",
        generated_at: "2024-05-10T08:00:00Z",
      },
      baseline: {
        lookback_days: 30,
        mix_source: "order_items",
        price_source: "products.base_price",
        cost_source: "manual_entry",
      },
      items: [
        {
          product_id: "p1",
          name: "Black",
          base_price: 75,
          current_unit_cost: 20,
          cost_status: "manual",
          recipe_complete: true,
        },
        {
          product_id: "p2",
          name: "White",
          base_price: 65,
          current_unit_cost: 30,
          cost_status: "missing_recipe",
          recipe_complete: false,
        },
      ],
      warnings: ["historical_mix_unavailable"],
    };

    const result = adaptPlanningBaseline(response);

    expect(result.dataQualityLevel).toBe("estimated");
    expect(result.hasEstimatedCosts).toBe(true);
    expect(result.hasIncompleteRecipes).toBe(true);
    expect(result.mixFallbackApplied).toBe(true);
    expect(result.hasAddonCostGaps).toBe(false);
    expect(result.warningSummary).toBeUndefined();
    expect(result.backendWarnings).toEqual(["historical_mix_unavailable"]);
    expect(result.derivedWarnings).toEqual(
      expect.arrayContaining([
        "ต้นทุนบางรายการยังเป็นค่าตั้งต้น/ประมาณการ ควรบันทึกซื้อเข้าสต็อกเพื่อให้ต้นทุนแม่นยำขึ้น",
        "สูตรยังไม่ครบ ต้นทุนเมนูนี้อาจต่ำกว่าความจริง",
        "ยังไม่มีข้อมูลสัดส่วนยอดขายล่าสุด ระบบจะแจกน้ำหนักเท่าๆ กันชั่วคราว",
        "ยังไม่มีข้อมูล Mix ล่าสุด ระบบจะกระจายน้ำหนักเมนูเท่าๆ กันชั่วคราว",
      ]),
    );
  });
});

describe("buildFallbackBaselineFromMenu", () => {
  it("labels fallback data clearly and keeps backend cost values", () => {
    const menuRows: MenuRow[] = [
      { id: 1, name: "Latte", price: 90, totalCost: 40, ingredientCost: 30, packagingCost: 5, deliveryFee: 5, mix: 0 },
      { id: 2, name: "Mocha", price: 100, totalCost: 45, ingredientCost: 32, packagingCost: 6, deliveryFee: 7, mix: 0 },
    ];

    const fallback = buildFallbackBaselineFromMenu(menuRows);

    expect(fallback.priceSource).toBe("local.demo");
    expect(fallback.costSource).toBe("local.demo");
    expect(fallback.dataQualityLevel).toBe("estimated");
    expect(fallback.mixFallbackApplied).toBe(true);
    expect(fallback.derivedWarnings).toContain("กำลังใช้ข้อมูลประมาณการจากเครื่องนี้ ไม่ใช่ข้อมูลล่าสุดจากระบบ");
    expect(fallback.items[0]?.currentUnitCost).toBe(40);
    expect(fallback.overhead).toBeNull();
  });
});

describe("planningBaselineAdapter overhead overlay", () => {
  it("passes through baseline.overhead and maps product-level overhead fields", () => {
    const response: PlanningBaselineResponse = {
      store: { id: "s1", generated_at: "2024-06-01T00:00:00Z" },
      baseline: {
        lookback_days: 30,
        mix_source: "order_items",
        price_source: "products.base_price",
        cost_source: "purchase_derived",
        overhead: {
          monthly_overhead: 4500,
          expected_cups_per_month: 300,
          operating_days_per_month: 25,
          overhead_per_cup: 15,
          break_even_cups_per_month: 200,
          break_even_cups_per_day: 8,
          allocation_method: "per_cup",
          expense_count: 3,
          target_profit_monthly: 10000,
          category_breakdown: { rent: 4000, water: 500 },
        },
      },
      items: [
        {
          product_id: "p1",
          name: "Latte",
          base_price: 60,
          current_unit_cost: 25,
          gross_profit: 35,
          cost_status: "complete",
          recipe_complete: true,
          historical_mix_percent: 100,
          direct_cost_per_unit: 25,
          gross_profit_per_unit: 35,
          overhead_per_unit: 15,
          net_profit_after_overhead_per_unit: 20,
        },
      ],
      warnings: [],
    };

    const result = adaptPlanningBaseline(response);

    expect(result.overhead).not.toBeNull();
    expect(result.overhead?.monthly_overhead).toBe(4500);
    expect(result.overhead?.overhead_per_cup).toBe(15);
    expect(result.overhead?.break_even_cups_per_month).toBe(200);
    expect(result.items[0].directCostPerUnit).toBe(25);
    expect(result.items[0].grossProfitPerUnit).toBe(35);
    expect(result.items[0].overheadPerUnit).toBe(15);
    expect(result.items[0].netProfitAfterOverheadPerUnit).toBe(20);
  });

  it("defaults overhead to null and product-level fields to null when omitted", () => {
    const response: PlanningBaselineResponse = {
      store: { id: "s2" },
      baseline: {
        lookback_days: 30,
        mix_source: "order_items",
        price_source: "products.base_price",
        cost_source: "purchase_derived",
      },
      items: [
        {
          product_id: "p9",
          name: "Espresso",
          base_price: 50,
          current_unit_cost: 18,
          gross_profit: 32,
          cost_status: "complete",
          recipe_complete: true,
          historical_mix_percent: 100,
        },
      ],
      warnings: [],
    };

    const result = adaptPlanningBaseline(response);

    expect(result.overhead).toBeNull();
    expect(result.items[0].overheadPerUnit).toBeNull();
    expect(result.items[0].netProfitAfterOverheadPerUnit).toBeNull();
  });
});
