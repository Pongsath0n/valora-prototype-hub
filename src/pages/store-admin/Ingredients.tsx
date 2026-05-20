import AdminLayout from "@/components/admin/AdminLayout";

export default function StoreAdminIngredientsPage() {
  return (
    <AdminLayout title="วัตถุดิบ" subtitle="จัดการข้อมูลวัตถุดิบ ต้นทุนต่อหน่วย และสถานะสต็อก">
      <div className="stat-card space-y-3">
        <p className="text-sm text-muted-foreground">
          หน้านี้ใช้สำหรับบันทึกวัตถุดิบ หน่วยนับ ราคาทุนต่อหน่วย และสถานะสต็อก/การใช้งาน เพื่อเชื่อมโยงกับสูตรและการคำนวณต้นทุนเมนูในภายหลัง
        </p>
        <ul className="list-disc list-inside text-sm text-foreground space-y-1">
          <li>เพิ่ม/แก้ไขวัตถุดิบและหน่วยนับ</li>
          <li>บันทึกราคาทุนต่อหน่วยเพื่อนำไปคำนวณสูตร</li>
          <li>รองรับสถานะสต็อกหรือการใช้จริงเมื่อเชื่อมต่อระบบสต็อก</li>
        </ul>
        <p className="text-sm text-muted-foreground">Placeholder สำหรับเวอร์ชัน MVP — จะเชื่อมต่อบริการสต็อก/ต้นทุนในขั้นถัดไป</p>
      </div>
    </AdminLayout>
  );
}
