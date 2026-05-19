import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { orderService, type Order, type OrderStatus } from "@/features/store/orderService";

const statuses: OrderStatus[] = [
  "draft",
  "pending_payment",
  "paid",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "completed",
  "cancelled",
];

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<Order[]>(orderService.list());

  const refresh = () => setRows(orderService.list());
  useEffect(() => {
    refresh();
  }, []);

  return (
    <AdminLayout
      title="Order Queue"
      subtitle="จัดการสถานะออเดอร์: ยืนยัน → เตรียม → พร้อมรับ → ปิดออเดอร์"
    >
      <DataTable
        columns={[
          {
            key: "id",
            header: "เลขออเดอร์",
            render: (r) => (
              <Link to={`/admin/orders/${r.id}`} className="underline">
                {r.id}
              </Link>
            ),
          },
          { key: "channelName", header: "ช่องทาง" },
          { key: "totalAmount", header: "ยอดขาย" },
          {
            key: "status",
            header: "สถานะ",
            render: (r) => <StatusBadge label={r.status} tone="info" />,
          },
          {
            key: "next",
            header: "อัปเดต",
            render: (r) => (
              <select
                className="border rounded px-2 py-1"
                value={r.status}
                onChange={(e) =>
                  orderService
                    .updateStatus(r.id, e.target.value as OrderStatus)
                    .then(refresh)
                }
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ),
          },
        ]}
        rows={rows}
      />
    </AdminLayout>
  );
}
