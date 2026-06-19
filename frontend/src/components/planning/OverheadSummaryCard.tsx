import { Layers } from "lucide-react";
import type { PlanningBaselineOverhead } from "@/services/storeAdminApi";
import { formatBaht, formatCups, overheadCategoryLabel } from "./overheadLabels";

type Props = {
  overhead: PlanningBaselineOverhead | null;
  loading?: boolean;
};

const MISSING_MESSAGE =
  "ยังไม่มีข้อมูลต้นทุนแฝง กรุณาเพิ่มรายการค่าใช้จ่ายประจำเพื่อให้ระบบคำนวณกำไรจริงได้แม่นขึ้น";

/**
 * Section A — สรุปต้นทุนแฝง.
 * Reads from baseline.overhead. When overhead is unavailable or there are no
 * recurring expenses yet, shows a gentle empty state instead of zeros.
 */
export default function OverheadSummaryCard({ overhead, loading }: Props) {
  const hasData = Boolean(overhead) && (overhead?.expense_count ?? 0) > 0;

  const categoryRows = Object.entries(overhead?.category_breakdown ?? {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/10 p-2 text-accent">
          <Layers className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">สรุปต้นทุนแฝง</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ต้นทุนประจำที่ระบบนำมาเฉลี่ยต่อแก้ว เพื่อให้เห็นกำไรจริงหลังหักต้นทุนแฝง
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          กำลังโหลดข้อมูลต้นทุนแฝง...
        </div>
      ) : !hasData ? (
        <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4 text-sm text-foreground">
          {MISSING_MESSAGE}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="ต้นทุนแฝงต่อเดือน" value={formatBaht(overhead!.monthly_overhead)} emphasis />
            <Metric label="คาดว่าจะขายต่อเดือน" value={`${formatCups(overhead!.expected_cups_per_month)} แก้ว`} />
            <Metric label="เปิดร้านกี่วันต่อเดือน" value={`${overhead!.operating_days_per_month} วัน`} />
            <Metric
              label="ต้นทุนแฝงเฉลี่ยต่อแก้ว"
              value={formatBaht(overhead!.overhead_per_cup, true)}
              emphasis
            />
            <Metric
              label="จุดคุ้มทุนต่อเดือน"
              value={
                overhead!.break_even_cups_per_month === null
                  ? "—"
                  : `${formatCups(overhead!.break_even_cups_per_month)} แก้ว`
              }
            />
            <Metric
              label="จุดคุ้มทุนต่อวัน"
              value={
                overhead!.break_even_cups_per_day === null
                  ? "—"
                  : `${formatCups(overhead!.break_even_cups_per_day)} แก้ว`
              }
            />
          </div>

          {overhead!.break_even_cups_per_month === null && (
            <p className="text-xs text-muted-foreground">
              ยังคำนวณจุดคุ้มทุนไม่ได้ เพราะกำไรขั้นต้นเฉลี่ยต่อแก้วยังไม่เป็นบวก ลองตรวจสอบราคาขายและต้นทุนวัตถุดิบ
            </p>
          )}

          {categoryRows.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-semibold text-foreground">แยกตามหมวด (ต่อเดือน)</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {categoryRows.map(([category, value]) => (
                  <div
                    key={category}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-xs"
                  >
                    <span className="text-muted-foreground">{overheadCategoryLabel(category)}</span>
                    <span className="font-medium tabular-nums text-foreground">{formatBaht(Number(value))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums text-foreground ${emphasis ? "text-lg" : "text-base"}`}>
        {value}
      </p>
    </div>
  );
}
