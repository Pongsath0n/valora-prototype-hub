import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { Info, Clock, ArrowRight } from "lucide-react";

const menuItems = [
  { name: "ลาเต้เย็น", currentPrice: 75, cost: 28.2 },
  { name: "คาปูชิโน่ร้อน", currentPrice: 65, cost: 27.2 },
  { name: "มัทฉะลาเต้", currentPrice: 85, cost: 38.0 },
  { name: "อเมริกาโน่", currentPrice: 55, cost: 17.5 },
  { name: "ชาเขียวนม", currentPrice: 75, cost: 35.5 },
];

export default function ScenarioPage() {
  const [adjustments, setAdjustments] = useState<Record<number, number>>(
    Object.fromEntries(menuItems.map((_, i) => [i, 0]))
  );

  const handleChange = (index: number, value: number) => {
    setAdjustments((prev) => ({ ...prev, [index]: value }));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">จำลองสถานการณ์ราคา</h1>
          <p className="text-sm text-muted-foreground mt-1">ทดลองปรับราคาและดูผลกระทบต่อกำไรก่อนนำไปใช้จริง</p>
        </div>

        <div className="guidance-card">
          <p className="text-sm text-foreground">
            ปรับราคาในคอลัมน์ "ปรับ (฿)" แล้วดูผลลัพธ์ในคอลัมน์ "ราคาใหม่" และ "Margin ใหม่" 
            ข้อมูลยอดขายอ้างอิงจากค่าเฉลี่ย 30 วันล่าสุด
          </p>
        </div>

        <div className="stat-card overflow-x-auto">
          <div className="panel-header">
            <h2 className="section-title">ตารางจำลอง</h2>
            <span className="timestamp">ข้อมูลต้นทุน ณ วันที่ 23 ก.พ. 2569</span>
          </div>
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2 font-medium">เมนู</th>
                <th className="pb-2 font-medium text-right">ราคาปัจจุบัน (฿)</th>
                <th className="pb-2 font-medium text-right">ต้นทุน (฿)</th>
                <th className="pb-2 font-medium text-right">ปรับ (฿)</th>
                <th className="pb-2 font-medium text-right">ราคาใหม่ (฿)</th>
                <th className="pb-2 font-medium text-right">Margin ใหม่</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map((item, i) => {
                const newPrice = item.currentPrice + adjustments[i];
                const newMargin = ((newPrice - item.cost) / newPrice * 100).toFixed(1);
                const oldMargin = ((item.currentPrice - item.cost) / item.currentPrice * 100).toFixed(1);
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2.5 text-foreground font-medium">{item.name}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.currentPrice}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.cost.toFixed(1)}</td>
                    <td className="py-2.5 text-right">
                      <input
                        type="number"
                        value={adjustments[i]}
                        onChange={(e) => handleChange(i, Number(e.target.value))}
                        className="w-20 text-right px-2 py-1 rounded border bg-background text-foreground text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">
                      {newPrice}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={Number(newMargin) > Number(oldMargin) ? "text-success font-medium" : Number(newMargin) < Number(oldMargin) ? "text-destructive font-medium" : ""}>
                        {newMargin}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 pt-3 border-t space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="w-3 h-3 flex-shrink-0" />
              <span>สมมติฐาน: ต้นทุนคำนวณจากราคาวัตถุดิบล่าสุดที่บันทึกในระบบ ไม่รวมค่าแรง ค่าบรรจุภัณฑ์ และค่าใช้จ่ายคงที่</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>Margin = (ราคาขาย - ต้นทุนวัตถุดิบ) / ราคาขาย x 100 | ปัดเศษทศนิยม 1 ตำแหน่ง</span>
            </div>
          </div>
        </div>

        {/* Impact Summary */}
        <div className="stat-card">
          <h2 className="section-title mb-4">สรุปผลกระทบ (ประมาณการ)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="metric-label">รายได้เฉลี่ย/วัน (เดิม)</p>
              <p className="metric-value text-xl">฿5,541</p>
            </div>
            <div>
              <p className="metric-label">รายได้เฉลี่ย/วัน (ใหม่)</p>
              <p className="metric-value text-xl">
                ฿{(5541 + Object.values(adjustments).reduce((a, b) => a + b * 15, 0)).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="metric-label">ส่วนต่าง</p>
              <p className={`metric-value text-xl ${Object.values(adjustments).reduce((a, b) => a + b, 0) >= 0 ? "text-success" : "text-destructive"}`}>
                {Object.values(adjustments).reduce((a, b) => a + b * 15, 0) >= 0 ? "+" : ""}
                ฿{Object.values(adjustments).reduce((a, b) => a + b * 15, 0).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>ประมาณการจากยอดขายเฉลี่ย 15 แก้ว/เมนู/วัน สมมติว่าปริมาณขายไม่เปลี่ยนแปลง</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
