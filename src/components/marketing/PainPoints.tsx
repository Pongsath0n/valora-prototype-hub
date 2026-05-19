import { AlertTriangle, Banknote, ClipboardX, MessageSquareWarning, Settings2, UserCog } from "lucide-react";

const painPoints = [
  {
    icon: MessageSquareWarning,
    title: "รับออเดอร์ในแชทแล้วตกหล่น",
    desc: "ลูกค้าทักมาในไลน์รวมกับแชทอื่น เลื่อนแป๊บเดียวก็หาย ออเดอร์ขาด หาย ทำผิดเมนู",
  },
  {
    icon: Banknote,
    title: "ตรวจสลิปไม่เป็นระบบ",
    desc: "สลิปกระจัดกระจาย ต้องไล่เช็คในแชททีละคน บางทีลูกค้าโอนแล้วลืมยืนยัน",
  },
  {
    icon: ClipboardX,
    title: "ไม่รู้ว่าแต่ละเมนูกำไรจริงเท่าไหร่",
    desc: "ขายดีแต่ไม่รู้ว่ากำไรเหลือเท่าไหร่ ปรับราคาทีต้องเดา ต้นทุนวัตถุดิบขยับก็ตามไม่ทัน",
  },
  {
    icon: Settings2,
    title: "ใช้ POS ใหญ่เกินความจำเป็น",
    desc: "ระบบที่มีในตลาดออกแบบให้ร้านใหญ่ ฟีเจอร์เยอะเกิน ใช้จริงแค่ 10% แต่จ่ายเต็ม",
  },
  {
    icon: UserCog,
    title: "เจ้าของร้านต้องทำทุกอย่างเอง",
    desc: "ทั้งรับออเดอร์ ตรวจสลิป ชง ส่ง สรุปยอด ทำคนเดียวจนไม่มีเวลาคิดเรื่องโต",
  },
];

export default function PainPoints() {
  return (
    <section className="border-t bg-muted/30 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            ปัญหาที่ร้านเล็กเจอทุกวัน
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            ขายดีก็เหนื่อย ขายไม่ดีก็เครียด
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ปัญหาเหล่านี้คือสิ่งที่ Valora ได้ยินจากร้านเล็กบ่อยที่สุด
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {painPoints.map((p) => (
            <div
              key={p.title}
              className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
