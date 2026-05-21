import AdminLayout from "@/components/admin/AdminLayout";

export default function StoreAdminReportsPage() {
  return (
    <AdminLayout title="รายงาน" subtitle="สรุปยอดขาย กำไร ประสิทธิภาพเมนู วัตถุดิบ และช่องทาง">
      <div className="stat-card space-y-3">
        <p className="text-sm text-muted-foreground">
          สรุปรายงานที่ต้องมี: ยอดขาย/กำไร, ประสิทธิภาพเมนู, ต้นทุนวัตถุดิบ, ประสิทธิภาพช่องทาง, และภาพรวมออเดอร์
        </p>
        <ul className="list-disc list-inside text-sm text-foreground space-y-1">
          <li>รายงานยอดขายและกำไรขั้นต้น</li>
          <li>รายงานเมนูขายดีและต้นทุนต่อเมนู</li>
          <li>สรุปต้นทุนวัตถุดิบและค่าใช้จ่ายหลัก</li>
          <li>ประสิทธิภาพช่องทางขาย เปรียบเทียบ GP ต่อช่องทาง</li>
          <li>สรุปสถานะออเดอร์รวม</li>
        </ul>
        <p className="text-sm text-muted-foreground">Placeholder สำหรับแดชบอร์ดรายงาน — ยังไม่เชื่อมต่อข้อมูลจริง</p>
      </div>
    </AdminLayout>
  );
}
