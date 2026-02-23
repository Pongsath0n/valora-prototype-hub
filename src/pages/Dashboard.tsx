import AppLayout from "@/components/AppLayout";
import DataQualityBadge from "@/components/DataQualityBadge";
import AssumptionsDrawer from "@/components/AssumptionsDrawer";
import InputAudit from "@/components/InputAudit";
import WarningAlert from "@/components/WarningAlert";
import { Target, TrendingUp, Coffee, DollarSign, BarChart3, Info } from "lucide-react";

// --- Realistic Thai cafe demo data ---
const fixedCosts = 50000; // rent 15k + labor 25k + utilities 5k + other 5k
const targetProfit = 30000;
const daysOpen = 26;

const menuItems = [
  { name: "ลาเต้เย็น", price: 75, costPerCup: 28.2, mix: 28 },
  { name: "คาปูชิโน่ร้อน", price: 65, costPerCup: 27.2, mix: 23 },
  { name: "มัทฉะลาเต้", price: 85, costPerCup: 38.0, mix: 18 },
  { name: "อเมริกาโน่", price: 55, costPerCup: 17.5, mix: 17 },
  { name: "ชาเขียวนม", price: 75, costPerCup: 35.5, mix: 14 },
];

// Calculations
const menuWithMetrics = menuItems.map((m) => {
  const grossProfit = m.price - m.costPerCup;
  const cmPercent = (grossProfit / m.price) * 100;
  let status: "good" | "caution" | "loss" = "good";
  if (cmPercent < 40) status = "caution";
  if (grossProfit <= 0) status = "loss";
  return { ...m, grossProfit, cmPercent, status };
});

const weightedCM =
  menuWithMetrics.reduce((sum, m) => sum + m.grossProfit * (m.mix / 100), 0);
const weightedPrice =
  menuWithMetrics.reduce((sum, m) => sum + m.price * (m.mix / 100), 0);

const bepCupsMonth = Math.ceil(fixedCosts / weightedCM);
const bepCupsDay = Math.ceil(bepCupsMonth / daysOpen);
const targetCupsMonth = Math.ceil((fixedCosts + targetProfit) / weightedCM);
const targetCupsDay = Math.ceil(targetCupsMonth / daysOpen);
const requiredRevenueDay = Math.round(targetCupsDay * weightedPrice);
const estNetProfit = Math.round(targetCupsDay * daysOpen * weightedCM - fixedCosts);

const mixSum = menuItems.reduce((s, m) => s + m.mix, 0);

const statusLabel = (s: string) => {
  if (s === "good") return { text: "กำไรดี", cls: "bg-success/10 text-success" };
  if (s === "caution") return { text: "ควรระวัง", cls: "bg-warning/10 text-warning" };
  return { text: "ขาดทุน", cls: "bg-destructive/10 text-destructive" };
};

