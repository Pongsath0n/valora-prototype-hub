import { Link } from "react-router-dom";
import SystemLayout from "@/components/system/SystemLayout";
import { Activity, Database, FileText, ShieldCheck, Users } from "lucide-react";

const systemCards = [
  {
    title: "จัดการผู้ใช้",
    desc: "เพิ่ม/ปิดการใช้งานบัญชี รีเซ็ตสิทธิ์ และเชื่อมโยงบัญชีกับร้าน",
    icon: Users,
    to: "/system/users",
  },
  {
    title: "จัดการสิทธิ์",
    desc: "กำหนด role เช่น owner/admin/manager/staff และสิทธิ์การเข้าถึงระบบ",
    icon: ShieldCheck,
    to: "/system/roles",
  },
  {
    title: "ตรวจสอบระบบ",
    desc: "ดูสถานะระบบพื้นฐาน รวมถึง Storage Check",
    icon: Activity,
    to: "/system/health",
  },
  {
    title: "บันทึกเหตุการณ์",
    desc: "Audit logs ของการกระทำที่สำคัญในระบบ",
    icon: FileText,
    to: "/system/audit-logs",
  },
  {
    title: "Storage Check",
    desc: "ตรวจสอบ Storage และ Asset ที่ระบบใช้งาน",
    icon: Database,
    to: "/system/health",
  },
];

export default function SystemOverviewPage() {
  return (
    <SystemLayout>
      <section className="stat-card">
        <h2 className="section-title mb-2">Internal System Console</h2>
        <p className="text-sm text-muted-foreground">
          พื้นที่สำหรับดูแลระบบกลาง ไม่เกี่ยวกับการขายหน้าร้าน หากต้องการจัดการออเดอร์หรือเมนู
          ให้ไปที่{" "}
          <Link to="/admin" className="underline">
            Valora Store Admin
          </Link>
          .
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {systemCards.map((item) => (
          <Link
            key={item.title}
            to={item.to}
            className="stat-card hover:border-accent/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-accent" />
              </div>
              <h2 className="font-semibold text-foreground">{item.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{item.desc}</p>
          </Link>
        ))}
      </div>
    </SystemLayout>
  );
}
