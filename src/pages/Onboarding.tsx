import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { CheckCircle2, Plus, Trash2, Info, Lightbulb, Eye, EyeOff } from "lucide-react";
import { shopService, fixedCostService, menuService } from "@/services/mockStorage";
import type { FixedCostRow, MenuRow } from "@/services/types";
import LogoBrand from "@/components/LogoBrand";


const defaultFixedCosts: FixedCostRow[] = [
  { id: 1, label: "ค่าเช่า", amount: 15000 },
  { id: 2, label: "ค่าแรง", amount: 25000 },
  { id: 3, label: "ค่าน้ำไฟ", amount: 5000 },
  { id: 4, label: "ค่าใช้จ่ายอื่น", amount: 5000 },
];

const defaultMenuRows: MenuRow[] = [
  { id: 1, name: "ลาเต้เย็น", price: 75, totalCost: 28.2, ingredientCost: 22, packagingCost: 4.2, deliveryFee: 2, mix: 28 },
  { id: 2, name: "คาปูชิโน่ร้อน", price: 65, totalCost: 27.2, ingredientCost: 21, packagingCost: 3.2, deliveryFee: 3, mix: 23 },
  { id: 3, name: "มัทฉะลาเต้", price: 85, totalCost: 38.0, ingredientCost: 30, packagingCost: 5, deliveryFee: 3, mix: 18 },
];

const steps = [
  { title: "ข้อมูลร้าน", desc: "ข้อมูลพื้นฐานและเป้าหมาย" },
  { title: "ค่าใช้จ่ายคงที่", desc: "รายจ่ายรายเดือนที่ไม่เปลี่ยนตามยอดขาย" },
  { title: "เมนูและต้นทุน", desc: "สินค้าและต้นทุนต่อหน่วย" },
];

