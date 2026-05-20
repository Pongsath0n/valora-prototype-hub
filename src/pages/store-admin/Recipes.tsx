import AdminLayout from "@/components/admin/AdminLayout";

export default function StoreAdminRecipesPage() {
  return (
    <AdminLayout title="สูตรและต้นทุน" subtitle="คำนวณต้นทุนสูตร วัตถุดิบ บรรจุภัณฑ์ และค่าธรรมเนียมช่องทาง">
      <div className="stat-card space-y-3">
        <p className="text-sm text-muted-foreground">
          หน้านี้จะใช้คำนวณต้นทุนรวมของเมนู จากวัตถุดิบ บรรจุภัณฑ์ ค่าธรรมเนียมช่องทางขาย และราคาขาย เพื่อประมาณกำไรขั้นต้นต่อช่องทาง
        </p>
        <ul className="list-disc list-inside text-sm text-foreground space-y-1">
          <li>เชื่อมโยงวัตถุดิบกับสูตรของแต่ละเมนู</li>
          <li>คำนวณต้นทุนต่อแก้ว/ต่อรายการ และค่าธรรมเนียมช่องทาง</li>
          <li>แผนกำไร (profit planner) จะถูกนำมาใช้ต่อยอดในเฟสถัดไป</li>
        </ul>
        <p className="text-sm text-muted-foreground">Placeholder เชื่อมต่อ logic ต้นทุน/กำไรที่มีอยู่ โดยไม่แก้โค้ดธุรกิจปัจจุบัน</p>
      </div>
    </AdminLayout>
  );
}
