import { useRoleGuard } from "@/lib/guards";
import AppLayout from "@/components/AppLayout";
import { Activity, Settings, ShieldCheck, Store, Users } from "lucide-react";

const cards = [
  { title: "User management", desc: "จัดการผู้ใช้งาน เพิ่ม/ปิดการใช้งาน และรีเซ็ตสถานะ", icon: Users },
  { title: "Role management", desc: "กำหนด role เช่น owner/admin/manager/staff และสิทธิ์การเข้าถึง", icon: ShieldCheck },
  { title: "Store settings", desc: "ตั้งค่าร้าน ชื่อสาขา เวลาเปิด/ปิด และค่าเริ่มต้นธุรกิจ", icon: Store },
  { title: "Sales channel settings", desc: "กำหนดช่องทางขาย เช่น หน้าร้าน เดลิเวอรี และค่าธรรมเนียม", icon: Activity },
  { title: "System settings", desc: "ตั้งค่าระบบกลาง, locale, การแจ้งเตือน และค่าพื้นฐาน", icon: Settings },
  { title: "System health", desc: "ดูสถานะระบบพื้นฐานและบันทึกเหตุการณ์ (basic logs)", icon: Activity },
];

export default function AdminDashboardPage() {
  const { checking, accessDenied } = useRoleGuard(["owner", "admin"]);

  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-subtitle">Internal control panel for Brewway / Valora Engine</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {cards.map((item) => (
            <section key={item.title} className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-accent" />
                </div>
                <h2 className="font-semibold text-foreground">{item.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </section>
          ))}
        </div>

        <section className="stat-card">
          <h2 className="section-title mb-2">Initial owner/admin bootstrap</h2>
          <p className="text-sm text-muted-foreground">
            สร้างผู้ใช้ผ่าน Supabase Auth แล้วเพิ่มข้อมูลใน profiles ให้ role = owner และ store_name = Brewway
          </p>
        </section>
      </div>
    </AppLayout>
  );
}
