import { Coffee, CupSoda, UserCircle2, Utensils, Sprout } from "lucide-react";

const audiences = [
  {
    icon: Coffee,
    title: "ร้านกาแฟเล็ก",
    desc: "ร้านกาแฟหน้าบ้าน คีออส หรือร้านเปิดใหม่ ที่อยากรู้กำไรจริงต่อแก้ว",
  },
  {
    icon: CupSoda,
    title: "ร้านเครื่องดื่ม",
    desc: "ชานม น้ำผลไม้ สมูทตี้ ที่มีต้นทุนวัตถุดิบและตัวเลือกหลากหลาย",
  },
  {
    icon: Utensils,
    title: "ร้านอาหารขนาดเล็ก",
    desc: "ร้านอาหารตามสั่งหรือร้านเล็ก ที่อยากวางราคาเมนูให้คุ้มทุน",
  },
  {
    icon: UserCircle2,
    title: "เจ้าของกิจการที่เริ่มต้นเอง",
    desc: "ทำเองคนเดียวหรือทีมเล็ก อยากเห็นตัวเลขชัด ๆ ก่อนตัดสินใจ",
  },
  {
    icon: Sprout,
    title: "SMEs ที่ยังไม่พร้อมใช้ระบบใหญ่",
    desc: "ธุรกิจขนาดเล็กที่อยากเริ่มวางแผนกำไร โดยไม่ต้องลงทุนระบบใหญ่",
  },
];

export default function UseCasesSection() {
  return (
    <section
      id="who"
      className="border-t py-20 md:py-24"
      aria-labelledby="who-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            เหมาะกับใคร
          </p>
          <h2
            id="who-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            ออกแบบมาเพื่อร้านเล็กและเจ้าของกิจการที่เริ่มต้นเอง
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ถ้าร้านของคุณเข้าข่ายข้อใดข้อหนึ่งด้านล่าง Valora ช่วยให้เห็นกำไรและจุดคุ้มทุนได้ชัดขึ้น
          </p>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {audiences.map((a) => (
            <li
              key={a.title}
              className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent"
                aria-hidden
              >
                <a.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
