import AppLayout from "@/components/AppLayout";
import DataQualityBadge from "@/components/DataQualityBadge";
import AssumptionsDrawer from "@/components/AssumptionsDrawer";
import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Clock, Info, FileText, Trash2, AlertTriangle } from "lucide-react";
import { shopService, fixedCostService, menuService, scenarioService } from "@/services/mockStorage";
import { calcScenarioKPIs } from "@/services/calculationEngine";
import type { SavedScenario, ScenarioKPIs } from "@/services/types";
import { storeAdminApi } from "@/services/storeAdminApi";
import {
  adaptPlanningBaseline,
  buildFallbackBaselineFromMenu,
  type PlanningBaselineAdapterResult,
} from "@/services/planningBaselineAdapter";

const now = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const baselineDateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const currencyFormatter = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });

type BaselineLoadState = {
  status: "loading" | "live" | "fallback" | "error";
  data: PlanningBaselineAdapterResult | null;
  error?: string;
};

const PRICE_SOURCE_HINTS: Record<string, string> = {
  "products.base_price": "ราคาเมนูปัจจุบัน",
};

const COST_SOURCE_HINTS: Record<string, string> = {
  "recipes.ingredients.cost_engine": "สูตร + ราคาซื้อจริง (purchase-derived)",
  purchase_derived: "ต้นทุนจาก Stock Intake",
  manual: "กรอกเอง (manual)",
  estimated: "ประมาณการ",
};

const MIX_SOURCE_HINTS: Record<string, string> = {
  order_items: "Mix จากออเดอร์จริง",
};

const LOCAL_SOURCE_LABEL = "ข้อมูลประมาณการจากเครื่องนี้";

const COST_STATUS_META: Record<string, { label: string; tone: string }> = {
  complete: { label: "ครบถ้วน", tone: "text-success" },
  missing_recipe: { label: "ยังไม่มีสูตร", tone: "text-warning" },
  missing_ingredient: { label: "ขาดชื่อวัตถุดิบ", tone: "text-warning" },
  missing_ingredient_cost: { label: "ขาดราคาวัตถุดิบ", tone: "text-warning" },
  estimated: { label: "ประมาณการ", tone: "text-warning" },
  manual: { label: "กรอกเอง", tone: "text-warning" },
};

const FALLBACK_WARNING = "กำลังใช้ข้อมูลประมาณการจากเครื่องนี้ ไม่ใช่ข้อมูลล่าสุดจากระบบ";

function formatSourceLabel(value: string | null | undefined, type: "price" | "cost" | "mix", lookbackDays?: number): string {
  if (!value) return "ไม่พบข้อมูล";
  if (value.startsWith("local.") || value.includes("demo") || value.includes("mock")) {
    if (type === "mix" && value.endsWith("equal")) {
      return `${LOCAL_SOURCE_LABEL} (เฉลี่ยน้ำหนักเท่าๆ กัน)`;
    }
    return LOCAL_SOURCE_LABEL;
  }
  if (type === "price") {
    return PRICE_SOURCE_HINTS[value] ?? value;
  }
  if (type === "cost") {
    const direct = COST_SOURCE_HINTS[value];
    if (direct) return direct;
    if (value.includes("manual")) return COST_SOURCE_HINTS.manual;
    if (value.includes("estimated")) return COST_SOURCE_HINTS.estimated;
    if (value.includes("purchase") || value.includes("cost_engine")) return COST_SOURCE_HINTS["recipes.ingredients.cost_engine"];
    return value;
  }
  const base = MIX_SOURCE_HINTS[value] ?? value;
  if (lookbackDays && lookbackDays > 0) {
    return `${base} (${lookbackDays} วันล่าสุด)`;
  }
  return base;
}

function formatBaselineTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return baselineDateFormatter.format(date);
}

function getCostStatusMeta(status: string | null | undefined, recipeComplete: boolean) {
  if (status && COST_STATUS_META[status]) return COST_STATUS_META[status];
  if (recipeComplete) return COST_STATUS_META.complete;
  return COST_STATUS_META.missing_recipe;
}

