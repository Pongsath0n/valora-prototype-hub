import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { Info, Calendar, Tag } from "lucide-react";

const promos = [
  { id: 1, name: "ซื้อ 1 แถม 1 ลาเต้", type: "แถมฟรี", start: "1 มี.ค. 69", end: "7 มี.ค. 69", status: "กำลังจะเริ่ม", estCost: 2100, estRevenue: 5600 },
  { id: 2, name: "ลด 15% เมนูร้อนทุกแก้ว", type: "ส่วนลด", start: "20 ก.พ. 69", end: "28 ก.พ. 69", status: "กำลังดำเนินการ", estCost: 1450, estRevenue: 4200 },
  { id: 3, name: "แก้วที่ 2 ลดครึ่งราคา", type: "ส่วนลด", start: "10 ก.พ. 69", end: "16 ก.พ. 69", status: "สิ้นสุดแล้ว", estCost: 1870, estRevenue: 6300 },
];

export default function PromoPage() {
  const [selectedPromo, setSelectedPromo] = useState<number | null>(null);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">โปรโมชัน</h1>
            <p className="text-sm text-muted-foreground mt-1">จัดการโปรโมชันและดูผลตอบแทน</p>
          </div>
          <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            สร้างโปรโมชัน
          </button>
        </div>

        <div className="guidance-card">
          <p className="text-sm text-foreground">
            ระบบคำนวณต้นทุนโปรโมชันจากส่วนลดจริงที่ให้ลูกค้า คูณกับจำนวนการใช้งานจริง/ประมาณการ
          </p>
        </div>

        <div className="space-y-3">
          {promos.map((promo) => (
            <div
              key={promo.id}
              onClick={() => setSelectedPromo(selectedPromo === promo.id ? null : promo.id)}
              className="stat-card cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{promo.name}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {promo.type}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {promo.start} - {promo.end}</span>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  promo.status === "กำลังดำเนินการ" ? "bg-success/10 text-success" :
                  promo.status === "กำลังจะเริ่ม" ? "bg-info/10 text-info" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {promo.status}
                </span>
              </div>

              {selectedPromo === promo.id && (
                <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="metric-label">ต้นทุนโปรโมชัน</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">฿{promo.estCost.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="metric-label">รายได้ที่เพิ่ม</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">฿{promo.estRevenue.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="metric-label">ROI</p>
                    <p className="text-lg font-bold tabular-nums text-success">
                      {((promo.estRevenue - promo.estCost) / promo.estCost * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="metric-label">กำไรสุทธิ</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      ฿{(promo.estRevenue - promo.estCost).toLocaleString()}
                    </p>
                  </div>
                  <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    <span>
                      {promo.status === "สิ้นสุดแล้ว"
                        ? "ตัวเลขเป็นผลลัพธ์จริงจากข้อมูลการขาย"
                        : "ตัวเลขเป็นค่าประมาณการจากยอดขายเฉลี่ย 30 วัน"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
