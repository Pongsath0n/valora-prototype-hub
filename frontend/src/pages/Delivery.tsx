import AppLayout from "@/components/AppLayout";
import { useState, useMemo } from "react";
import { Info, Plus, Trash2, Save, CheckCircle2 } from "lucide-react";

interface PlatformRow {
  id: number;
  name: string;
  orders: number;
  revenue: number;
  commissionPct: number; // e.g. 30 = 30%
}

const DELIVERY_KEY = "valora:delivery";

const DEFAULT_PLATFORMS: PlatformRow[] = [
  { id: 1, name: "Grab Food", orders: 234, revenue: 18720, commissionPct: 30 },
  { id: 2, name: "LINE MAN", orders: 189, revenue: 14175, commissionPct: 27 },
  { id: 3, name: "Shopee Food", orders: 95, revenue: 7600, commissionPct: 25 },
  { id: 4, name: "หน้าร้าน", orders: 412, revenue: 28840, commissionPct: 0 },
];

function loadPlatforms(): PlatformRow[] {
  try {
    const raw = localStorage.getItem(DELIVERY_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_PLATFORMS;
  } catch {
    return DEFAULT_PLATFORMS;
  }
}

let nextId = 10;

export default function DeliveryPage() {
  const [platforms, setPlatforms] = useState<PlatformRow[]>(() => loadPlatforms());
  const [saved, setSaved] = useState(false);

  const update = (id: number, field: keyof PlatformRow, val: string | number) => {
    setPlatforms((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: field === "name" ? val : Number(val) } : p))
    );
    setSaved(false);
  };

  const add = () => {
    setPlatforms((prev) => [
      ...prev,
      { id: nextId++, name: "", orders: 0, revenue: 0, commissionPct: 0 },
    ]);
    setSaved(false);
  };

  const remove = (id: number) => {
    setPlatforms((prev) => prev.filter((p) => p.id !== id));
    setSaved(false);
  };

  const save = () => {
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(platforms));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const rows = useMemo(
    () =>
      platforms.map((p) => ({
        ...p,
        netRevenue: Math.round(p.revenue * (1 - p.commissionPct / 100)),
        avgTicket: p.orders > 0 ? Math.round(p.revenue / p.orders) : 0,
        commissionAmt: Math.round(p.revenue * (p.commissionPct / 100)),
      })),
    [platforms]
  );

  const totals = useMemo(
    () => ({
      orders: rows.reduce((s, r) => s + r.orders, 0),
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      netRevenue: rows.reduce((s, r) => s + r.netRevenue, 0),
      commissionAmt: rows.reduce((s, r) => s + r.commissionAmt, 0),
    }),
    [rows]
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          หน้านี้เป็นต้นแบบสำหรับทดสอบภายใน (prototype) — ข้อมูลเป็นตัวอย่างที่เก็บในเครื่องนี้เท่านั้น ยังไม่เชื่อมต่อข้อมูลจริง และจะไม่แสดงในเวอร์ชันใช้งานจริง
        </div>
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">ช่องทางจัดส่ง</h1>
            <p className="page-subtitle">กรอกข้อมูลจริงของแต่ละแพลตฟอร์ม — ระบบคำนวณรายได้สุทธิ์ให้อัตโนมัติ</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" /> เพิ่มแพลตฟอร์ม
            </button>
            <button
              onClick={save}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                saved
                  ? "bg-success/10 text-success"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {saved ? (
                <><CheckCircle2 className="w-4 h-4" /> บันทึกแล้ว</>
              ) : (
                <><Save className="w-4 h-4" /> บันทึก</>
              )}
            </button>
          </div>
        </div>

        <div className="guidance-card">
          <p className="text-sm text-foreground">
            กรอก <strong>จำนวนออเดอร์</strong>, <strong>รายได้รวม (฿)</strong> และ <strong>% ค่าคอมมิชชัน</strong> ของแต่ละแพลตฟอร์ม
            — ระบบคำนวณรายได้สุทธิและค่าเฉลี่ยต่อบิลให้อัตโนมัติ
          </p>
        </div>

        {/* Editable Table */}
        <div className="stat-card overflow-x-auto">
          <div className="panel-header">
            <h2 className="section-title">ข้อมูลช่องทางจัดส่ง</h2>
          </div>
          <table className="data-table min-w-[700px]">
            <thead>
              <tr>
                <th>แพลตฟอร์ม</th>
                <th className="text-right">ออเดอร์/เดือน</th>
                <th className="text-right">รายได้รวม (฿)</th>
                <th className="text-right">ค่าคอมฯ (%)</th>
                <th className="text-right">ค่าคอมฯ (฿)</th>
                <th className="text-right">รายได้สุทธิ์ (฿)</th>
                <th className="text-right">เฉลี่ย/บิล (฿)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => update(r.id, "name", e.target.value)}
                      placeholder="ชื่อแพลตฟอร์ม"
                      className="w-full px-2 py-1.5 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className="py-2 pl-2">
                    <input
                      type="number"
                      value={r.orders}
                      onChange={(e) => update(r.id, "orders", e.target.value)}
                      min={0}
                      className="w-24 px-2 py-1.5 rounded-md border bg-background text-foreground text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className="py-2 pl-2">
                    <input
                      type="number"
                      value={r.revenue}
                      onChange={(e) => update(r.id, "revenue", e.target.value)}
                      min={0}
                      className="w-28 px-2 py-1.5 rounded-md border bg-background text-foreground text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className="py-2 pl-2">
                    <input
                      type="number"
                      value={r.commissionPct}
                      onChange={(e) => update(r.id, "commissionPct", e.target.value)}
                      min={0}
                      max={100}
                      step={0.5}
                      className="w-20 px-2 py-1.5 rounded-md border bg-background text-foreground text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground text-sm">
                    {r.commissionAmt.toLocaleString()}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums font-medium text-sm">
                    {r.netRevenue.toLocaleString()}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-sm">
                    ฿{r.avgTicket.toLocaleString()}
                  </td>
                  <td className="py-2 pl-2">
                    <button
                      onClick={() => remove(r.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="pt-3 text-foreground">รวมทุกช่องทาง</td>
                <td className="pt-3 text-right tabular-nums">{totals.orders.toLocaleString()}</td>
                <td className="pt-3 text-right tabular-nums">฿{totals.revenue.toLocaleString()}</td>
                <td />
                <td className="pt-3 text-right tabular-nums text-muted-foreground">
                  ฿{totals.commissionAmt.toLocaleString()}
                </td>
                <td className="pt-3 text-right tabular-nums">฿{totals.netRevenue.toLocaleString()}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>

          <div className="mt-4 pt-3 border-t flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              รายได้สุทธิ = รายได้รวม × (1 - ค่าคอมมิชชัน%) | ยังไม่หักต้นทุนวัตถุดิบ |
              กดปุ่ม "บันทึก" เพื่อเก็บข้อมูลไว้ในอุปกรณ์นี้
            </span>
          </div>
        </div>

        {/* Net Revenue Insight */}
        {totals.revenue > 0 && (
          <div className="stat-card">
            <div className="panel-header">
            <h2 className="section-title">สรุปภาพรวม</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="metric-label">รายได้รวมทุกช่องทาง</p>
                <p className="metric-value mt-1">฿{totals.revenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">/เดือน</p>
              </div>
              <div>
                <p className="metric-label">ค่าคอมมิชชันรวม</p>
                <p className="metric-value mt-1 text-destructive">฿{totals.commissionAmt.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {totals.revenue > 0
                    ? `${((totals.commissionAmt / totals.revenue) * 100).toFixed(1)}% ของรายได้รวม`
                    : "-"}
                </p>
              </div>
              <div>
                <p className="metric-label">รายได้สุทธิหลังหักคอมฯ</p>
                <p className="metric-value mt-1">฿{totals.netRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">/เดือน</p>
              </div>
              <div>
                <p className="metric-label">ออเดอร์รวม</p>
                <p className="metric-value mt-1">{totals.orders.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  รายการ/เดือน
                  {totals.orders > 0 && ` (~${Math.round(totals.orders / 26)} รายการ/วัน)`}
                </p>
              </div>
            </div>

            {/* Best platform */}
            {rows.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  ช่องทางที่คุ้มค่าที่สุด (รายได้สุทธิสูงสุด):{" "}
                  <strong className="text-foreground">
                    {rows.reduce((best, r) => (r.netRevenue > best.netRevenue ? r : best), rows[0])
                      .name || "—"}
                  </strong>
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4 border-t">
          ข้อมูลนี้เป็นแบบจำลองเพื่อการวางแผน อัปเดตตัวเลขจริงทุกสิ้นเดือน
        </p>
      </div>
    </AppLayout>
  );
}
