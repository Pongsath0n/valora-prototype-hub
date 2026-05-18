import { BarChart3, CheckCircle2, Shield, Zap } from "lucide-react";
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
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <LogoBrand size="sm" />
          <span className="text-xs text-muted-foreground">Internal-first platform by Brewway</span>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20 md:pt-28 md:pb-28 text-center md:text-left">
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6" style={{ lineHeight: 1.7 }}>
            รู้ต้นทุน รู้กำไร<br />
            <span className="text-accent">ตัดสินใจได้มั่นใจ</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-2 max-w-xl leading-relaxed">
            Valora Engine คือระบบภายในสำหรับ Brewway ที่รวมต้นทุน กำไร สต็อก และออเดอร์ไว้ในระบบเดียว
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-20">
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

      <section className="border-t bg-muted/50">
        <div className="max-w-6xl mx-auto px-4 py-12 space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-3">สนใจใช้ Valora Engine กับธุรกิจของคุณ?</h2>
            <p className="text-muted-foreground leading-relaxed">
              Valora Engine เปิดให้ใช้งานในรูปแบบติดต่อเพื่อติดตั้งและปรับระบบให้เหมาะกับธุรกิจของคุณ เหมาะสำหรับร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็กที่ต้องการรู้ต้นทุน กำไรจริง สต็อก และออเดอร์ในระบบเดียว
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">ช่องทางติดต่อ</h3>
            <div>
              <p className="text-sm font-medium">Instagram</p>
              {/* MARKING: Add Brewway / Valora Instagram username or URL here later */}
              <p className="text-sm text-muted-foreground">[MARKING: เพิ่มชื่อ IG หรือ URL ภายหลัง]</p>
            </div>
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">pongsathon.po@kkumail.com</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> ข้อมูลเข้ารหัสทุกขั้นตอน</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> แสดงสมมติฐานทุกการคำนวณ</span>
          </div>
        </div>
      </section>
    </div>
  );
}
