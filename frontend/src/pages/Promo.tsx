import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { Info, Calendar, Tag, Plus, X, Trash2, CheckCircle2 } from "lucide-react";
import { FormSelect } from "@/components/ui/form-select";

interface PromoRow {
  id: number;
  name: string;
  type: "ส่วนลด" | "แถมฟรี" | "ซื้อครบแถม";
  start: string;
  end: string;
  status: "กำลังดำเนินการ" | "กำลังจะเริ่ม" | "สิ้นสุดแล้ว";
  discountAmt: number;      // THB per redemption
  estRedemptions: number;   // estimated uses
  estRevenueLift: number;   // estimated extra revenue
}

const PROMO_KEY = "valora:promos";

const DEFAULT_PROMOS: PromoRow[] = [
  { id: 1, name: "ซื้อ 1 แถม 1 ลาเต้", type: "แถมฟรี", start: "1 มี.ค. 69", end: "7 มี.ค. 69", status: "กำลังจะเริ่ม", discountAmt: 75, estRedemptions: 28, estRevenueLift: 5600 },
  { id: 2, name: "ลด 15% เมนูร้อนทุกแก้ว", type: "ส่วนลด", start: "20 ก.พ. 69", end: "28 ก.พ. 69", status: "กำลังดำเนินการ", discountAmt: 10, estRedemptions: 145, estRevenueLift: 4200 },
  { id: 3, name: "แก้วที่ 2 ลดครึ่งราคา", type: "ส่วนลด", start: "10 ก.พ. 69", end: "16 ก.พ. 69", status: "สิ้นสุดแล้ว", discountAmt: 37, estRedemptions: 51, estRevenueLift: 6300 },
];

