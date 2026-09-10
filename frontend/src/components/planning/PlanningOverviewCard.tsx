import { AlertTriangle, TrendingUp } from "lucide-react";
import DataQualityBadge from "@/components/DataQualityBadge";
import type { PlanningBaselineOverhead } from "@/services/storeAdminApi";
import { formatBaht, formatCups } from "./overheadLabels";

export type TargetProfitMetricsSummary =
  | {
      canCalculate: false;
      reason?: "missing_data" | "non_positive_margin";
    }
  | ({
      canCalculate: true;
      requiredCups: number;
      requiredCupsPerDay: number | null;
      gapCups: number | null;
    } & { reason?: undefined });

type Props = {
  averagePrice: number;
  averageCost: number;
  overhead: PlanningBaselineOverhead | null;
  loading?: boolean;
  dataQualityLevel: "confirmed" | "estimated";
  dataQualityStatus: "live" | "fallback" | "loading" | "error";
  dataQualityTimestamp?: string;
  statusTag: string;
  warnings: string[];
  targetProfitMonthly: number | null;
  targetProfitMetrics: TargetProfitMetricsSummary;
};

const MISSING_MESSAGE =
  "เพิ่มสมมติฐานและรายการต้นทุนแฝง เพื่อให้ระบบคำนวณกำไรจริงได้แม่นขึ้น";

type Kpi = { label: string; value: string; tone?: string; emphasis?: boolean; helper?: string };

/**
 * Section 1 — ภาพรวมการวางแผนกำไร.
 * Read-only summary: the headline KPIs an owner should see first, grouped into
 * แผนปัจจุบัน / จุดคุ้มทุน / เป้ากำไร so the three ideas are not confused.
 * No editable fields here (assumptions live in Section 2, expenses in Section 3).
 * No business formulas are computed here — values come straight from props.
 */
