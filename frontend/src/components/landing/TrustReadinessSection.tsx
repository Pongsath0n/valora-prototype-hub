import { CheckCircle2, ShieldCheck } from "lucide-react";

const checks = [
  "Local build ผ่าน",
  "E2E ผ่าน",
  "Cloud smoke test ผ่าน",
  "ออเดอร์ปกติใช้งานได้",
  "ออเดอร์เพิ่มช็อต/ตัวเลือกเสริมใช้งานได้",
  "ชำระเงิน/ตรวจสลิปใช้งานได้",
  "พนักงานรับออเดอร์ได้ถูกต้อง",
  "เจ้าของเห็นต้นทุน/กำไร",
  "พนักงานไม่เห็นต้นทุน/กำไร",
  "Recipe & Addon Cost Engine ผ่านการตรวจสอบ",
];

export default function TrustReadinessSection() {
  return (
    <section
      id="readiness"
      className="border-t py-20 md:py-24"
      aria-labelledby="readiness-heading"
    >
      <div className="mx-auto max-w-4xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
            ผ่านการทดสอบ Workflow จริง
          </p>
          <h2
            id="readiness-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            ระบบที่ผ่านการทดสอบ Workflow จริง ก่อน Soft Launch
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            เราวัดความพร้อมจากพฤติกรรมของระบบที่ทดสอบแล้ว ไม่ใช่ตัวเลขการตลาด
          </p>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {checks.map((c) => (
            <li
              key={c}
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-foreground"
            >
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
