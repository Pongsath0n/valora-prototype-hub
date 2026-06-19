import {
  BarChart3,
  Bell,
  Calculator,
  ClipboardCheck,
  Layers,
  LineChart,
  Target,
} from "lucide-react";

type Feature = {
  icon: typeof BarChart3;
  title: string;
  desc: string;
  tag: string;
  secondary?: boolean;
};

const features: Feature[] = [
  {
    icon: LineChart,
    title: "วางแผนกำไร",
    desc: "ตั้งราคา ต้นทุน และยอดขายที่คาดไว้ แล้วเห็นกำไรที่ควรได้ก่อนลงมือขายจริง",
    tag: "วางแผน",
  },
  {
    icon: Calculator,
    title: "คำนวณต้นทุนต่อเมนู",
    desc: "ผูกวัตถุดิบและบรรจุภัณฑ์เข้ากับแต่ละเมนู เพื่อคิดต้นทุนจริงต่อแก้วให้อัตโนมัติ",
    tag: "ต้นทุน",
  },
  {
    icon: Layers,
    title: "จัดการต้นทุนแฝง",
    desc: "ใส่ค่าเช่า ค่าน้ำ ค่าไฟ และค่าใช้จ่ายประจำ แล้วเฉลี่ยลงเป็นต้นทุนต่อแก้ว",
    tag: "ต้นทุนแฝง",
  },
  {
    icon: Target,
    title: "ดูจุดคุ้มทุน",
    desc: "รู้ว่าต้องขายกี่แก้วต่อเดือนและต่อวัน ร้านถึงจะเริ่มมีกำไรจริง",
    tag: "จุดคุ้มทุน",
  },
  {
    icon: BarChart3,
    title: "วิเคราะห์กำไรรายสินค้า",
    desc: "เห็นว่าเมนูไหนทำกำไรจริง เมนูไหนกำไรบาง เพื่อตัดสินใจว่าจะเชียร์หรือปรับเมนูไหน",
    tag: "วิเคราะห์",
  },
  {
    icon: ClipboardCheck,
    title: "รองรับ order / payment review",
    desc: "รับออเดอร์ ตรวจสลิป และทบทวนการชำระเงิน เชื่อมต่อกับการดูต้นทุน–กำไรในระบบเดียว",
    tag: "ออเดอร์",
  },
  {
    icon: Bell,
    title: "แจ้งเตือนผ่าน LINE OA",
    desc: "แจ้งสถานะออเดอร์ถึงลูกค้าผ่าน LINE OA เป็นส่วนเสริม ไม่ใช่หัวใจหลักของระบบ",
    tag: "ส่วนเสริม",
    secondary: true,
  },
];

export default function FeatureGrid() {
  return (
    <section
      id="features"
      className="border-t bg-muted/30 py-20 md:py-24"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            ฟีเจอร์หลัก
          </p>
          <h2
            id="features-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            ทุกอย่างที่ร้านเล็กต้องใช้เพื่อวางแผนกำไร
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            เน้นที่การวางแผนกำไรและการมองเห็นต้นทุนสำคัญ พร้อมรองรับการรับออเดอร์และตรวจสลิปในตัว
          </p>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <li
              key={f.title}
              className={`group flex flex-col rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md ${
                f.secondary ? "border-dashed" : ""
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                    f.secondary ? "bg-muted text-muted-foreground" : "bg-accent/10 text-accent"
                  }`}
                  aria-hidden
                >
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
