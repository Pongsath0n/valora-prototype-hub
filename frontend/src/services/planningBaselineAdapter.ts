import type {
  PlanningBaselineItem,
  PlanningBaselineOverhead,
  PlanningBaselineResponse,
  PlanningBaselineWarningSummary,
} from "@/services/storeAdminApi";
import type { MenuRow } from "@/services/types";

export type PlanningBaselineMenuSummary = {
  productId: string;
  name: string;
  basePrice: number;
  currentUnitCost: number;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  costStatus: string | null;
  recipeComplete: boolean;
  historicalMixPercent: number | null;
  has_addon_cost_gap?: boolean;
  // Product-level overhead/profit overlay (null when backend omits the fields).
  directCostPerUnit: number | null;
  grossProfitPerUnit: number | null;
  overheadPerUnit: number | null;
  netProfitAfterOverheadPerUnit: number | null;
};

export type PlanningBaselineAdapterResult = {
  items: PlanningBaselineMenuSummary[];
  averagePrice: number;
  averageCost: number;
  generatedAt?: string | null;
  priceSource?: string | null;
  costSource?: string | null;
  mixSource?: string | null;
  lookbackDays: number;
  backendWarnings: string[];
  derivedWarnings: string[];
  dataQualityLevel: "confirmed" | "estimated";
  hasIncompleteRecipes: boolean;
  hasEstimatedCosts: boolean;
  mixFallbackApplied: boolean;
  hasAddonCostGaps: boolean;
  warningSummary?: PlanningBaselineWarningSummary;
  /** Overhead summary block from the backend baseline (null when unavailable). */
  overhead: PlanningBaselineOverhead | null;
};

const MIX_WARNING_MESSAGES: Record<string, string> = {
  historical_mix_unavailable: "ยังไม่มีข้อมูลสัดส่วนยอดขายล่าสุด ระบบจะแจกน้ำหนักเท่าๆ กันชั่วคราว",
};

const COST_STATUS_NEEDS_REVIEW = new Set([
  "missing_recipe",
  "missing_ingredient",
  "missing_ingredient_cost",
  "estimated",
  "manual",
  "zero_quantity",
]);

function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Preserve null/undefined (so "no data" stays hidden) but coerce finite numbers. */
function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWeights(items: PlanningBaselineItem[]): { weight: number; item: PlanningBaselineItem }[] {
  const mixValues = items.map((item) => {
    const mix = safeNumber(item.historical_mix_percent ?? 0);
    return mix > 0 ? mix : 0;
  });
  const mixSum = mixValues.reduce((sum, value) => sum + value, 0);
  if (mixSum > 0) {
    return items.map((item, idx) => ({ weight: mixValues[idx] / mixSum, item }));
  }
  if (!items.length) return [];
  const equalWeight = 1 / items.length;
  return items.map((item) => ({ weight: equalWeight, item }));
}

function buildDerivedWarnings(result: PlanningBaselineAdapterResult): string[] {
  const alerts = new Set<string>();
  result.backendWarnings.forEach((warning) => {
    const mapped = MIX_WARNING_MESSAGES[warning];
    if (mapped) alerts.add(mapped);
  });

  if (result.hasEstimatedCosts || result.costSource?.includes("manual")) {
    alerts.add(
      "ต้นทุนบางรายการยังเป็นค่าตั้งต้น/ประมาณการ ควรบันทึกซื้อเข้าสต็อกเพื่อให้ต้นทุนแม่นยำขึ้น",
    );
  }
  if (result.hasIncompleteRecipes) {
    alerts.add("สูตรยังไม่ครบ ต้นทุนเมนูนี้อาจต่ำกว่าความจริง");
  }
  if (result.hasAddonCostGaps) {
    alerts.add("ตัวเลือกเสริมบางรายการยังไม่มีสูตรหรือบันทึกต้นทุน โปรดตรวจสอบ Add-on");
  }
  if (result.mixFallbackApplied) {
    alerts.add("ยังไม่มีข้อมูล Mix ล่าสุด ระบบจะกระจายน้ำหนักเมนูเท่าๆ กันชั่วคราว");
  }

  const summary = result.warningSummary;
  if (summary) {
    if (summary.zero_quantity_recipe_products > 0) {
      alerts.add("พบสูตรที่มีปริมาณเป็นศูนย์ โปรดใส่ปริมาณวัตถุดิบให้ครบถ้วน");
    }
    if (summary.missing_recipe_products > 0) {
      alerts.add("ยังมีเมนูที่ไม่ได้บันทึกสูตรเลย ทำให้ต้นทุนไม่ครบ");
    }
  }
  return Array.from(alerts);
}

