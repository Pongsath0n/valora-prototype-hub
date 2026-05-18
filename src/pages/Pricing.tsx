import { Link } from "react-router-dom";
import LogoBrand from "@/components/LogoBrand";
import { useEffect, useState } from "react";
import { Check, Minus, ChevronDown, ChevronUp, ShieldCheck, Sparkles } from "lucide-react";

// ─── Plan Definitions ──────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    audience: "เหมาะสำหรับร้านที่เพิ่งเริ่มต้น หรือต้องการทดลองใช้งาน",
    features: [
      "เมนูสูงสุด 10 รายการ",
      "บันทึกสถานการณ์ได้สูงสุด 3 สถานการณ์",
      "ดูแดชบอร์ดและตัวชี้วัดพื้นฐาน",
      "คำนวณจุดคุ้มทุน (BEP) อัตโนมัติ",
      "แสดงที่มาของสมมติฐานการคำนวณ",
    ],
    notIncluded: ["ส่งออก PDF/PNG", "เครื่องมือจำลองโปรโมชัน", "เครื่องมือช่องทางจัดส่ง", "แชร์ลิงก์รายงาน"],
    cta: "เริ่มใช้งานฟรี",
    ctaLink: "/onboarding",
    microcopy: "ไม่ต้องใช้บัตร",
    highlighted: false,
    badge: null,
  },
  {
    id: "starter",
    name: "Starter",
    price: 590,
    audience: "เหมาะสำหรับร้านที่ต้องการวิเคราะห์โปรโมชันและช่องทางจัดส่ง",
    features: [
      "เมนูสูงสุด 30 รายการ",
      "บันทึกสถานการณ์ได้สูงสุด 20 สถานการณ์",
      "ส่งออกรายงานสรุป PDF/PNG (1 หน้า)",
      "จำลองโปรโมชัน: ส่วนลด % เท่านั้น",
      "เครื่องมือช่องทางจัดส่ง: หักค่า Fee %",
      "แสดงที่มาของสมมติฐานการคำนวณ",
      "หน่วยมาตรฐาน: ฿/แก้ว, แก้ว/วัน, %",
    ],
    notIncluded: ["สถานการณ์ไม่จำกัด", "โปรโมชันซื้อ 1 แถม 1 / คูปอง", "แชร์ลิงก์รายงาน"],
    cta: "ซื้อแพ็กเกจ Starter",
    ctaLink: "/auth/login",
    microcopy: "ชำระครั้งเดียว ใช้ได้ตลอดไป",
    highlighted: true,
    badge: "แนะนำ",
  },
  {
    id: "pro",
    name: "Pro",
    price: 1490,
    audience: "เหมาะสำหรับเจ้าของร้านที่ต้องการข้อมูลเชิงลึกเพื่อการตัดสินใจเชิงธุรกิจ",
    features: [
      "เมนูไม่จำกัด",
      "บันทึกสถานการณ์ไม่จำกัด พร้อมประวัติย้อนหลัง",
      "ส่งออก PDF/PNG: สรุป 1 หน้า + รายงานเปรียบเทียบสถานการณ์",
      "จำลองโปรโมชัน: ส่วนลด %, ซื้อ 1 แถม 1, คูปอง",
      "ช่องทางจัดส่ง: แนะนำราคาและเปรียบเทียบกำไรระหว่างช่อง",
      "แชร์ลิงก์รายงานแบบอ่านอย่างเดียว",
      "แสดงที่มาและสมมติฐานการคำนวณแบบละเอียด",
      "หน่วยมาตรฐาน: ฿/แก้ว, แก้ว/วัน, % ครบทุกรายงาน",
    ],
    notIncluded: [],
    cta: "ซื้อแพ็กเกจ Pro",
    ctaLink: "/auth/login",
    microcopy: "เหมาะสำหรับการตัดสินใจเชิงธุรกิจ",
    highlighted: false,
    badge: null,
  },
];

