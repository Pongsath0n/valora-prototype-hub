import AppLayout from "@/components/AppLayout";
import { Info, MapPin, Clock } from "lucide-react";

const platforms = [
  { name: "Grab Food", orders: 234, revenue: 18720, commission: "30%", netRevenue: 13104, avgTicket: 80 },
  { name: "LINE MAN", orders: 189, revenue: 14175, commission: "27%", netRevenue: 10348, avgTicket: 75 },
  { name: "Shopee Food", orders: 95, revenue: 7600, commission: "25%", netRevenue: 5700, avgTicket: 80 },
  { name: "หน้าร้าน", orders: 412, revenue: 28840, commission: "0%", netRevenue: 28840, avgTicket: 70 },
];

const zones = [
  { zone: "บางนา-ศรีนครินทร์", orders: 145, avgTime: "28 นาที", topItem: "ลาเต้เย็น" },
  { zone: "อุดมสุข-ปุณณวิถี", orders: 112, avgTime: "22 นาที", topItem: "คาปูชิโน่ร้อน" },
  { zone: "สุขุมวิท-พร้อมพงษ์", orders: 87, avgTime: "35 นาที", topItem: "มัทฉะลาเต้" },
  { zone: "อ่อนนุช-สวนหลวง", orders: 74, avgTime: "25 นาที", topItem: "อเมริกาโน่" },
];

export default function DeliveryPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ช่องทางจัดส่ง</h1>
          <p className="text-sm text-muted-foreground mt-1">วิเคราะห์ประสิทธิภาพแต่ละแพลตฟอร์มและพื้นที่จัดส่ง</p>
        </div>

        <div className="guidance-card">
          <p className="text-sm text-foreground">
            เปรียบเทียบรายได้สุทธิหลังหักค่าคอมมิชชันของแต่ละแพลตฟอร์ม 
            ช่วยตัดสินใจว่าควรเน้นช่องทางไหนมากขึ้น
          </p>
        </div>

        {/* Platform Performance */}
        <div className="stat-card overflow-x-auto">
          <div className="panel-header">
            <h2 className="section-title">ประสิทธิภาพตามแพลตฟอร์ม</h2>
            <span className="timestamp">ข้อมูลเดือน ก.พ. 2569</span>
          </div>
          <table className="w-full text-sm min-w-[550px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2 font-medium">แพลตฟอร์ม</th>
                <th className="pb-2 font-medium text-right">ออเดอร์</th>
                <th className="pb-2 font-medium text-right">รายได้ (฿)</th>
                <th className="pb-2 font-medium text-right">ค่าคอมฯ</th>
                <th className="pb-2 font-medium text-right">รายได้สุทธิ (฿)</th>
                <th className="pb-2 font-medium text-right">เฉลี่ย/บิล</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2.5 text-foreground font-medium">{p.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{p.orders}</td>
                  <td className="py-2.5 text-right tabular-nums">{p.revenue.toLocaleString()}</td>
                  <td className="py-2.5 text-right tabular-nums">{p.commission}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium">{p.netRevenue.toLocaleString()}</td>
                  <td className="py-2.5 text-right tabular-nums">฿{p.avgTicket}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>รายได้สุทธิ = รายได้ - (รายได้ x อัตราค่าคอมมิชชัน) | ยังไม่หักต้นทุนวัตถุดิบ</span>
          </div>
        </div>

        {/* Delivery Zones */}
        <div className="stat-card">
          <div className="panel-header">
            <h2 className="section-title">พื้นที่จัดส่งยอดนิยม</h2>
            <span className="timestamp">เรียงตาม: จำนวนออเดอร์</span>
          </div>
          <div className="space-y-3">
            {zones.map((z, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{z.zone}</p>
                    <p className="text-xs text-muted-foreground">เมนูยอดนิยม: {z.topItem}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums text-foreground">{z.orders} ออเดอร์</p>
                  <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" /> {z.avgTime}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
