import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { Save, Info } from "lucide-react";

export default function SettingsPage() {
  const [shopName, setShopName] = useState("ร้านกาแฟบ้านสวน");
  const [currency, setCurrency] = useState("THB");
  const [rounding, setRounding] = useState("1");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ตั้งค่า</h1>
          <p className="text-sm text-muted-foreground mt-1">จัดการข้อมูลร้านและค่าเริ่มต้นของระบบ</p>
        </div>

        {/* Shop Info */}
        <div className="stat-card space-y-4">
          <h2 className="section-title">ข้อมูลร้าน</h2>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">ชื่อร้าน</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">อีเมลผู้ดูแล</label>
            <input
              type="email"
              value="owner@bansuan.cafe"
              readOnly
              className="w-full px-3 py-2.5 rounded-lg border bg-muted text-muted-foreground text-sm"
            />
          </div>
        </div>

        {/* Display Settings */}
        <div className="stat-card space-y-4">
          <h2 className="section-title">การแสดงผลตัวเลข</h2>
          <div className="guidance-card">
            <p className="text-sm text-foreground">
              การตั้งค่าเหล่านี้มีผลต่อการแสดงผลตัวเลขในทุกหน้า รวมถึงรายงานที่ดาวน์โหลด
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">สกุลเงิน</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="THB">บาท (฿)</option>
              <option value="USD">US Dollar ($)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">ทศนิยม</label>
            <select
              value={rounding}
              onChange={(e) => setRounding(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="0">ไม่มีทศนิยม (฿100)</option>
              <option value="1">1 ตำแหน่ง (฿100.0)</option>
              <option value="2">2 ตำแหน่ง (฿100.00)</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>ค่าเริ่มต้น: บาท (฿) ทศนิยม 1 ตำแหน่ง</span>
          </div>
        </div>

        {/* Methodology */}
        <div className="stat-card space-y-4">
          <h2 className="section-title">วิธีคำนวณ</h2>
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong className="text-foreground">ต้นทุนวัตถุดิบ</strong> = ผลรวมของ (ปริมาณส่วนผสม x ราคาต่อหน่วย) ตามสูตรที่กำหนด</p>
            <p><strong className="text-foreground">อัตรากำไรขั้นต้น</strong> = (ราคาขาย - ต้นทุนวัตถุดิบ) / ราคาขาย x 100</p>
            <p><strong className="text-foreground">รายได้สุทธิ (Delivery)</strong> = รายได้ - (รายได้ x อัตราค่าคอมมิชชัน)</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <Info className="w-3 h-3" />
            <span>หมายเหตุ: ต้นทุนไม่รวมค่าแรง ค่าเช่า ค่าสาธารณูปโภค และค่าบรรจุภัณฑ์</span>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Save className="w-4 h-4" />
          {saved ? "บันทึกแล้ว" : "บันทึกการตั้งค่า"}
        </button>
      </div>
    </AppLayout>
  );
}
