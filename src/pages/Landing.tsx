import { Link } from "react-router-dom";
import { ArrowRight, Shield, BarChart3, Zap, CheckCircle2 } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

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
          <Link to="/" className="flex items-center">
            <LogoBrand size="sm" />
          </Link>
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
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20 md:pt-28 md:pb-32 text-center md:text-left">
        <div className="max-w-3xl">
          <h1
            className="text-4xl md:text-5xl font-bold text-foreground mb-6"
            style={{ lineHeight: 1.8, letterSpacing: '0.01em' }}
          >
            รู้ต้นทุน รู้กำไร<br />
            <span className="text-accent">ตัดสินใจได้มั่นใจ</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl mx-auto md:mx-0 leading-relaxed">
            เครื่องมือวิเคราะห์ต้นทุนและจำลองสถานการณ์ ออกแบบสำหรับร้านอาหารและคาเฟ่ไทย
            ให้ข้อมูลที่เชื่อถือได้ โปร่งใส ตรวจสอบได้ทุกขั้นตอน
          </p>
          <div className="flex flex-wrap gap-4 justify-center md:justify-start">
            <Link
              to="/auth/signup"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/20 cursor-pointer"
            >
              เริ่มต้นใช้งาน
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/overview"
              className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-8 py-3.5 rounded-xl font-semibold hover:bg-secondary/80 transition-all cursor-pointer"
            >
              ดูตัวอย่างระบบ
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f) => (
            <div key={f.title} className="stat-card hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-5">
                <f.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
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
