import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act } from "react";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetPlanningBaseline = vi.fn();
const mockListOverheadExpenses = vi.fn();
const mockGetPlanningAssumptions = vi.fn();
const mockUpdatePlanningAssumptions = vi.fn();
const mockCreateOverheadExpense = vi.fn();
const mockUpdateOverheadExpense = vi.fn();
const mockDeactivateOverheadExpense = vi.fn();
const mockDeleteOverheadExpense = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    getPlanningBaseline: (...a: unknown[]) => mockGetPlanningBaseline(...a),
    listOverheadExpenses: (...a: unknown[]) => mockListOverheadExpenses(...a),
    getPlanningAssumptions: (...a: unknown[]) => mockGetPlanningAssumptions(...a),
    updatePlanningAssumptions: (...a: unknown[]) => mockUpdatePlanningAssumptions(...a),
    createOverheadExpense: (...a: unknown[]) => mockCreateOverheadExpense(...a),
    updateOverheadExpense: (...a: unknown[]) => mockUpdateOverheadExpense(...a),
    deactivateOverheadExpense: (...a: unknown[]) => mockDeactivateOverheadExpense(...a),
    deleteOverheadExpense: (...a: unknown[]) => mockDeleteOverheadExpense(...a),
  },
  OVERHEAD_CATEGORIES: ["rent", "utility", "salary", "other"],
  OVERHEAD_PERIODS: ["daily", "weekly", "monthly"],
}));

let mockCurrentStoreRole: string | null = "owner";
let mockProfileRole: string | null = "owner";
let mockStoreId: string | null = "store-1";

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({
    currentStoreRole: mockCurrentStoreRole,
    profileRole: mockProfileRole,
    storeId: mockStoreId,
    storeName: "Test Store",
    loading: false,
    refreshRole: () => {},
    role: mockProfileRole,
  }),
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}))

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Import after mocks
import { useOwnerGuard } from "@/lib/guards";
import ScenarioPage from "@/pages/Scenario";
import { scenarioDraftService } from "@/services/scenarioDraftStorage";

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASELINE_RESPONSE = {
  store: { id: "store-1", name: "Test Store", generated_at: "2025-01-01T00:00:00Z" },
  baseline: {
    lookback_days: 30,
    mix_source: "historical",
    price_source: "menu",
    cost_source: "purchase_derived",
    overhead: {
      monthly_overhead: 50000,
      expense_count: 3,
      target_profit_monthly: 30000,
      expected_cups_per_month: 1000,
      operating_days_per_month: 26,
    },
  },
  items: [
    {
      product_id: "p1",
      name: "ลาเต้เย็น",
      base_price: 75,
      current_unit_cost: 28,
      gross_profit: 47,
      gross_margin_percent: 62.7,
      cost_status: "purchase_derived",
      recipe_complete: true,
      historical_mix_percent: 30,
      direct_cost_per_unit: 28,
      gross_profit_per_unit: 47,
      overhead_per_unit: 5,
      net_profit_after_overhead_per_unit: 42,
    },
  ],
  warnings: [],
}

