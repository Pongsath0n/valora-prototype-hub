import { BarChart3, Boxes, Coffee, Handshake, PackageCheck, Pickaxe, ShoppingCart, Store, TrendingUp } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

const features = [
  { title: "จัดการเมนู", desc: "เพิ่ม แก้ไข และจัดกลุ่มเมนูของร้าน พร้อมกำหนดราคาขายตามช่องทาง", icon: Coffee },
  { title: "คำนวณต้นทุนเมนู", desc: "ผูกเมนูกับวัตถุดิบและสูตร เพื่อคำนวณต้นทุนต่อแก้วหรือต่อรายการ", icon: Pickaxe },
  { title: "จัดการสต็อก", desc: "ติดตามจำนวนวัตถุดิบคงเหลือ และแจ้งเตือนเมื่อวัตถุดิบใกล้หมด", icon: PackageCheck },
  { title: "จัดการออเดอร์", desc: "รองรับการบันทึกออเดอร์จากหน้าร้าน Pick-up และช่องทาง Delivery แบบ manual", icon: ShoppingCart },
  { title: "วิเคราะห์กำไรจริง", desc: "คำนวณยอดขาย ต้นทุน ค่าธรรมเนียมช่องทาง และกำไรขั้นต้นของแต่ละออเดอร์", icon: TrendingUp },
  { title: "Dashboard สำหรับเจ้าของร้าน", desc: "สรุปยอดขาย จำนวนออเดอร์ เมนูขายดี เมนูกำไรดี และวัตถุดิบใกล้หมดในหน้าเดียว", icon: BarChart3 },
  { title: "วิเคราะห์สถานการณ์ร้าน", desc: "ช่วยสรุปสถานการณ์ยอดขาย กำไร ช่องทางขาย เมนูเด่น และวัตถุดิบที่ควรตรวจสอบ เพื่อให้เจ้าของร้านตัดสินใจได้ง่ายขึ้น", icon: Boxes },
];

const useCases = [
  "ร้านกาแฟ / Slow Bar",
  "ร้านเครื่องดื่ม",
  "ร้านที่ขายแบบ Pick-up",
  "ร้านที่ขายผ่าน Delivery Platform",
  "ธุรกิจขนาดเล็กที่ต้องการรู้กำไรจริง",
];

function ScrollBtn() {
  return (
    <a href="#contact" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-7 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
      ติดต่อเพื่อซื้อระบบ
    </a>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <LogoBrand size="sm" />
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#overview" className="hover:text-foreground">ภาพรวมระบบ</a>
            <a href="#features" className="hover:text-foreground">ฟีเจอร์</a>
            <a href="#usecases" className="hover:text-foreground">เหมาะกับใคร</a>
            <a href="#contact" className="hover:text-foreground">ติดต่อเรา</a>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-3xl space-y-6">
          <p className="text-sm text-accent font-semibold">Brewway Internal Business Operating System</p>
          <h1 className="text-4xl md:text-5xl font-bold">Valora Engine</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            ระบบหลังบ้านสำหรับร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็ก ที่ช่วยให้เจ้าของร้านมองเห็นยอดขาย ต้นทุน สต็อก ออเดอร์ และกำไรจริงในระบบเดียว
          </p>
          <ScrollBtn />
        </div>
      </section>

      <section id="overview" className="border-t bg-muted/40">
        <div className="max-w-6xl mx-auto px-4 py-16 space-y-5">
          <h2 className="text-2xl font-bold">ภาพรวมระบบ</h2>
          <p className="text-muted-foreground leading-relaxed">
            Valora Engine ช่วยให้เจ้าของร้านจัดการข้อมูลสำคัญของธุรกิจในระบบเดียว ตั้งแต่เมนู วัตถุดิบ สูตรต้นทุน ออเดอร์ ช่องทางขาย สต็อก ไปจนถึงกำไรจริงของแต่ละเมนู
          </p>
          <p className="text-muted-foreground leading-relaxed">
            ระบบถูกออกแบบมาเพื่อช่วยให้ร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็กสามารถมองเห็นภาพรวมของการขายได้ชัดเจนขึ้น ไม่ใช่เพียงยอดขายรวม แต่รวมถึงต้นทุนที่ใช้จริง กำไรที่เหลือจริง และวัตถุดิบที่ต้องบริหารในแต่ละวัน
          </p>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold mb-6">ฟีเจอร์หลักของระบบ</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <article key={f.title} className="stat-card">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3"><f.icon className="w-5 h-5 text-accent" /></div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="usecases" className="border-t bg-muted/40">
        <div className="max-w-6xl mx-auto px-4 py-16 space-y-6">
          <h2 className="text-2xl font-bold">เหมาะกับธุรกิจแบบไหน?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Valora Engine เหมาะสำหรับร้านกาแฟ ร้านเครื่องดื่ม ร้านอาหารขนาดเล็ก ธุรกิจแบบ Pick-up / Delivery และเจ้าของกิจการที่ต้องการรู้ต้นทุนและกำไรจริงของสินค้าแต่ละรายการ โดยไม่ต้องพึ่ง Excel หลายไฟล์หรือระบบบัญชีที่ซับซ้อนเกินไป
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {useCases.map((item) => (
              <div key={item} className="stat-card flex items-start gap-2"><Store className="w-4 h-4 text-accent mt-0.5" /><span className="text-sm">{item}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="max-w-6xl mx-auto px-4 py-16">
        <div className="stat-card space-y-5">
          <h2 className="text-2xl font-bold">สนใจใช้ Valora Engine กับธุรกิจของคุณ?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Valora Engine เปิดให้ใช้งานในรูปแบบติดต่อเพื่อติดตั้งและปรับระบบให้เหมาะกับธุรกิจของคุณ เหมาะสำหรับร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็กที่ต้องการรู้ต้นทุน กำไรจริง สต็อก และออเดอร์ในระบบเดียว
          </p>

          <div className="space-y-2">
            <h3 className="font-semibold">ช่องทางติดต่อ</h3>
            <p className="text-sm font-medium">Instagram</p>
            {/* MARKING: Add Brewway / Valora Instagram username or URL here later */}
            <p className="text-sm text-muted-foreground">[MARKING: เพิ่มชื่อ IG หรือ URL ภายหลัง]</p>
            <p className="text-sm font-medium pt-2">Email</p>
            <p className="text-sm text-muted-foreground">pongsathon.po@kkumail.com</p>
          </div>
        </div>
      </section>

      <footer className="border-t bg-card/60">
        <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Valora Engine</p>
          <p>ระบบหลังบ้านเพื่อช่วยให้ธุรกิจเครื่องดื่มเห็นต้นทุนและกำไรจริงได้ชัดเจน</p>
          <p>Contact: pongsathon.po@kkumail.com</p>
          <p>© {new Date().getFullYear()} Valora Engine</p>
        </div>
      </footer>
    </div>
  );
}
