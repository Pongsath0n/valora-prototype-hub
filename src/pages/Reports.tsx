import AppLayout from "@/components/AppLayout";
import DataQualityBadge from "@/components/DataQualityBadge";
import { useState, useRef } from "react";
import { Download, Share2, FileText, Printer, Info, Clock } from "lucide-react";

const now = new Date().toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });
const shopName = "ร้านกาแฟบ้านสวน";

// Demo data
const kpis = [
  { label: "ค่าใช้จ่ายคงที่", value: "฿50,000", unit: "/เดือน" },
  { label: "จุดคุ้มทุน", value: "1,186", unit: "แก้ว/เดือน" },
  { label: "จุดคุ้มทุน", value: "46", unit: "แก้ว/วัน" },
  { label: "ยอดขายเพื่อกำไรเป้า", value: "฿5,190", unit: "/วัน" },
  { label: "กำไรสุทธิประมาณการ", value: "฿37,693", unit: "/เดือน" },
  { label: "กำไรขั้นต้นเฉลี่ย", value: "฿42.2", unit: "/แก้ว" },
];

const menuMetrics = [
  { name: "ลาเต้เย็น", price: 75, cost: 28.2, gp: 46.8, cm: "62.4%", mix: "28%", status: "กำไรดี" },
  { name: "คาปูชิโน่ร้อน", price: 65, cost: 27.2, gp: 37.8, cm: "58.2%", mix: "23%", status: "กำไรดี" },
  { name: "มัทฉะลาเต้", price: 85, cost: 38.0, gp: 47.0, cm: "55.3%", mix: "18%", status: "กำไรดี" },
  { name: "อเมริกาโน่", price: 55, cost: 17.5, gp: 37.5, cm: "68.2%", mix: "17%", status: "กำไรดี" },
  { name: "ชาเขียวนม", price: 75, cost: 35.5, gp: 39.5, cm: "52.7%", mix: "14%", status: "กำไรดี" },
];

export default function ReportsPage() {
  const [showPreview, setShowPreview] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">รายงาน</h1>
            <p className="text-sm text-muted-foreground mt-1">สร้างรายงานแผนกำไรในรูปแบบเอกสารธุรกิจ</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <FileText className="w-4 h-4" />
              {showPreview ? "ซ่อนตัวอย่าง" : "แสดงตัวอย่าง"}
            </button>
          </div>
        </div>

        {/* Export options */}
        <div className="stat-card">
          <h2 className="section-title mb-3">ส่งออกรายงาน</h2>
          <div className="flex flex-wrap gap-2">
            <button className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Download className="w-4 h-4" /> ดาวน์โหลด PDF
            </button>
            <button className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Download className="w-4 h-4" /> ดาวน์โหลด PNG
            </button>
            <button className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Share2 className="w-4 h-4" /> แชร์ลิงก์อ่านอย่างเดียว
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <Printer className="w-4 h-4" /> พิมพ์
            </button>
          </div>
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
                  <p className="font-semibold">{shopName}</p>
                  <p className="text-xs opacity-80">สร้างเมื่อ: {now}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6 space-y-6">
              {/* KPI Block */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-foreground">ตัวชี้วัดหลัก</h3>
                  <DataQualityBadge level="estimated" lastChecked="23 ก.พ. 69" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {kpis.map((kpi, i) => (
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
                      {menuMetrics.map((m, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2 text-foreground font-medium">{m.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.price}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.cost.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{m.gp.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.cm}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.mix}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
                              {m.status}
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
                  <p><strong className="text-foreground">กำไรขั้นต้นถ่วงน้ำหนัก</strong> = ผลรวมของ (กำไรขั้นต้น/แก้ว x Mix%) ทุกเมนู</p>
                  <p><strong className="text-foreground">จุดคุ้มทุน</strong> = ค่าใช้จ่ายคงที่รวม / กำไรขั้นต้นถ่วงน้ำหนัก</p>
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
                <p className="text-xs text-muted-foreground">
                  ข้อมูลนี้เป็นแบบจำลองเพื่อการวางแผน โปรดตรวจสอบต้นทุนจริงเป็นระยะ
                </p>
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
