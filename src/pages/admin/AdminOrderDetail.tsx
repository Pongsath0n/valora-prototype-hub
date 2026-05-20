import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import {
  orderService,
  type Order,
  type OrderStatus,
} from "@/features/store/orderService";

const nextStatusActions: { label: string; next: OrderStatus }[] = [
  { label: "Mark Preparing", next: "preparing" },
  { label: "Mark Ready", next: "ready_for_pickup" },
  { label: "Mark Completed", next: "completed" },
  { label: "Cancel Order", next: "cancelled" },
];

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const initial = id ? orderService.get(id) : null;
  const [order, setOrder] = useState<Order | null>(initial);

  if (!order) {
    return (
      <AdminLayout title="รายละเอียดออเดอร์" subtitle="">
        <div className="stat-card">
          <p>ไม่พบออเดอร์</p>
          <Link
            to="/store-admin/orders"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> กลับไปที่ Order Queue
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const handleStatus = async (next: OrderStatus) => {
    await orderService.updateStatus(order.id, next);
    const reread = orderService.get(order.id);
    if (reread) setOrder(reread);
  };

  const moves = orderService.listMovements(order.id);

  return (
    <AdminLayout title="รายละเอียดออเดอร์" subtitle={`Order #${order.id}`}>
      <div className="stat-card space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={order.status} tone="info" />
          <span className="text-sm text-muted-foreground">
            Payment: {order.paymentStatus}
          </span>
        </div>
        <p className="text-sm">
          ยอดขาย ฿{order.totalAmount.toFixed(2)} | ต้นทุน ฿{order.totalCost.toFixed(2)} | ค่าช่องทาง ฿
          {order.totalChannelFee.toFixed(2)} | กำไร ฿{order.grossProfit.toFixed(2)}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {nextStatusActions.map((a) => (
            <button
              key={a.next}
              type="button"
              onClick={() => handleStatus(a.next)}
              className={`px-3 py-1.5 rounded border text-sm ${
                a.next === "cancelled"
                  ? "text-destructive border-destructive/40 hover:bg-destructive/10"
                  : "hover:bg-muted"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={[
          { key: "menuName", header: "เมนู" },
          { key: "quantity", header: "จำนวน" },
          { key: "unitPrice", header: "ราคา/หน่วย" },
          { key: "unitCost", header: "ต้นทุน/หน่วย" },
          { key: "lineProfit", header: "กำไร" },
          { key: "note", header: "โน้ต" },
        ]}
        rows={order.items}
      />

      <div className="stat-card">
        <h2 className="section-title mb-2">Stock movements</h2>
        <DataTable
          columns={[
            { key: "ingredientName", header: "วัตถุดิบ" },
            { key: "movementType", header: "ประเภท" },
            { key: "quantity", header: "จำนวน" },
            { key: "reason", header: "เหตุผล" },
          ]}
          rows={moves}
        />
      </div>
    </AdminLayout>
  );
}
