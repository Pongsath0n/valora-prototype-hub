import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  ClipboardList,
  CreditCard,
  Settings,
  Soup,
  Store,
} from "lucide-react";

const storeCards = [
  {
    title: "Order Queue",
    desc: "ดูรายการออเดอร์ที่เข้ามา และอัปเดตสถานะการเตรียม/พร้อมรับ/ปิดออเดอร์",
    icon: ClipboardList,
    to: "/admin/orders",
  },
  {
    title: "Payment Queue",
    desc: "ตรวจสอบสลิป อนุมัติหรือปฏิเสธการชำระเงินจากลูกค้า",
    icon: CreditCard,
    to: "/admin/payments",
  },
  {
    title: "เมนูสินค้า",
    desc: "เพิ่ม/แก้ไขเมนู หมวดหมู่ และสถานะการเปิด-ปิดของแต่ละสินค้า",
    icon: Soup,
    to: "/admin/products",
  },
  {
    title: "ตั้งค่าร้าน",
    desc: "ตั้งค่าข้อมูลร้าน เวลาเปิดปิด และค่าเริ่มต้นต่างๆ",
    icon: Store,
    to: "/admin/store",
  },
  {
    title: "ตั้งค่าช่องทางขาย",
    desc: "จัดการช่องทางขาย เช่น หน้าร้าน LINE OA Grab และค่าธรรมเนียมต่อช่องทาง",
    icon: Settings,
    to: "/admin/sales-channels",
  },
];

export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      <div className="grid md:grid-cols-2 gap-4">
        {storeCards.map((item) => (
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

      <section className="stat-card">
        <h2 className="section-title mb-2">พร้อมสำหรับ E2E ทดสอบ</h2>
        <p className="text-sm text-muted-foreground">
          เส้นทางหลักของ Phase 1: Payment Queue → Approve Slip → Order Queue → Mark Ready
        </p>
      </section>
    </AdminLayout>
  );
}
