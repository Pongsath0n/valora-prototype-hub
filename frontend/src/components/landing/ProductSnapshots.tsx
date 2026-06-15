import { useState } from "react";
import { ImageIcon, LayoutDashboard, Receipt, Smartphone } from "lucide-react";

const snapshots = [
  {
    icon: Smartphone,
    badge: "ลูกค้า",
    title: "หน้าสั่งซื้อของลูกค้า",
    desc: "หน้าเมนูบอร์ดของลูกค้า และหน้ารายละเอียดเมนู เลือกความหวาน เพิ่มช็อต และจำนวนได้",
    // Drop the masked screenshot here to replace the placeholder automatically.
    src: "/snapshots/customer-order.png",
    // object-position for the wide-frame crop (keeps the most important UI in view).
    position: "object-top",
  },
  {
    icon: Receipt,
    badge: "พนักงาน",
    title: "หน้าจัดการของพนักงาน",
    desc: "คิวออเดอร์และการตรวจสลิป — ไม่มีคอลัมน์ต้นทุน/กำไรให้พนักงานเห็น",
    src: "/snapshots/staff-operation.png",
    position: "object-top",
  },
  {
    icon: LayoutDashboard,
    badge: "เจ้าของร้าน",
    title: "หน้าต้นทุน–กำไรของเจ้าของ",
    desc: "เห็นยอดขาย ต้นทุน ค่าช่องทาง และกำไร ทั้งต่อออเดอร์และต่อรายการเมนู — หลักฐานคุณค่าหลักของระบบ",
    src: "/snapshots/owner-profit.png",
    position: "object-top",
  },
];

export default function ProductSnapshots() {
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  return (
    <section
      id="snapshots"
      className="border-t bg-muted/30 py-20 md:py-24"
      aria-labelledby="snapshots-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            ตัวอย่างหน้าจอจริง
          </p>
          <h2
            id="snapshots-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            หน้าตาการใช้งานจริงของแต่ละบทบาท
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ภาพหน้าจอจากระบบจริง โดยปิดบังข้อมูลส่วนบุคคลของลูกค้าก่อนนำมาแสดง
          </p>
        </div>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {snapshots.map((s) => {
            const showImage = !failed[s.src];
            return (
              <li
                key={s.title}
                className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-video w-full overflow-hidden border-b border-border bg-muted/40">
                  {showImage ? (
                    <img
                      src={s.src}
                      alt={`ตัวอย่างหน้าจอ — ${s.title}`}
                      loading="lazy"
                      className={`h-full w-full object-cover ${s.position}`}
                      onError={() => setFailed((prev) => ({ ...prev, [s.src]: true }))}
                    />
                  ) : (
                    <div
                      className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
                      role="img"
                      aria-label={`พื้นที่ภาพตัวอย่างหน้าจอ — ${s.title} (กำลังเตรียม)`}
                    >
                      <ImageIcon className="h-8 w-8 opacity-60" aria-hidden />
                      <span className="px-4 text-center text-xs font-medium">
                        ภาพตัวอย่างหน้าจอ — กำลังเตรียม
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"
                      aria-hidden
                    >
                      <s.icon className="h-4 w-4" />
                    </span>
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {s.badge}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