export default function PlanningOverviewCard({
  averagePrice,
  averageCost,
  overhead,
  loading,
  dataQualityLevel,
  dataQualityStatus,
  dataQualityTimestamp,
  statusTag,
  warnings,
  targetProfitMonthly,
  targetProfitMetrics,
}: Props) {
  const hasOverhead = Boolean(overhead) && (overhead?.expense_count ?? 0) > 0;
  const overheadPerCup = overhead?.overhead_per_cup ?? null;
  const netAfterOverhead = hasOverhead ? averagePrice - averageCost - (overheadPerCup ?? 0) : null;
  // Gross profit per cup BEFORE overhead — the value the target-profit formula
  // divides by (see Scenario.tsx). Shown so owners use the right per-cup number.
  const grossPerCup = Number.isFinite(averagePrice - averageCost) ? averagePrice - averageCost : null;
  const bepMonth = overhead?.break_even_cups_per_month ?? null;
  const bepDay = overhead?.break_even_cups_per_day ?? null;

  const cups = (value: number | null) =>
    value === null || !Number.isFinite(value) ? "—" : `${formatCups(value)} แก้ว`;

  const BREAK_EVEN_HELPER = "ขายให้ครอบคลุมต้นทุนแฝง ยังไม่รวมเป้ากำไร";
  const TARGET_HELPER = "ขายให้ครอบคลุมต้นทุนแฝงและได้กำไรตามเป้า";
  const TARGET_FORMULA =
    "จำนวนแก้วเพื่อถึงเป้า = (ค่าใช้จ่ายประจำต่อเดือน + เป้ากำไร) ÷ กำไรขั้นต้นต่อแก้ว";

  const planKpis: Kpi[] = [
    { label: "ต้นทุนวัตถุดิบเฉลี่ย", value: formatBaht(averageCost, true) },
    {
      label: "ต้นทุนแฝงต่อแก้ว",
      value: hasOverhead ? formatBaht(overheadPerCup, true) : "—",
      emphasis: true,
    },
    {
      label: "กำไรเฉลี่ย/แก้วตามแผนนี้",
      value: netAfterOverhead === null ? "—" : formatBaht(netAfterOverhead, true),
      tone:
        netAfterOverhead === null
          ? undefined
          : netAfterOverhead >= 0
            ? "text-success"
            : "text-destructive",
      emphasis: true,
      helper: "คำนวณจากจำนวนแก้วที่ตั้งไว้ในสมมติฐาน",
    },
  ];

  const breakEvenKpis: Kpi[] = [
    { label: "จุดคุ้มทุนต่อเดือน", value: cups(bepMonth), helper: BREAK_EVEN_HELPER },
    { label: "จุดคุ้มทุนต่อวัน", value: cups(bepDay), helper: BREAK_EVEN_HELPER },
  ];

  const targetStatus = (() => {
    if (!targetProfitMetrics.canCalculate) {
      const reason = targetProfitMetrics.reason;
      return {
        state: "unavailable" as const,
        short: "—",
        insight:
          reason === "non_positive_margin"
            ? "ยังคำนวณเป้ากำไรไม่ได้ เพราะข้อมูลต้นทุนยังไม่ครบ"
            : "ยังคำนวณเป้ากำไรไม่ได้ เพราะข้อมูลไม่ครบ",
      };
    }
    const gap = targetProfitMetrics.gapCups ?? null;
    if (gap === null) {
      return {
        state: "pending" as const,
        short: "รอข้อมูล",
        insight: "ใส่จำนวนแก้วที่คาดว่าจะขายต่อเดือนในสมมติฐาน เพื่อเทียบกับเป้านี้",
      };
    }
    if (gap <= 0) {
      return {
        state: "positive" as const,
        short: "มีโอกาสถึงเป้า",
        insight:
          "แผนนี้มีโอกาสถึงเป้ากำไร เพราะจำนวนแก้วที่ตั้งไว้สูงกว่าจำนวนที่ต้องขายเพื่อถึงเป้า",
      };
    }
    return {
      state: "gap" as const,
      short: "ยังไม่ถึงเป้า",
      insight: `แผนปัจจุบันยังต่ำกว่าเป้ากำไร ต้องขายเพิ่มอีกประมาณ ${formatCups(gap)} แก้ว/เดือน`,
    };
  })();

  const targetStatusTone: Record<string, string> = {
    positive: "text-success",
    gap: "text-destructive",
    pending: "text-muted-foreground",
    unavailable: "text-muted-foreground",
  };

  const renderKpi = (kpi: Kpi) => (
    <div key={kpi.label} className="rounded-xl border bg-muted/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{kpi.label}</p>
      <p
        className={`mt-0.5 font-semibold tabular-nums ${kpi.emphasis ? "text-lg" : "text-base"} ${
          kpi.tone ?? "text-foreground"
        }`}
      >
        {kpi.value}
      </p>
      {kpi.helper && <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.helper}</p>}
    </div>
  );

  return (
    <div className="stat-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-accent/10 p-2 text-accent">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">1. ภาพรวมการวางแผนกำไร</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              สรุปกำไรและจุดคุ้มทุนของร้านหลังรวมต้นทุนแฝง — ดูภาพรวมได้ที่นี่ที่เดียว
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{statusTag}</p>
          </div>
        </div>
        <DataQualityBadge level={dataQualityLevel} status={dataQualityStatus} lastChecked={dataQualityTimestamp} />
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          กำลังโหลดข้อมูลภาพรวม...
        </div>
      ) : (
        <>
          {/* กลุ่มที่ 1: แผนปัจจุบัน */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">แผนปัจจุบัน</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{planKpis.map(renderKpi)}</div>
          </div>

          {/* กลุ่มที่ 2: จุดคุ้มทุน */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">จุดคุ้มทุน</p>
            <div className="grid grid-cols-2 gap-3">{breakEvenKpis.map(renderKpi)}</div>
          </div>

          {!hasOverhead && (
            <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4 text-sm text-foreground">
              {MISSING_MESSAGE}
            </div>
          )}

          {hasOverhead && bepMonth === null && (
            <p className="text-xs text-muted-foreground">
              ยังคำนวณจุดคุ้มทุนไม่ได้ เพราะกำไรขั้นต้นเฉลี่ยต่อแก้วยังไม่เป็นบวก ลองตรวจสอบราคาขายและต้นทุนวัตถุดิบ
            </p>
          )}

          {warnings.length > 0 && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
              {warnings.map((warning) => (
                <div key={warning} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* กลุ่มที่ 3: เป้ากำไร */}
          <div className="rounded-xl border border-dashed border-accent/30 bg-accent/5 px-4 py-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <p className="text-xs font-semibold text-foreground">เป้ากำไร</p>
                <p className="text-[11px] text-muted-foreground">{TARGET_HELPER}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">เป้ากำไรต่อเดือน</p>
                <p className="text-base font-semibold tabular-nums text-foreground">
                  {targetProfitMonthly != null ? formatBaht(targetProfitMonthly, true) : "—"}
                </p>
              </div>
            </div>

            {targetProfitMetrics.canCalculate ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">ต้องขายเพื่อถึงเป้า</p>
                    <p className="mt-0.5 text-lg font-semibold text-foreground">
                      {`${formatCups(targetProfitMetrics.requiredCups)} แก้ว/เดือน`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">เฉลี่ยต่อวันเพื่อถึงเป้า</p>
                    <p className="mt-0.5 text-lg font-semibold text-foreground">
                      {targetProfitMetrics.requiredCupsPerDay != null
                        ? `${formatCups(targetProfitMetrics.requiredCupsPerDay)} แก้ว/วัน`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">สถานะเป้าหมาย</p>
                    <p className={`mt-0.5 text-sm font-semibold ${targetStatusTone[targetStatus.state]}`}>
                      {targetStatus.short}
                    </p>
                  </div>
                </div>

                <p className={`text-xs font-medium ${targetStatusTone[targetStatus.state]}`}>
                  {targetStatus.insight}
                </p>

                <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">{TARGET_FORMULA}</p>
                  {grossPerCup != null && grossPerCup > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      กำไรขั้นต้นต่อแก้ว (ก่อนหักต้นทุนแฝง) = {formatBaht(grossPerCup, true)} —
                      ใช้ตัวเลขนี้คิดเป้า ไม่ใช่ “กำไรเฉลี่ย/แก้วตามแผนนี้” ที่หักต้นทุนแฝงไปแล้ว
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{targetStatus.insight}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
