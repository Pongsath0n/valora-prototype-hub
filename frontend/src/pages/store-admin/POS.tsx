import AdminLayout from "@/components/admin/AdminLayout";

export default function StoreAdminPOSPage() {
  return (
    <AdminLayout title="POS" subtitle="จุดขายสำหรับออเดอร์หน้าร้าน/รับที่ร้าน">
      <div className="stat-card space-y-3">
        <p className="text-sm text-muted-foreground">
          หน้านี้ใช้เปิดออเดอร์ walk-in หรือ pickup ด้วยตนเอง รองรับการเลือกเมนู ระบุจำนวน และชำระผ่านช่องทางที่ร้านรองรับ
        </p>
        <ul className="list-disc list-inside text-sm text-foreground space-y-1">
          <li>สร้างออเดอร์ใหม่สำหรับหน้าร้าน</li>
          <li>รองรับสถานะการชำระเงิน (เงินสด/โอน) และการพิมพ์สลิปในอนาคต</li>
          <li>เชื่อมต่อคิวออเดอร์และการเตรียมเครื่องดื่ม</li>
        </ul>
        <p className="text-sm text-muted-foreground">Placeholder — UI POS จะเชื่อมต่อ logic ออเดอร์ที่มีอยู่ในเฟสถัดไป</p>
      </div>
    </AdminLayout>
  );
}
