import { Calculator, Minus, Equal } from "lucide-react";

const parts = [
  { label: "ราคาเมนู", tone: "base" as const },
  { label: "ต้นทุนสูตร", tone: "minus" as const },
  { label: "ต้นทุน addon", tone: "minus" as const },
  { label: "ค่าธรรมเนียมช่องทาง", tone: "minus" as const },
];

export default function CostProfitSection() {
  return (
    <section
      id="profit"
      className="border-t bg-muted/30 py-20 md:py-24"
      aria-labelledby="profit-heading"
    >
      <div className="mx-auto max-w-4xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground">
            <Calculator className="h-3.5 w-3.5 text-accent" aria-hidden />
            กำไรต่อเมนู
          </p>
          <h2
            id="profit-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            กำไรจริง คือยอดขายที่หักทุกต้นทุนแล้ว
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Valora คิดกำไรจากของจริง ไม่ใช่แค่ยอดขายรวม จึงเห็นได้ว่าแต่ละแก้วเหลือกำไรกี่บาท
          </p>
        </div>

        <div className="mt-12 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center justify-center gap-3 text-center">
            {parts.map((p, i) => (
              <div key={p.label} className="flex items-center gap-3">
                {i > 0 && (
                  <Minus className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                    p.tone === "minus"
                      ? "border-destructive/20 bg-destructive/5 text-foreground"
                      : "border-border bg-secondary/40 text-foreground"
                  }`}
                >
                  {p.label}
                </span>
              </div>
            ))}
            <Equal className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden />
            <span className="rounded-xl border border-success/30 bg-success/10 px-5 py-3 text-base font-bold text-foreground">
              กำไรที่ใกล้ความจริง
            </span>
          </div>

          <p className="mt-6 text-center text-sm leading-relaxed text-muted-foreground">
            ระบบผูกวัตถุดิบและสูตรเข้ากับแต่ละเมนูและตัวเลือกเสริม เช่น Extra Shot
            เพื่อคิดต้นทุนต่อแก้วให้อัตโนมัติ แล้วหักค่าธรรมเนียมช่องทางออก
            เจ้าของร้านจึงเห็นว่าเมนูไหนทำเงินจริง เมนูไหนแค่ดูดี
          </p>
        </div>
      </div>
    </section>
  );
}
