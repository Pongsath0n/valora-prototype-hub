import {
  ArrowRight,
  EyeOff,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Wallet,
} from "lucide-react";

const steps = [
  {
    icon: ShoppingBag,
    title: "ลูกค้าสั่งสินค้า",
    desc: "กดลิงก์เปิดเมนู เลือกของ และสร้างออเดอร์ได้เอง ไม่ต้องสมัครหรือล็อกอิน",
  },
  {
    icon: Wallet,
    title: "ชำระเงิน / อัปโหลดสลิป",
    desc: "ลูกค้าโอนผ่าน PromptPay และแนบสลิป ออเดอร์เข้าสถานะรอตรวจทันที",
  },
  {
    icon: Receipt,
    title: "พนักงานรับและจัดการออเดอร์",
    desc: "ตรวจสลิป อนุมัติหรือปฏิเสธ และอัปเดตสถานะออเดอร์ในหลังบ้าน",
  },
  {
    icon: ShieldCheck,
    title: "เจ้าของเห็นต้นทุนและกำไรจริง",
    desc: "ต้นทุน ค่าธรรมเนียมช่องทาง และกำไร ทั้งต่อออเดอร์และต่อรายการเมนู",
  },
];

export default function VerifiedWorkflowSection() {
  return (
    <section
      id="workflow"
      className="border-t py-20 md:py-24"
      aria-labelledby="verified-workflow-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
            Verified Workflow
          </p>
          <h2
            id="verified-workflow-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            จากออเดอร์ ถึงกำไรจริง — ตรวจสอบได้ทั้งเส้นทาง
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ระบบไม่ได้หยุดแค่รับออเดอร์ แต่ตรวจสอบ workflow ได้ครบ ตั้งแต่ลูกค้าสั่ง → ชำระเงิน/อัปโหลดสลิป
            → พนักงานรับและจัดการออเดอร์ → เจ้าของเห็นต้นทุนและกำไรจริง
          </p>
        </div>

        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <span
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                  aria-hidden
                >
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ขั้นที่ {i + 1}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              {i < steps.length - 1 && (
                <ArrowRight
                  className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-border lg:block"
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>

        <div className="mx-auto mt-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-5">
          <span
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"
            aria-hidden
          >
            <EyeOff className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              พนักงานไม่เห็นข้อมูลต้นทุน/กำไร
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              พนักงานจัดการออเดอร์และตรวจสลิปได้ตามปกติ แต่ตัวเลขต้นทุนและกำไรถูกซ่อนตามบทบาท —
              ข้อมูลการเงินที่อ่อนไหวจึงอยู่กับเจ้าของร้านเท่านั้น
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
