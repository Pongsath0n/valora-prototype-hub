/**
 * Pure calculation engine — no side effects. All functions are deterministic.
 * Used by Dashboard, Scenario, and Reports.
 */
import type { MenuRow, MenuMetrics, BusinessKPIs, ScenarioKPIs } from "./types";

/** Contribution margin and status for a single menu item */
export function calcMenuMetrics(item: MenuRow): MenuMetrics {
  const grossProfit = item.price - item.totalCost;
  const cmPercent = item.price > 0 ? (grossProfit / item.price) * 100 : 0;
  let status: MenuMetrics["status"] = "good";
  if (cmPercent < 40) status = "caution";
  if (grossProfit <= 0) status = "loss";
  return { ...item, grossProfit, cmPercent, status };
}

/** Weighted contribution margin and price from menu mix */
export function calcWeightedMetrics(items: MenuRow[]): {
  weightedCM: number;
  weightedPrice: number;
  weightedCost: number;
  mixSum: number;
} {
  const mixSum = items.reduce((s, m) => s + m.mix, 0);
  const weightedCM = items.reduce(
    (s, m) => s + (m.price - m.totalCost) * (m.mix / 100),
    0
  );
  const weightedPrice = items.reduce((s, m) => s + m.price * (m.mix / 100), 0);
  const weightedCost = items.reduce(
    (s, m) => s + m.totalCost * (m.mix / 100),
    0
  );
  return { weightedCM, weightedPrice, weightedCost, mixSum };
}

/**
 * Full KPI calculation from shop-level inputs.
 * Edge case: if weightedCM <= 0, BEP and target cups are Infinity.
 */
export function calcBusinessKPIs(
  fixedCostsTotal: number,
  targetProfit: number,
  daysOpen: number,
  menuItems: MenuRow[]
): BusinessKPIs {
  const { weightedCM, weightedPrice, weightedCost, mixSum } =
    calcWeightedMetrics(menuItems);

  if (weightedCM <= 0) {
    return {
      weightedCM,
      weightedPrice,
      weightedCost,
      bepCupsMonth: Infinity,
      bepCupsDay: Infinity,
      targetCupsMonth: Infinity,
      targetCupsDay: Infinity,
      requiredRevenueDay: Infinity,
      estNetProfit: -fixedCostsTotal,
      mixSum,
    };
  }

  const days = Math.max(1, daysOpen);
  const bepCupsMonth = Math.ceil(fixedCostsTotal / weightedCM);
  const bepCupsDay = Math.ceil(bepCupsMonth / days);
  const targetCupsMonth = Math.ceil((fixedCostsTotal + targetProfit) / weightedCM);
  const targetCupsDay = Math.ceil(targetCupsMonth / days);
  const requiredRevenueDay = Math.round(targetCupsDay * weightedPrice);
  const estNetProfit = Math.round(
    targetCupsDay * days * weightedCM - fixedCostsTotal
  );

  return {
    weightedCM,
    weightedPrice,
    weightedCost,
    bepCupsMonth,
    bepCupsDay,
    targetCupsMonth,
    targetCupsDay,
    requiredRevenueDay,
    estNetProfit,
    mixSum,
  };
}

/**
 * Scenario-level KPI for a flat average-cost model (used in Scenario page).
 * avgPrice and avgCost are direct slider inputs, not derived from menu mix.
 */
export function calcScenarioKPIs(
  fixedCosts: number,
  targetProfit: number,
  avgPrice: number,
  avgCost: number,
  daysOpen: number
): ScenarioKPIs {
  const cm = avgPrice - avgCost;
  if (cm <= 0) {
    return {
      bepMonth: Infinity,
      bepDay: Infinity,
      targetCupsDay: Infinity,
      revenueDay: Infinity,
      netProfit: -fixedCosts,
    };
  }
  const days = Math.max(1, daysOpen);
  const bepMonth = Math.ceil(fixedCosts / cm);
  const bepDay = Math.ceil(bepMonth / days);
  const targetCupsMonth = Math.ceil((fixedCosts + targetProfit) / cm);
  const targetCupsDay = Math.ceil(targetCupsMonth / days);
  const revenueDay = Math.round(targetCupsDay * avgPrice);
  const netProfit = Math.round(targetCupsDay * days * cm - fixedCosts);
  return { bepMonth, bepDay, targetCupsDay, revenueDay, netProfit };
}

/** CM% formatted with 1 decimal place */
export function fmtCmPercent(cm: number, price: number): string {
  if (price <= 0) return "N/A";
  return `${((cm / price) * 100).toFixed(1)}%`;
}

/** Format number as Thai Baht string with locale separator */
export function fmtTHB(n: number): string {
  if (!isFinite(n)) return "N/A";
  return `฿${n.toLocaleString("th-TH")}`;
}
