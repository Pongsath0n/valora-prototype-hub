import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

const plans = [
  {
    name: "ฟรี",
    price: "฿0",
    period: "/เดือน",
    desc: "เหมาะสำหรับร้านที่เพิ่งเริ่มต้น",
    features: ["เมนูสูงสุด 10 รายการ", "รายงานพื้นฐาน", "จำลองสถานการณ์ 3 ครั้ง/เดือน"],
    cta: "เริ่มต้นฟรี",
    highlighted: false,
  },
  {
    name: "โปร",
    price: "฿499",
    period: "/เดือน",
    desc: "สำหรับร้านที่ต้องการข้อมูลเชิงลึก",
    features: ["เมนูไม่จำกัด", "รายงานครบทุกประเภท", "จำลองสถานการณ์ไม่จำกัด", "วิเคราะห์ช่องทางจัดส่ง", "โปรโมชันอัจฉริยะ"],
    cta: "เลือกแผนนี้",
    highlighted: true,
  },
  {
    name: "องค์กร",
    price: "ติดต่อเรา",
    period: "",
    desc: "สำหรับเชนร้านหลายสาขา",
    features: ["ทุกอย่างในแผนโปร", "รองรับหลายสาขา", "API เชื่อมต่อระบบ", "ผู้ดูแลเฉพาะ"],
    cta: "ติดต่อทีมขาย",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">V</span>
            </div>
            <span className="font-bold text-lg text-foreground">Valora</span>
          </Link>
          <Link
            to="/auth/login"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">เลือกแผนที่เหมาะกับร้านคุณ</h1>
          <p className="text-muted-foreground mt-2">ทุกแผนรวมการเข้ารหัสข้อมูลและการแสดงที่มาของตัวเลข</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`stat-card flex flex-col ${plan.highlighted ? "ring-2 ring-accent shadow-lg" : ""}`}
            >
              {plan.highlighted && (
                <span className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full self-start mb-3">แนะนำ</span>
              )}
              <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
              <div className="mt-2 mb-1">
                <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{plan.desc}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/onboarding"
                className={`block text-center py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
