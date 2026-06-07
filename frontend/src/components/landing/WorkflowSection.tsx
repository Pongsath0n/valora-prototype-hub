import {
  ArrowRight,
  BadgeCheck,
  ChefHat,
  ClipboardCheck,
  MessageCircle,
  Receipt,
  ShoppingBag,
  Smartphone,
} from "lucide-react";

const flow = [
  { icon: MessageCircle, label: "LINE OA", note: "ลูกค้ากดลิงก์จาก Rich Menu" },
  { icon: Smartphone, label: "เปิดเมนูร้าน", note: "เปิดหน้าสั่งได้ทันที" },
  { icon: ShoppingBag, label: "สร้างออเดอร์", note: "เลือกของ + สรุปยอด" },
  { icon: Receipt, label: "อัปโหลดสลิป", note: "โอนเงิน + แนบสลิป" },
  { icon: ClipboardCheck, label: "ร้านยืนยัน", note: "ตรวจสลิปด้วยมือ" },
  { icon: ChefHat, label: "กำลังเตรียม", note: "ร้านเริ่มเตรียม" },
  { icon: BadgeCheck, label: "พร้อมรับ", note: "พร้อมรับ / ส่ง" },
  { icon: BadgeCheck, label: "สรุปยอด", note: "สรุปยอด + กำไร" },
];

export default function WorkflowSection() {
  return (
    <section
      id="workflow"
      className="border-t py-20 md:py-24"
      aria-labelledby="workflow-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            โฟลว์การทำงาน
          </p>
          <h2
            id="workflow-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            จากลูกค้ากดลิงก์ ถึงสรุปกำไร ในไม่กี่ขั้นตอน
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            วางลิงก์หน้า ร้านไว้ใน Rich Menu ของ LINE OA ลูกค้ากดเข้ามาสั่งได้ทันที ไม่ต้องล็อกอิน ส่วนร้านตรวจสลิปและจัดคิวในหลังบ้าน
          </p>
        </div>

        <div className="mt-12">
          <div className="-mx-4 overflow-x-auto px-4 pb-2 md:overflow-visible">
            <ol
              className="flex min-w-max items-stretch gap-3 md:grid md:min-w-0 md:grid-cols-4 md:gap-4 lg:grid-cols-8"
              aria-label="ขั้นตอนการทำงานของ Valora"
            >
              {flow.map((step, i) => (
                <li
                  key={step.label}
                  className="flex items-center gap-3 md:flex-col md:items-stretch md:gap-0"
                >
                  <div className="flex w-44 flex-col items-center rounded-2xl border bg-card p-4 text-center shadow-sm md:w-auto">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                      aria-hidden
                    >
                      <step.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">{step.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.note}</p>
                  </div>
                  {i < flow.length - 1 && (
                    <ArrowRight
                      className="h-5 w-5 flex-shrink-0 text-muted-foreground md:hidden"
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            รับออเดอร์แล้ว → รอชำระเงิน/รอตรวจสลิป → ยืนยันแล้ว → กำลังเตรียม → พร้อมรับ / เสร็จสิ้น
          </p>
        </div>
      </div>
    </section>
  );
}
