import { Check, Info, Minus } from "lucide-react";

const focusOn = [
  "วางแผนกำไรและจุดคุ้มทุน",
  "คำนวณต้นทุนต่อเมนูและต้นทุนแฝง",
  "วิเคราะห์กำไรรายสินค้า",
  "รับออเดอร์และทบทวนการชำระเงิน",
];

const notYet = [
  "ระบบบัญชีและงบการเงิน",
  "ใบกำกับภาษี / ภาษีมูลค่าเพิ่ม",
  "เงินเดือนพนักงาน (payroll)",
  "ระบบ ERP เต็มรูปแบบ",
];

export default function PhaseOneSection() {
  return (
    <section
      id="scope"
      className="border-t py-20 md:py-24"
      aria-labelledby="scope-heading"
    >
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center">
          <p
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-info/30 bg-info/5 px-3 py-1 text-xs font-medium"
            style={{ color: "hsl(var(--info))" }}
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
            พูดตรงไปตรงมา
          </p>
          <h2
            id="scope-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Valora V.1 ทำอะไร และไม่ใช่อะไร
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Valora V.1 โฟกัสที่การวางแผนกำไรและการมองเห็นต้นทุนสำคัญ
            ไม่ใช่ระบบบัญชีหรือ ERP เต็มรูปแบบ
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-success/30 bg-success/5 p-6 md:p-7">
            <p className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Valora V.1 ช่วยเรื่อง
            </p>
            <ul className="mt-4 space-y-3">
              {focusOn.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground/90">
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-6 md:p-7">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              ยังไม่ใช่ (ในเวอร์ชันนี้)
            </p>
            <ul className="mt-4 space-y-3">
              {notYet.map((n) => (
                <li key={n} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    aria-hidden
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </span>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 text-center text-sm leading-relaxed text-muted-foreground">
          เราตั้งใจทำเครื่องมือที่เรียบง่ายและใช้ได้จริงสำหรับร้านเล็กก่อน
          แล้วค่อย ๆ ขยายตามฟีดแบ็กของร้านจริง
        </p>
      </div>
    </section>
  );
}
