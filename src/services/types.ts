// ─── Shop ─────────────────────────────────────────────────────────────────────
export interface Shop {
  name: string;
  daysOpen: number;        // 1–31 days/month
  targetProfit: number;    // THB/month
}

// ─── Fixed Cost ───────────────────────────────────────────────────────────────
export interface FixedCostRow {
  id: number;
  label: string;
  amount: number;          // THB/month
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
export interface MenuRow {
  id: number;
  name: string;
  price: number;           // THB/unit
  totalCost: number;       // THB/unit (sum of breakdowns below)
  ingredientCost: number;  // THB/unit
  packagingCost: number;   // THB/unit
  deliveryFee: number;     // THB/unit
  mix: number;             // 0–100 (sales proportion %)
}

// ─── Scenario ─────────────────────────────────────────────────────────────────
export interface SavedScenario {
  id: number;
  name: string;
  timestamp: string;
  fixedCosts: number;
  avgPrice: number;
  avgCost: number;
  daysOpen: number;
  targetProfit: number;
  notes: string;
}

// ─── Calculation Results ───────────────────────────────────────────────────────
export interface MenuMetrics extends MenuRow {
  grossProfit: number;     // price - totalCost
  cmPercent: number;       // (grossProfit / price) * 100
  status: "good" | "caution" | "loss";
}

export interface BusinessKPIs {
  weightedCM: number;          // THB/unit — contribution margin weighted by mix
  weightedPrice: number;       // THB/unit — avg price weighted by mix
  weightedCost: number;        // THB/unit — avg cost weighted by mix
  bepCupsMonth: number;        // units/month — break-even point
  bepCupsDay: number;          // units/day
  targetCupsMonth: number;     // units/month needed for profit target
  targetCupsDay: number;       // units/day
  requiredRevenueDay: number;  // THB/day
  estNetProfit: number;        // THB/month (estimated)
  mixSum: number;              // sanity check: should be 100
}

export interface ScenarioKPIs {
  bepMonth: number;
  bepDay: number;
  targetCupsDay: number;
  revenueDay: number;
  netProfit: number;
}