let nextFixedId = 5;
let nextMenuId = 4;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Step 1 — initialise from localStorage so returning users see saved data
  const savedShop = shopService.get();
  const [shopName, setShopName] = useState(savedShop.name);
  const [daysOpen, setDaysOpen] = useState(savedShop.daysOpen);
  const [targetProfit, setTargetProfit] = useState(savedShop.targetProfit);

  // Step 2
  const [fixedCosts, setFixedCosts] = useState<FixedCostRow[]>(() => fixedCostService.get());

  // Step 3
  const [menuRows, setMenuRows] = useState<MenuRow[]>(() => menuService.get());
  const [detailedMode, setDetailedMode] = useState(false);

  // Persist all data to localStorage then navigate to dashboard
  const handleConfirm = () => {
    shopService.set({ name: shopName, daysOpen, targetProfit });
    fixedCostService.set(fixedCosts);
    menuService.set(menuRows);
    localStorage.setItem("valora:onboarded", "1");
    navigate("/app/dashboard");
  };


  // Step 2 handlers
  const addFixedCost = () => {
    setFixedCosts([...fixedCosts, { id: nextFixedId++, label: "", amount: 0 }]);
  };
  const removeFixedCost = (id: number) => {
    setFixedCosts(fixedCosts.filter((r) => r.id !== id));
  };
  const updateFixedCost = (id: number, field: keyof FixedCostRow, value: string | number) => {
    setFixedCosts(fixedCosts.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const loadDefaults = () => setFixedCosts(defaultFixedCosts);

  // Step 3 handlers
  const addMenuRow = () => {
    setMenuRows([...menuRows, { id: nextMenuId++, name: "", price: 0, totalCost: 0, ingredientCost: 0, packagingCost: 0, deliveryFee: 0, mix: 0 }]);
  };
  const removeMenuRow = (id: number) => {
    setMenuRows(menuRows.filter((r) => r.id !== id));
  };
  const updateMenuRow = (id: number, field: keyof MenuRow, value: string | number) => {
    setMenuRows(menuRows.map((r) => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (detailedMode && (field === "ingredientCost" || field === "packagingCost" || field === "deliveryFee")) {
        updated.totalCost = Number(updated.ingredientCost) + Number(updated.packagingCost) + Number(updated.deliveryFee);
      }
      return updated;
    }));
  };

  const totalFixed = fixedCosts.reduce((s, r) => s + Number(r.amount), 0);
  const mixSum = menuRows.reduce((s, r) => s + Number(r.mix), 0);

  const formatTHB = (n: number) => `฿${n.toLocaleString()}`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <LogoBrand size="md" />
          </div>
          <h1 className="text-2xl font-bold text-foreground leading-snug">ตั้งค่าร้านของคุณ</h1>
          <p className="text-sm text-muted-foreground mt-1">กรอกข้อมูลเพื่อให้ Valora คำนวณจุดคุ้มทุนและวางแผนกำไร</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  i < step ? "bg-success text-success-foreground cursor-pointer" :
                  i === step ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </button>
              <span className="hidden md:inline text-sm text-muted-foreground">{s.title}</span>
              {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        <div className="stat-card">
          {/* ===== STEP 1: ข้อมูลร้าน ===== */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="guidance-card flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">
                  ใช้เพื่อคำนวณยอดขายที่ต้องทำและจุดคุ้มทุนของร้าน
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">ชื่อร้าน</label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  maxLength={100}
                  className="form-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">จำนวนวันเปิดขาย/เดือน</label>
                  <input
                    type="number"
                    value={daysOpen}
                    onChange={(e) => setDaysOpen(Math.max(1, Math.min(31, Number(e.target.value))))}
                    min={1}
                    max={31}
                    className="form-input tabular-nums"
                  />
                  <p className="form-hint">1-31 วัน</p>
                </div>
                <div className="form-group">
                  <label className="form-label">เป้ากำไรสุทธิ์/เดือน (฿)</label>
                  <input
                    type="number"
                    value={targetProfit}
                    onChange={(e) => setTargetProfit(Math.max(0, Number(e.target.value)))}
                    min={0}
                    className="form-input tabular-nums"
                  />
                  <p className="form-hint">คำนวณจาก: รายได้ - ต้นทุน - ค่าใช้จ่ายคงที่</p>
                </div>
              </div>
            </div>
          )}

          {/* ===== STEP 2: ค่าใช้จ่ายคงที่ ===== */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="guidance-card flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">
                  ค่าใช้จ่ายคงที่คือรายจ่ายรายเดือนที่ไม่เปลี่ยนแปลงตามจำนวนแก้วที่ขาย เช่น ค่าเช่า ค่าแรง
                </p>
              </div>

              <div className="space-y-2">
                {fixedCosts.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateFixedCost(row.id, "label", e.target.value)}
                      placeholder="รายการ"
                      maxLength={50}
                      className="flex-1 px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">฿</span>
                      <input
                        type="number"
                        value={row.amount}
                        onChange={(e) => updateFixedCost(row.id, "amount", Number(e.target.value))}
                        min={0}
                        className="w-32 pl-7 pr-3 py-2 rounded-lg border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <button
                      onClick={() => removeFixedCost(row.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={addFixedCost}
                  className="flex items-center gap-1.5 text-sm text-accent font-medium hover:text-accent/80 transition-colors"
                >
                  <Plus className="w-4 h-4" /> เพิ่มรายการ
                </button>
                <button
                  onClick={loadDefaults}
                  className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  ตัวอย่างค่าใช้จ่ายมาตรฐานร้านกาแฟ
                </button>
              </div>

              <div className="pt-3 border-t flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">รวมค่าใช้จ่ายคงที่</span>
                <span className="font-bold tabular-nums text-foreground">{formatTHB(totalFixed)}/เดือน</span>
              </div>
            </div>
          )}

          {/* ===== STEP 3: เมนูและต้นทุน ===== */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="guidance-card flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">
                  กรอกเมนูหลักและต้นทุนต่อแก้ว Mix% คือสัดส่วนยอดขายที่คาดว่าแต่ละเมนูจะขายได้
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">โหมดกรอกข้อมูล</span>
                <button
                  onClick={() => setDetailedMode(!detailedMode)}
                  className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  {detailedMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {detailedMode ? "ใส่ข้อมูลขั้นต่ำ" : "ข้อมูลละเอียด"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-2 font-medium">เมนู</th>
                      <th className="pb-2 font-medium text-right">ราคา (฿)</th>
                      {detailedMode ? (
                        <>
                          <th className="pb-2 font-medium text-right">วัตถุดิบ</th>
                          <th className="pb-2 font-medium text-right">บรรจุภัณฑ์</th>
                          <th className="pb-2 font-medium text-right">ค่าเดลิเวอรี่</th>
                        </>
                      ) : (
                        <th className="pb-2 font-medium text-right">ต้นทุนรวม (฿)</th>
                      )}
                      <th className="pb-2 font-medium text-right">Mix%</th>
                      <th className="pb-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {menuRows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-1.5">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => updateMenuRow(row.id, "name", e.target.value)}
                            placeholder="ชื่อเมนู"
                            maxLength={50}
                            className="w-full min-w-[100px] px-2 py-1.5 rounded border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </td>
                        <td className="py-1.5">
                          <input
                            type="number"
                            value={row.price}
                            onChange={(e) => updateMenuRow(row.id, "price", Number(e.target.value))}
                            min={0}
                            className="w-20 px-2 py-1.5 rounded border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </td>
                        {detailedMode ? (
                          <>
                            <td className="py-1.5">
                              <input type="number" value={row.ingredientCost} onChange={(e) => updateMenuRow(row.id, "ingredientCost", Number(e.target.value))} min={0} className="w-20 px-2 py-1.5 rounded border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring" />
                            </td>
                            <td className="py-1.5">
                              <input type="number" value={row.packagingCost} onChange={(e) => updateMenuRow(row.id, "packagingCost", Number(e.target.value))} min={0} className="w-20 px-2 py-1.5 rounded border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring" />
                            </td>
                            <td className="py-1.5">
                              <input type="number" value={row.deliveryFee} onChange={(e) => updateMenuRow(row.id, "deliveryFee", Number(e.target.value))} min={0} className="w-20 px-2 py-1.5 rounded border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring" />
                            </td>
                          </>
                        ) : (
                          <td className="py-1.5">
                            <input
                              type="number"
                              value={row.totalCost}
                              onChange={(e) => updateMenuRow(row.id, "totalCost", Number(e.target.value))}
                              min={0}
                              className="w-20 px-2 py-1.5 rounded border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                        )}
                        <td className="py-1.5">
                          <input
                            type="number"
                            value={row.mix}
                            onChange={(e) => updateMenuRow(row.id, "mix", Number(e.target.value))}
                            min={0}
                            max={100}
                            className="w-16 px-2 py-1.5 rounded border bg-background text-foreground text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </td>
                        <td className="py-1.5">
                          <button onClick={() => removeMenuRow(row.id)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={addMenuRow}
                className="flex items-center gap-1.5 text-sm text-accent font-medium hover:text-accent/80 transition-colors"
              >
                <Plus className="w-4 h-4" /> เพิ่มเมนู
              </button>

              {mixSum !== 100 && mixSum > 0 && (
                <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/30 rounded-lg px-3 py-2">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Mix% รวม = {mixSum}% (ควรเท่ากับ 100%)</span>
                </div>
              )}
            </div>
          )}

          {/* ===== REVIEW SCREEN ===== */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="section-title">สรุปก่อนเริ่มใช้งาน</h2>
              <p className="text-sm text-muted-foreground">ตรวจสอบข้อมูลให้ถูกต้อง คุณสามารถกลับมาแก้ไขได้ภายหลังในหน้าตั้งค่า</p>

              <div className="space-y-3">
                <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                  <h4 className="font-semibold text-foreground">ข้อมูลร้าน</h4>
                  <div className="flex justify-between"><span className="text-muted-foreground">ชื่อร้าน</span><span className="font-medium text-foreground">{shopName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">วันเปิดขาย</span><span className="font-medium text-foreground tabular-nums">{daysOpen} วัน/เดือน</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">เป้ากำไรสุทธิ</span><span className="font-medium text-foreground tabular-nums">{formatTHB(targetProfit)}/เดือน</span></div>
                </div>

                <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                  <h4 className="font-semibold text-foreground">ค่าใช้จ่ายคงที่</h4>
                  {fixedCosts.map((r) => (
                    <div key={r.id} className="flex justify-between">
                      <span className="text-muted-foreground">{r.label || "ไม่ระบุชื่อ"}</span>
                      <span className="font-medium text-foreground tabular-nums">{formatTHB(Number(r.amount))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t font-semibold">
                    <span className="text-foreground">รวม</span>
                    <span className="text-foreground tabular-nums">{formatTHB(totalFixed)}/เดือน</span>
                  </div>
                </div>

                <div className="bg-muted rounded-lg p-4 text-sm">
                  <h4 className="font-semibold text-foreground mb-2">เมนูและต้นทุน ({menuRows.length} รายการ)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="pb-1 text-left font-medium">เมนู</th>
                          <th className="pb-1 text-right font-medium">ราคา</th>
                          <th className="pb-1 text-right font-medium">ต้นทุน</th>
                          <th className="pb-1 text-right font-medium">Mix%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {menuRows.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-1.5 text-foreground">{r.name || "-"}</td>
                            <td className="py-1.5 text-right tabular-nums">฿{Number(r.price).toFixed(0)}</td>
                            <td className="py-1.5 text-right tabular-nums">฿{Number(r.totalCost).toFixed(1)}</td>
                            <td className="py-1.5 text-right tabular-nums">{r.mix}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {mixSum !== 100 && (
                    <p className="text-xs text-warning mt-2">Mix% รวม = {mixSum}% (ควรเท่ากับ 100%)</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              ย้อนกลับ
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {step === 2 ? "ตรวจสอบข้อมูล" : "ถัดไป"}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                ยืนยันและเริ่มใช้งาน
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
