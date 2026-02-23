import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { Download, Info, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const monthlyData = [
  { month: "ก.ย.", revenue: 112000, profit: 58200 },
  { month: "ต.ค.", revenue: 125000, profit: 66500 },
  { month: "พ.ย.", revenue: 118000, profit: 61800 },
  { month: "ธ.ค.", revenue: 142000, profit: 78000 },
  { month: "ม.ค.", revenue: 135000, profit: 72400 },
  { month: "ก.พ.", revenue: 148000, profit: 82600 },
];

const reportTypes = [
  { name: "สรุปรายได้ประจำเดือน", period: "ก.พ. 2569", ready: true },
  { name: "รายงานต้นทุนวัตถุดิบ", period: "ก.พ. 2569", ready: true },
  { name: "วิเคราะห์กำไรตามเมนู", period: "ก.พ. 2569", ready: true },
  { name: "เปรียบเทียบช่องทางขาย", period: "ก.พ. 2569", ready: false },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState("6months");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">รายงาน</h1>
            <p className="text-sm text-muted-foreground mt-1">ดูภาพรวมและดาวน์โหลดรายงานผลประกอบการ</p>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="3months">3 เดือน</option>
            <option value="6months">6 เดือน</option>
            <option value="12months">12 เดือน</option>
          </select>
        </div>

        {/* Trend Chart */}
        <div className="stat-card">
          <div className="panel-header">
            <div>
              <h2 className="section-title">แนวโน้มรายได้และกำไร</h2>
              <p className="text-xs text-muted-foreground mt-0.5">หน่วย: บาท (฿) | 6 เดือนล่าสุด</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary inline-block" /> รายได้</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-success inline-block" /> กำไรขั้นต้น</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
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
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="รายได้" />
                <Line type="monotone" dataKey="profit" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 4 }} name="กำไร" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>กำไรขั้นต้น = รายได้ - ต้นทุนวัตถุดิบ ยังไม่รวมค่าใช้จ่ายดำเนินงาน</span>
          </div>
        </div>

        {/* Downloadable Reports */}
        <div className="stat-card">
          <div className="panel-header">
            <h2 className="section-title">รายงานพร้อมดาวน์โหลด</h2>
          </div>
          <div className="space-y-2">
            {reportTypes.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.period}</p>
                </div>
                <button
                  disabled={!r.ready}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    r.ready
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <Download className="w-3 h-3" />
                  {r.ready ? "ดาวน์โหลด" : "กำลังประมวลผล"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