function toMenuSummary(item: PlanningBaselineItem): PlanningBaselineMenuSummary {
  return {
    productId: String(item.product_id),
    name: item.name ?? "-",
    basePrice: safeNumber(item.base_price),
    currentUnitCost: safeNumber(item.current_unit_cost),
    grossProfit: item.gross_profit ?? null,
    grossMarginPercent: typeof item.gross_margin_percent === "number" ? item.gross_margin_percent : null,
    costStatus: item.cost_status ?? null,
    recipeComplete: Boolean(item.recipe_complete),
    historicalMixPercent: typeof item.historical_mix_percent === "number" ? item.historical_mix_percent : null,
    has_addon_cost_gap: item.has_addon_cost_gap,
    directCostPerUnit: nullableNumber(item.direct_cost_per_unit),
    grossProfitPerUnit: nullableNumber(item.gross_profit_per_unit),
    overheadPerUnit: nullableNumber(item.overhead_per_unit),
    netProfitAfterOverheadPerUnit: nullableNumber(item.net_profit_after_overhead_per_unit),
  };
}

export function adaptPlanningBaseline(response: PlanningBaselineResponse): PlanningBaselineAdapterResult {
  const items = response.items ?? [];
  const weightedItems = normalizeWeights(items);
  const mixFallbackApplied = weightedItems.length > 0 && items.every((item) => !(item.historical_mix_percent && item.historical_mix_percent > 0));

  let averagePrice = 0;
  let averageCost = 0;
  weightedItems.forEach(({ weight, item }) => {
    averagePrice += weight * safeNumber(item.base_price);
    averageCost += weight * safeNumber(item.current_unit_cost);
  });

  const summaries = items.map(toMenuSummary);
  const hasIncompleteRecipes = summaries.some((item) => !item.recipeComplete || COST_STATUS_NEEDS_REVIEW.has(item.costStatus ?? ""));
  const hasEstimatedCosts = summaries.some((item) => COST_STATUS_NEEDS_REVIEW.has(item.costStatus ?? ""));
  const hasAddonCostGaps = summaries.some((item) => item.has_addon_cost_gap);
  const warningSummary = response.warning_summary;
  const isPurchaseDerived = response.baseline.cost_source === "purchase_derived";
  const dataQualityLevel: "confirmed" | "estimated" = !hasIncompleteRecipes && !hasAddonCostGaps && isPurchaseDerived ? "confirmed" : "estimated";

  const result: PlanningBaselineAdapterResult = {
    items: summaries,
    averagePrice,
    averageCost,
    generatedAt: response.store.generated_at,
    priceSource: response.baseline.price_source,
    costSource: response.baseline.cost_source,
    mixSource: response.baseline.mix_source,
    lookbackDays: response.baseline.lookback_days,
    backendWarnings: response.warnings ?? [],
    derivedWarnings: [],
    dataQualityLevel,
    hasIncompleteRecipes,
    hasEstimatedCosts,
    mixFallbackApplied,
    hasAddonCostGaps,
    warningSummary,
    overhead: response.baseline.overhead ?? null,
  };

  result.derivedWarnings = buildDerivedWarnings(result);
  return result;
}

export function buildFallbackBaselineFromMenu(menuRows: MenuRow[]): PlanningBaselineAdapterResult {
  const rows = menuRows ?? [];
  const mixValues = rows.map((row) => Math.max(0, Number(row.mix) || 0));
  const mixSum = mixValues.reduce((sum, value) => sum + value, 0);
  const weights = rows.map((row, idx) => {
    if (mixSum > 0) return mixValues[idx] / mixSum;
    return rows.length ? 1 / rows.length : 0;
  });

  let averagePrice = 0;
  let averageCost = 0;
  weights.forEach((weight, idx) => {
    averagePrice += weight * (rows[idx]?.price ?? 0);
    averageCost += weight * (rows[idx]?.totalCost ?? 0);
  });

  const items: PlanningBaselineMenuSummary[] = rows.map((row) => ({
    productId: String(row.id),
    name: row.name,
    basePrice: row.price,
    currentUnitCost: row.totalCost,
    grossProfit: row.price - row.totalCost,
    grossMarginPercent: row.price > 0 ? ((row.price - row.totalCost) / row.price) * 100 : null,
    costStatus: "estimated",
    recipeComplete: false,
    historicalMixPercent: row.mix ?? null,
    directCostPerUnit: row.totalCost ?? null,
    grossProfitPerUnit: row.price - row.totalCost,
    overheadPerUnit: null,
    netProfitAfterOverheadPerUnit: null,
  }));

  return {
    items,
    averagePrice,
    averageCost,
    generatedAt: new Date().toISOString(),
    priceSource: "local.demo",
    costSource: "local.demo",
    mixSource: mixSum > 0 ? "local.demo.mix" : "local.demo.equal",
    lookbackDays: 0,
    backendWarnings: [],
    derivedWarnings: ["กำลังใช้ข้อมูลประมาณการจากเครื่องนี้ ไม่ใช่ข้อมูลล่าสุดจากระบบ"],
    dataQualityLevel: "estimated",
    hasIncompleteRecipes: true,
    hasEstimatedCosts: true,
    mixFallbackApplied: mixSum === 0,
    hasAddonCostGaps: false,
    warningSummary: undefined,
    overhead: null,
  };
}