function collectWarnings(baseline: PlanningBaselineAdapterResult | null, status: BaselineLoadState["status"]): string[] {
  const alerts = new Set<string>();
  baseline?.derivedWarnings.forEach((warning) => alerts.add(warning));
  if (status === "fallback") alerts.add(FALLBACK_WARNING);
  return Array.from(alerts);
}

function formatTHB(value: number): string {
  if (!Number.isFinite(value)) return currencyFormatter.format(0);
  return currencyFormatter.format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

export default function ScenarioPage() {
  // Load baseline from service layer
  const shop = useMemo(() => shopService.get(), []);
  const fixedCostsTotal = useMemo(() => fixedCostService.total(), []);
  const menuRows = useMemo(() => menuService.get(), []);
  const fallbackBaseline = useMemo(() => buildFallbackBaselineFromMenu(menuRows), [menuRows]);

  const [baselineState, setBaselineState] = useState<BaselineLoadState>({ status: "loading", data: null });
  const hasSeededBaseline = useRef(false);

  // Scenario state — initialised from real baseline (seeded after baseline arrives)
  const [fixedCosts, setFixedCosts] = useState(fixedCostsTotal);
  const [avgPrice, setAvgPrice] = useState(() =>
    Number.isFinite(fallbackBaseline.averagePrice) ? Number(fallbackBaseline.averagePrice.toFixed(1)) : 0
  );
  const [avgCost, setAvgCost] = useState(() =>
    Number.isFinite(fallbackBaseline.averageCost) ? Number(fallbackBaseline.averageCost.toFixed(1)) : 0
  );
  const [daysOpen, setDaysOpen] = useState(shop.daysOpen);
  const [targetProfit, setTargetProfit] = useState(shop.targetProfit);
  const [scenarioNotes, setScenarioNotes] = useState("");
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() =>
    scenarioService.get()
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchBaseline() {
      setBaselineState((prev) => ({ ...prev, status: "loading", error: undefined }));
      try {
        const response = await storeAdminApi.getPlanningBaseline();
        if (cancelled) return;
        const adapted = adaptPlanningBaseline(response);
        setBaselineState({ status: "live", data: adapted });
      } catch (error: any) {
        if (cancelled) return;
        setBaselineState({
          status: "fallback",
          data: fallbackBaseline,
          error: error?.message || "planning_baseline_failed",
        });
      }
    }
    void fetchBaseline();
    return () => {
      cancelled = true;
    };
  }, [fallbackBaseline]);

  useEffect(() => {
    if (hasSeededBaseline.current) return;
    const source = baselineState.data ?? (baselineState.status === "fallback" ? fallbackBaseline : null);
    if (!source) return;
    hasSeededBaseline.current = true;
    const priceSeed = Number.isFinite(source.averagePrice) ? Number(source.averagePrice.toFixed(1)) : 0;
    const costSeed = Number.isFinite(source.averageCost) ? Number(source.averageCost.toFixed(1)) : 0;
    setAvgPrice(priceSeed);
    setAvgCost(costSeed);
  }, [baselineState, fallbackBaseline]);

  const activeBaseline = baselineState.data ?? fallbackBaseline;

  // Calculations (pure engine)
  const baselineKPIs = useMemo<ScenarioKPIs>(() => {
    const basePrice = activeBaseline?.averagePrice ?? 0;
    const baseCost = activeBaseline?.averageCost ?? 0;
    return calcScenarioKPIs(fixedCostsTotal, shop.targetProfit, basePrice, baseCost, shop.daysOpen);
  }, [activeBaseline, fixedCostsTotal, shop.targetProfit, shop.daysOpen]);

  const scenario = useMemo(
    () => calcScenarioKPIs(fixedCosts, targetProfit, avgPrice, avgCost, daysOpen),
    [fixedCosts, targetProfit, avgPrice, avgCost, daysOpen]
  );

  const baselineAveragePrice = activeBaseline?.averagePrice ?? 0;
  const baselineAverageCost = activeBaseline?.averageCost ?? 0;
  const cmBaseline = baselineAveragePrice - baselineAverageCost;
  const baselineUpdatedLabel = formatBaselineTimestamp(activeBaseline?.generatedAt);
  const baselineSources = [
    { label: "ราคา", value: formatSourceLabel(activeBaseline?.priceSource, "price") },
    { label: "ต้นทุน", value: formatSourceLabel(activeBaseline?.costSource, "cost") },
    {
      label: "Mix",
      value: formatSourceLabel(activeBaseline?.mixSource, "mix", activeBaseline?.lookbackDays),
    },
  ];
  const baselineWarnings = collectWarnings(activeBaseline, baselineState.status);
  const baselineMenuPreview = (activeBaseline?.items ?? []).slice(0, 5);
  const baselineGrossMarginPercent = baselineAveragePrice > 0 ? (cmBaseline / baselineAveragePrice) * 100 : null;
  const dataQualityStatus: "live" | "fallback" | "loading" =
    baselineState.status === "live"
      ? "live"
      : baselineState.status === "loading" && !baselineState.data
        ? "loading"
        : "fallback";
  const dataQualityLevel = activeBaseline?.dataQualityLevel ?? "estimated";
  const dataQualityTimestamp = dataQualityStatus === "live" ? baselineUpdatedLabel ?? undefined : undefined;
  const baselineStatusMessages: Record<BaselineLoadState["status"], string> = {
    live: baselineUpdatedLabel ? `ข้อมูลสดจากร้าน (อัปเดต ${baselineUpdatedLabel})` : "ข้อมูลสดจากร้าน",
    fallback: "ไม่ได้เชื่อมต่อระบบ กำลังใช้ข้อมูลประมาณการจากเครื่องนี้",
    loading: "กำลังโหลดข้อมูล baseline สดของร้าน...",
    error: "โหลด baseline ไม่สำเร็จ กำลังใช้ข้อมูลประมาณการ",
  };
  const baselineStatusTag = baselineStatusMessages[baselineState.status] ?? baselineStatusMessages.fallback;
  const baselineIsLoading = baselineState.status === "loading" && !baselineState.data;
  const baselineMenuTimestampNote =
    dataQualityStatus === "live"
      ? baselineUpdatedLabel
        ? `อัปเดตล่าสุด ${baselineUpdatedLabel}`
        : "อัปเดต baseline สดล่าสุด"
      : dataQualityStatus === "fallback"
        ? "ข้อมูลประมาณการ ไม่ได้เชื่อมต่อระบบ"
        : "กำลังโหลด baseline สด...";
  const baselineRecencyDescriptor =
    dataQualityStatus === "live" && baselineUpdatedLabel
      ? `baseline สด ${baselineUpdatedLabel}`
      : dataQualityStatus === "fallback"
        ? "baseline จากข้อมูลประมาณการ"
        : null;

  const diff = (a: number, b: number) => {
    if (!isFinite(a) || !isFinite(b)) return { text: "-", cls: "text-muted-foreground" };
    const d = a - b;
    if (d === 0) return { text: "ไม่เปลี่ยนแปลง", cls: "text-muted-foreground" };
    const sign = d > 0 ? "+" : "";
    return { text: `${sign}${d.toLocaleString()}`, cls: d > 0 ? "text-destructive" : "text-success" };
  };

  const saveScenario = () => {
    const newScenario: SavedScenario = {
      id: scenarioService.nextId(),
      name: `สถานการณ์ ${scenarioService.nextId()}`,
      timestamp: now,
      fixedCosts,
      avgPrice,
      avgCost,
      daysOpen,
      targetProfit,
      notes: scenarioNotes,
    };
    scenarioService.save(newScenario);
    setSavedScenarios(scenarioService.get());
    setScenarioNotes("");
  };

  const deleteScenario = (id: number) => {
    scenarioService.delete(id);
    setSavedScenarios(scenarioService.get());
  };

  const loadScenario = (s: SavedScenario) => {
    setFixedCosts(s.fixedCosts);
    setAvgPrice(s.avgPrice);
    setAvgCost(s.avgCost);
    setDaysOpen(s.daysOpen);
    setTargetProfit(s.targetProfit);
    setScenarioNotes(s.notes);
  };

  const cm = avgPrice - avgCost;

  const kpiRows = [
    { label: "จุดคุ้มทุน (แก้ว/เดือน)", unit: "แก้ว", base: baselineKPIs.bepMonth, scen: scenario.bepMonth },
    { label: "จุดคุ้มทุน (แก้ว/วัน)", unit: "แก้ว", base: baselineKPIs.bepDay, scen: scenario.bepDay },
    { label: "ยอดขายเพื่อกำไรเป้า (แก้ว/วัน)", unit: "แก้ว", base: baselineKPIs.targetCupsDay, scen: scenario.targetCupsDay },
    { label: "รายได้ที่ต้องทำ (บาท/วัน)", unit: "฿", base: baselineKPIs.revenueDay, scen: scenario.revenueDay },
    { label: "กำไรสุทธิประมาณการ (บาท/เดือน)", unit: "฿", base: baselineKPIs.netProfit, scen: scenario.netProfit },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">วางแผนกำไร</h1>
            <p className="page-subtitle">
              เครื่องมือจำลองสถานการณ์ — ปรับราคา ต้นทุน และเป้ากำไร เพื่อดูจุดคุ้มทุนและยอดขายที่ต้องทำ
            </p>
          </div>
        </div>

        <div className="guidance-card flex items-start gap-3">
          <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              แผนกำไรใช้ราคาขายและต้นทุนปัจจุบันเพื่อวางแผนล่วงหน้า ส่วนรายงานใช้ข้อมูลขายจริงและต้นทุนที่บันทึกไว้ตอนขาย
              ตัวเลขทั้งสองส่วนอาจต่างกันได้หากมีการปรับราคา สูตร หรือข้อมูลวัตถุดิบล่าสุด
            </p>
            <p className="text-xs text-muted-foreground">
              ค่าเริ่มต้นด้านล่างมาจาก baseline สดของร้าน หากเชื่อมต่อไม่ได้ ระบบจะใช้ข้อมูลตัวอย่างจากเครื่องนี้และระบุว่าเป็นข้อมูลประมาณการ
            </p>
          </div>
        </div>

        <div className="stat-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">ข้อมูลต้นทุนล่าสุด</p>
              <h2 className="text-lg font-semibold text-foreground">Profit Planning Baseline</h2>
              <div className="text-xs text-muted-foreground mt-1">{baselineStatusTag}</div>
            </div>
            <DataQualityBadge level={dataQualityLevel} status={dataQualityStatus} lastChecked={dataQualityTimestamp} />
          </div>

          {baselineIsLoading ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              กำลังโหลดข้อมูล baseline ล่าสุดของร้าน...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "ราคาเฉลี่ย/แก้ว", value: formatTHB(baselineAveragePrice) },
                  { label: "ต้นทุนเฉลี่ย/แก้ว", value: formatTHB(baselineAverageCost) },
                  {
                    label: "กำไรขั้นต้น",
                    value: formatTHB(cmBaseline),
                    helper: baselineGrossMarginPercent ? `${baselineGrossMarginPercent.toFixed(1)}%` : "-",
                  },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl border bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="text-lg font-semibold text-foreground">{metric.value}</p>
                    {metric.helper && <p className="text-[11px] text-muted-foreground mt-0.5">{metric.helper}</p>}
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-3 gap-3 text-xs">
                {baselineSources.map((source) => (
                  <div key={source.label} className="rounded-lg border px-3 py-2 bg-muted/30">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{source.label}</p>
                    <p className="font-medium text-foreground mt-0.5">{source.value}</p>
                  </div>
                ))}
              </div>

              {baselineWarnings.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 space-y-2 text-sm text-warning">
                  {baselineWarnings.map((warning) => (
                    <div key={warning} className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">ตัวอย่างเมนูจาก baseline</p>
                  {baselineMenuTimestampNote && <span className="text-xs text-muted-foreground">{baselineMenuTimestampNote}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground text-left">
                        <th className="py-2 pr-2">เมนู</th>
                        <th className="py-2 pr-2 text-right">ราคา</th>
                        <th className="py-2 pr-2 text-right">ต้นทุน</th>
                        <th className="py-2 pr-2 text-right">กำไร/แก้ว</th>
                        <th className="py-2">สถานะต้นทุน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baselineMenuPreview.map((item) => {
                        const statusMeta = getCostStatusMeta(item.costStatus ?? null, item.recipeComplete);
                        const grossProfit = (item.basePrice ?? 0) - (item.currentUnitCost ?? 0);
                        const marginPercent = item.basePrice > 0 ? (grossProfit / item.basePrice) * 100 : null;
                        return (
                          <tr key={item.productId} className="border-t border-muted/80">
                            <td className="py-2 pr-2 font-medium text-foreground">{item.name}</td>
                            <td className="py-2 pr-2 text-right">{formatTHB(item.basePrice)}</td>
                            <td className="py-2 pr-2 text-right">{formatTHB(item.currentUnitCost)}</td>
                            <td className="py-2 pr-2 text-right">{`${formatTHB(grossProfit)} • ${formatPercent(marginPercent)}`}</td>
                            <td className={`py-2 text-xs font-medium ${statusMeta.tone}`}>{statusMeta.label}</td>
                          </tr>
                        );
                      })}
                      {baselineMenuPreview.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                            ยังไม่มีเมนูใน baseline โปรดเพิ่มเมนูและสูตรก่อนใช้งานการวางแผน
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* LEFT: Sliders */}
          <div className="lg:col-span-2 space-y-4">
            <div className="stat-card space-y-5">
              <h2 className="section-title">ตัวแปรที่ปรับได้</h2>

              {[
                { label: "ค่าใช้จ่ายคงที่", unit: "฿/เดือน", value: fixedCosts, set: setFixedCosts, min: 0, max: 200000, step: 1000 },
                { label: "ราคาเฉลี่ยต่อแก้ว", unit: "฿", value: avgPrice, set: setAvgPrice, min: 20, max: 200, step: 1 },
                { label: "ต้นทุนเฉลี่ยต่อแก้ว", unit: "฿", value: avgCost, set: setAvgCost, min: 5, max: 150, step: 0.5 },
                { label: "วันเปิดขาย", unit: "วัน/เดือน", value: daysOpen, set: setDaysOpen, min: 1, max: 31, step: 1 },
                { label: "เป้ากำไรสุทธิ", unit: "฿/เดือน", value: targetProfit, set: setTargetProfit, min: 0, max: 200000, step: 1000 },
              ].map((s) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="form-label">{s.label}</label>
                      <span className="text-xs text-muted-foreground font-medium">{s.unit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={s.value}
                        onChange={(e) => s.set(Number(e.target.value))}
                        className="flex-1 h-2 rounded-full appearance-none bg-muted accent-primary cursor-pointer"
                      />
                      <input
                        type="number"
                        value={s.value}
                        onChange={(e) => s.set(Number(e.target.value))}
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        className="w-24 px-2 py-1.5 rounded-lg border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
              ))}

              <div>
                <label className="form-label mb-1.5">บันทึกช่วยจำ</label>
                <textarea
                  value={scenarioNotes}
                  onChange={(e) => setScenarioNotes(e.target.value)}
                  placeholder="เช่น ทดสอบถ้าขึ้นราคา 10%..."
                  maxLength={200}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={saveScenario}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Save className="w-4 h-4" /> บันทึกสถานการณ์
                </button>
                <button className="flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                  <FileText className="w-4 h-4" /> บันทึกเป็นรายงาน
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Results */}
          <div className="lg:col-span-3 space-y-4">
            <div className="stat-card">
              <div className="panel-header">
                <h2 className="section-title">ผลลัพธ์การจำลอง</h2>
                <DataQualityBadge level={dataQualityLevel} status={dataQualityStatus} lastChecked={dataQualityTimestamp} />
              </div>

              {cm <= 0 && (
                <div className="mb-4 bg-destructive/5 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive font-medium">
                  กำไรขั้นต้นติดลบ — ราคาขายต่ำกว่าต้นทุน ไม่สามารถคำนวณจุดคุ้มทุนได้
                </div>
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>ตัวชี้วัด</th>
                    <th className="text-right">ปัจจุบัน</th>
                    <th className="text-right">จำลอง</th>
                    <th className="text-right">ผลต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiRows.map((row, i) => {
                    const d = diff(row.scen, row.base);
                    const isInf = !isFinite(row.scen);
                    return (
                      <tr key={i}>
                        <td className="text-foreground font-medium">{row.label}</td>
                        <td className="text-right tabular-nums">
                          {!isFinite(row.base) ? "N/A" : row.unit === "฿" ? `฿${row.base.toLocaleString()}` : row.base.toLocaleString()}
                        </td>
                        <td className="text-right tabular-nums font-semibold">
                          {isInf ? "N/A" : row.unit === "฿" ? `฿${row.scen.toLocaleString()}` : row.scen.toLocaleString()}
                        </td>
                        <td className={`text-right tabular-nums text-xs font-medium ${d.cls}`}>
                          {isInf ? "-" : d.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {cm > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-semibold text-foreground mb-2">สรุปความแตกต่าง</h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {scenario.bepDay !== baselineKPIs.bepDay && (
                      <li>
                        จุดคุ้มทุนรายวัน {scenario.bepDay > baselineKPIs.bepDay ? "เพิ่มขึ้น" : "ลดลง"} {Math.abs(scenario.bepDay - baselineKPIs.bepDay)} แก้ว/วัน
                      </li>
                    )}
                    {scenario.netProfit !== baselineKPIs.netProfit && (
                      <li>
                        กำไรสุทธิประมาณการ {scenario.netProfit > baselineKPIs.netProfit ? "เพิ่มขึ้น" : "ลดลง"} ฿
                        {Math.abs(scenario.netProfit - baselineKPIs.netProfit).toLocaleString()}/เดือน
                      </li>
                    )}
                    <li>กำไรขั้นต้น/แก้ว ฿{cm.toFixed(1)} (baseline ฿{cmBaseline.toFixed(1)})</li>
                  </ul>
                </div>
              )}

              <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>
                  อัปเดตตัวจำลองเมื่อ: {now} {baselineRecencyDescriptor && `(${baselineRecencyDescriptor})`}
                </span>
              </div>
            </div>

            <AssumptionsDrawer
              title="วิธีคำนวณ"
              inputSources={[
                "ราคา + ต้นทุนเฉลี่ยจาก baseline สด (หรือข้อมูลประมาณการหากออฟไลน์)",
                "ค่าใช้จ่ายคงที่และเป้ากำไรที่เจ้าของร้านปรับในหน้านี้",
                "Mix% ย้อนหลัง (หากไม่มีจะเฉลี่ยน้ำหนักเมนูเท่าๆ กัน)",
              ]}
              formulas={[
                { label: "จุดคุ้มทุน", formula: "= ค่าใช้จ่ายคงที่ / กำไรขั้นต้นต่อแก้ว" },
                { label: "กำไรสุทธิ", formula: "= (แก้วเป้า/วัน x วันเปิดขาย x กำไรขั้นต้น/แก้ว) - ค่าใช้จ่ายคงที่" },
              ]}
              assumptions={[
                { text: "ใช้ค่าเฉลี่ยถ่วงน้ำหนักจาก Mix ปัจจุบัน หรือเฉลี่ยเท่าๆ กันถ้ายังไม่มีข้อมูลขาย" },
                { text: "สมมติว่า Mix% และโครงสร้างต้นทุนไม่เปลี่ยนแปลงระหว่างจำลอง" },
                { text: "ผลลัพธ์เป็นการวางแผนล่วงหน้า ไม่ใช่รายงานยอดขายจริง" },
              ]}
            />
          </div>
        </div>

        {/* Saved Scenarios */}
        {savedScenarios.length > 0 && (
          <div className="stat-card">
            <div className="panel-header">
              <h2 className="section-title">สถานการณ์ที่บันทึกไว้</h2>
              <span className="text-xs text-muted-foreground">{savedScenarios.length} รายการ</span>
            </div>
            <div className="space-y-2">
              {savedScenarios.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{s.name}</p>
                    {s.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.notes}</p>}
                    <p className="timestamp mt-1">{s.timestamp}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button onClick={() => loadScenario(s)} className="text-xs text-accent font-medium hover:text-accent/80 transition-colors">
                      โหลด
                    </button>
                    <button onClick={() => deleteScenario(s.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4 border-t">
          ข้อมูลนี้เป็นแบบจำลองเพื่อการวางแผน โปรดตรวจสอบต้นทุนจริงเป็นระยะ
        </p>
      </div>
    </AppLayout>
  );
}
