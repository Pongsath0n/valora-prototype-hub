import { ShieldCheck, Store, UserCircle2, Users } from "lucide-react";

const roles = [
  {
    icon: UserCircle2,
    role: "ลูกค้า",
    desc: "สั่งง่าย เลือกความหวาน/เพิ่มช็อต ชำระเงินและอัปโหลดสลิป ติดตามสถานะออเดอร์ได้เอง",
    points: ["เปิดเมนูจากลิงก์ ไม่ต้องสมัคร", "ปรับตัวเลือกเครื่องดื่มได้", "เช็กสถานะออเดอร์ได้ตลอด"],
  },
  {
    icon: Users,
    role: "พนักงาน",
    desc: "รับและจัดการออเดอร์ ตรวจและอนุมัติสลิป อัปเดตสถานะ — โดยไม่เห็นต้นทุน/กำไร",
    points: ["จัดการคิวออเดอร์", "อนุมัติ/ปฏิเสธสลิป", "ไม่เห็นข้อมูลต้นทุน/กำไร"],
  },
  {
    icon: Store,
    role: "เจ้าของร้าน",
    desc: "เห็นต้นทุนและกำไรจริงต่อเมนูและต่อออเดอร์ ดูภาพรวมธุรกิจ และคุมสิทธิ์ข้อมูลการเงิน",
    points: ["ต้นทุน–กำไรต่อเมนู/ออเดอร์", "ภาพรวมยอดขายและกำไร", "ควบคุมสิทธิ์การเข้าถึง"],
  },
];

export default function RoleValueSection() {
  return (
    <section
      id="roles"
      className="border-t py-20 md:py-24"
      aria-labelledby="roles-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            คุณค่าแยกตามบทบาท
          </p>
          <h2
            id="roles-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            แต่ละคนเห็นเฉพาะสิ่งที่ควรเห็น
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ลูกค้า พนักงาน และเจ้าของร้าน ใช้ระบบเดียวกัน แต่มองเห็นข้อมูลคนละระดับตามบทบาท
          </p>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {roles.map((r) => (
            <li
              key={r.role}
              className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-7"
            >
              <div
                className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                aria-hidden
              >
                <r.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground md:text-xl">{r.role}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.desc}</p>
              <ul className="mt-4 space-y-2">
                {r.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm text-foreground/80">
                    <ShieldCheck className="h-4 w-4 flex-shrink-0 text-success" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
