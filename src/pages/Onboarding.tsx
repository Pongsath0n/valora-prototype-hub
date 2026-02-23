import { Link } from "react-router-dom";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

const steps = [
  { title: "ข้อมูลร้าน", desc: "ชื่อร้านและประเภทธุรกิจ" },
  { title: "สินค้าหลัก", desc: "เพิ่มเมนูยอดนิยม" },
  { title: "เริ่มต้นใช้งาน", desc: "ตรวจสอบและยืนยัน" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState("ร้านกาแฟบ้านสวน");
  const [shopType, setShopType] = useState("คาเฟ่");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">ตั้งค่าร้านของคุณ</h1>
          <p className="text-sm text-muted-foreground mt-1">กรอกข้อมูลเบื้องต้นเพื่อเริ่มใช้ Valora</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i < step ? "bg-success text-success-foreground" :
                i === step ? "bg-primary text-primary-foreground" :
                "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span className="hidden md:inline text-sm text-muted-foreground">{s.title}</span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <div className="stat-card">
          {step === 0 && (
            <div className="space-y-4">
              <div className="guidance-card">
                <p className="text-sm text-foreground">ระบบจะใช้ข้อมูลเหล่านี้ในการปรับแต่งการคำนวณต้นทุนให้เหมาะกับประเภทธุรกิจของคุณ</p>
              </div>
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
                <label className="text-sm font-medium text-foreground block mb-1.5">ประเภทธุรกิจ</label>
                <select
                  value={shopType}
                  onChange={(e) => setShopType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option>คาเฟ่</option>
                  <option>ร้านอาหาร</option>
                  <option>เบเกอรี่</option>
                  <option>บาร์เครื่องดื่ม</option>
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="guidance-card">
                <p className="text-sm text-foreground">เพิ่มเมนู 3-5 รายการที่ขายดีที่สุด ระบบจะใช้ข้อมูลนี้เป็นตัวอย่างในการวิเคราะห์</p>
              </div>
              <div className="space-y-2 text-sm">
                {["ลาเต้เย็น", "คาปูชิโน่ร้อน", "มัทฉะลาเต้"].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg">
                    <span className="text-foreground">{item}</span>
                    <span className="text-muted-foreground">ราคาขาย ฿{[75, 65, 85][i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="guidance-card">
                <p className="text-sm text-foreground">ตรวจสอบข้อมูลให้ถูกต้อง คุณสามารถกลับมาแก้ไขได้ภายหลังในหน้าตั้งค่า</p>
              </div>
              <div className="text-sm space-y-2">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">ชื่อร้าน</span>
                  <span className="text-foreground font-medium">{shopName}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">ประเภท</span>
                  <span className="text-foreground font-medium">{shopType}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">จำนวนเมนู</span>
                  <span className="text-foreground font-medium">3 รายการ</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              ย้อนกลับ
            </button>
            {step < 2 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                ถัดไป
              </button>
            ) : (
              <Link
                to="/app/dashboard"
                className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
