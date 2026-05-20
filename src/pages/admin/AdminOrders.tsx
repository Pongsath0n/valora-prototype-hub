import { useEffect, useMemo, useState } from "react";
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

const statusTabs: { key: OrderStatus | "queue" | "payments"; label: string; filter: OrderStatus[] }[] = [
  { key: "queue", label: "Order Queue", filter: ["pending_payment", "paid", "accepted", "preparing", "ready_for_pickup"] },
  { key: "payments", label: "Payment Queue", filter: ["pending_payment"] },
  { key: "preparing", label: "Preparing", filter: ["preparing"] },
  { key: "ready_for_pickup", label: "Ready for Pickup", filter: ["ready_for_pickup"] },
  { key: "completed", label: "Completed", filter: ["completed"] },
  { key: "cancelled", label: "Cancelled", filter: ["cancelled"] },
];

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<Order[]>(orderService.list());
  const [activeTab, setActiveTab] = useState<OrderStatus | "queue" | "payments">("queue");

  const refresh = () => setRows(orderService.list());
  useEffect(() => {
    refresh();
  }, []);

  const filteredRows = useMemo(() => {
    const tab = statusTabs.find((t) => t.key === activeTab);
    if (!tab) return rows;
    return rows.filter((r) => tab.filter.includes(r.status));
  }, [rows, activeTab]);

  return (
    <AdminLayout
      title="ออเดอร์"
      subtitle="คิวออเดอร์ การชำระเงิน การเตรียม และพร้อมรับ"
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              activeTab === tab.key ? "bg-accent text-accent-foreground border-accent" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "payments" ? (
        <div className="stat-card mb-4">
          <p className="text-sm text-muted-foreground">
            ใช้สำหรับตรวจสอบและอนุมัติการชำระเงิน (mock trigger LINE):
            "ตรวจสอบการชำระเงินสำเร็จแล้ว กำลังเตรียมเครื่องดื่มให้คุณ"
          </p>
        </div>
      ) : null}

      {activeTab === "ready_for_pickup" || activeTab === "completed" ? (
        <div className="stat-card mb-4">
          <p className="text-sm text-muted-foreground">
            เมื่อออเดอร์พร้อมรับ/สำเร็จ (mock trigger LINE):
            "เครื่องดื่มของคุณพร้อมแล้ว สามารถมารับได้เลยครับ"
          </p>
        </div>
      ) : null}

      <DataTable
        columns={[
          {
            key: "id",
            header: "เลขออเดอร์",
            render: (r) => (
              <Link to={`/store-admin/orders/${r.id}`} className="underline">
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
        rows={filteredRows}
      />
    </AdminLayout>
  );
}
