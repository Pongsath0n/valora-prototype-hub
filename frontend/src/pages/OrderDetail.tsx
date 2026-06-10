import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable, { type Column } from "@/components/shared/DataTable";
import { orderService, type Order, type OrderItem } from "@/features/store/orderService";
import { formatOrderStatus, orderStatusTone, formatPaymentStatus, paymentStatusTone, formatTHB } from "@/lib/format";

export default function OrderDetailPage() {
  const { id } = useParams();
  const order = (id ? orderService.get(id) : null) as Order | null;

  if (!order) {
    return (
      <AppLayout>
        <div className="stat-card">ไม่พบออเดอร์</div>
      </AppLayout>
    );
  }

  type MovementRow = ReturnType<typeof orderService.listMovements>[number];

  const items = order.items as OrderItem[];
  const moves = orderService.listMovements(order.id) as MovementRow[];

  const itemColumns: Column<OrderItem>[] = [
    { key: "menuName", header: "เมนู" },
    { key: "quantity", header: "จำนวน" },
    { key: "unitPrice", header: "ราคา/หน่วย", render: (r) => formatTHB(r.unitPrice ?? 0) },
    { key: "unitCost", header: "ต้นทุน/หน่วย", render: (r) => formatTHB(r.unitCost ?? 0) },
    { key: "lineProfit", header: "กำไร", render: (r) => formatTHB(r.lineProfit ?? 0) },
    { key: "note", header: "โน้ต" },
  ];

  const movementColumns: Column<MovementRow>[] = [
    { key: "ingredientName", header: "วัตถุดิบ" },
    { key: "movementType", header: "ประเภท" },
    { key: "quantity", header: "จำนวน" },
    { key: "reason", header: "เหตุผล" },
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="page-title">รายละเอียดออเดอร์</h1>
        <div className="stat-card space-y-2">
          <p className="text-sm">Order: {order.id}</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={formatOrderStatus(order.status)} tone={orderStatusTone(order.status)} />
            <StatusBadge label={formatPaymentStatus(order.paymentStatus)} tone={paymentStatusTone(order.paymentStatus)} />
          </div>
          <p className="text-sm">
            ยอดขาย {formatTHB(order.totalAmount ?? 0)} | ต้นทุน {formatTHB(order.totalCost ?? 0)} | ค่าช่องทาง {formatTHB(order.totalChannelFee ?? 0)} | กำไร {formatTHB(order.grossProfit ?? 0)}
          </p>
        </div>

        <DataTable columns={itemColumns} rows={items} />

        <div className="stat-card">
          <h2 className="section-title mb-2">Stock movements</h2>
          <DataTable columns={movementColumns} rows={moves} />
        </div>
      </div>
    </AppLayout>
  );
}
