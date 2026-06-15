import {
  BarChart3,
  Calculator,
  ClipboardList,
  Coffee,
  MessageCircle,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "เห็นต้นทุน–กำไรจริงต่อเมนู",
    desc: "รู้ว่าเมนูไหนทำเงินจริง เมนูไหนแค่ดูดี คำนวณกำไรจาก ราคา − ต้นทุน − ค่าธรรมเนียมช่องทาง",
    tag: "ข้อมูลเชิงลึก",
  },
  {
    icon: ShieldCheck,
    title: "ปกป้องข้อมูลการเงินตามบทบาท",
    desc: "พนักงานจัดการออเดอร์และตรวจสลิปได้ แต่ไม่เห็นต้นทุน/กำไร",
    tag: "ความปลอดภัย",
  },
  {
    icon: Calculator,
    title: "Recipe & Addon Cost Engine",
    desc: "ผูกวัตถุดิบและสูตรเข้ากับเมนูและ Extra Shot เพื่อคิดต้นทุนต่อแก้ว",
    tag: "ต้นทุน",
  },
  {
    icon: MessageCircle,
    title: "ลูกค้าสั่งเองผ่านลิงก์",
    desc: "เปิดเมนูจาก LINE OA หรือลิงก์ร้าน สั่งได้ทันที ไม่ต้องสมัคร/ล็อกอิน",
    tag: "ลูกค้า",
  },
  {
    icon: Coffee,
    title: "ตัวเลือกเครื่องดื่ม",
    desc: "ความหวาน / เพิ่มช็อต / จำนวน / หมายเหตุ ปรับได้ในหน้าเดียว",
    tag: "ลูกค้า",
  },
  {
    icon: Wallet,
    title: "PromptPay + Slip Upload",
    desc: "ลูกค้าโอนและแนบสลิป ติดตามสถานะได้เอง",
    tag: "การเงิน",
  },
  {
    icon: ClipboardList,
    title: "Staff Order Operation",
    desc: "รับออเดอร์ ตรวจสลิป อนุมัติ/ปฏิเสธ และอัปเดตสถานะ",
    tag: "หน้าร้าน",
  },
  {
    icon: Store,
    title: "Channel Fee Modelling",
    desc: "แยกค่าธรรมเนียมตามช่องทางเพื่อให้กำไรสุทธิใกล้ความจริงมากขึ้น",
    tag: "ต้นทุน",
  },
];

export default function FeatureGrid() {
  return (
    <section
      id="features"
      className="border-t bg-muted/30 py-20 md:py-24"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            ฟีเจอร์หลัก
          </p>
          <h2
            id="features-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            ทุกอย่างที่ร้านเล็กต้องใช้จริง ๆ ในที่เดียว
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ไม่ใช่ POS ใหญ่ที่ฟีเจอร์ล้น แต่เป็นเครื่องมือพอดีตัวสำหรับร้านที่ขายผ่าน LINE OA และหน้าร้าน
          </p>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <li
              key={f.title}
              className="group flex flex-col rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between">
                <span
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"
                  aria-hidden
                >
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
