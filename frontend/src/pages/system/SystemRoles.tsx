import SystemLayout from "@/components/system/SystemLayout";

const KNOWN_ROLES = [
  { role: "owner", desc: "เจ้าของร้าน เข้าถึงได้ทั้งหมด รวมถึง Internal System Console" },
  { role: "admin", desc: "ผู้ดูแลร้าน เข้าถึง Store Admin (ออเดอร์ ชำระเงิน เมนู ตั้งค่า)" },
  { role: "staff", desc: "พนักงานประจำกะ เข้าถึง Order Queue / Payment Queue สำหรับ E2E flow" },
];

const PLANNED_ROLES = [
  { role: "manager", desc: "(กำลังวางแผน) ผู้จัดการ ใช้งานหน้าร้านและรายงาน เมื่อ schema รองรับ" },
];

export default function SystemRolesPage() {
  return (
    <SystemLayout
      title="จัดการสิทธิ์"
      subtitle="กำหนด role และสิทธิ์การเข้าถึง Store Admin / Internal System Console"
    >
      <section className="stat-card">
        <h2 className="section-title mb-3">Roles ปัจจุบัน</h2>
        <ul className="space-y-2 text-sm">
          {KNOWN_ROLES.map((r) => (
            <li key={r.role} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
              <span className="font-mono font-semibold text-foreground min-w-24">{r.role}</span>
              <span className="text-muted-foreground">{r.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stat-card space-y-2">
        <h2 className="section-title">Roles ที่วางแผนจะรองรับ</h2>
        <ul className="space-y-2 text-sm">
          {PLANNED_ROLES.map((r) => (
            <li key={r.role} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
              <span className="font-mono font-semibold text-foreground min-w-24">{r.role}</span>
              <span className="text-muted-foreground">{r.desc}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          หน้านี้เป็น read-only สำหรับการอ้างอิงสิทธิ์ที่มีอยู่ เมื่อ role model ครบจะเปิดให้ Internal admin ปรับสิทธิ์ได้
        </p>
      </section>
    </SystemLayout>
  );
}
