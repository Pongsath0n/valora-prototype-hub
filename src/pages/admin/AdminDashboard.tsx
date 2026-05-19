import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";
import { useRoleGuard } from "@/lib/guards";

const navCards = [
  { title: "จัดการผู้ใช้", desc: "เพิ่ม ตรวจสอบ และจัดการผู้ใช้งานในระบบ พร้อมบทบาทและร้านที่เกี่ยวข้อง", route: "/admin/users" },
  { title: "จัดการสิทธิ์", desc: "ตรวจสอบสิทธิ์ของ owner, admin, manager และ staff ว่าแต่ละบทบาทเข้าถึงส่วนใดได้บ้าง", route: "/admin/roles" },
  { title: "ตั้งค่าร้าน", desc: "จัดการข้อมูลพื้นฐานของร้าน เช่น ชื่อร้าน สกุลเงิน และข้อมูลสำหรับการใช้งานระบบ", route: "/admin/store" },
  { title: "ตั้งค่าช่องทางขาย", desc: "จัดการช่องทางขาย เช่น Pick-up, LINE OA, Grab, LINE MAN, Shopee Food และค่าธรรมเนียม", route: "/admin/sales-channels" },
  { title: "ตรวจสอบระบบ", desc: "ตรวจสอบสถานะ Auth, Profile, Store, Database, Storage และข้อมูลตั้งต้นของระบบ", route: "/admin/system" },
  { title: "บันทึกเหตุการณ์", desc: "ดูเหตุการณ์สำคัญของระบบ เช่น การสร้างออเดอร์ การแก้ไขเมนู การปรับสต็อก และการเปลี่ยนสถานะออเดอร์", route: "/admin/audit-logs" },
];

export default function AdminDashboardPage() {
  const { checking, accessDenied } = useRoleGuard(["owner", "admin"]);
  const [overview, setOverview] = useState<any>({});
  useEffect(() => {(async()=>{const {data:a}=await supabase.auth.getUser();const uid=a.user?.id;let storeName="Brewway";if(uid){const {data:p}=await supabase.from("profiles").select("store_id").eq("id",uid).maybeSingle();if(p?.store_id){const {data:s}=await supabase.from("stores").select("name").eq("id",p.store_id).maybeSingle();storeName=s?.name??storeName;}}const {count:u}=await supabase.from("profiles").select("id",{count:"exact",head:true});const {count:ad}=await supabase.from("profiles").select("id",{count:"exact",head:true}).in("role",["owner","admin"]);const {count:ac}=await supabase.from("sales_channels").select("id",{count:"exact",head:true}).eq("is_active",true);setOverview({storeName,totalUsers:u??0,totalAdmins:ad??0,activeChannels:ac??0});})();},[]);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="stat-card">
          <span className="text-xs rounded-full px-2 py-1 bg-accent/10 text-accent">Internal System Console</span>
          <h1 className="page-title mt-2">ศูนย์ควบคุมระบบ Valora</h1>
          <p className="page-subtitle">สำหรับจัดการผู้ใช้ สิทธิ์การเข้าถึง การตั้งค่าร้าน สถานะระบบ และบันทึกเหตุการณ์สำคัญของ Valora Engine</p>
          <p className="text-sm text-muted-foreground mt-3">หน้านี้ใช้สำหรับควบคุมระบบ Valora Engine ในระดับผู้ดูแล ไม่ใช่หน้าสำหรับบันทึกยอดขายประจำวัน หากต้องการจัดการออเดอร์ เมนู สต็อก หรือรายงาน ให้ใช้เมนูหลักของระบบร้าน</p>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="kpi-card"><p className="metric-label">ร้านที่เชื่อมต่อ</p><p className="metric-value">{overview.storeName ?? "Brewway"}</p></div>
          <div className="kpi-card"><p className="metric-label">ผู้ใช้ทั้งหมด</p><p className="metric-value">{overview.totalUsers ?? 0}</p></div>
          <div className="kpi-card"><p className="metric-label">ผู้ดูแลระบบ</p><p className="metric-value">{overview.totalAdmins ?? 0}</p></div>
          <div className="kpi-card"><p className="metric-label">ช่องทางขายที่เปิดใช้งาน</p><p className="metric-value">{overview.activeChannels ?? 0}</p></div>
          <div className="kpi-card"><p className="metric-label">สถานะ Storage</p><p className="metric-value text-base">ตรวจสอบจาก Supabase Storage</p></div>
          <div className="kpi-card"><p className="metric-label">โหมดระบบ</p><p className="metric-value text-base">Internal Use / One-time Sale Ready</p><p className="text-xs text-muted-foreground">Subscription Mode: Disabled</p></div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {navCards.map((item) => (
            <section key={item.route} className="stat-card space-y-2">
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
              <p className="text-xs text-muted-foreground">{item.route}</p>
              <Link to={item.route} className="inline-block bg-primary text-primary-foreground px-3 py-2 rounded text-sm">เปิดจัดการ</Link>
            </section>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
