import { describe, expect, it } from "vitest";
import { calcScenarioKPIs, calcWeightedMetrics } from "../calculationEngine";

describe("calcScenarioKPIs (Profit Planning engine)", () => {
  it("computes break-even and target KPIs for a healthy margin", () => {
    // fixedCosts=30000, targetProfit=20000, price=60, cost=25, daysOpen=26 → CM=35
    const kpi = calcScenarioKPIs(30000, 20000, 60, 25, 26);

    expect(kpi.bepMonth).toBe(Math.ceil(30000 / 35)); // 858
    expect(kpi.bepDay).toBe(Math.ceil(858 / 26)); // 33
    const targetCupsMonth = Math.ceil(50000 / 35); // 1429
    expect(kpi.targetCupsDay).toBe(Math.ceil(targetCupsMonth / 26)); // 55
    expect(kpi.revenueDay).toBe(Math.round(kpi.targetCupsDay * 60));
    expect(kpi.netProfit).toBe(Math.round(kpi.targetCupsDay * 26 * 35 - 30000));
  });

  it("returns Infinity break-even when contribution margin is zero or negative", () => {
    const kpi = calcScenarioKPIs(30000, 20000, 25, 30, 26);
    expect(kpi.bepMonth).toBe(Infinity);
    expect(kpi.bepDay).toBe(Infinity);
    expect(kpi.targetCupsDay).toBe(Infinity);
    expect(kpi.netProfit).toBe(-30000);
  });

  it("clamps daysOpen to at least 1", () => {
    const kpi = calcScenarioKPIs(1000, 0, 50, 25, 0);
    expect(Number.isFinite(kpi.bepDay)).toBe(true);
    expect(kpi.bepDay).toBe(kpi.bepMonth); // days clamped to 1
  });
});

describe("calcWeightedMetrics", () => {
  it("computes mix-weighted price and contribution margin", () => {
    const rows = [
      { id: 1, name: "A", price: 60, totalCost: 20, mix: 50 },
      { id: 2, name: "B", price: 40, totalCost: 25, mix: 50 },
    ] as never[];
    const m = calcWeightedMetrics(rows);
    expect(m.weightedPrice).toBe(50);
    expect(m.weightedCM).toBe(27.5);
    expect(m.mixSum).toBe(100);
  });
});
