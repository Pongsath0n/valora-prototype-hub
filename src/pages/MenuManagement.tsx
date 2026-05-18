import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";

const rows = [
  { name: "Iced Latte", category: "Coffee", basePrice: 75, active: "Yes" },
  { name: "Americano", category: "Coffee", basePrice: 60, active: "Yes" },
];

export default function MenuManagement() {
  return <AppLayout><div className="space-y-4"><h1 className="page-title">จัดการเมนู</h1>{rows.length ? <DataTable columns={[{key:"name",header:"เมนู"},{key:"category",header:"หมวดหมู่"},{key:"basePrice",header:"ราคา"},{key:"active",header:"สถานะ"}]} rows={rows} /> : <EmptyState title="ยังไม่มีเมนู" description="เพิ่มเมนูเพื่อเริ่มคำนวณกำไร" />}</div></AppLayout>;
}
