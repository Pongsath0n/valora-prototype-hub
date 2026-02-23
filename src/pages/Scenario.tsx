import AppLayout from "@/components/AppLayout";
import DataQualityBadge from "@/components/DataQualityBadge";
import AssumptionsDrawer from "@/components/AssumptionsDrawer";
import { useState } from "react";
import { Save, Clock, Info, FileText, Trash2 } from "lucide-react";

// Baseline data
const baselineData = {
  fixedCosts: 50000,
  targetProfit: 30000,
  daysOpen: 26,
  avgPrice: 71.1,
  avgCost: 28.9,
  weightedCM: 42.2,
};

interface SavedScenario {
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

let scenarioId = 3;

const now = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export default function ScenarioPage() {
  // Adjustable inputs
  const [fixedCosts, setFixedCosts] = useState(baselineData.fixedCosts);
  const [avgPrice, setAvgPrice] = useState(baselineData.avgPrice);
  const [avgCost, setAvgCost] = useState(baselineData.avgCost);
  const [daysOpen, setDaysOpen] = useState(baselineData.daysOpen);
  const [targetProfit, setTargetProfit] = useState(baselineData.targetProfit);
  const [scenarioNotes, setScenarioNotes] = useState("");

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([
    { id: 1, name: "ขึ้นราคา 5 บาท", timestamp: "20 ก.พ. 2569 14:30", fixedCosts: 50000, avgPrice: 76.1, avgCost: 28.9, daysOpen: 26, targetProfit: 30000, notes: "ทดสอบผลกระทบจากการขึ้นราคาเฉลี่ย 5 บาท" },
    { id: 2, name: "ลดค่าเช่า", timestamp: "18 ก.พ. 2569 10:15", fixedCosts: 40000, avgPrice: 71.1, avgCost: 28.9, daysOpen: 26, targetProfit: 30000, notes: "ย้ายไปทำเลถูกลง" },
  ]);

  // Calculations
  const cm = avgPrice - avgCost;
  const cmBaseline = baselineData.avgPrice - baselineData.avgCost;

  const calc = (fc: number, tp: number, cmVal: number, d: number, price: number) => {
    if (cmVal <= 0) return { bepMonth: Infinity, bepDay: Infinity, targetCupsDay: Infinity, revenueDay: Infinity, netProfit: -fc };
    const bepMonth = Math.ceil(fc / cmVal);
    const bepDay = Math.ceil(bepMonth / d);
    const targetCupsMonth = Math.ceil((fc + tp) / cmVal);
    const targetCupsDay = Math.ceil(targetCupsMonth / d);
    const revenueDay = Math.round(targetCupsDay * price);
    const netProfit = Math.round(targetCupsDay * d * cmVal - fc);
    return { bepMonth, bepDay, targetCupsDay, revenueDay, netProfit };
  };

  const baseline = calc(baselineData.fixedCosts, baselineData.targetProfit, cmBaseline, baselineData.daysOpen, baselineData.avgPrice);
  const scenario = calc(fixedCosts, targetProfit, cm, daysOpen, avgPrice);

  const diff = (a: number, b: number) => {
    const d = a - b;
    if (d === 0) return { text: "ไม่เปลี่ยนแปลง", cls: "text-muted-foreground" };
    const sign = d > 0 ? "+" : "";
    return { text: `${sign}${d.toLocaleString()}`, cls: d > 0 ? "text-destructive" : "text-success" };
  };

  const saveScenario = () => {
    const newScenario: SavedScenario = {
      id: scenarioId++,
      name: `สถานการณ์ ${scenarioId - 1}`,
      timestamp: now,
      fixedCosts,
      avgPrice,
      avgCost,
      daysOpen,
      targetProfit,
      notes: scenarioNotes,
    };
    setSavedScenarios([newScenario, ...savedScenarios]);
    setScenarioNotes("");
  };

  const deleteScenario = (id: number) => {
    setSavedScenarios(savedScenarios.filter((s) => s.id !== id));
  };

  const loadScenario = (s: SavedScenario) => {
    setFixedCosts(s.fixedCosts);
    setAvgPrice(s.avgPrice);
    setAvgCost(s.avgCost);
    setDaysOpen(s.daysOpen);
    setTargetProfit(s.targetProfit);
    setScenarioNotes(s.notes);
  };

  const kpiRows = [
    { label: "จุดคุ้มทุน (แก้ว/เดือน)", unit: "แก้ว", base: baseline.bepMonth, scen: scenario.bepMonth },
    { label: "จุดคุ้มทุน (แก้ว/วัน)", unit: "แก้ว", base: baseline.bepDay, scen: scenario.bepDay },
    { label: "ยอดขายเพื่อกำไรเป้า (แก้ว/วัน)", unit: "แก้ว", base: baseline.targetCupsDay, scen: scenario.targetCupsDay },
    { label: "รายได้ที่ต้องทำ (บาท/วัน)", unit: "฿", base: baseline.revenueDay, scen: scenario.revenueDay },
    { label: "กำไรสุทธิประมาณการ (บาท/เดือน)", unit: "฿", base: baseline.netProfit, scen: scenario.netProfit },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">จำลองสถานการณ์</h1>
          <p className="text-sm text-muted-foreground mt-1">ปรับตัวแปรและเปรียบเทียบผลลัพธ์กับข้อมูลปัจจุบัน</p>
        </div>

        <div className="guidance-card flex items-start gap-2">
          <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            การจำลองอ้างอิงจากข้อมูลที่กรอกล่าสุด ปรับค่าในฝั่งซ้ายและดูผลลัพธ์ฝั่งขวาทันที
          </p>
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
                    <label className="text-sm font-medium text-foreground">{s.label}</label>
                    <span className="text-xs text-muted-foreground">{s.unit}</span>
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
                <label className="text-sm font-medium text-foreground block mb-1.5">บันทึกช่วยจำ</label>
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
                <button
                  className="flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
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
                <DataQualityBadge level="estimated" />
              </div>

              {cm <= 0 && (
                <div className="mb-4 bg-destructive/5 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive font-medium">
                  กำไรขั้นต้นติดลบ — ราคาขายต่ำกว่าต้นทุน ไม่สามารถคำนวณจุดคุ้มทุนได้
                </div>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="pb-2 text-left font-medium">ตัวชี้วัด</th>
                    <th className="pb-2 text-right font-medium">ปัจจุบัน</th>
                    <th className="pb-2 text-right font-medium">จำลอง</th>
                    <th className="pb-2 text-right font-medium">ผลต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiRows.map((row, i) => {
                    const d = diff(row.scen, row.base);
                    const isInf = !isFinite(row.scen);
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2.5 text-foreground font-medium">{row.label}</td>
                        <td className="py-2.5 text-right tabular-nums">{row.unit === "฿" ? `฿${row.base.toLocaleString()}` : row.base.toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium">
                          {isInf ? "N/A" : row.unit === "฿" ? `฿${row.scen.toLocaleString()}` : row.scen.toLocaleString()}
                        </td>
                        <td className={`py-2.5 text-right tabular-nums text-xs font-medium ${d.cls}`}>
                          {isInf ? "-" : d.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Key differences */}
              {cm > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-semibold text-foreground mb-2">สรุปความแตกต่าง</h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {scenario.bepDay !== baseline.bepDay && (
                      <li>จุดคุ้มทุนรายวัน {scenario.bepDay > baseline.bepDay ? "เพิ่มขึ้น" : "ลดลง"} {Math.abs(scenario.bepDay - baseline.bepDay)} แก้ว/วัน</li>
                    )}
                    {scenario.netProfit !== baseline.netProfit && (
                      <li>กำไรสุทธิประมาณการ {scenario.netProfit > baseline.netProfit ? "เพิ่มขึ้น" : "ลดลง"} ฿{Math.abs(scenario.netProfit - baseline.netProfit).toLocaleString()}/เดือน</li>
                    )}
                    <li>กำไรขั้นต้น/แก้ว ฿{cm.toFixed(1)} (เดิม ฿{cmBaseline.toFixed(1)})</li>
                  </ul>
                </div>
              )}

              <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>อัปเดตล่าสุด: {now}</span>
              </div>
            </div>

            {/* Methodology */}
            <AssumptionsDrawer
              title="วิธีคำนวณ"
              inputSources={[
                "ค่าใช้จ่ายคงที่ (ปรับได้จากสไลเดอร์)",
                "ราคาและต้นทุนเฉลี่ยถ่วงน้ำหนัก (ปรับได้จากสไลเดอร์)",
                "เป้ากำไรสุทธิ (ปรับได้จากสไลเดอร์)",
              ]}
              formulas={[
                { label: "จุดคุ้มทุน", formula: "= ค่าใช้จ่ายคงที่ / กำไรขั้นต้นต่อแก้ว" },
                { label: "กำไรสุทธิ", formula: "= (แก้วเป้า/วัน x วันเปิดขาย x กำไรขั้นต้น/แก้ว) - ค่าใช้จ่ายคงที่" },
              ]}
              assumptions={[
                { text: "ใช้ราคาและต้นทุนเฉลี่ยถ่วงน้ำหนัก ไม่ใช่รายเมนู" },
                { text: "สมมติว่า Mix% ไม่เปลี่ยนแปลง" },
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

        <div className="text-center py-4 border-t">
          <p className="text-xs text-muted-foreground">ข้อมูลนี้เป็นแบบจำลองเพื่อการวางแผน โปรดตรวจสอบต้นทุนจริงเป็นระยะ</p>
        </div>
      </div>
    </AppLayout>
  );
}
