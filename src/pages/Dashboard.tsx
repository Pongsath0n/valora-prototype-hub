import AppLayout from "@/components/AppLayout";
import DataQualityBadge from "@/components/DataQualityBadge";
import AssumptionsDrawer from "@/components/AssumptionsDrawer";
import InputAudit from "@/components/InputAudit";
import WarningAlert from "@/components/WarningAlert";
import { Target, TrendingUp, Coffee, DollarSign, BarChart3, Info } from "lucide-react";
import { shopService, fixedCostService, menuService } from "@/services/mockStorage";
import { calcBusinessKPIs, calcMenuMetrics } from "@/services/calculationEngine";
import { useMemo } from "react";

const statusLabel = (s: string) => {
  if (s === "good") return { text: "กำไรดี", cls: "status-badge-success" };
  if (s === "caution") return { text: "ควรระวัง", cls: "status-badge-warning" };
  return { text: "ขาดทุน", cls: "status-badge-danger" };
};

const KPI_ITEMS = (kpis: ReturnType<typeof calcBusinessKPIs>) => [
  { label: "จุดคุ้มทุน", value: isFinite(kpis.bepCupsMonth) ? kpis.bepCupsMonth.toLocaleString() : "N/A", unit: "แก้ว/เดือน", icon: Coffee },
  { label: "จุดคุ้มทุน", value: isFinite(kpis.bepCupsDay) ? kpis.bepCupsDay.toLocaleString() : "N/A", unit: "แก้ว/วัน", icon: Coffee },
  { label: "ยอดขายเพื่อกำไรเป้า", value: isFinite(kpis.requiredRevenueDay) ? `฿${kpis.requiredRevenueDay.toLocaleString()}` : "N/A", unit: "บาท/วัน", icon: DollarSign },
  { label: "กำไรสุทธิประมาณการ", value: isFinite(kpis.estNetProfit) ? `฿${kpis.estNetProfit.toLocaleString()}` : "N/A", unit: "บาท/เดือน", icon: TrendingUp },
  { label: "กำไรขั้นต้นเฉลี่ย", value: `฿${kpis.weightedCM.toFixed(1)}`, unit: "บาท/แก้ว", icon: BarChart3 },
];

