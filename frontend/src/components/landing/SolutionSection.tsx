import {
  CheckCircle2,
  Coffee,
  Layers,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";

const steps = [
  {
    icon: Coffee,
    title: "เพิ่มสินค้าและต้นทุน",
    desc: "ใส่เมนูพร้อมต้นทุนวัตถุดิบและบรรจุภัณฑ์ เพื่อให้ระบบคิดต้นทุนจริงต่อแก้ว",
  },
  {
    icon: Layers,
    title: "ใส่ต้นทุนแฝง เช่น ค่าเช่า ค่าไฟ",
    desc: "เพิ่มค่าใช้จ่ายประจำของร้าน ระบบจะเฉลี่ยลงเป็นต้นทุนต่อแก้วให้อัตโนมัติ",
  },
  {
    icon: SlidersHorizontal,
    title: "ตั้งสมมติฐานยอดขาย",
    desc: "ใส่ยอดขายที่คาดว่าจะขายได้ต่อวันหรือต่อเดือน เพื่อใช้เป็นฐานในการวางแผน",
  },
  {
    icon: Target,
    title: "ดูกำไรจริงและจุดคุ้มทุน",
    desc: "เห็นกำไรหลังหักต้นทุนทั้งหมด และจำนวนแก้วที่ต้องขายเพื่อให้คุ้มทุน",
  },
  {
    icon: Sparkles,
    title: "ทดลองปรับแผนก่อนตัดสินใจ",
    desc: "ลองปรับราคา ต้นทุน หรือยอดขาย แล้วเปรียบเทียบผลลัพธ์ ก่อนตัดสินใจขายจริง",
  },
];

export default function SolutionSection() {
  return (
    <section id="how" className="border-t py-20 md:py-24" aria-labelledby="how-heading">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" aria-hidden />
            ใช้งานง่ายใน 5 ขั้นตอน
          </p>
          <h2
            id="how-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            วางแผนกำไรร้านได้ ตั้งแต่ครั้งแรกที่ใช้
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ไม่ต้องมีพื้นฐานบัญชี แค่ใส่ข้อมูลร้านของคุณ ระบบจะคำนวณกำไรและจุดคุ้มทุนให้
          </p>
        </div>

        <ol className="mt-14 grid gap-6 lg:grid-cols-2">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="relative flex gap-5 rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-7"
            >
              <div className="flex flex-col items-center" aria-hidden>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <s.icon className="h-5 w-5" />
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-3 hidden h-full w-px flex-1 bg-border lg:block" />
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
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
