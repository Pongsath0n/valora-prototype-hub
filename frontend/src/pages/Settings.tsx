import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { Save, Info, CheckCircle2 } from "lucide-react";
import { storeSetupService } from "@/features/store/storeService";
import { useAuth } from "@/contexts/AuthContext";
import { STORE_DISPLAY_NAME } from "@/config/brand";

export default function SettingsPage() {
  const { user } = useAuth();
  const [shopName, setShopName] = useState(STORE_DISPLAY_NAME);
  const [daysOpen, setDaysOpen] = useState(26);
  const [targetProfit, setTargetProfit] = useState(30000);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState("THB");
  const [rounding, setRounding] = useState("1");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    storeSetupService.get().then((store) => {
      if (!mounted) return;
      setShopName(store.name);
      setDaysOpen(store.daysOpen);
      setTargetProfit(store.targetProfit);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    await storeSetupService.save({ name: shopName, daysOpen, targetProfit });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const FORMULA_ROWS = [
    { label: "ต้นทุนวัตถุดิบ", formula: "= ผลรวมของ (ปริมาณส่วนผสม × ราคาต่อหน่วย) ตามสูตรที่กำหนด" },
    { label: "อัตรากำไรขั้นต้น", formula: "= (ราคาขาย − ต้นทุนวัตถุดิบ) / ราคาขาย × 100" },
    { label: "รายได้สุทธิ (Delivery)", formula: "= รายได้ − (รายได้ × อัตราค่าคอมมิชชัน)" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">ตั้งค่า</h1>
            <p className="page-subtitle">จัดการข้อมูลร้านและค่าเริ่มต้นของระบบ</p>
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {loading ? "กำลังโหลด..." : saved ? "บันทึกแล้ว" : "บันทึกการตั้งค่า"}
          </button>
        </div>

        {/* ── Shop Info ─────────────────────────────────── */}
        <div className="stat-card space-y-4">
          <div>
            <h2 className="section-title">ข้อมูลร้าน</h2>
            <p className="text-xs text-muted-foreground mt-0.5">ชื่อร้านและผู้ดูแลระบบ</p>
          </div>
          <div className="section-divider" />
          <div className="form-group">
            <label className="form-label">ชื่อร้าน</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">จำนวนวันเปิดต่อเดือน</label>
            <input
              type="number"
              value={daysOpen}
              onChange={(e) => setDaysOpen(Number(e.target.value))}
              min={1}
              max={31}
              className="form-input tabular-nums"
            />
          </div>
          <div className="form-group">
            <label className="form-label">เป้าหมายกำไร (฿/เดือน)</label>
            <input
              type="number"
              value={targetProfit}
              onChange={(e) => setTargetProfit(Number(e.target.value))}
              min={0}
              className="form-input tabular-nums"
            />
          </div>
          <div className="form-group">
            <label className="form-label">อีเมลผู้ดูแล</label>
            <input
              type="email"
              value={user?.email ?? "-"}
              readOnly
              className="form-input bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="form-hint">อีเมลเชื่อมกับบัญชี Supabase Auth ไม่สามารถเปลี่ยนที่นี่ได้</p>
          </div>
        </div>

        {/* ── Display Settings (future — not active in v1) ─── */}
        <div className="stat-card space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="section-title">การแสดงผลตัวเลข</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                ยังไม่เปิดใช้ใน v1
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              ปัจจุบันระบบแสดงผลเป็นเงินบาท (฿) ทั้งหมด ตัวเลือกด้านล่างจะเปิดใช้งานในเวอร์ชันถัดไป
            </p>
          </div>
          <div className="section-divider" />
          <div className="form-group">
            <label className="form-label">สกุลเงิน</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled
              aria-disabled="true"
              className="form-input opacity-60 cursor-not-allowed"
            >
              <option value="THB">บาท (฿)</option>
              <option value="USD">US Dollar ($)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">ทศนิยม</label>
            <select
              value={rounding}
              onChange={(e) => setRounding(e.target.value)}
              disabled
              aria-disabled="true"
              className="form-input opacity-60 cursor-not-allowed"
            >
              <option value="0">ไม่มีทศนิยม (฿100)</option>
              <option value="1">1 ตำแหน่ง (฿100.0)</option>
              <option value="2">2 ตำแหน่ง (฿100.00)</option>
            </select>
            <p className="form-hint">ค่าเริ่มต้น: บาท (฿) ทศนิยม 1 ตำแหน่ง (ล็อกไว้ใน v1)</p>
          </div>
        </div>

        {/* ── Formulas Reference ────────────────────────── */}
        <div className="stat-card space-y-4">
          <div>
            <h2 className="section-title">สูตรคำนวณที่ใช้</h2>
            <p className="text-xs text-muted-foreground mt-0.5">อ้างอิงสำหรับการตรวจสอบความถูกต้อง</p>
          </div>
          <div className="section-divider" />
          <dl className="space-y-3">
            {FORMULA_ROWS.map((row) => (
              <div key={row.label}>
                <dt className="text-sm font-medium text-foreground">{row.label}</dt>
                <dd className="text-sm text-muted-foreground mt-0.5 font-mono text-xs bg-muted px-3 py-2 rounded-lg mt-1">
                  {row.formula}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-start gap-2 text-xs text-muted-foreground pt-2 border-t">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>ต้นทุนไม่รวมค่าแรง ค่าเช่า ค่าสาธารณูปโภค และค่าบรรจุภัณฑ์</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
