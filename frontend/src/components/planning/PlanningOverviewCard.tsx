import { AlertTriangle, TrendingUp } from "lucide-react";
import DataQualityBadge from "@/components/DataQualityBadge";
import type { PlanningBaselineOverhead } from "@/services/storeAdminApi";
import { formatBaht, formatCups } from "./overheadLabels";

type Props = {
  averagePrice: number;
  averageCost: number;
  overhead: PlanningBaselineOverhead | null;
  loading?: boolean;
  dataQualityLevel: "confirmed" | "estimated";
  dataQualityStatus: "live" | "fallback" | "loading";
  dataQualityTimestamp?: string;
  statusTag: string;
  warnings: string[];
};

const MISSING_MESSAGE =
  "เพิ่มสมมติฐานและรายการต้นทุนแฝง เพื่อให้ระบบคำนวณกำไรจริงได้แม่นขึ้น";

/**
 * Section 1 — ภาพรวมการวางแผนกำไร.
 * Read-only summary: the five headline KPIs an owner should see first.
 * No editable fields here (assumptions live in Section 2, expenses in Section 3).
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
}: Props) {
  const hasOverhead = Boolean(overhead) && (overhead?.expense_count ?? 0) > 0;
  const overheadPerCup = overhead?.overhead_per_cup ?? null;
  const netAfterOverhead = hasOverhead ? averagePrice - averageCost - (overheadPerCup ?? 0) : null;
  const bepMonth = overhead?.break_even_cups_per_month ?? null;
  const bepDay = overhead?.break_even_cups_per_day ?? null;

  const cups = (value: number | null) =>
    value === null || !Number.isFinite(value) ? "—" : `${formatCups(value)} แก้ว`;

  const kpis: { label: string; value: string; tone?: string; emphasis?: boolean }[] = [
    { label: "ต้นทุนวัตถุดิบเฉลี่ย", value: formatBaht(averageCost, true) },
    { label: "ต้นทุนแฝงต่อแก้ว", value: hasOverhead ? formatBaht(overheadPerCup, true) : "—", emphasis: true },
    {
      label: "กำไรหลังรวมต้นทุนแฝง",
      value: netAfterOverhead === null ? "—" : formatBaht(netAfterOverhead, true),
      tone:
        netAfterOverhead === null
          ? undefined
          : netAfterOverhead >= 0
            ? "text-success"
            : "text-destructive",
      emphasis: true,
    },
    { label: "จุดคุ้มทุนต่อเดือน", value: cups(bepMonth) },
    { label: "จุดคุ้มทุนต่อวัน", value: cups(bepDay) },
  ];

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border bg-muted/40 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p
                  className={`mt-0.5 font-semibold tabular-nums ${kpi.emphasis ? "text-lg" : "text-base"} ${
                    kpi.tone ?? "text-foreground"
                  }`}
                >
                  {kpi.value}
                </p>
              </div>
            ))}
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
        </>
      )}
    </div>
  );
}
