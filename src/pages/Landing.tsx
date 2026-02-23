import { Link } from "react-router-dom";
import { ArrowRight, Shield, BarChart3, Zap, CheckCircle2 } from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "วิเคราะห์ต้นทุนอัตโนมัติ",
    desc: "คำนวณต้นทุนสินค้าและกำไรขั้นต้นแบบเรียลไทม์ พร้อมแยกรายละเอียดตามส่วนผสม",
  },
  {
    icon: Zap,
    title: "จำลองสถานการณ์ราคา",
    desc: "ทดสอบการปรับราคาก่อนนำไปใช้จริง เห็นผลกระทบต่อกำไรทันที",
  },
  {
    icon: Shield,
    title: "ข้อมูลน่าเชื่อถือ",
    desc: "ทุกตัวเลขแสดงที่มาของข้อมูล สมมติฐาน และเวลาอัปเดตล่าสุด",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">V</span>
            </div>
            <span className="font-bold text-lg text-foreground">Valora</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground transition-colors">ราคา</Link>
            <Link
              to="/auth/login"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              เข้าสู่ระบบ
            </Link>
          </nav>
          <Link to="/auth/login" className="md:hidden bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-2xl">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight mb-4">
            รู้ต้นทุน รู้กำไร<br />
            <span className="text-accent">ตัดสินใจได้มั่นใจ</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl">
            เครื่องมือวิเคราะห์ต้นทุนและจำลองสถานการณ์ ออกแบบสำหรับร้านอาหารและคาเฟ่ไทย
            ให้ข้อมูลที่เชื่อถือได้ โปร่งใส ตรวจสอบได้ทุกขั้นตอน
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/onboarding"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              เริ่มต้นใช้งาน
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/app/dashboard"
              className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-6 py-3 rounded-lg font-medium hover:bg-secondary/80 transition-colors"
            >
              ดูตัวอย่างระบบ
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="stat-card">
              <f.icon className="w-8 h-8 text-accent mb-3" />
              <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-t bg-muted/50">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> ข้อมูลเข้ารหัสทุกขั้นตอน</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> แสดงสมมติฐานทุกการคำนวณ</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> ตรวจสอบที่มาข้อมูลได้</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>Valora v1.0 — สร้างเพื่อผู้ประกอบการไทย</span>
          <Link to="/pricing" className="hover:text-foreground transition-colors">ดูราคา</Link>
        </div>
      </footer>
    </div>
  );
}
