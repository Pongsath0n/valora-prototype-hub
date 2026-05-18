import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useParams } from "react-router-dom";
import { orderService } from "@/features/store/orderService";

export default function OrderDetailPage() {
  const { id } = useParams();
  const order = id ? orderService.get(id) : null;
  if (!order) return <AppLayout><div className="stat-card">ไม่พบออเดอร์</div></AppLayout>;
  const moves = orderService.listMovements(order.id);

  return <AppLayout><div className="space-y-4"><h1 className="page-title">รายละเอียดออเดอร์</h1><div className="stat-card"><p className="text-sm">Order: {order.id}</p><div className="mt-2"><StatusBadge label={order.status} tone="info"/></div><p className="text-sm mt-2">Payment: {order.paymentStatus}</p><p className="text-sm mt-2">ยอดขาย ฿{order.totalAmount.toFixed(2)} | ต้นทุน ฿{order.totalCost.toFixed(2)} | ค่าช่องทาง ฿{order.totalChannelFee.toFixed(2)} | กำไร ฿{order.grossProfit.toFixed(2)}</p></div>
  <DataTable columns={[{key:"menuName",header:"เมนู"},{key:"quantity",header:"จำนวน"},{key:"unitPrice",header:"ราคา/หน่วย"},{key:"unitCost",header:"ต้นทุน/หน่วย"},{key:"lineProfit",header:"กำไร"},{key:"note",header:"โน้ต"}]} rows={order.items as any} />
  <div className="stat-card"><h2 className="section-title mb-2">Stock movements</h2><DataTable columns={[{key:"ingredientName",header:"วัตถุดิบ"},{key:"movementType",header:"ประเภท"},{key:"quantity",header:"จำนวน"},{key:"reason",header:"เหตุผล"}]} rows={moves as any} /></div>
  </div></AppLayout>;
}
