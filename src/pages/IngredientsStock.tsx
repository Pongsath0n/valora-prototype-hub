import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";

const rows = [
  { name: "Coffee Beans", stock: 1.2, unit: "kg", min: 2 },
  { name: "Fresh Milk", stock: 6, unit: "L", min: 4 },
];

export default function IngredientsStock() {
  return <AppLayout><div className="space-y-4"><h1 className="page-title">วัตถุดิบและสต็อก</h1><DataTable columns={[{key:"name",header:"วัตถุดิบ"},{key:"stock",header:"คงเหลือ"},{key:"min",header:"ขั้นต่ำ"},{key:"status",header:"แจ้งเตือน",render:(r)=>r.stock<r.min?<StatusBadge label="ใกล้หมด" tone="warning"/>:<StatusBadge label="ปกติ" tone="success"/>}]} rows={rows} /></div></AppLayout>;
}
