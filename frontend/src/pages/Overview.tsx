import { Link } from "react-router-dom";
import LogoBrand from "@/components/LogoBrand";
import { 
  BarChart3, 
  Zap, 
  Shield, 
  TrendingUp, 
  ArrowLeft,
  LayoutDashboard,
  Calculator,
  Coins,
  History,
  Target,
  Sparkles,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import FeatureMockup from "@/components/FeatureMockup";

const benefits = [
  {
    icon: LayoutDashboard,
    title: "จบปัญหาการ 'เดา' ยอดขาย",
    subtitle: "Real-time Dashboard",
    desc: "เห็นภาพรวมร้านชัดเจนเหมือนมีเลขาส่วนตัว สรุปยอดขาย ต้นทุน และเป้าหมายกำไรรายวันในหน้าเดียว ไม่ต้องรอสรุปสิ้นเดือน",
    mockup: "dashboard" as const,
    benefits: ["สรุปยอดรายวันอัตโนมัติ", "ติดตามเป้าหมายกำไร", "ดูย้อนหลังได้ไม่จำกัด"]
  },
  {
    icon: Calculator,
    title: "หยุดกำไรไหลออก... อย่างถาวร",
    subtitle: "Recipe Costing Pro",
    desc: "คำนวณต้นทุนวัตถุดิบและกำไรขั้นต้น (GP) แม่นยำระดับ 100% รู้ทันทีว่าเมนูไหนทำเงิน เมนูไหนทำให้ขาดทุน",
    mockup: "costing" as const,
    benefits: ["แยกต้นทุนตามส่วนผสม", "คำนวณ GP อัตโนมัติ", "แจ้งเตือนเมื่อวัตถุดิบแพงขึ้น"]
  },
  {
    icon: Zap,
    title: "รอดทุกวิกฤต ด้วยการจำลองราคา",
    subtitle: "Dynamic Scenarios",
    desc: "ทดลองปรับราคาขาย หรือสมมติค่าวัตถุดิบที่จะขึ้นในอนาคต เพื่อดูผลกระทบต่อกำไรก่อนตัดสินใจจริง ปกป้องร้านของคุณล่วงหน้า",
    mockup: "scenario" as const,
    benefits: ["จำลองโปรโมชั่นลดราคา", "รับมือวัตถุดิบผันผวน", "วางแผนล่วงหน้าได้แม่นยำ"]
  },
  {
    icon: Target,
    title: "รู้จุดคุ้มทุน... ไม่ต้องลุ้นวันต่อวัน",
    subtitle: "Break-even Analysis",
    desc: "คำนวณให้คุณเห็นว่าวันนี้ต้องขายกี่จาน ถึงจะคุ้มค่าเช่าและค่าแรง เปลี่ยนความกังวลเป็นแผนที่ชัดเจน",
    mockup: "breakeven" as const,
    benefits: ["คำนวณเป้าหมายรายวัน", "คุมค่าเช่าและค่าแรง", "รู้จุดคืนทุนที่แท้จริง"]
  }
];

export default function OverviewPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-accent/30 selection:text-foreground">
      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-card/60 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center group-hover:opacity-80 transition-opacity">
            <LogoBrand size="sm" />
          </Link>
          
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-4 sm:gap-8">
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">ราคา</Link>
            <div className="h-4 w-px bg-border" />
            <Link to="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">เข้าสู่ระบบ</Link>
            <Link to="/auth/signup" className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95">
              เริ่มใช้งานฟรี
            </Link>
          </nav>

          {/* Mobile: only show signup CTA */}
          <Link to="/auth/signup" className="sm:hidden bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold active:scale-95 transition-all">
            ฟรี 14 วัน
          </Link>
        </div>
      </header>

      {/* ─── Hero Section ─────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden mesh-gradient text-white">
        {/* Decorative elements */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] -translate-y-1/2" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-primary/20 rounded-full blur-[100px] translate-y-1/2" />
        
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-1.5 rounded-full text-xs font-bold mb-8 animate-fade-in">
            <Sparkles className="w-3 h-3 text-accent" />
            <span>ร่วมยกระดับกับเจ้าของร้านอาหาร 500+ แห่งทั่วไทย</span>
          </div>
          
          <h1
            className="text-4xl md:text-5xl font-bold mb-8 text-glow"
            style={{ lineHeight: 1.8, letterSpacing: '0.01em' }}
          >
            รู้ใจร้าน... <span className="text-accent underline decoration-accent/30 underline-offset-8">รู้งบกำไร</span><br />
            ตัดสินใจแบบมือโปร
          </h1>
          
          <p className="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
            จบปัญหา "ยอดขายดีแต่ไม่มีเงินเหลือ" ด้วยระบบวิเคราะห์ต้นทุนที่แม่นยำที่สุด 
            ให้คุณมองเห็นกำไรที่แท้จริง และวางแผนอนาคตได้อย่างมั่นใจ
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4 items-center">
            <Link to="/auth/signup" className="w-full sm:w-auto bg-accent text-accent-foreground px-10 py-4 rounded-2xl font-black text-lg hover:scale-105 hover:shadow-2xl hover:shadow-accent/40 transition-all active:scale-95">
              เริ่มต้นกู้คืนกำไรทันที
            </Link>
            <p className="text-sm opacity-60 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> ปลอดภัย • ไม่ต้องลงโปรแกรม • ฟรี 14 วัน
            </p>
          </div>
        </div>
      </section>

      {/* ─── The "Why" Section ────────────────────────────────────────────────── */}
      <section className="py-20 bg-card">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card p-8 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                <Coins className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">คุมต้นทุนไม่อยู่?</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">วัตถุดิบราคาขึ้นทุกวัน แต่ไม่กล้าปรับราคาขาย เพราะไม่รู้ว่ากำไรต่อจานเหลือเท่าไหร่กันแน่</p>
            </div>
            <div className="glass-card p-8 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                <History className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">เสียเวลาทำ Excel?</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">นั่งสรุปตัวเลขถึงเที่ยงคืน แต่พอเปิดร้านพรุ่งนี้ ข้อมูลก็ล้าสมัยไปแล้ว เพราะราคาของเปลี่ยนตลอดเวลา</p>
            </div>
            <div className="glass-card p-8 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">ยอดขายดีแต่ไม่มีเงิน?</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">คนเต็มร้านทุกวัน แต่พอหักค่าใช้จ่ายกลับไม่เหลือเงินเก็บ นี่คือกับดักที่ Valora จะมาช่วยปลดล็อค</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Main Benefits ────────────────────────────────────────────────────── */}
      <section className="bg-background py-24 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-24 space-y-4">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-accent">Our Solutions</h2>
            <h3 className="text-3xl md:text-4xl font-bold" style={{ lineHeight: 1.6 }}>ทำไมต้อง Valora Hub?</h3>
          </div>

          <div className="space-y-16 md:space-y-28">
            {benefits.map((b, i) => (
              <div key={b.title} className={`flex flex-col md:flex-row items-center gap-16 ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
                <div className="flex-1 space-y-8 animate-fade-in-up">
                  <div className="space-y-3 text-center md:text-left">
                    <span className="text-sm font-bold text-accent px-3 py-1 bg-accent/10 rounded-lg">{b.subtitle}</span>
                    <h2 className="text-2xl md:text-3xl font-black text-foreground" style={{ lineHeight: 1.6 }}>{b.title}</h2>
                  </div>
                  <p className="text-lg text-muted-foreground leading-relaxed text-center md:text-left">{b.desc}</p>
                  
                  <ul className="space-y-4 max-w-sm mx-auto md:mx-0">
                    {b.benefits.map(item => (
                      <li key={item} className="flex items-center gap-3 font-semibold text-foreground">
                        <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        </div>
                        {item}
                      </li>
                    ))}
                  </ul>

                  {/* Link removed to improve focus on primary CTA at bottom */}
                </div>

                <div className="flex-1 w-full relative">
                  <div className="absolute -inset-4 bg-accent/5 blur-3xl rounded-full" />
                  <div className="relative premium-shadow rounded-[2rem] overflow-hidden border-8 border-card">
                    <FeatureMockup type={b.mockup} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground py-24 relative overflow-hidden">
        <div className="absolute inset-0 mesh-gradient opacity-30" />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10 space-y-10">
          <h2
            className="text-3xl md:text-4xl font-black"
            style={{ lineHeight: 1.8, letterSpacing: '0.01em' }}
          >
            อย่าปล่อยให้กำไรของร้าน<br />
            หายไปกับความไม่แน่นอน
          </h2>
          <p className="text-lg opacity-80 leading-relaxed font-medium">
            เข้าร่วมกับเจ้าของร้านอาหารยุคใหม่ที่ใช้ข้อมูลนำทาง 
            เริ่มต้นวันนี้เพื่อความมั่งคั่งและยั่งยืนในวันหน้า
          </p>
          <div className="flex flex-col sm:flex-row gap-5 justify-center pt-4">
            <Link to="/auth/signup" className="bg-accent text-accent-foreground px-12 py-5 rounded-2xl font-black text-xl hover:scale-105 hover:shadow-2xl hover:shadow-accent/30 transition-all">
              เปิดบัญชี Valora ของคุณ
            </Link>
            <Link to="/pricing" className="bg-white/10 backdrop-blur-md border border-white/20 px-12 py-5 rounded-2xl font-bold text-lg hover:bg-white/20 transition-all flex items-center justify-center gap-2">
              ดูตารางราคา <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
          <p className="text-sm opacity-50">เริ่มใช้ฟรี 14 วัน • ยกเลิกได้ตลอดเวลา • ไม่มีข้อผูกมัดบัตรเครดิต</p>
        </div>
      </section>

      {/* ─── Simple Footer ────────────────────────────────────────────────────── */}
      <footer className="bg-card py-16 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="space-y-4 text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">V</span>
              </div>
              <span className="font-bold text-xl">Valora Hub</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">เครื่องมือวิเคราะห์ต้นทุนและจัดการกำไร สำหรับร้านอาหารและคาเฟ่ไทย</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-4 text-sm font-semibold">
            <Link to="/pricing" className="hover:text-primary transition-colors">ราคา</Link>
            <Link to="/auth/login" className="hover:text-primary transition-colors">เข้าสู่ระบบ</Link>
            <Link to="/auth/signup" className="hover:text-primary transition-colors">เริ่มใช้งาน</Link>
            <a href="mailto:pongsathon.officialwork@gmail.com" className="hover:text-primary transition-colors">ติดต่อเรา</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-16 pt-8 border-t text-center md:text-left">
          <p className="text-xs text-muted-foreground">© 2026 Valora Hub. All rights reserved. สร้างด้วยความรักเพื่อผู้ประกอบการไทย</p>
        </div>
      </footer>
    </div>
  );
}

// Custom Icons for better look
function CheckCircle2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
