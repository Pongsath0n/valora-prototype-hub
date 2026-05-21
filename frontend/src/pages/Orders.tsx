import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Link } from "react-router-dom";
import { orderService, type OrderStatus } from "@/features/store/orderService";

const statuses: OrderStatus[] = ["draft","pending_payment","paid","accepted","preparing","ready_for_pickup","completed","cancelled"];

export default function OrdersPage() {
  const [rows, setRows] = useState(orderService.list());
  const refresh = () => setRows(orderService.list());
  useEffect(()=>{ refresh(); }, []);

  return <AppLayout><div className="space-y-4"><h1 className="page-title">รายการออเดอร์</h1><DataTable columns={[
    {key:"id",header:"เลขออเดอร์",render:(r)=><Link to={`/app/orders/${r.id}`} className="underline">{r.id}</Link>},
    {key:"channelName",header:"ช่องทาง"},{key:"totalAmount",header:"ยอดขาย"},
    {key:"status",header:"สถานะ",render:(r)=><StatusBadge label={r.status} tone="info"/>},
    {key:"next",header:"อัปเดต",render:(r)=><select className="border rounded px-2 py-1" value={r.status} onChange={(e)=>orderService.updateStatus(r.id, e.target.value as OrderStatus).then(refresh)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select>}
  ]} rows={rows as any}/></div></AppLayout>;
}
