import type { PlanId } from "./types";

/** Feature flags derived from the user's current plan */
export interface PlanAccess {
  maxMenuItems: number;       // Infinity = unlimited
  maxScenarios: number;       // Infinity = unlimited + history
  canExportSummary: boolean;          // PDF/PNG 1-page summary
  canExportScenarioComparison: boolean; // PDF/PNG scenario comparison report
  promoDiscountPct: boolean;          // % discount promo simulator
  promoBuyOneGetOne: boolean;         // buy-1-get-1 promo simulator
  promoCoupon: boolean;               // coupon promo simulator
  deliveryFeeDeduction: boolean;      // fee % deduction tool
  deliveryPriceRecommendation: boolean; // recommended price + profit comparison
  canShareLink: boolean;              // read-only report sharing
  hasDetailedMethodology: boolean;    // detailed assumptions & methodology
}

const FREE_ACCESS: PlanAccess = {
  maxMenuItems: 10,
  maxScenarios: 3,
  canExportSummary: false,
  canExportScenarioComparison: false,
  promoDiscountPct: false,
  promoBuyOneGetOne: false,
  promoCoupon: false,
  deliveryFeeDeduction: false,
  deliveryPriceRecommendation: false,
  canShareLink: false,
  hasDetailedMethodology: false,
};

const STARTER_ACCESS: PlanAccess = {
  maxMenuItems: 30,
  maxScenarios: 20,
  canExportSummary: true,
  canExportScenarioComparison: false,
  promoDiscountPct: true,
  promoBuyOneGetOne: false,
  promoCoupon: false,
  deliveryFeeDeduction: true,
  deliveryPriceRecommendation: false,
  canShareLink: false,
  hasDetailedMethodology: false,
};

const PRO_ACCESS: PlanAccess = {
  maxMenuItems: Infinity,
  maxScenarios: Infinity,
  canExportSummary: true,
  canExportScenarioComparison: true,
  promoDiscountPct: true,
  promoBuyOneGetOne: true,
  promoCoupon: true,
  deliveryFeeDeduction: true,
  deliveryPriceRecommendation: true,
  canShareLink: true,
  hasDetailedMethodology: true,
};

const ACCESS_MAP: Record<PlanId, PlanAccess> = {
  free: FREE_ACCESS,
  starter: STARTER_ACCESS,
  pro: PRO_ACCESS,
};

/** Returns the feature access flags for a given plan */
export function calcAccess(plan: PlanId): PlanAccess {
  return ACCESS_MAP[plan] ?? FREE_ACCESS;
}

/** Checks if the user can use a specific feature */
export function canUseFeature(plan: PlanId, feature: keyof PlanAccess): boolean {
  const access = calcAccess(plan);
  const val = access[feature];
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val > 0;
  return false;
}

/** Returns which minimum plan is required for a given feature */
export function minPlanRequired(feature: keyof PlanAccess): PlanId {
  if (calcAccess("free")[feature]) return "free";
  if (calcAccess("starter")[feature]) return "starter";
  return "pro";
}
