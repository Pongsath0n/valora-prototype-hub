import AppLayout from "@/components/AppLayout";
import { TrendingUp, TrendingDown, Info, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const now = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const dailyData = [
  { day: "จ.", revenue: 4250, cost: 1820 },
  { day: "อ.", revenue: 3890, cost: 1650 },
  { day: "พ.", revenue: 5120, cost: 2180 },
  { day: "พฤ.", revenue: 4780, cost: 2040 },
  { day: "ศ.", revenue: 6340, cost: 2710 },
  { day: "ส.", revenue: 7520, cost: 3200 },
  { day: "อา.", revenue: 6890, cost: 2940 },
];

const topItems = [
  { name: "ลาเต้เย็น", sold: 142, revenue: 10650, margin: "62.4%" },
  { name: "คาปูชิโน่ร้อน", sold: 118, revenue: 7670, margin: "58.1%" },
  { name: "มัทฉะลาเต้", sold: 95, revenue: 8075, margin: "55.3%" },
  { name: "อเมริกาโน่", sold: 87, revenue: 4785, margin: "68.2%" },
  { name: "ชาเขียวนม", sold: 73, revenue: 5475, margin: "52.7%" },
];

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">ร้านกาแฟบ้านสวน</h1>
          <p className="timestamp mt-1">อัปเดตล่าสุด: {now}</p>
        </div>

        {/* Guidance */}
        <div className="guidance-card">
          <p className="text-sm text-foreground font-medium mb-1">สรุปสัปดาห์นี้</p>
          <p className="text-sm text-muted-foreground">
            รายได้สัปดาห์นี้สูงกว่าสัปดาห์ที่แล้ว 8.3% โดยเมนูที่มีกำไรขั้นต้นสูงสุดคือ อเมริกาโน่ (68.2%)
            ลองพิจารณาโปรโมทเมนูนี้เพิ่มเติม
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <p className="metric-label">รายได้รวม</p>
            <p className="metric-value">฿38,790</p>
            <p className="metric-change-up flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> +8.3% จากสัปดาห์ก่อน
            </p>
          </div>
          <div className="stat-card">
            <p className="metric-label">ต้นทุนวัตถุดิบ</p>
            <p className="metric-value">฿16,540</p>
            <p className="metric-change-down flex items-center gap-1 mt-1">
              <TrendingDown className="w-3 h-3" /> +3.1% จากสัปดาห์ก่อน
            </p>
          </div>
          <div className="stat-card">
            <p className="metric-label">กำไรขั้นต้น</p>
            <p className="metric-value">฿22,250</p>
            <p className="metric-change-up flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> +12.1%
            </p>
          </div>
          <div className="stat-card">
            <p className="metric-label">อัตรากำไรขั้นต้น</p>
            <p className="metric-value">57.4%</p>
            <div className="flex items-center gap-1 mt-1">
              <Info className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">ค่าเฉลี่ยอุตสาหกรรม 55%</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="stat-card">
          <div className="panel-header">
            <div>
              <h2 className="section-title">รายได้ vs ต้นทุน รายวัน</h2>
              <p className="text-xs text-muted-foreground mt-0.5">หน่วย: บาท (฿) | สัปดาห์ 17-23 ก.พ. 2569</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary inline-block" /> รายได้</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-accent inline-block" /> ต้นทุน</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`฿${value.toLocaleString()}`, ""]}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="รายได้" />
                <Bar dataKey="cost" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="ต้นทุน" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>สมมติฐาน: ต้นทุนคำนวณจากสูตรส่วนผสมที่ตั้งค่าไว้ ไม่รวมค่าแรงและค่าเช่า</span>
          </div>
        </div>

        {/* Top Items Table */}
        <div className="stat-card">
          <div className="panel-header">
            <h2 className="section-title">เมนูขายดีประจำสัปดาห์</h2>
            <span className="text-xs text-muted-foreground">เรียงตาม: จำนวนขาย</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2 font-medium">เมนู</th>
                  <th className="pb-2 font-medium text-right">จำนวนขาย (แก้ว)</th>
                  <th className="pb-2 font-medium text-right">รายได้ (฿)</th>
                  <th className="pb-2 font-medium text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2.5 text-foreground font-medium">{item.name}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.sold}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.revenue.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{item.margin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>Margin = (ราคาขาย - ต้นทุนวัตถุดิบ) / ราคาขาย x 100 | ปัดเศษทศนิยม 1 ตำแหน่ง</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