// ─── Comparison Table Rows ─────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { feature: "จำนวนเมนูสูงสุด", free: "10 รายการ", starter: "30 รายการ", pro: "ไม่จำกัด" },
  { feature: "จำนวนสถานการณ์ที่บันทึกได้", free: "3 สถานการณ์", starter: "20 สถานการณ์", pro: "ไม่จำกัด + ประวัติ" },
  { feature: "แดชบอร์ดและตัวชี้วัด BEP", free: true, starter: true, pro: true },
  { feature: "แสดงที่มาของสมมติฐาน", free: true, starter: true, pro: true },
  { feature: "ส่งออก PDF/PNG (สรุป 1 หน้า)", free: false, starter: true, pro: true },
  { feature: "ส่งออกรายงานเปรียบเทียบสถานการณ์", free: false, starter: false, pro: true },
  { feature: "จำลองโปรโมชัน (ส่วนลด %)", free: false, starter: true, pro: true },
  { feature: "จำลองโปรโมชัน (ซื้อ 1 แถม 1, คูปอง)", free: false, starter: false, pro: true },
  { feature: "ช่องทางจัดส่ง: หักค่า Fee %", free: false, starter: true, pro: true },
  { feature: "ช่องทางจัดส่ง: แนะนำราคาที่เหมาะสม", free: false, starter: false, pro: true },
  { feature: "แชร์ลิงก์รายงานอ่านอย่างเดียว", free: false, starter: false, pro: true },
  { feature: "หน่วยมาตรฐาน (฿/แก้ว, แก้ว/วัน, %)", free: true, starter: true, pro: true },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "ต้องใช้บัตรเครดิตในการเริ่มต้นใช้งานไหม",
    a: "แพ็กเกจ Free ไม่ต้องใช้บัตรเครดิตหรือข้อมูลการชำระเงินใดๆ สามารถเริ่มต้นได้ทันที สำหรับแพ็กเกจ Starter และ Pro จะต้องระบุวิธีชำระเงินเมื่อซื้อ",
  },
  {
    q: "ซื้อแล้วใช้ได้ตลอดไปเลยหรือมีวันหมดอายุ",
    a: "ใช่ครับ เป็นระบบซื้อขาด (จ่ายครั้งเดียว) ไม่มีค่าบริการรายเดือนหรือรายปี เมื่อชำระเงินแล้ว ใช้งานได้ตลอดไปไม่มีวันหมดอายุ",
  },
  {
    q: "ราคาที่แสดงรวม VAT แล้วหรือยัง",
    a: "ราคาที่แสดงยังไม่รวม VAT 7% ราคาสุทธิที่ต้องชำระจริงจะแสดงในหน้ายืนยันการชำระเงินก่อนดำเนินการ",
  },
  {
    q: "ข้อมูลธุรกิจที่กรอกเข้าระบบปลอดภัยเพียงใด",
    a: "ข้อมูลที่ส่งระหว่างอุปกรณ์และเซิร์ฟเวอร์ถูกเข้ารหัสระหว่างการส่งผ่าน (encryption in transit) Valora ไม่นำข้อมูลร้านค้าของคุณไปใช้เพื่อวัตถุประสงค์ทางโฆษณาหรือขายให้บุคคลที่สาม",
  },
  {
    q: "ขอลบข้อมูลของฉันออกจากระบบได้ไหม",
    a: "ได้ครับ เจ้าของข้อมูลมีสิทธิขอลบข้อมูลทั้งหมดได้ตลอดเวลาผ่านการติดต่อทีมงาน Valora ภายใน 30 วันทำการข้อมูลจะถูกลบออกจากระบบถาวร ยกเว้นที่กฎหมายกำหนดให้เก็บรักษา",
  },
  {
    q: "อัปเกรดแพ็กเกจกระทบกับข้อมูลที่มีอยู่ไหม",
    a: "การอัปเกรดไม่กระทบข้อมูลใดๆ ข้อมูลเดิมจะยังคงอยู่ครบถ้วน แพ็กเกจใหม่จะเปิดฟีเจอร์เพิ่มเติมตามระดับที่ซื้อ",
  },
];

