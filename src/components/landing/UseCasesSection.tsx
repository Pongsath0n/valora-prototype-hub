import { Building2, Coffee, ShoppingBag, Sparkles } from "lucide-react";

const useCases = [
  {
    icon: Coffee,
    title: "ร้านกาแฟแบบ Pick-up",
    desc: "ลูกค้าสั่งล่วงหน้าผ่าน LINE OA แล้วมารับหน้าร้าน ลดคิวยืนรอ ปิดยอดเร็วขึ้น",
    points: ["สั่งล่วงหน้าได้", "ไม่ต้องจดออเดอร์ในกระดาษ", "แจ้งเตือนเมื่อพร้อมรับ"],
  },
  {
    icon: Building2,
    title: "ร้านในคอนโด / หอพัก",
    desc: "ขายในกลุ่มลูกค้าเฉพาะตึก รับออเดอร์ผ่านไลน์ ส่งให้ถึงหน้าห้อง คุมต้นทุนได้ง่าย",
    points: ["ดูยอดต่อรอบส่ง", "รู้เมนูที่ทำกำไรจริง", "แอดมินคนเดียวก็พอ"],
  },
  {
    icon: ShoppingBag,
    title: "ร้านขนม / เครื่องดื่มขนาดเล็ก",
    desc: "ไม่ต้องลงทุน POS ใหญ่ ใช้ Valora จัดการทุกออเดอร์ ตรวจสลิป และดูกำไรในระบบเดียว",
    points: ["เริ่มใช้ง่าย", "เหมาะกับเจ้าของร้านคนเดียว", "เก็บข้อมูลไว้วิเคราะห์ทีหลัง"],
  },
  {
    icon: Sparkles,
    title: "ธุรกิจ Pre-order ผ่าน LINE OA",
    desc: "เปิดพรีออเดอร์เป็นรอบ รับสลิปและจัดคิวให้เป็นระบบ ปิดยอดสรุปแต่ละรอบได้ทันที",
    points: ["เปิด/ปิดเมนูตามรอบ", "ติดตามสถานะออเดอร์", "สรุปยอดต่อรอบเสร็จในแอป"],
  },
];

export default function UseCasesSection() {
  return (
    <section
      id="use-cases"
      className="border-t bg-muted/30 py-20 md:py-24"
      aria-labelledby="usecases-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            เหมาะกับใคร
          </p>
          <h2
            id="usecases-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            ออกแบบมาเพื่อร้านเล็กที่ขายผ่าน LINE OA โดยเฉพาะ
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ถ้าร้านของคุณเข้าข่ายข้อใดข้อหนึ่งด้านล่าง Valora น่าจะช่วยให้ทำงานเบาลงทันที
          </p>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {useCases.map((u) => (
            <li
              key={u.title}
              className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-8"
            >
              <div
                className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent"
                aria-hidden
              >
                <u.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground md:text-xl">{u.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                {u.desc}
              </p>
              <ul className="mt-4 space-y-2">
                {u.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm text-foreground/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