export default function DashboardPage() {
  const shop = useMemo(() => shopService.get(), []);
  const fixedCostsTotal = useMemo(() => fixedCostService.total(), []);
  const menuRows = useMemo(() => menuService.get(), []);
  const menuWithMetrics = useMemo(() => menuRows.map(calcMenuMetrics), [menuRows]);
  const kpis = useMemo(
    () => calcBusinessKPIs(fixedCostsTotal, shop.targetProfit, shop.daysOpen, menuRows),
    [fixedCostsTotal, shop, menuRows]
  );
  const now = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">แดชบอร์ด</h1>
            <p className="page-subtitle">อัปเดตล่าสุด: {now}</p>
          </div>
          <DataQualityBadge level="estimated" lastChecked={now} />
        </div>

        {/* ── Daily Target Guidance ────────────────────── */}
        <div className="guidance-card">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                วันนี้คุณต้องขายประมาณ{" "}
                <span className="text-accent">
                  {isFinite(kpis.targetCupsDay) ? kpis.targetCupsDay : "N/A"} แก้ว/วัน
                </span>{" "}
                เพื่อให้ถึงกำไรเป้าหมาย
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                อิงจากเป้ากำไรสุทธิ ฿{shop.targetProfit.toLocaleString()}/เดือน
                และค่าใช้จ่ายคงที่ ฿{fixedCostsTotal.toLocaleString()}/เดือน
              </p>
            </div>
          </div>
        </div>

        {/* ── Warnings ─────────────────────────────────── */}
        {kpis.mixSum !== 100 && (
          <WarningAlert
            type="warning"
            title={`สัดส่วนยอดขาย (Mix%) รวมได้ ${kpis.mixSum}% ไม่เท่ากับ 100%`}
            description="ผลลัพธ์อาจคลาดเคลื่อน แนะนำให้ปรับ Mix% ให้รวมเป็น 100%"
            action={{ label: "ปรับใน Onboarding", onClick: () => window.location.href = "/onboarding" }}
          />
        )}
        {(!isFinite(kpis.weightedCM) || kpis.weightedCM <= 0) && (
          <WarningAlert
            type="error"
            title="กำไรขั้นต้นติดลบ — ราคาขายต่ำกว่าต้นทุน"
            description="ไม่สามารถคำนวณจุดคุ้มทุนได้ กรุณาตรวจสอบราคาและต้นทุนในหน้าตั้งค่าเมนู"
          />
        )}

        {/* ── KPI Cards ────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {KPI_ITEMS(kpis).map((kpi, i) => (
            <div key={i} className="kpi-card">
              <kpi.icon className="w-4 h-4 text-accent mb-2" />
              <p className="metric-label">{kpi.label}</p>
              <p className="metric-value mt-1">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.unit}</p>
            </div>
          ))}
        </div>

        {/* ── Input Audit ───────────────────────────────── */}
        <InputAudit
          lastUpdated={now}
          rows={[
            { label: "ชื่อร้าน", value: shop.name },
            { label: "ค่าใช้จ่ายคงที่รวม", value: `฿${fixedCostsTotal.toLocaleString()}`, unit: "/เดือน" },
            { label: "ราคาเฉลี่ยถ่วงน้ำหนัก", value: `฿${kpis.weightedPrice.toFixed(1)}`, unit: "/แก้ว" },
            { label: "ต้นทุนเฉลี่ยถ่วงน้ำหนัก", value: `฿${kpis.weightedCost.toFixed(1)}`, unit: "/แก้ว" },
            { label: "สัดส่วนยอดขาย (Mix%) รวม", value: `${kpis.mixSum}%` },
            { label: "จำนวนวันเปิดขาย", value: `${shop.daysOpen}`, unit: "วัน/เดือน" },
            { label: "เป้ากำไรสุทธิ", value: `฿${shop.targetProfit.toLocaleString()}`, unit: "/เดือน" },
          ]}
        />

        {/* ── Menu Metrics Table ────────────────────────── */}
        <div className="stat-card overflow-x-auto">
          <div className="panel-header">
            <h2 className="section-title">ตัวชี้วัดรายเมนู</h2>
            <DataQualityBadge level="estimated" lastChecked={now} />
          </div>
          <table className="data-table min-w-[680px]">
            <thead>
              <tr>
                <th>เมนู</th>
                <th className="text-right">ราคา (฿)</th>
                <th className="text-right">ต้นทุน/แก้ว (฿)</th>
                <th className="text-right">กำไรขั้นต้น/แก้ว (฿)</th>
                <th className="text-right">CM%</th>
                <th className="text-right">Mix%</th>
                <th className="text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {menuWithMetrics.map((m, i) => {
                const st = statusLabel(m.status);
                return (
                  <tr key={i}>
                    <td className="text-foreground font-medium">{m.name}</td>
                    <td className="text-right tabular-nums">{m.price.toFixed(0)}</td>
                    <td className="text-right tabular-nums">{m.totalCost.toFixed(1)}</td>
                    <td className="text-right tabular-nums font-medium">{m.grossProfit.toFixed(1)}</td>
                    <td className="text-right tabular-nums">{m.cmPercent.toFixed(1)}%</td>
                    <td className="text-right tabular-nums">{m.mix}%</td>
                    <td className="text-center">
                      <span className={`status-badge ${st.cls}`}>{st.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold text-foreground">
                <td className="pt-3">เฉลี่ยถ่วงน้ำหนัก</td>
                <td className="pt-3 text-right tabular-nums">{kpis.weightedPrice.toFixed(1)}</td>
                <td className="pt-3 text-right tabular-nums">{kpis.weightedCost.toFixed(1)}</td>
                <td className="pt-3 text-right tabular-nums">{kpis.weightedCM.toFixed(1)}</td>
                <td className="pt-3 text-right tabular-nums">
                  {kpis.weightedPrice > 0 ? ((kpis.weightedCM / kpis.weightedPrice) * 100).toFixed(1) : "N/A"}%
                </td>
                <td className="pt-3 text-right tabular-nums">{kpis.mixSum}%</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="mt-3 pt-3 border-t flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              CM% = กำไรขั้นต้น / ราคาขาย × 100 &nbsp;|&nbsp;
              สถานะ: กำไรดี (CM% ≥ 40%), ควรระวัง (CM% &lt; 40%), ขาดทุน (กำไรขั้นต้น ≤ 0)
            </span>
          </div>
        </div>

        {/* ── Methodology ──────────────────────────────── */}
        <AssumptionsDrawer
          inputSources={[
            "ค่าใช้จ่ายคงที่รายเดือน (กรอกในหน้า Onboarding → ค่าใช้จ่ายคงที่)",
            "ราคาขายและต้นทุนวัตถุดิบต่อแก้ว (กรอกในหน้า Onboarding → เมนูและต้นทุน)",
            "สัดส่วนยอดขาย (Mix%) แต่ละเมนู (กรอกในหน้า Onboarding → เมนูและต้นทุน)",
            "จำนวนวันเปิดขายต่อเดือน (กรอกในหน้า Onboarding → ข้อมูลร้าน)",
          ]}
          formulas={[
            { label: "กำไรขั้นต้นถ่วงน้ำหนัก (Weighted CM)", formula: "= ผลรวมของ (กำไรขั้นต้น/แก้ว × Mix%) ทุกเมนู" },
            { label: "จุดคุ้มทุน (แก้ว/เดือน)", formula: "= ค่าใช้จ่ายคงที่รวม / กำไรขั้นต้นถ่วงน้ำหนัก" },
            { label: "จุดคุ้มทุน (แก้ว/วัน)", formula: "= จุดคุ้มทุน (แก้ว/เดือน) / จำนวนวันเปิดขาย" },
            { label: "ยอดขายเพื่อกำไรเป้า (บาท/วัน)", formula: "= (ค่าใช้จ่ายคงที่ + เป้ากำไร) / Weighted CM / วันเปิดขาย × ราคาเฉลี่ยถ่วงน้ำหนัก" },
            { label: "กำไรสุทธิประมาณการ", formula: "= (แก้วเป้า/วัน × วันเปิดขาย × Weighted CM) - ค่าใช้จ่ายคงที่" },
          ]}
          assumptions={[
            { text: "ค่าใช้จ่ายคงที่เป็นค่าใช้จ่ายรายเดือนที่ไม่เปลี่ยนแปลงตามยอดขาย" },
            { text: "สัดส่วนยอดขาย (Mix%) เป็นค่าประมาณการ อาจแตกต่างจากยอดขายจริง" },
            { text: "ต้นทุนต่อแก้วยังไม่รวมค่าแรงผลิต ค่าน้ำ ค่าไฟ ที่ใช้ต่อแก้ว" },
            { text: "กำไรสุทธิไม่รวมภาษีและค่าใช้จ่ายพิเศษอื่นๆ" },
          ]}
        />

        {/* ── Footer ───────────────────────────────────── */}
        <p className="text-center text-xs text-muted-foreground pt-4 border-t">
          ข้อมูลนี้เป็นแบบจำลองเพื่อการวางแผน โปรดตรวจสอบต้นทุนจริงเป็นระยะ
        </p>
      </div>
    </AppLayout>
  );
}