function load(): PromoRow[] {
  try {
    const raw = localStorage.getItem(PROMO_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_PROMOS;
  } catch {
    return DEFAULT_PROMOS;
  }
}
function persist(rows: PromoRow[]) {
  localStorage.setItem(PROMO_KEY, JSON.stringify(rows));
}

let nextId = 10;

const EMPTY_FORM = {
  name: "",
  type: "ส่วนลด" as PromoRow["type"],
  start: "",
  end: "",
  status: "กำลังจะเริ่ม" as PromoRow["status"],
  discountAmt: 0,
  estRedemptions: 0,
  estRevenueLift: 0,
};

const statusStyle = (s: string) => {
  if (s === "กำลังดำเนินการ") return "status-badge-success";
  if (s === "กำลังจะเริ่ม") return "status-badge-info";
  return "status-badge bg-muted text-muted-foreground";
};

export default function PromoPage() {
  const [promos, setPromos] = useState<PromoRow[]>(() => load());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saved, setSaved] = useState(false);

  const estCost = (p: PromoRow) => Math.round(p.discountAmt * p.estRedemptions);
  const roi = (p: PromoRow) => {
    const cost = estCost(p);
    if (cost === 0) return null;
    return (((p.estRevenueLift - cost) / cost) * 100).toFixed(0);
  };

  const handleCreate = () => {
    const newPromo: PromoRow = { ...form, id: nextId++ };
    const updated = [newPromo, ...promos];
    setPromos(updated);
    persist(updated);
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleDelete = (id: number) => {
    const updated = promos.filter((p) => p.id !== id);
    setPromos(updated);
    persist(updated);
  };

  const f = (key: keyof typeof form, val: string | number) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          หน้านี้เป็นต้นแบบสำหรับทดสอบภายใน (prototype) — ข้อมูลเป็นตัวอย่างที่เก็บในเครื่องนี้เท่านั้น ยังไม่เชื่อมต่อข้อมูลจริง และจะไม่แสดงในเวอร์ชันใช้งานจริง
        </div>
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">โปรโมชัน</h1>
            <p className="page-subtitle">จัดการโปรโมชันและดูผลตอบแทนโดยประมาณ</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success font-medium">
                <CheckCircle2 className="w-4 h-4" /> บันทึกแล้ว
              </span>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Plus className="w-4 h-4" /> สร้างโปรโมชัน
            </button>
          </div>
        </div>

        <div className="guidance-card">
          <p className="text-sm text-foreground">
            ระบบคำนวณ <strong>ต้นทุนโปรโมชัน = มูลค่าส่วนลด/แก้ว × จำนวนครั้งที่ใช้จริง (ประมาณการ)</strong>
            และ ROI จากรายได้ที่เพิ่มขึ้นเทียบกับต้นทุน
          </p>
        </div>

        {/* Create Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-base font-semibold text-foreground">สร้างโปรโมชันใหม่</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Name */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">ชื่อโปรโมชัน *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => f("name", e.target.value)}
                    placeholder="เช่น ซื้อ 1 แถม 1 ลาเต้"
                    className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Type + Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">ประเภท</label>
                    <FormSelect
                      value={form.type}
                      onValueChange={(value) => f("type", value)}
                      options={[
                        { value: "ส่วนลด", label: "ส่วนลด" },
                        { value: "แถมฟรี", label: "แถมฟรี" },
                        { value: "ซื้อครบแถม", label: "ซื้อครบแถม" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">สถานะ</label>
                    <FormSelect
                      value={form.status}
                      onValueChange={(value) => f("status", value)}
                      options={[
                        { value: "กำลังจะเริ่ม", label: "กำลังจะเริ่ม" },
                        { value: "กำลังดำเนินการ", label: "กำลังดำเนินการ" },
                        { value: "สิ้นสุดแล้ว", label: "สิ้นสุดแล้ว" },
                      ]}
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">วันเริ่มต้น</label>
                    <input
                      type="text"
                      value={form.start}
                      onChange={(e) => f("start", e.target.value)}
                      placeholder="เช่น 1 มี.ค. 69"
                      className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">วันสิ้นสุด</label>
                    <input
                      type="text"
                      value={form.end}
                      onChange={(e) => f("end", e.target.value)}
                      placeholder="เช่น 7 มี.ค. 69"
                      className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                {/* Cost / Redemptions / Revenue */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      มูลค่าส่วนลด/ครั้ง (฿)
                    </label>
                    <input
                      type="number"
                      value={form.discountAmt}
                      onChange={(e) => f("discountAmt", Number(e.target.value))}
                      min={0}
                      className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      จำนวนครั้ง (ประมาณการ)
                    </label>
                    <input
                      type="number"
                      value={form.estRedemptions}
                      onChange={(e) => f("estRedemptions", Number(e.target.value))}
                      min={0}
                      className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      รายได้ที่เพิ่ม (฿ ประมาณการ)
                    </label>
                    <input
                      type="number"
                      value={form.estRevenueLift}
                      onChange={(e) => f("estRevenueLift", Number(e.target.value))}
                      min={0}
                      className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                {/* Preview calc */}
                {form.discountAmt > 0 && form.estRedemptions > 0 && (
                  <div className="bg-muted rounded-lg px-4 py-3 text-sm space-y-1">
                    <p className="font-medium text-foreground">สรุปประมาณการ</p>
                    <p className="text-muted-foreground">
                      ต้นทุนโปรโมชัน: <span className="text-foreground font-medium tabular-nums">
                        ฿{(form.discountAmt * form.estRedemptions).toLocaleString()}
                      </span>
                    </p>
                    {form.estRevenueLift > 0 && (
                      <p className="text-muted-foreground">
                        ROI ประมาณการ: <span className={`font-medium tabular-nums ${
                          form.estRevenueLift > form.discountAmt * form.estRedemptions ? "text-success" : "text-destructive"
                        }`}>
                          {(((form.estRevenueLift - form.discountAmt * form.estRedemptions) / (form.discountAmt * form.estRedemptions)) * 100).toFixed(0)}%
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.name.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  สร้างโปรโมชัน
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Promo List */}
        <div className="space-y-3">
          {promos.length === 0 && (
            <div className="empty-state">
              <Tag className="empty-state-icon" />
              <p className="empty-state-title">ยังไม่มีโปรโมชัน</p>
              <p className="empty-state-desc">กดปุ่ม &ldquo;สร้างโปรโมชัน&rdquo; เพื่อเริ่มต้น</p>
            </div>
          )}
          {promos.map((promo) => (
            <div
              key={promo.id}
              className="stat-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setExpanded(expanded === promo.id ? null : promo.id)}
                >
                  <h3 className="font-semibold text-foreground">{promo.name}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {promo.type}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {promo.start} - {promo.end}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`status-badge ${statusStyle(promo.status)}`}>
                    {promo.status}
                  </span>
                  <button
                    onClick={() => handleDelete(promo.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {expanded === promo.id && (
                <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="metric-label">ต้นทุนโปรโมชัน (ประมาณการ)</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">฿{estCost(promo).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">฿{promo.discountAmt}/ครั้ง × {promo.estRedemptions} ครั้ง</p>
                  </div>
                  <div>
                    <p className="metric-label">รายได้ที่เพิ่ม (ประมาณการ)</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">฿{promo.estRevenueLift.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="metric-label">ROI</p>
                    {roi(promo) !== null ? (
                      <p className={`text-lg font-bold tabular-nums ${Number(roi(promo)) >= 0 ? "text-success" : "text-destructive"}`}>
                        {roi(promo)}%
                      </p>
                    ) : (
                      <p className="text-lg font-bold text-muted-foreground">N/A</p>
                    )}
                  </div>
                  <div>
                    <p className="metric-label">กำไรสุทธิจากโปรโมชัน</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      ฿{(promo.estRevenueLift - estCost(promo)).toLocaleString()}
                    </p>
                  </div>
                  <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    <span>
                      {promo.status === "สิ้นสุดแล้ว"
                        ? "ตัวเลขเป็นผลลัพธ์จริงจากข้อมูลการขาย"
                        : "ตัวเลขเป็นค่าประมาณการจากที่กรอกไว้"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground pt-4 border-t">
          ตัวเลขทั้งหมดเป็นประมาณการเพื่อการวางแผน ควรตรวจสอบกับยอดขายจริงหลังสิ้นสุดโปรโมชัน
        </p>
      </div>
    </AppLayout>
  );
}
