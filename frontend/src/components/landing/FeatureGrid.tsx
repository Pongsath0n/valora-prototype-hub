import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  ScanSearch,
  Store,
  Wallet,
} from "lucide-react";

const features = [
  {
    icon: MessageCircle,
    title: "เปิดเมนูออนไลน์",
    desc: "ลูกค้ากดลิงก์จาก LINE OA หรือลิงก์ร้าน เปิดเมนูสั่งได้เลย ไม่ต้องสมัครสมาชิก",
    tag: "ลูกค้า",
  },
  {
    icon: Receipt,
    title: "ตรวจสลิปด้วยมือ",
    desc: "เห็นสลิปและยอดเงินในที่เดียว ตรวจด้วยตา กดยืนยันหรือปฏิเสธพร้อมเหตุผล",
    tag: "การเงิน",
  },
  {
    icon: ClipboardList,
    title: "คิวออเดอร์",
    desc: "ออเดอร์เคลื่อนจากรับแล้ว → เตรียม → พร้อมรับ → เสร็จ ติดตามสถานะได้ตลอด",
    tag: "หน้าร้าน",
  },
  {
    icon: Wallet,
    title: "รายการรอตรวจสลิป",
    desc: "เห็นชัดว่าใครรอตรวจ ใครยืนยันแล้ว ใครต้องติดต่อกลับ ไม่ตกหล่น",
    tag: "การเงิน",
  },
  {
    icon: BarChart3,
    title: "ต้นทุน–กำไรต่อเมนู",
    desc: "คำนวณต้นทุนและกำไรของแต่ละเมนู รู้ว่าเมนูไหนทำเงินจริง เมนูไหนแค่ดูสวย",
    tag: "ข้อมูลเชิงลึก",
  },
  {
    icon: LayoutDashboard,
    title: "หลังบ้านร้านค้า",
    desc: "หน้าเดียวเห็นยอดขาย ออเดอร์ค้าง สลิปรอตรวจ และกำไรของวัน ไม่ต้องเปิดหลายแท็บ",
    tag: "เจ้าของร้าน",
  },
  {
    icon: Store,
    title: "รองรับหลายช่องทางขาย",
    desc: "แยกค่าธรรมเนียมตามแต่ละช่องทาง เพื่อให้กำไรสุทธิที่เห็นตรงกับความจริง",
    tag: "หลายช่องทาง",
  },
  {
    icon: ScanSearch,
    title: "พร้อมต่อยอดในอนาคต",
    desc: "ออกแบบเผื่อเพิ่มการตรวจสลิปอัตโนมัติในอนาคต โดยไม่ต้องรื้อระบบเดิม",
    tag: "ต่อยอดได้",
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
