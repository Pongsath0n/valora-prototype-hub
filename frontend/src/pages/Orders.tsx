import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import DataTable, { type Column } from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { orderService, type OrderStatus } from "@/features/store/orderService";
import { formatOrderStatus, orderStatusTone, formatTHB } from "@/lib/format";

type OrderRow = ReturnType<typeof orderService.list>[number];

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

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>(orderService.list() as OrderRow[]);

  const refresh = () => setRows(orderService.list());

  useEffect(() => {
    refresh();
  }, []);

  const columns: Column<OrderRow>[] = [
    {
      key: "id",
      header: "เลขออเดอร์",
      render: (r) => (
        <Link to={`/app/orders/${r.id}`} className="underline">
          {r.id}
        </Link>
      ),
    },
    { key: "channelName", header: "ช่องทาง" },
    {
      key: "totalAmount",
      header: "ยอดขาย",
      render: (r) => formatTHB(r.totalAmount ?? 0),
    },
    {
      key: "status",
      header: "สถานะ",
      render: (r) => (
        <StatusBadge label={formatOrderStatus(r.status)} tone={orderStatusTone(r.status)} />
      ),
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
              {formatOrderStatus(s)}
            </option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="page-title">รายการออเดอร์</h1>
        <DataTable columns={columns} rows={rows} />
      </div>
    </AppLayout>
  );
}
