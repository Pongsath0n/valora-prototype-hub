import {
  AlertTriangle,
  Coins,
  Receipt,
  Scale,
  TrendingDown,
} from "lucide-react";

const painPoints = [
  {
    icon: TrendingDown,
    title: "ขายดี แต่ไม่รู้ว่าเหลือกำไรจริงไหม",
    desc: "ยอดขายดูดีทุกวัน แต่พอสิ้นเดือนเงินไม่เหลือเท่าที่คิด เพราะไม่เคยเห็นกำไรจริงหลังหักต้นทุนทั้งหมด",
  },
  {
    icon: Scale,
    title: "ตั้งราคาแล้วไม่แน่ใจว่าคุ้มทุนหรือเปล่า",
    desc: "ตั้งราคาตามร้านอื่นหรือตามความรู้สึก ไม่รู้ว่าต้องขายกี่แก้วต่อวันถึงจะคุ้มทุนจริง",
  },
  {
    icon: Receipt,
    title: "ลืมคิดค่าเช่า ค่าน้ำ ค่าไฟ",
    desc: "คิดแต่ต้นทุนวัตถุดิบ แต่ลืมต้นทุนแฝงที่จ่ายทุกเดือน พอรวมแล้วกำไรหายไปมากกว่าที่คิด",
  },
  {
    icon: Coins,
    title: "ไม่รู้ว่าแต่ละเมนูกำไรเหลือเท่าไหร่",
    desc: "บางเมนูขายดีแต่กำไรบาง บางเมนูกำไรดีแต่ไม่ค่อยเชียร์ ถ้าไม่เห็นตัวเลขก็ตัดสินใจได้ยาก",
  },
];

export default function PainPointsSection() {
  return (
    <section
      id="pain"
      className="border-t bg-muted/30 py-20 md:py-24"
      aria-labelledby="painpoints-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            ปัญหาที่เจ้าของร้านเล็กเจอบ่อย
          </p>
          <h2
            id="painpoints-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            ขายดีก็เหนื่อย ขายไม่ดีก็เครียด
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            และส่วนใหญ่ยังไม่รู้ว่าแต่ละแก้ว “เหลือกำไรจริงกี่บาท” หลังหักต้นทุนทุกอย่าง
          </p>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {painPoints.map((p) => (
            <li
              key={p.title}
              className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                aria-hidden
              >
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
