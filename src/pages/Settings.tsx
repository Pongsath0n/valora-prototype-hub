import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { Save, Info, CheckCircle2 } from "lucide-react";

const SECTIONS = [
  {
    id: "shop",
    title: "ข้อมูลร้าน",
    subtitle: "ชื่อร้านและผู้ดูแลระบบ",
    fields: [
      { id: "name", label: "ชื่อร้าน", type: "text", value: "ร้านกาแฟบ้านสวน", readOnly: false },
      { id: "email", label: "อีเมลผู้ดูแล", type: "email", value: "owner@bansuan.cafe", readOnly: true },
    ],
  },
  {
    id: "display",
    title: "การแสดงผลตัวเลข",
    subtitle: "มีผลต่อทุกหน้าและรายงานที่ดาวน์โหลด",
    selects: [
      {
        id: "currency",
        label: "สกุลเงิน",
        options: [{ value: "THB", label: "บาท (฿)" }, { value: "USD", label: "US Dollar ($)" }],
        defaultValue: "THB",
      },
      {
        id: "decimal",
        label: "ทศนิยม",
        options: [
          { value: "0", label: "ไม่มีทศนิยม (฿100)" },
          { value: "1", label: "1 ตำแหน่ง (฿100.0)" },
          { value: "2", label: "2 ตำแหน่ง (฿100.00)" },
        ],
        defaultValue: "1",
      },
    ],
  },
];

const FORMULA_ROWS = [
  { label: "ต้นทุนวัตถุดิบ", formula: "= ผลรวมของ (ปริมาณส่วนผสม × ราคาต่อหน่วย) ตามสูตรที่กำหนด" },
  { label: "อัตรากำไรขั้นต้น", formula: "= (ราคาขาย − ต้นทุนวัตถุดิบ) / ราคาขาย × 100" },
  { label: "รายได้สุทธิ (Delivery)", formula: "= รายได้ − (รายได้ × อัตราค่าคอมมิชชัน)" },
];

export default function SettingsPage() {
  const [shopName, setShopName] = useState("ร้านกาแฟบ้านสวน");
  const [currency, setCurrency] = useState("THB");
  const [rounding, setRounding] = useState("1");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

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
            {saved ? "บันทึกแล้ว" : "บันทึกการตั้งค่า"}
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
            <label className="form-label">อีเมลผู้ดูแล</label>
            <input
              type="email"
              value="owner@bansuan.cafe"
              readOnly
              className="form-input bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="form-hint">อีเมลไม่สามารถเปลี่ยนแปลงได้ในตอนนี้</p>
          </div>
        </div>

        {/* ── Display Settings ──────────────────────────── */}
        <div className="stat-card space-y-4">
          <div>
            <h2 className="section-title">การแสดงผลตัวเลข</h2>
            <p className="text-xs text-muted-foreground mt-0.5">มีผลต่อทุกหน้าและรายงานที่ดาวน์โหลด</p>
          </div>
          <div className="section-divider" />
          <div className="form-group">
            <label className="form-label">สกุลเงิน</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="form-input"
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
              className="form-input"
            >
              <option value="0">ไม่มีทศนิยม (฿100)</option>
              <option value="1">1 ตำแหน่ง (฿100.0)</option>
              <option value="2">2 ตำแหน่ง (฿100.00)</option>
            </select>
            <p className="form-hint">ค่าเริ่มต้น: บาท (฿) ทศนิยม 1 ตำแหน่ง</p>
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
