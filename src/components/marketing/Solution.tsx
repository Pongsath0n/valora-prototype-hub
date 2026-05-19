import { CheckCircle2, ClipboardCheck, MessageCircle, Receipt, Smartphone, Wallet } from "lucide-react";

const steps = [
  {
    icon: Smartphone,
    title: "ลูกค้าเปิดเมนูผ่าน LINE OA",
    desc: "ลูกค้ากดลิงก์ในไลน์ของร้านเพื่อเข้าหน้า LIFF POS เห็นเมนูจริง ราคาจริง พร้อมสั่งได้เลย",
  },
  {
    icon: MessageCircle,
    title: "เลือกเมนูและสร้างออเดอร์",
    desc: "ลูกค้าเลือกของ ปรับจำนวน ใส่หมายเหตุ ระบบรวมเงินให้อัตโนมัติ ไม่ต้องคุยทีละข้อความ",
  },
  {
    icon: Wallet,
    title: "โอนเงินและแนบสลิป",
    desc: "ลูกค้าโอนเข้าบัญชีร้านและอัปโหลดสลิปในระบบ ออเดอร์เข้าสถานะ \"รอตรวจสลิป\" ทันที",
  },
  {
    icon: Receipt,
    title: "แอดมินตรวจสลิปด้วยมือ (Phase 1)",
    desc: "เจ้าของร้านเปิด Admin Dashboard เห็นสลิปและยอดเงิน กดยืนยันรับออเดอร์ หรือปฏิเสธพร้อมเหตุผล",
  },
  {
    icon: ClipboardCheck,
    title: "ระบบจัดคิว ติดตามสถานะ",
    desc: "ออเดอร์เคลื่อนจาก รับแล้ว → กำลังเตรียม → พร้อมรับ → เสร็จสมบูรณ์ พร้อมสรุปยอดและกำไรของวัน",
  },
];

export default function Solution() {
  return (
    <section className="border-t py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
            วิธีที่ Valora ช่วย
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            ตั้งแต่ลูกค้าทักจนปิดยอดวัน อยู่ในระบบเดียว
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Valora ออกแบบโฟลว์ให้เจ้าของร้านคุมง่าย ลูกค้าใช้สะดวก ไม่ต้องสลับหน้าจอหลายตัว
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="relative flex gap-5 rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-7"
            >
              <div className="flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <s.icon className="h-5 w-5" />
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-3 hidden h-full w-px flex-1 bg-border lg:block" aria-hidden />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ขั้นตอนที่ {i + 1}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground md:text-xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
