import { ArrowRight, Calculator, Layers, Target, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Calculator,
    label: "ขั้นที่ 1",
    title: "ต้นทุนวัตถุดิบ / บรรจุภัณฑ์",
    desc: "คิดต้นทุนจริงต่อแก้วจากสูตรและบรรจุภัณฑ์ เช่น เมล็ดกาแฟ นม แก้ว หลอด",
  },
  {
    icon: Layers,
    label: "ขั้นที่ 2",
    title: "ต้นทุนแฝง / ค่าใช้จ่ายประจำ",
    desc: "รวมค่าเช่า ค่าน้ำ ค่าไฟ และค่าใช้จ่ายประจำอื่น ๆ แล้วเฉลี่ยลงเป็นต้นทุนต่อแก้ว",
  },
  {
    icon: TrendingUp,
    label: "ขั้นที่ 3",
    title: "กำไรหลังรวมต้นทุนแฝง",
    desc: "เห็นกำไรจริงต่อแก้วและต่อเมนู ที่หักทั้งต้นทุนวัตถุดิบและต้นทุนแฝงแล้ว",
  },
  {
    icon: Target,
    label: "ขั้นที่ 4",
    title: "จุดคุ้มทุนต่อเดือน / ต่อวัน",
    desc: "รู้ว่าต้องขายกี่แก้วต่อเดือนและต่อวัน ร้านถึงจะเริ่มมีกำไรจริง",
  },
];

export default function CostProfitSection() {
  return (
    <section
      id="planning"
      className="border-t py-20 md:py-24"
      aria-labelledby="planning-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground">
            <Calculator className="h-3.5 w-3.5 text-accent" aria-hidden />
            หัวใจของ Valora — วางแผนกำไร
          </p>
          <h2
            id="planning-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            กำไรจริง คือยอดขายที่หักทุกต้นทุนแล้ว
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Valora คิดกำไรจากของจริง ทั้งต้นทุนวัตถุดิบและต้นทุนแฝง จึงเห็นได้ว่าแต่ละแก้วเหลือกำไรกี่บาท
            และต้องขายเท่าไหร่ถึงจะคุ้มทุน
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
                  {s.label}
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

        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground">
          ปรับราคา ต้นทุน หรือยอดขายที่คาดไว้ แล้วดูทันทีว่ากำไรและจุดคุ้มทุนเปลี่ยนไปอย่างไร —
          ช่วยให้ตัดสินใจได้ก่อนลงมือขายจริง
        </p>
      </div>
    </section>
  );
}
