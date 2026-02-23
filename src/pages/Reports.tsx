import AppLayout from "@/components/AppLayout";
import DataQualityBadge from "@/components/DataQualityBadge";
import { useState, useRef, useMemo } from "react";
import { Download, Share2, FileText, Printer, Info, Clock, CheckCircle2 } from "lucide-react";
import { shopService, fixedCostService, menuService } from "@/services/mockStorage";
import { calcBusinessKPIs, calcMenuMetrics } from "@/services/calculationEngine";

export default function ReportsPage() {
  const [showPreview, setShowPreview] = useState(true);
  const [shareMsg, setShareMsg] = useState("");
  const [pngLoading, setPngLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const shop = useMemo(() => shopService.get(), []);
  const fixedCostsRows = useMemo(() => fixedCostService.get(), []);
  const fixedCostsTotal = useMemo(() => fixedCostService.total(), []);
  const menuRows = useMemo(() => menuService.get(), []);

  const kpis = useMemo(
    () => calcBusinessKPIs(fixedCostsTotal, shop.targetProfit, shop.daysOpen, menuRows),
    [fixedCostsTotal, shop, menuRows]
  );
  const menuWithMetrics = useMemo(() => menuRows.map(calcMenuMetrics), [menuRows]);

  const now = new Date().toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });

  // ─── Export handlers ────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  const handlePNG = async () => {
    if (!reportRef.current) return;
    setPngLoading(true);
    try {
      // Load html2canvas from CDN at runtime — no npm install needed
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      document.head.appendChild(script);
      await new Promise((res) => { script.onload = res; });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = await (window as any).html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `valora-report-${shop.name}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
      alert("ดาวน์โหลด PNG ไม่สำเร็จ — ลองอีกครั้ง");
    } finally {
      setPngLoading(false);
    }
  };

  const handleShare = () => {
    const payload = {
      shop: shop.name,
      bepDay: kpis.bepCupsDay,
      targetCupsDay: kpis.targetCupsDay,
      estNetProfit: kpis.estNetProfit,
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    const url = `${window.location.origin}/app/reports?data=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareMsg("คัดลอกลิงก์แล้ว");
      setTimeout(() => setShareMsg(""), 3000);
    }).catch(() => {
      // Fallback: show url in prompt
      prompt("คัดลอกลิงก์ด้านล่าง:", url);
    });
  };

  const fmtVal = (v: number, prefix = "") =>
    isFinite(v) ? `${prefix}${v.toLocaleString()}` : "N/A";

  const kpiSummary = [
    { label: "ค่าใช้จ่ายคงที่", value: `฿${fixedCostsTotal.toLocaleString()}`, unit: "/เดือน" },
    { label: "จุดคุ้มทุน", value: fmtVal(kpis.bepCupsMonth), unit: "แก้ว/เดือน" },
    { label: "จุดคุ้มทุน", value: fmtVal(kpis.bepCupsDay), unit: "แก้ว/วัน" },
    { label: "ยอดขายเพื่อกำไรเป้า", value: fmtVal(kpis.requiredRevenueDay, "฿"), unit: "/วัน" },
    { label: "กำไรสุทธิประมาณการ", value: fmtVal(kpis.estNetProfit, "฿"), unit: "/เดือน" },
    { label: "กำไรขั้นต้นเฉลี่ย", value: `฿${kpis.weightedCM.toFixed(1)}`, unit: "/แก้ว" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">รายงาน</h1>
            <p className="page-subtitle">สร้างรายงานแผนกำไรในรูปแบบเอกสารธุรกิจ</p>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            {showPreview ? "ซ่อนตัวอย่าง" : "แสดงตัวอย่าง"}
          </button>
        </div>

        {/* Export options */}
        <div className="stat-card">
          <div className="panel-header">
            <h2 className="section-title">ส่งออกรายงาน</h2>
          </div>
          <div className="action-bar justify-start">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Printer className="w-4 h-4" /> พิมพ์ / PDF
            </button>
            <button
              onClick={handlePNG}
              disabled={pngLoading}
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {pngLoading ? "กำลังสร้าง..." : "ดาวน์โหลด PNG"}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" /> แชร์ลิงก์
            </button>
            {shareMsg && (
              <span className="flex items-center gap-1 text-sm text-success font-medium">
                <CheckCircle2 className="w-4 h-4" /> {shareMsg}
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            PDF: บราวเซอร์จะเปิด dialog บันทึกเป็น PDF | PNG: บันทึกเป็นรูปภาพ | แชร์: คัดลอก URL พร้อมข้อมูลสรุป
          </p>
        </div>

        {/* Report Preview */}
        {showPreview && (
          <div ref={reportRef} className="bg-card border rounded-xl shadow-sm overflow-hidden print:shadow-none print:border-0">
            {/* Report Header */}
            <div className="bg-primary text-primary-foreground px-8 py-6 print:py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                    <span className="font-bold text-lg">V</span>
                  </div>
                  <div>
                    <p className="text-xs opacity-80">Valora</p>
                    <h2 className="text-lg font-bold">รายงานแผนกำไรประจำเดือน</h2>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{shop.name}</p>
                  <p className="text-xs opacity-80">สร้างเมื่อ: {now}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6 space-y-6">
              {/* KPI Block */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-foreground">ตัวชี้วัดหลัก</h3>
                  <DataQualityBadge level="estimated" lastChecked={now} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {kpiSummary.map((kpi, i) => (
                    <div key={i} className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">
                        {kpi.value}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fixed Costs Breakdown */}
              <div>
                <h3 className="text-base font-semibold text-foreground mb-3">ค่าใช้จ่ายคงที่รายเดือน</h3>
                <table className="w-full text-sm border">
                  <thead>
                    <tr className="bg-muted text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium border-b">รายการ</th>
                      <th className="px-3 py-2 text-right font-medium border-b">จำนวน (฿)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedCostsRows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-foreground">{r.label || "ไม่ระบุ"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">฿{Number(r.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold border-t">
                      <td className="px-3 py-2 text-foreground">รวม</td>
                      <td className="px-3 py-2 text-right tabular-nums">฿{fixedCostsTotal.toLocaleString()}/เดือน</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Menu Metrics Table */}
              <div>
                <h3 className="text-base font-semibold text-foreground mb-3">ตัวชี้วัดรายเมนู</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium border-b">เมนู</th>
                        <th className="px-3 py-2 text-right font-medium border-b">ราคา (฿)</th>
                        <th className="px-3 py-2 text-right font-medium border-b">ต้นทุน/แก้ว (฿)</th>
                        <th className="px-3 py-2 text-right font-medium border-b">กำไรขั้นต้น/แก้ว (฿)</th>
                        <th className="px-3 py-2 text-right font-medium border-b">CM%</th>
                        <th className="px-3 py-2 text-right font-medium border-b">Mix%</th>
                        <th className="px-3 py-2 text-center font-medium border-b">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menuWithMetrics.map((m, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2 text-foreground font-medium">{m.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.price}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.totalCost.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{m.grossProfit.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.cmPercent.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.mix}%</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              m.status === "good" ? "bg-success/10 text-success" :
                              m.status === "caution" ? "bg-warning/10 text-warning" :
                              "bg-destructive/10 text-destructive"
                            }`}>
                              {m.status === "good" ? "กำไรดี" : m.status === "caution" ? "ควรระวัง" : "ขาดทุน"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Methodology */}
              <div className="border-t pt-4">
                <h3 className="text-base font-semibold text-foreground mb-2">วิธีคำนวณ</h3>
                <div className="text-sm text-muted-foreground space-y-1.5">
                  <p><strong className="text-foreground">กำไรขั้นต้น/แก้ว</strong> = ราคาขาย - ต้นทุนวัตถุดิบต่อแก้ว</p>
                  <p><strong className="text-foreground">กำไรขั้นต้นถ่วงน้ำหนัก (Weighted CM)</strong> = ผลรวมของ (กำไรขั้นต้น/แก้ว x Mix%) ทุกเมนู</p>
                  <p><strong className="text-foreground">จุดคุ้มทุน</strong> = ค่าใช้จ่ายคงที่รวม / Weighted CM</p>
                  <p><strong className="text-foreground">CM%</strong> = (กำไรขั้นต้น / ราคาขาย) x 100</p>
                </div>
              </div>

              {/* Assumptions */}
              <div className="border-t pt-4">
                <h3 className="text-base font-semibold text-foreground mb-2">สมมติฐานและข้อจำกัด</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="flex items-start gap-2"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> ต้นทุนไม่รวมค่าแรงผลิต ค่าสาธารณูปโภคที่ใช้ต่อแก้ว และค่าบรรจุภัณฑ์ (ยกเว้นกรอกแยก)</p>
                  <p className="flex items-start gap-2"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> สัดส่วนยอดขาย (Mix%) เป็นค่าประมาณการ อาจแตกต่างจากสัดส่วนจริง</p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t pt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">ข้อมูลนี้เป็นแบบจำลองเพื่อการวางแผน โปรดตรวจสอบต้นทุนจริงเป็นระยะ</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>ปัดเศษทศนิยม 1 ตำแหน่ง</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
