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
    title: "LINE OA Order Flow",
    desc: "เปิดเมนูผ่าน LIFF ในไลน์ของร้าน รับออเดอร์ตรง ไม่ต้องคุยข้อความทีละคน",
    tag: "Customer",
  },
  {
    icon: Receipt,
    title: "Manual Slip Review",
    desc: "เห็นสลิปและยอดเงินในที่เดียว ตรวจด้วยตา กดยืนยันหรือปฏิเสธพร้อมเหตุผล",
    tag: "Phase 1",
  },
  {
    icon: ClipboardList,
    title: "Order Queue",
    desc: "คิวออเดอร์เคลื่อนจากรับแล้ว → เตรียม → พร้อมรับ → เสร็จ ติดตามสถานะแบบเรียลไทม์",
    tag: "Operations",
  },
  {
    icon: Wallet,
    title: "Payment Queue",
    desc: "หน้าจัดการคำขอชำระเงินแยกชัด เห็นว่าใครรอตรวจ ใครยืนยันแล้ว ใครต้องติดต่อกลับ",
    tag: "Finance",
  },
  {
    icon: BarChart3,
    title: "Menu Cost & Profit",
    desc: "คำนวณต้นทุน–กำไรขั้นต้นจาก order_items รู้ว่าเมนูไหนทำเงินจริง เมนูไหนแค่ดูสวย",
    tag: "Insight",
  },
  {
    icon: LayoutDashboard,
    title: "Admin Dashboard",
    desc: "หน้าเดียวเห็นยอดขาย ออเดอร์ค้าง สลิปรอตรวจ และกำไรของวัน ไม่ต้องเปิดหลายแท็บ",
    tag: "Owner",
  },
  {
    icon: Store,
    title: "Sales Channel Support",
    desc: "รองรับหลายช่องทางขาย แยกค่าธรรมเนียมตามแพลตฟอร์ม เพื่อให้กำไรสุทธิที่เห็นเป็นจริง",
    tag: "Multi-channel",
  },
  {
    icon: ScanSearch,
    title: "Ready for Slip Verification API",
    desc: "ระบบออกแบบเผื่อต่อ API ตรวจสลิปอัตโนมัติในอนาคต โดยไม่ต้องรื้อโฟลว์เดิม",
    tag: "Future-ready",
  },
];

export default function Features() {
  return (
    <section id="features" className="border-t bg-muted/30 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            ฟีเจอร์หลัก
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            ทุกอย่างที่ร้านเล็กต้องใช้จริง ๆ ในที่เดียว
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ไม่ใช่ POS ใหญ่ที่ฟีเจอร์ล้น แต่เป็นเครื่องมือพอดีตัวสำหรับร้านที่ขายผ่าน LINE OA และหน้าร้าน
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex flex-col rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <f.icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
