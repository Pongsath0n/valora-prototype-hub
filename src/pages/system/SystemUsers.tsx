import SystemLayout from "@/components/system/SystemLayout";

export default function SystemUsersPage() {
  return (
    <SystemLayout
      title="จัดการผู้ใช้"
      subtitle="ดูและจัดการบัญชีผู้ใช้ที่เข้าใช้งานระบบ Valora"
    >
      <section className="stat-card space-y-2">
        <h2 className="section-title">ยังไม่พร้อมใช้งาน</h2>
        <p className="text-sm text-muted-foreground">
          TODO: เชื่อมต่อรายการ profiles จาก Supabase
          เพื่อให้ Internal admin จัดการบัญชี (เปิด/ปิด, รีเซ็ตสถานะ, เชื่อมร้าน) ได้
        </p>
      </section>
    </SystemLayout>
  );
}