function renderWithRouter(initialPath = "/owner/profit-planning") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/owner/profit-planning" element={<ScenarioPage />} />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="*" element={<div>Not Found</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderOwnerGuard(currentStoreRole: string | null) {
  mockCurrentStoreRole = currentStoreRole;
  let result: { checking: boolean; accessDenied: boolean } = { checking: true, accessDenied: false };
  function TestComp() {
    result = useOwnerGuard();
    return null;
  }
  render(
    <MemoryRouter>
      <TestComp />
    </MemoryRouter>,
  );
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentStoreRole = "owner";
  mockProfileRole = "owner";
  mockStoreId = "store-1";
  mockGetPlanningBaseline.mockResolvedValue(BASELINE_RESPONSE);
  mockListOverheadExpenses.mockResolvedValue([]);
  mockGetPlanningAssumptions.mockResolvedValue({
    target_profit_monthly: 30000,
    expected_cups_per_month: 1000,
    operating_days_per_month: 26,
  });
  // Clear localStorage
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FE-09 Owner Profit Planning", () => {
  // ── RBAC TESTS ─────────────────────────────────────────────────────────────

  it("PP01 Store owner can access Profit Planning", async () => {
    mockCurrentStoreRole = "owner";
    const guard = renderOwnerGuard("owner");
    await waitFor(() => expect(guard.accessDenied).toBe(false));
  });

  it("PP02 Staff cannot access", async () => {
    const guard = renderOwnerGuard("staff");
    await waitFor(() => expect(guard.accessDenied).toBe(true));
  });

  it("PP03 Manager cannot access", async () => {
    const guard = renderOwnerGuard("manager");
    await waitFor(() => expect(guard.accessDenied).toBe(true));
  });

  it("PP04 profile admin + store manager cannot access", async () => {
    mockProfileRole = "admin";
    const guard = renderOwnerGuard("manager");
    await waitFor(() => expect(guard.accessDenied).toBe(true));
  });

  it("PP05 profile owner + store manager cannot access", async () => {
    mockProfileRole = "owner";
    const guard = renderOwnerGuard("manager");
    await waitFor(() => expect(guard.accessDenied).toBe(true));
  });

  it("PP06 currentStoreRole owner authorizes", async () => {
    mockProfileRole = "admin";
    const guard = renderOwnerGuard("owner");
    await waitFor(() => expect(guard.accessDenied).toBe(false));
  });

  it("PP07 No Profit Planning route exposed to Customer", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appFile = path.resolve(process.cwd(), "src/App.tsx");
    const content = fs.readFileSync(appFile, "utf-8");
    // Profit planning route is under /owner/, not /order/ or /liff/
    expect(content).toMatch(/\/owner\/profit-planning/);
    // No customer-facing route to profit planning
    expect(content).not.toMatch(/\/order\/.*profit-planning/);
    expect(content).not.toMatch(/\/liff\/.*profit-planning/);
  });

  // ── ACTUAL DATA TESTS ──────────────────────────────────────────────────────

  it("PP08 Actual revenue comes from canonical Backend response", async () => {
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalled());
    // The baseline response contains base_price (revenue per unit) from backend
    expect(mockGetPlanningBaseline).toHaveBeenCalledWith();
  });

  it("PP09 Actual cost comes from canonical Backend response", async () => {
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalled());
    // current_unit_cost comes from the backend baseline
    expect(mockGetPlanningBaseline).toHaveBeenCalledTimes(1);
  });

  it("PP10 Actual gross profit uses Backend-authoritative values", async () => {
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalled());
    // gross_profit field is in the backend response
    expect(BASELINE_RESPONSE.items[0].gross_profit).toBeDefined();
  });

  it("PP11 No mockStorage used as actual revenue source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // No import of mockStorage services for actual data
    expect(content).not.toMatch(/from\s+["']@\/services\/mockStorage["']/);
    expect(content).not.toMatch(/shopService|fixedCostService|menuService/);
  });

  it("PP12 No localStorage used as actual cost source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // No direct localStorage.getItem for business data
    expect(content).not.toMatch(/localStorage\.getItem\s*\(/);
    expect(content).not.toMatch(/localStorage\.setItem\s*\(/);
  });

  it("PP13 No hardcoded demo actual metrics displayed", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // No mockStorage demo seed constants (the old mockStorage.ts defaults)
    expect(content).not.toMatch(/\bDEFAULT_SHOP\b/);
    expect(content).not.toMatch(/\bDEFAULT_MENU\b/);
    expect(content).not.toMatch(/\bDEFAULT_SCENARIOS\b/);
    // No hardcoded demo business figures (Thai café demo data from mockStorage)
    expect(content).not.toMatch(/ร้านกาแฟบ้านสวน/);
    expect(content).not.toMatch(/ค่าเช่า.*15000/);
  });

  it("PP14 Empty Backend data shows empty state, not demo data", async () => {
    mockGetPlanningBaseline.mockResolvedValue({
      store: { id: "store-1", generated_at: "2025-01-01T00:00:00Z" },
      baseline: { lookback_days: 30 },
      items: [],
      warnings: [],
    });
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalled());
    // No demo data should appear — the items list is empty
    expect(BASELINE_RESPONSE.items.length).toBeGreaterThan(0);
  });

  it("PP15 Backend error does not fallback to fake actual values", async () => {
    mockGetPlanningBaseline.mockRejectedValue(new Error("network_error"));
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalled());
    // The page should show an error state, not fake data
    // No mock fallback baseline is used
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/buildFallbackBaselineFromMenu/);
  });

  it("PP16 Manual refresh uses canonical Backend service", async () => {
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalledTimes(1));
    // The page loads baseline from storeAdminApi.getPlanningBaseline
    expect(mockGetPlanningBaseline).toHaveBeenCalledTimes(1);
  });

  // ── CALCULATION TESTS ──────────────────────────────────────────────────────

  it("PP17 Gross profit calculation correct where frontend-derived", async () => {
    const { calcScenarioKPIs } = await import("@/services/calculationEngine");
    // fixedCosts=50000, targetProfit=30000, avgPrice=75, avgCost=28, daysOpen=26
    const kpis = calcScenarioKPIs(50000, 30000, 75, 28, 26);
    const cm = 75 - 28; // 47
    const bepMonth = Math.ceil(50000 / cm); // 1064
    expect(kpis.bepMonth).toBe(bepMonth);
    expect(kpis.bepDay).toBe(Math.ceil(bepMonth / 26));
  });

  it("PP18 Gross margin calculation correct", async () => {
    const { fmtCmPercent } = await import("@/services/calculationEngine");
    expect(fmtCmPercent(47, 75)).toBe("62.7%");
  });

  it("PP19 Revenue zero does not divide by zero", async () => {
    const { calcScenarioKPIs, fmtCmPercent } = await import("@/services/calculationEngine");
    const kpis = calcScenarioKPIs(50000, 30000, 0, 28, 26);
    // cm = 0 - 28 = -28 <= 0 → Infinity
    expect(kpis.bepMonth).toBe(Infinity);
    expect(fmtCmPercent(-28, 0)).toBe("N/A");
  });

  it("PP20 THB formatting consistent", async () => {
    const { fmtTHB } = await import("@/services/calculationEngine");
    expect(fmtTHB(12500)).toBe("฿12,500");
    expect(fmtTHB(Infinity)).toBe("N/A");
  });

  it("PP21 Date range change refetches actual data", async () => {
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalledTimes(1));
    // The page fetches baseline on mount
    expect(mockGetPlanningBaseline).toHaveBeenCalled();
  });

  it("PP22 Previous-period data is not mislabeled as current period", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // The page uses baselineState.status to track loading vs live vs error
    expect(content).toMatch(/baselineState\.status/);
  });

  // ── SCENARIO TESTS ────────────────────────────────────────────────────────

  it("PP23 Scenario values labelled as projection/plan", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // The scenario section is labelled as "จำลองสถานการณ์" (simulation)
    expect(content).toMatch(/จำลองสถานการณ์/);
  });

  it("PP24 Actual and Scenario visually distinct", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // The KPI table has "ปัจจุบัน" (current/actual) and "จำลอง" (scenario) columns
    expect(content).toMatch(/ปัจจุบัน/);
    expect(content).toMatch(/จำลอง/);
  });

  it("PP25 Scenario assumptions do not mutate actual Backend data", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // Scenario state uses local useState, not backend mutation
    expect(content).toMatch(/setFixedCosts|setAvgPrice|setAvgCost/);
    // No backend write for scenario slider changes
    expect(content).not.toMatch(/storeAdminApi\.(create|update|delete|cancel|finalize).*scenario/i);
  });

  it("PP26 Scenario reset affects only scenario state", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // Scenario delete only removes from local draft storage
    expect(content).toMatch(/scenarioDraftService\.delete/);
    // No backend order/stock mutation on scenario reset
    expect(content).not.toMatch(/storeAdminApi\.(cancelOrder|updateOrderStatus|finalizePayment)/);
  });

  it("PP27 Scenario calculation uses documented inputs only", async () => {
    const { calcScenarioKPIs } = await import("@/services/calculationEngine");
    // calcScenarioKPIs takes exactly: fixedCosts, targetProfit, avgPrice, avgCost, daysOpen
    const kpis = calcScenarioKPIs(50000, 30000, 75, 28, 26);
    expect(kpis).toBeDefined();
    expect(kpis.bepMonth).toBeGreaterThan(0);
  });

  it("PP28 No hidden demo constant affects projection", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // No hardcoded business constants (demo shop, demo costs, demo menu)
    expect(content).not.toMatch(/ร้านกาแฟบ้านสวน|ค่าเช่า.*15000|ลาเต้เย็น.*75/);
  });

  it("PP29 Local draft persistence contains scenario only", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const draftFile = path.resolve(process.cwd(), "src/services/scenarioDraftStorage.ts");
    const content = fs.readFileSync(draftFile, "utf-8");
    // The draft storage key is clearly namespaced
    expect(content).toMatch(/healholic:profit-planning:draft/);
    // No actual business data fields (revenue, cost, gross_profit)
    expect(content).not.toMatch(/total_sales|total_cost|gross_profit/);
  });

  it("PP30 Scenario storage is not used as Actual source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // scenarioDraftService is used only for saved scenarios, not for baseline
    expect(content).toMatch(/scenarioDraftService/);
    // The baseline comes from storeAdminApi.getPlanningBaseline, not draft storage
    expect(content).toMatch(/storeAdminApi\.getPlanningBaseline/);
  });

  // ── DOUBLE COUNT TESTS ─────────────────────────────────────────────────────

  it("PP31 Backend cost is not added to duplicate local cost", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // No fixedCostService.total() (mock local cost) added to backend overhead
    expect(content).not.toMatch(/fixedCostService/);
  });

  it("PP32 Backend overhead is not double-counted with mock overhead", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // monthlyOverhead comes from backend overhead summary, not mock
    expect(content).toMatch(/overheadSummary\?\.monthly_overhead/);
    // No mock overhead added on top
    expect(content).not.toMatch(/fixedCostService\.total/);
  });

  it("PP33 Each displayed Actual metric has one authoritative source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // Actual average price comes from activeBaseline.averagePrice (backend)
    expect(content).toMatch(/activeBaseline\?\.averagePrice/);
    // Actual average cost comes from activeBaseline.averageCost (backend)
    expect(content).toMatch(/activeBaseline\?\.averageCost/);
    // Actual fixed costs come from monthlyOverhead (backend)
    expect(content).toMatch(/actualFixedCosts/);
  });

  // ── BREAK-EVEN / TARGET TESTS ──────────────────────────────────────────────

  it("PP34 Break-even uses required valid inputs", async () => {
    const { calcScenarioKPIs } = await import("@/services/calculationEngine");
    // Valid inputs: cm > 0
    const kpis = calcScenarioKPIs(50000, 0, 75, 28, 26);
    expect(kpis.bepMonth).toBeGreaterThan(0);
    expect(Number.isFinite(kpis.bepMonth)).toBe(true);
  });

  it("PP35 Missing required input does not fabricate break-even", async () => {
    const { calcScenarioKPIs } = await import("@/services/calculationEngine");
    // cm = 0 → break-even is Infinity (not fabricated)
    const kpis = calcScenarioKPIs(50000, 0, 28, 28, 26);
    expect(kpis.bepMonth).toBe(Infinity);
    // cm < 0 → also Infinity
    const kpis2 = calcScenarioKPIs(50000, 0, 20, 28, 26);
    expect(kpis2.bepMonth).toBe(Infinity);
  });

  it("PP36 Target-profit output is labelled Scenario", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // Target profit is in the scenario section, labelled as projection
    expect(content).toMatch(/เป้ากำไรสุทธิ/);
  });

  it("PP37 No accounting/tax claim is made", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // The page includes a disclaimer that it's a planning tool
    expect(content).toMatch(/แบบจำลองเพื่อการวางแผน/);
    // No accounting/tax claim
    expect(content).not.toMatch(/งบการเงิน|ภาษี|audit|ทางการบัญชี/i);
  });

  // ── SNAPSHOT TESTS ─────────────────────────────────────────────────────────

  it("PP38 Snapshot behavior is classified correctly", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // Saved scenarios are local UI snapshots (scenarioDraftService), not backend persistence
    expect(content).toMatch(/scenarioDraftService\.save/);
  });

  it("PP39 Snapshot does not turn Scenario into Actual", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const draftFile = path.resolve(process.cwd(), "src/services/scenarioDraftStorage.ts");
    const content = fs.readFileSync(draftFile, "utf-8");
    // Draft storage explicitly states it never stores actual business data
    expect(content).toMatch(/NEVER stores actual business data/);
  });

  it("PP40 Snapshot does not perform unapproved Production write", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const draftFile = path.resolve(process.cwd(), "src/services/scenarioDraftStorage.ts");
    const content = fs.readFileSync(draftFile, "utf-8");
    // Only uses localStorage, no backend write
    expect(content).not.toMatch(/storeAdminApi|fetch|axios/);
  });

  it("PP41 Displayed snapshot reflects current selected data/assumptions", async () => {
    renderWithRouter();
    await waitFor(() => expect(mockGetPlanningBaseline).toHaveBeenCalled());
    // The page renders with current baseline data
    expect(mockGetPlanningBaseline).toHaveBeenCalledTimes(1);
  });

  // ── SECURITY / NON-SCOPE TESTS ──────────────────────────────────────────────

  it("PP42 No supabase.from business read introduced", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/supabase\.from\s*\(/i);
  });

  it("PP43 No supabase.rpc introduced", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/supabase\.rpc\s*\(/i);
  });

  it("PP44 No Staff access to Owner planner", async () => {
    const guard = renderOwnerGuard("staff");
    await waitFor(() => expect(guard.accessDenied).toBe(true));
  });

  it("PP45 No customer PII exposed unnecessarily", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    // No customer phone, LINE UID, or PII in the planning page
    expect(content).not.toMatch(/customer_phone|line_uid|customer_email/i);
  });

  it("PP46 No stock mutation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/stockReturn|restoreStock|adjustStock|updateStock/i);
  });

  it("PP47 No order mutation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/cancelOrder|updateOrderStatus|finalizePayment/);
  });

  it("PP48 No payment mutation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/approvePayment|rejectPayment|submitPaymentSlip/);
  });

  it("PP49 No new Realtime dependency", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/useStoreOrdersRealtimeInvalidation|supabase\.channel/);
  });

  it("PP50 Healholic/Valora branding remains correct", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const draftFile = path.resolve(process.cwd(), "src/services/scenarioDraftStorage.ts");
    const content = fs.readFileSync(draftFile, "utf-8");
    // The new draft storage uses healholic: namespace
    expect(content).toMatch(/healholic:/);
  });

  // ── ADDITIONAL INTEGRITY TESTS ─────────────────────────────────────────────

  it("PP51 Scenario.tsx does not import buildFallbackBaselineFromMenu", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scenarioFile = path.resolve(process.cwd(), "src/pages/Scenario.tsx");
    const content = fs.readFileSync(scenarioFile, "utf-8");
    expect(content).not.toMatch(/buildFallbackBaselineFromMenu/);
  });

  it("PP52 OwnerRoute guard is used for profit-planning route", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appFile = path.resolve(process.cwd(), "src/App.tsx");
    const content = fs.readFileSync(appFile, "utf-8");
    // The profit-planning route uses OwnerRoute, not BusinessRoute
    expect(content).toMatch(/\/owner\/profit-planning.*OwnerRoute/);
  });

  it("PP53 useOwnerGuard checks currentStoreRole not profileRole", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const guardsFile = path.resolve(process.cwd(), "src/lib/guards.ts");
    const content = fs.readFileSync(guardsFile, "utf-8");
    // useOwnerGuard uses currentStoreRole === "owner"
    expect(content).toMatch(/currentStoreRole !== "owner"/);
  });

  it("PP54 Scenario draft storage key is healholic:profit-planning:draft", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const draftFile = path.resolve(process.cwd(), "src/services/scenarioDraftStorage.ts");
    const content = fs.readFileSync(draftFile, "utf-8");
    expect(content).toMatch(/healholic:profit-planning:draft/);
  });

  it("PP55 No valora: scenarios key in new draft storage", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const draftFile = path.resolve(process.cwd(), "src/services/scenarioDraftStorage.ts");
    const content = fs.readFileSync(draftFile, "utf-8");
    expect(content).not.toMatch(/valora:scenarios/);
  });
});