const now = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ===== A) FRIENDLY GUIDANCE AREA ===== */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">แดชบอร์ด</h1>
          <p className="timestamp mt-1">อัปเดตล่าสุด: {now}</p>
        </div>

        <div className="guidance-card">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                วันนี้คุณต้องขายประมาณ {targetCupsDay} แก้ว/วัน เพื่อให้ถึงกำไรเป้าหมาย
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                อิงจากเป้ากำไรสุทธิ ฿{targetProfit.toLocaleString()}/เดือน
                และค่าใช้จ่ายคงที่ ฿{fixedCosts.toLocaleString()}/เดือน
                คำนวณจากราคาเฉลี่ยถ่วงน้ำหนักและต้นทุนเฉลี่ยถ่วงน้ำหนักตาม Mix%
              </p>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {mixSum !== 100 && (
          <WarningAlert
            type="warning"
            title={`สัดส่วนยอดขาย (Mix%) รวมได้ ${mixSum}% ไม่เท่ากับ 100%`}
            description="ผลลัพธ์อาจคลาดเคลื่อน แนะนำให้ปรับ Mix% ให้รวมเป็น 100%"
            action={{ label: "ปรับ Mix% อัตโนมัติ", onClick: () => {} }}
          />
        )}

        {/* ===== B) FORMAL ANALYTICS AREA ===== */}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              label: "จุดคุ้มทุน",
              value: bepCupsMonth.toLocaleString(),
              unit: "แก้ว/เดือน",
              icon: Coffee,
            },
            {
              label: "จุดคุ้มทุน",
              value: bepCupsDay.toLocaleString(),
              unit: "แก้ว/วัน",
              icon: Coffee,
            },
            {
              label: "ยอดขายเพื่อกำไรเป้า",
              value: `฿${requiredRevenueDay.toLocaleString()}`,
              unit: "บาท/วัน",
              icon: DollarSign,
            },
            {
              label: "กำไรสุทธิประมาณการ",
              value: `฿${estNetProfit.toLocaleString()}`,
              unit: "บาท/เดือน",
              icon: TrendingUp,
            },
            {
              label: "กำไรขั้นต้นเฉลี่ย",
              value: `฿${weightedCM.toFixed(1)}`,
              unit: "บาท/แก้ว",
              icon: BarChart3,
            },
          ].map((kpi, i) => (
            <div key={i} className="stat-card relative">
              <div className="absolute top-3 right-3">
                <DataQualityBadge level="estimated" />
              </div>
              <kpi.icon className="w-5 h-5 text-accent mb-2" />
              <p className="metric-label">{kpi.label}</p>
              <p className="metric-value mt-1">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.unit}</p>
            </div>
          ))}
        </div>

        {/* Input Audit */}
        <InputAudit
          lastUpdated={now}
          rows={[
            { label: "ค่าใช้จ่ายคงที่รวม", value: `฿${fixedCosts.toLocaleString()}`, unit: "/เดือน" },
            { label: "ราคาเฉลี่ยถ่วงน้ำหนัก", value: `฿${weightedPrice.toFixed(1)}`, unit: "/แก้ว" },
            { label: "ต้นทุนเฉลี่ยถ่วงน้ำหนัก", value: `฿${(weightedPrice - weightedCM).toFixed(1)}`, unit: "/แก้ว" },
            { label: "สัดส่วนยอดขาย (Mix%) รวม", value: `${mixSum}%` },
            { label: "จำนวนวันเปิดขาย", value: `${daysOpen}`, unit: "วัน/เดือน" },
            { label: "เป้ากำไรสุทธิ", value: `฿${targetProfit.toLocaleString()}`, unit: "/เดือน" },
          ]}
        />

        {/* Menu Metrics Table */}
        <div className="stat-card overflow-x-auto">
          <div className="panel-header">
            <h2 className="section-title">ตัวชี้วัดรายเมนู</h2>
            <DataQualityBadge level="estimated" lastChecked="23 ก.พ. 69" />
          </div>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2 font-medium">เมนู</th>
                <th className="pb-2 font-medium text-right">ราคา (฿)</th>
                <th className="pb-2 font-medium text-right">ต้นทุน/แก้ว (฿)</th>
                <th className="pb-2 font-medium text-right">กำไรขั้นต้น/แก้ว (฿)</th>
                <th className="pb-2 font-medium text-right">CM%</th>
                <th className="pb-2 font-medium text-right">Mix%</th>
                <th className="pb-2 font-medium text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {menuWithMetrics.map((m, i) => {
                const st = statusLabel(m.status);
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2.5 text-foreground font-medium">{m.name}</td>
                    <td className="py-2.5 text-right tabular-nums">{m.price.toFixed(0)}</td>
                    <td className="py-2.5 text-right tabular-nums">{m.costPerCup.toFixed(1)}</td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{m.grossProfit.toFixed(1)}</td>
                    <td className="py-2.5 text-right tabular-nums">{m.cmPercent.toFixed(1)}%</td>
                    <td className="py-2.5 text-right tabular-nums">{m.mix}%</td>
                    <td className="py-2.5 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                        {st.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="pt-2.5 text-foreground">เฉลี่ยถ่วงน้ำหนัก</td>
                <td className="pt-2.5 text-right tabular-nums">{weightedPrice.toFixed(1)}</td>
                <td className="pt-2.5 text-right tabular-nums">{(weightedPrice - weightedCM).toFixed(1)}</td>
                <td className="pt-2.5 text-right tabular-nums">{weightedCM.toFixed(1)}</td>
                <td className="pt-2.5 text-right tabular-nums">{((weightedCM / weightedPrice) * 100).toFixed(1)}%</td>
                <td className="pt-2.5 text-right tabular-nums">{mixSum}%</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>CM% = กำไรขั้นต้น / ราคาขาย x 100 | สถานะ: กำไรดี (CM% ≥ 40%), ควรระวัง (CM% &lt; 40%), ขาดทุน (กำไรขั้นต้น ≤ 0)</span>
          </div>
        </div>

        {/* Methodology Panel */}
        <AssumptionsDrawer
          inputSources={[
            "ค่าใช้จ่ายคงที่รายเดือน (กรอกในหน้าตั้งค่า)",
            "ราคาขายและต้นทุนวัตถุดิบต่อแก้ว (กรอกในหน้าตั้งค่าเมนู)",
            "สัดส่วนยอดขาย (Mix%) แต่ละเมนู (ประมาณการจากข้อมูลที่กรอก)",
            "จำนวนวันเปิดขายต่อเดือน (กรอกในหน้าตั้งค่า)",
          ]}
          formulas={[
            {
              label: "กำไรขั้นต้นถ่วงน้ำหนัก (Weighted CM)",
              formula: "= ผลรวมของ (กำไรขั้นต้น/แก้ว x Mix%) ทุกเมนู",
            },
            {
              label: "จุดคุ้มทุน (แก้ว/เดือน)",
              formula: "= ค่าใช้จ่ายคงที่รวม / กำไรขั้นต้นถ่วงน้ำหนัก",
            },
            {
              label: "จุดคุ้มทุน (แก้ว/วัน)",
              formula: "= จุดคุ้มทุน (แก้ว/เดือน) / จำนวนวันเปิดขาย",
            },
            {
              label: "ยอดขายเพื่อกำไรเป้า (บาท/วัน)",
              formula: "= (ค่าใช้จ่ายคงที่ + เป้ากำไร) / กำไรขั้นต้นถ่วงน้ำหนัก / วันเปิดขาย x ราคาเฉลี่ยถ่วงน้ำหนัก",
            },
            {
              label: "กำไรสุทธิประมาณการ",
              formula: "= (จำนวนแก้วเป้า/วัน x วันเปิดขาย x กำไรขั้นต้นถ่วงน้ำหนัก) - ค่าใช้จ่ายคงที่",
            },
          ]}
          assumptions={[
            { text: "ค่าใช้จ่ายคงที่เป็นค่าใช้จ่ายรายเดือนที่ไม่เปลี่ยนแปลงตามยอดขาย" },
            { text: "สัดส่วนยอดขาย (Mix%) เป็นค่าประมาณการ อาจแตกต่างจากยอดขายจริง" },
            { text: "ต้นทุนต่อแก้วยังไม่รวมค่าแรงผลิต ค่าน้ำ ค่าไฟ ที่ใช้ต่อแก้ว" },
            { text: "กำไรสุทธิไม่รวมภาษีและค่าใช้จ่ายพิเศษอื่นๆ" },
          ]}
        />

        {/* Footer disclaimer */}
        <div className="text-center py-4 border-t">
          <p className="text-xs text-muted-foreground">
            ข้อมูลนี้เป็นแบบจำลองเพื่อการวางแผน โปรดตรวจสอบต้นทุนจริงเป็นระยะ
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
