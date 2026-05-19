import SystemLayout from "@/components/system/SystemLayout";

export default function SystemAuditLogsPage() {
  return (
    <SystemLayout
      title="บันทึกเหตุการณ์"
      subtitle="Audit logs ของการกระทำที่สำคัญในระบบ"
    >
      <section className="stat-card space-y-2">
        <h2 className="section-title">ยังไม่มีข้อมูล</h2>
        <p className="text-sm text-muted-foreground">
          TODO: รวบรวมเหตุการณ์สำคัญ (login admin, approve/reject payment, role change)
          จาก audit table ของ Supabase และแสดงเป็นรายการที่ค้นหา/กรองได้
        </p>
      </section>
    </SystemLayout>
  );
}
