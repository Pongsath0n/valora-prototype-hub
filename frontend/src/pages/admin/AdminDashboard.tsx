import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { useProfileRole } from "@/contexts/RoleContext";
import { ClipboardList, CreditCard, Settings, Soup, Store, Users } from "lucide-react";
import { featureFlags } from "@/config/featureFlags";

const dailyOpsCards = [
  {
    title: "ออเดอร์",
    desc: "คิวออเดอร์ ชำระเงิน เตรียม และพร้อมรับ",
    icon: ClipboardList,
    to: "/store-admin/orders",
  },
  {
    title: "POS",
    desc: "เปิดออเดอร์หน้าร้าน/รับที่ร้านแบบแมนนวล",
    icon: CreditCard,
    to: "/store-admin/pos",
  },
  {
    title: "ลูกค้า",
    desc: "ค้นหาและอัปเดตข้อมูลลูกค้า",
    icon: Users,
    to: "/store-admin/customers",
  },
];

const managementCards = [
  {
    title: "เมนู",
    desc: "เพิ่ม/แก้ไขเมนู หมวดหมู่ ราคา และสถานะ",
    icon: Soup,
    to: "/store-admin/menus",
  },
  {
    title: "ช่องทางขาย",
    desc: "จัดการช่องทางขายและสถานะการเชื่อมต่อ",
    icon: Store,
    to: "/store-admin/channels",
  },
  {
    title: "ราคาตามช่องทาง",
    desc: "ตั้งราคาและกำไรต่อช่องทางขาย",
    icon: Settings,
    to: "/store-admin/channel-pricing",
  },
];

export default function AdminDashboardPage() {
  const { role } = useProfileRole();

  const canManage = role ? ["owner", "admin", "manager"].includes(role) : false;

  return (
    <AdminLayout>
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">งานประจำวัน</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {dailyOpsCards.map((item) => (
            <Link key={item.title} to={item.to} className="stat-card hover:border-accent/40 transition-colors cursor-pointer">
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
      </section>

      {canManage ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">การจัดการร้าน (ผู้จัดการขึ้นไป)</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {managementCards.map((item) => (
              <Link key={item.title} to={item.to} className="stat-card hover:border-accent/40 transition-colors cursor-pointer">
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
        </section>
      ) : null}

      {featureFlags.showE2EHints ? (
        <section className="stat-card border-amber-300 bg-amber-50 text-amber-900">
          <h2 className="section-title mb-2 text-amber-900">พร้อมสำหรับ E2E ทดสอบ</h2>
          <p className="text-sm">
            เส้นทางหลักของ Phase 1: Payment Queue → Approve Slip → Order Queue → Mark Ready
          </p>
        </section>
      ) : null}
    </AdminLayout>
  );
}
