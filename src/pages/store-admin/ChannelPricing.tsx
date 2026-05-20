import AdminLayout from "@/components/admin/AdminLayout";

export default function StoreAdminChannelPricingPage() {
  return (
    <AdminLayout title="ราคาตามช่องทาง" subtitle="กำหนดราคาขายและกำไรต่อช่องทาง">
      <div className="stat-card space-y-3">
        <p className="text-sm text-muted-foreground">
          กำหนดราคาขายแยกตามช่องทาง เช่น หน้าร้าน LINE OA Grab LINE MAN Shopee Food และ storefront เพื่อให้เห็นกำไรจริงหลังหักค่าธรรมเนียม
        </p>
        <ul className="list-disc list-inside text-sm text-foreground space-y-1">
          <li>ตั้งราคาเมนูต่อช่องทาง</li>
          <li>ระบุค่าธรรมเนียม/GP ต่อช่องทางเพื่อเห็นกำไรสุทธิ</li>
          <li>เชื่อมโยงกับสูตรและต้นทุนเพื่อคำนวณกำไรต่อเมนู</li>
        </ul>
        <p className="text-sm text-muted-foreground">Placeholder สำหรับ UI ราคาตามช่องทาง — ยังไม่เชื่อม API จริง</p>
      </div>
    </AdminLayout>
  );
}
