import { ShoppingBag } from "lucide-react";
import type { PlanningBaselineMenuSummary } from "@/services/planningBaselineAdapter";
import { formatBaht } from "./overheadLabels";

type Props = {
  items: PlanningBaselineMenuSummary[];
  hasOverheadOverlay: boolean;
  loading?: boolean;
};

const NEEDS_REVIEW = new Set([
  "missing_recipe",
  "missing_ingredient",
  "missing_ingredient_cost",
  "estimated",
  "manual",
  "zero_quantity",
]);

type Badge = { label: string; cls: string } | null;

/** Profit health badge based on the best available bottom line. */
function profitBadge(bottomLine: number | null, price: number): Badge {
  if (bottomLine === null || !Number.isFinite(bottomLine)) return null;
  if (bottomLine < 0) return { label: "ขาดทุน", cls: "bg-destructive/10 text-destructive" };
  const marginPct = price > 0 ? (bottomLine / price) * 100 : null;
  if (marginPct !== null && marginPct < 15) return { label: "ต้องระวัง", cls: "bg-warning/10 text-warning" };
  return { label: "กำไรดี", cls: "bg-success/10 text-success" };
}

function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

/**
 * Section 4 — กำไรรายสินค้า.
 * Shows real per-product profitability. Overhead/after-overhead columns are
 * hidden gracefully when the backend has not produced the overlay yet.
 */
export default function ProductProfitTable({ items, hasOverheadOverlay, loading }: Props) {
  const colSpan = hasOverheadOverlay ? 7 : 5;

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/10 p-2 text-accent">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">4. กำไรรายสินค้า</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            กำไรจริงของแต่ละเมนู ทั้งกำไรขั้นต้นและกำไรหลังรวมต้นทุนแฝงต่อแก้ว
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          กำลังโหลดข้อมูลสินค้า...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">ชื่อสินค้า</th>
                <th className="py-2 pr-2 text-right">ราคาขาย</th>
                <th className="py-2 pr-2 text-right">ต้นทุนวัตถุดิบ/บรรจุภัณฑ์</th>
                <th className="py-2 pr-2 text-right">กำไรขั้นต้น</th>
                {hasOverheadOverlay && <th className="py-2 pr-2 text-right">ต้นทุนแฝงต่อแก้ว</th>}
                {hasOverheadOverlay && <th className="py-2 pr-2 text-right">กำไรหลังรวมต้นทุนแฝง</th>}
                <th className="py-2 text-right">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const grossProfit =
                  item.grossProfit ?? (item.basePrice ?? 0) - (item.currentUnitCost ?? 0);
                const grossMargin =
                  item.grossMarginPercent ??
                  (item.basePrice > 0 ? (grossProfit / item.basePrice) * 100 : null);
                const net = hasOverheadOverlay ? item.netProfitAfterOverheadPerUnit : null;
                const bottomLine = net != null ? net : grossProfit;
                const badge = profitBadge(bottomLine, item.basePrice);
                const costIncomplete =
                  !item.recipeComplete || NEEDS_REVIEW.has(item.costStatus ?? "");
                return (
                  <tr key={item.productId} className="border-t border-muted/80">
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-foreground">{item.name}</div>
                      {costIncomplete && (
                        <div className="text-[11px] text-warning">ต้นทุนยังไม่ครบ — ตัวเลขเป็นค่าประมาณ</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">{formatBaht(item.basePrice)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">{formatBaht(item.currentUnitCost)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">
                      {formatBaht(grossProfit)} • {percent(grossMargin)}
                    </td>
                    {hasOverheadOverlay && (
                      <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground">
                        {item.overheadPerUnit != null ? formatBaht(item.overheadPerUnit, true) : "—"}
                      </td>
                    )}
                    {hasOverheadOverlay && (
                      <td className="py-2.5 pr-2 text-right tabular-nums font-medium">
                        {net != null ? (
                          <span className={net >= 0 ? "text-success" : "text-destructive"}>
                            {formatBaht(net, true)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="py-2.5 text-right">
                      {badge ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="py-6 text-center text-sm text-muted-foreground">
                    ยังไม่มีเมนูสำหรับวางแผน โปรดเพิ่มเมนูและสูตรก่อนใช้งาน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