// ─── PDPA Sections ─────────────────────────────────────────────────────────────
const PDPA_SECTIONS = [
  {
    title: "1. ประเภทข้อมูลที่จัดเก็บ",
    content: "Valora จัดเก็บข้อมูล ได้แก่ อีเมลและข้อมูลบัญชีผู้ใช้ที่ใช้ในการยืนยันตัวตน ข้อมูลร้านค้าที่ผู้ใช้กรอกเอง (ชื่อร้าน จำนวนวันเปิด เป้ากำไร) ข้อมูลเมนูและต้นทุน ข้อมูลค่าใช้จ่ายคงที่ และประวัติสถานการณ์ที่บันทึกไว้ในระบบ",
  },
  {
    title: "2. วัตถุประสงค์การประมวลผล",
    content: "ข้อมูลถูกประมวลผลเพื่อ (ก) คำนวณและแสดงผลตัวชี้วัดทางธุรกิจแก่ผู้ใช้ (ข) สร้างรายงานตามคำขอ (ค) ปรับปรุงประสิทธิภาพและคุณภาพของระบบ Valora ในภาพรวม โดยไม่มีการระบุตัวตนของผู้ใช้รายบุคคล",
  },
  {
    title: "3. การเก็บรักษาและความปลอดภัย",
    content: "ข้อมูลที่ส่งระหว่างอุปกรณ์และเซิร์ฟเวอร์ถูกเข้ารหัสระหว่างการส่งผ่าน (encryption in transit) Valora ใช้มาตรการควบคุมการเข้าถึงที่เหมาะสมเพื่อป้องกันการเข้าถึงโดยไม่ได้รับอนุญาต และไม่อนุญาตให้บุคลากรภายในเข้าถึงข้อมูลส่วนบุคคลโดยไม่มีความจำเป็น",
  },
  {
    title: "4. การเปิดเผยข้อมูลต่อบุคคลที่สาม",
    content: "Valora ไม่ขายหรือนำข้อมูลส่วนบุคคลของผู้ใช้ไปใช้เพื่อวัตถุประสงค์ทางโฆษณาโดยไม่ได้รับความยินยอม การเปิดเผยข้อมูลต่อบุคคลที่สามจะเกิดขึ้นเฉพาะเมื่อมีความจำเป็นทางกฎหมาย หรือเพื่อการให้บริการที่ผู้ใช้ร้องขอ (เช่น ผู้ให้บริการชำระเงิน)",
  },
  {
    title: "5. สิทธิของเจ้าของข้อมูล",
    content: "ผู้ใช้มีสิทธิ (ก) เข้าถึงและขอสำเนาข้อมูลส่วนบุคคล (ข) แก้ไขข้อมูลที่ไม่ถูกต้อง (ค) ส่งออกข้อมูลในรูปแบบที่ใช้ได้ทั่วไป (ง) ขอลบข้อมูลทั้งหมด โดยสามารถใช้สิทธิดังกล่าวได้ผ่านการติดต่อทีมงาน Valora",
  },
  {
    title: "6. ระยะเวลาการเก็บรักษาข้อมูล",
    content: "ข้อมูลจะถูกเก็บรักษาตราบเท่าที่บัญชียังใช้งานอยู่ หรือตามที่จำเป็นสำหรับการให้บริการ หลังจากยกเลิกบัญชี ผู้ใช้สามารถขอให้ลบข้อมูลทั้งหมดได้ และจะดำเนินการภายใน 30 วันทำการ ยกเว้นข้อมูลที่กฎหมายกำหนดให้จัดเก็บ",
  },
  {
    title: "7. ช่องทางติดต่อ",
    content: "หากมีข้อสงสัยหรือต้องการใช้สิทธิตามนโยบายนี้ กรุณาติดต่อ: pongsathon.officialwork@gmail.com หรือผ่านแบบฟอร์มติดต่อในแอปพลิเคชัน",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────
function CellValue({ val }: { val: boolean | string }) {
  if (typeof val === "string") return <span className="text-sm text-foreground font-medium">{val}</span>;
  return val ? (
    <Check className="w-4 h-4 text-success mx-auto" />
  ) : (
    <Minus className="w-4 h-4 text-muted-foreground mx-auto" />
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left gap-4"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {open && <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>}
    </div>
  );
}

function PDPAItem({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left gap-4"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {open && <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{content}</p>}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PricingPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const price = (plan: typeof PLANS[0]) => {
    if (plan.price === 0) return "฿0";
    return `฿${plan.price.toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center">
            <LogoBrand size="sm" />
          </Link>
          <Link
            to="/auth/login"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-16 space-y-16">
        {/* ── A) Header ───────────────────────────────────────────────────────── */}
        <div className="text-center space-y-4">
          <h1
            className="text-3xl md:text-4xl font-bold text-foreground"
            style={{ lineHeight: 1.6, letterSpacing: '0.01em' }}
          >
            เลือกแพ็กเกจที่เหมาะกับร้านคุณ
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            ชำระครั้งเดียว ใช้งานได้ตลอดไปไม่มีค่าบริการรายเดือนหรือรายปี
            พร้อมหน่วยมาตรฐาน (บาท/แก้ว, แก้ว/วัน, %) ครบถ้วน
          </p>

          {/* Transparency badge */}
          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-full px-4 py-1.5 text-sm text-foreground">
            <ShieldCheck className="w-4 h-4 text-accent" />
            แสดงที่มาของตัวเลขและสมมติฐานการคำนวณทุกรายการ
          </div>
        </div>

        {/* ── B) One-time Purchase Badge ─────────────────────────────────────── */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 bg-success/10 border border-success/30 rounded-full px-5 py-2 text-sm font-semibold text-foreground">
            <Sparkles className="w-4 h-4 text-success" />
            ชำระครั้งเดียว — ไม่มีค่าบริการรายเดือน / รายปี
          </div>
        </div>

        {/* ── C) Plan Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
          {PLANS.map((plan) => {
            return (
              <div
                key={plan.id}
                className={`stat-card flex flex-col relative transition-all hover:translate-y-[-4px] ${
                  plan.highlighted ? "ring-2 ring-primary shadow-xl md:scale-105 z-10" : "hover:shadow-md"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-accent text-accent-foreground text-[10px] font-bold px-3 py-1 rounded-full shadow-sm uppercase tracking-widest">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed h-10">
                    {plan.audience}
                  </p>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-foreground tabular-nums tracking-tight">
                      {price(plan)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-sm text-muted-foreground font-medium">ครั้งเดียว</span>
                    )}
                  </div>
                  {plan.price === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">ใช้งานได้ทันที ไม่จำกัดเวลา</p>
                  )}
                  {plan.price > 0 && (
                    <p className="text-xs text-success font-semibold mt-2">ซื้อขาด ไม่มีค่าบริการรายเดือน/รายปี</p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-4 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-foreground/90">
                      <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-success" />
                      </div>
                      {f}
                    </li>
                  ))}
                  {plan.notIncluded.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-muted-foreground/60">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Minus className="w-3 h-3" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4">
                  <Link
                    to={plan.ctaLink}
                    className={`block text-center py-3.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 shadow-sm cursor-pointer ${
                      plan.highlighted
                        ? "bg-primary text-primary-foreground shadow-primary/20"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                  <p className="text-center text-[11px] text-muted-foreground mt-3 font-medium">
                    {plan.microcopy}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── D) Comparison Table ─────────────────────────────────────────────── */}
        <div className="stat-card overflow-x-auto">
          <h2 className="section-title mb-6">เปรียบเทียบแพ็กเกจอย่างละเอียด</h2>
          <table className="w-full text-sm min-w-[540px]">
            <thead>
              <tr className="border-b">
                <th className="pb-3 text-left font-medium text-muted-foreground w-1/2">คุณสมบัติ</th>
                <th className="pb-3 text-center font-semibold text-foreground">Free</th>
                <th className="pb-3 text-center font-semibold text-foreground">
                  Starter
                  <span className="block text-xs text-accent font-normal">แนะนำ</span>
                </th>
                <th className="pb-3 text-center font-semibold text-foreground">Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-3 text-foreground font-medium">{row.feature}</td>
                  <td className="py-3 text-center">
                    <CellValue val={row.free} />
                  </td>
                  <td className="py-3 text-center bg-accent/5">
                    <CellValue val={row.starter} />
                  </td>
                  <td className="py-3 text-center">
                    <CellValue val={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td className="pt-4" />
                <td className="pt-4 text-center">
                  <Link to="/onboarding" className="text-xs font-medium text-accent hover:underline">
                    เริ่มฟรี
                  </Link>
                </td>
                <td className="pt-4 text-center bg-accent/5">
                  <Link to="/auth/login" className="text-xs font-medium text-accent hover:underline">
                    ซื้อ Starter
                  </Link>
                </td>
                <td className="pt-4 text-center">
                  <Link to="/auth/login" className="text-xs font-medium text-accent hover:underline">
                    ซื้อ Pro
                  </Link>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── E) FAQ ──────────────────────────────────────────────────────────── */}
        <div className="stat-card">
          <h2 className="section-title mb-2">คำถามที่พบบ่อย</h2>
          <p className="text-sm text-muted-foreground mb-6">
            คำถามที่ผู้ใช้มักถามก่อนตัดสินใจซื้อ
          </p>
          <div>
            {FAQS.map((faq, i) => (
              <FAQItem key={i} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>

        {/* ── F) PDPA ─────────────────────────────────────────────────────────── */}
        <div className="stat-card">
          <div className="flex items-start gap-3 mb-4">
            <ShieldCheck className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="section-title">นโยบายความเป็นส่วนตัว (สรุปย่อ)</h2>
              <p className="text-sm text-muted-foreground mt-1">
                ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
                Valora ดำเนินการตามหลักการดังนี้
              </p>
            </div>
          </div>
          <div>
            {PDPA_SECTIONS.map((s, i) => (
              <PDPAItem key={i} title={s.title} content={s.content} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            นโยบายนี้อาจมีการปรับปรุงตามความเหมาะสม Valora จะแจ้งให้ทราบล่วงหน้าไม่น้อยกว่า 30 วันหากมีการเปลี่ยนแปลงสาระสำคัญ
          </p>
        </div>

        {/* ── G) Footer ───────────────────────────────────────────────────────── */}
        <div className="border-t pt-8 space-y-3 text-center">
          <p className="text-xs text-muted-foreground">
            ราคาที่แสดงยังไม่รวม VAT 7% — ราคาสุทธิจะแสดงในหน้ายืนยันการชำระเงิน
          </p>
          <p className="text-xs text-muted-foreground font-medium">
            ชำระครั้งเดียว — ไม่มีค่าบริการรายเดือนหรือรายปี
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="#" className="text-xs text-accent hover:underline">
              ข้อกำหนดการใช้งาน
            </Link>
            <span className="text-muted-foreground text-xs">·</span>
            <Link to="#" className="text-xs text-accent hover:underline">
              นโยบายความเป็นส่วนตัว
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
