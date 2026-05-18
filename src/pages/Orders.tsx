import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";

const rows = [
  { id: "ORD-1024", channel: "LINE OA", amount: 220, status: "preparing" },
  { id: "ORD-1023", channel: "Pick-up", amount: 145, status: "ready_for_pickup" },
];

export default function OrdersPage() {
  return <AppLayout><div className="space-y-4"><h1 className="page-title">รายการออเดอร์</h1><DataTable columns={[{key:"id",header:"เลขออเดอร์"},{key:"channel",header:"ช่องทาง"},{key:"amount",header:"ยอดขาย"},{key:"status",header:"สถานะ",render:(r)=><StatusBadge label={r.status} tone="info"/>}]} rows={rows}/></div></AppLayout>;
}
