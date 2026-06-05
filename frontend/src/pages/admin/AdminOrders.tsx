import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  storeAdminApi,
  type ApiOrder,
  type ApiPayment,
  type OrderPayload,
} from "@/services/storeAdminApi";
import { PaymentSlipPreviewModal } from "@/components/admin/PaymentSlipPreviewModal";

type TabKey = "queue" | "payments" | "preparing" | "ready" | "completed" | "cancelled";

const statusTabs: { key: TabKey; label: string; filter: string[] }[] = [
  { key: "queue", label: "Order Queue", filter: ["pending_payment", "waiting_payment_review", "accepted", "preparing", "ready"] },
  { key: "payments", label: "Payment Queue", filter: ["waiting_payment_review"] },
  { key: "preparing", label: "Preparing", filter: ["preparing"] },
  { key: "ready", label: "Ready for Pickup", filter: ["ready"] },
  { key: "completed", label: "Completed", filter: ["completed"] },
  { key: "cancelled", label: "Cancelled", filter: ["cancelled"] },
];

const nextStatusByCurrent: Record<string, string[]> = {
  pending_payment: ["waiting_payment_review", "cancelled"],
  waiting_payment_review: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "completed", "cancelled"],
  ready: ["completed", "cancelled"],
};

function friendlyError(message: string): string {
  if (message === "missing_token" || message === "invalid_token" || message === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (message === "store_access_denied" || message === "no_store_membership" || message === "store_mismatch") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (message === "insufficient_role") {
    return "สิทธิ์ไม่เพียงพอสำหรับการแก้ไขข้อมูล";
  }
  return message;
}

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<ApiOrder[]>([]);
  const [paymentQueue, setPaymentQueue] = useState<ApiPayment[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("queue");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderPayload>({
    order_type: "pickup",
    pickup_type: "pickup",
    pickup_time: "",
    note: "",
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<ApiPayment | null>(null);
  const [modalRejectReason, setModalRejectReason] = useState("");

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const [ordersData, paymentsData] = await Promise.all([
        storeAdminApi.listOrders(),
        storeAdminApi.listPayments(),
      ]);
      setRows(ordersData.items ?? []);
      setPaymentQueue(paymentsData.payment_queue ?? []);
    } catch (err: any) {
      setError(friendlyError(err?.message || "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filteredOrders = useMemo(() => {
    const tab = statusTabs.find((t) => t.key === activeTab);
    if (!tab) return rows;
    const filtered = rows.filter((r) => tab.filter.includes(r.status));

    if (activeTab === "queue" || activeTab === "preparing" || activeTab === "ready") {
      return [...filtered].sort((a, b) => {
        const aTs = a.pickup_time ? new Date(a.pickup_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTs = b.pickup_time ? new Date(b.pickup_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTs - bTs;
      });
    }
    return filtered;
  }, [rows, activeTab]);

  const handleStatusChange = async (order: ApiOrder, nextStatus: string) => {
    setError("");
    try {
      const res = await storeAdminApi.updateOrderStatus(order.id, { status: nextStatus });
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err?.message || "อัปเดตสถานะไม่สำเร็จ"));
    }
  };

  const handleApprovePayment = async (paymentId: string) => {
    setError("");
    try {
      const res = await storeAdminApi.approvePayment(paymentId, {});
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err?.message || "อนุมัติการชำระเงินไม่สำเร็จ"));
    }
  };

  const handleRejectPayment = async (paymentId: string, providedReason?: string) => {
    setError("");
    try {
      const reason = providedReason?.trim() || "rejected_by_admin";
      const res = await storeAdminApi.rejectPayment(paymentId, { reason });
      if (res.message) setInfo(res.message);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err?.message || "ปฏิเสธการชำระเงินไม่สำเร็จ"));
    }
  };

  const openPaymentPreview = (payment: ApiPayment) => {
    setActivePayment(payment);
    setModalRejectReason("");
    setPreviewOpen(true);
  };

  const closePaymentPreview = () => {
    setPreviewOpen(false);
    setActivePayment(null);
    setModalRejectReason("");
  };

  const handleApproveFromModal = async (payment: ApiPayment) => {
    await handleApprovePayment(payment.id);
    closePaymentPreview();
  };

  const handleRejectFromModal = async (payment: ApiPayment) => {
    const resolvedReason = modalRejectReason.trim() || "rejected_by_admin";
    await handleRejectPayment(payment.id, resolvedReason);
    closePaymentPreview();
  };

  const handleCreateOrder = async () => {
    setError("");
    setInfo("");
    setCreatingOrder(true);
    try {
      const payload: OrderPayload = {
        order_type: "pickup",
        pickup_type: "pickup",
        pickup_time: orderForm.pickup_time || undefined,
        note: orderForm.note || undefined,
      };
      await storeAdminApi.createOrder(payload);
      setInfo("สร้างออเดอร์รับที่ร้านแล้ว");
      setOrderForm({ order_type: "pickup", pickup_type: "pickup", pickup_time: "", note: "" });
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err?.message || "สร้างออเดอร์ไม่สำเร็จ"));
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <AdminLayout
      title="ออเดอร์"
      subtitle="คิวออเดอร์ การชำระเงิน การเตรียม และพร้อมรับ"
    >
      <div className="stat-card mb-4 space-y-3">
        <h2 className="section-title text-base">สร้างออเดอร์ Pickup</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Pickup Time</label>
            <input
              type="datetime-local"
              className="form-input"
              value={orderForm.pickup_time || ""}
              onChange={(e) => setOrderForm((prev) => ({ ...prev, pickup_time: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">หมายเหตุ</label>
            <input
              className="form-input"
              value={orderForm.note || ""}
              onChange={(e) => setOrderForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm"
            onClick={handleCreateOrder}
            disabled={creatingOrder}
          >
            {creatingOrder ? "กำลังสร้าง..." : "สร้างออเดอร์ Pickup"}
          </button>
          <span className="text-xs text-muted-foreground">รองรับ pickup_time สำหรับ flow จาก LIFF ในอนาคต</span>
        </div>
      </div>

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
        {refreshing ? <span className="text-xs text-muted-foreground self-center">กำลังโหลด...</span> : null}
      </div>

      {error ? <div className="stat-card mb-4 text-sm text-destructive">{error}</div> : null}
      {info ? <div className="stat-card mb-4 text-sm text-foreground">{info}</div> : null}

      {activeTab === "payments" ? (
        <div className="stat-card mb-4">
          <p className="text-sm text-muted-foreground">
            ใช้สำหรับตรวจสอบและอนุมัติการชำระเงิน (mock trigger LINE):
            "ตรวจสอบการชำระเงินสำเร็จแล้ว กำลังเตรียมเครื่องดื่มให้คุณ"
          </p>
        </div>
      ) : null}

      {activeTab === "ready" || activeTab === "completed" ? (
        <div className="stat-card mb-4">
          <p className="text-sm text-muted-foreground">
            เมื่อออเดอร์พร้อมรับ/สำเร็จ (mock trigger LINE):
            "เครื่องดื่มของคุณพร้อมแล้ว สามารถมารับได้เลยครับ"
          </p>
        </div>
      ) : null}

      {activeTab === "payments" ? (
        <DataTable
          columns={[
            {
              key: "order_id",
              header: "เลขออเดอร์",
              render: (r) => (
                <Link to={`/store-admin/orders/${r.order_id}`} className="underline">
                  {r.order_id}
                </Link>
              ),
            },
            { key: "customer_name", header: "ลูกค้า", render: (r) => r.customer_name || "-" },
            { key: "amount", header: "ยอดชำระ", render: (r) => `฿${Number(r.amount || 0).toFixed(2)}` },
            { key: "method", header: "วิธีชำระ" },
            {
              key: "slip",
              header: "หลักฐาน",
              render: (r) => (
                <button
                  type="button"
                  className="underline"
                  onClick={() => openPaymentPreview(r)}
                  disabled={!r.slip_storage_path && !r.slip_url}
                >
                  ตรวจสลิป
                </button>
              ),
            },
            { key: "submitted_at", header: "ส่งเมื่อ", render: (r) => r.submitted_at || "-" },
            { key: "status", header: "สถานะชำระเงิน", render: (r) => <StatusBadge label={r.status} tone="info" /> },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex flex-col gap-1 text-sm">
                  <button type="button" className="underline text-left" onClick={() => openPaymentPreview(r)}>เปิดหน้าตรวจสอบ</button>
                </div>
              ),
            },
          ]}
          rows={paymentQueue}
        />
      ) : (
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
            { key: "customer_name", header: "ลูกค้า", render: (r) => r.customer_name || "-" },
            { key: "pickup_time", header: "เวลารับ", render: (r) => r.pickup_time || "-" },
            { key: "channel_name", header: "ช่องทาง", render: (r) => r.channel_name || "-" },
            { key: "payment_status", header: "สถานะชำระเงิน", render: (r) => <StatusBadge label={r.payment_status} tone="warning" /> },
            { key: "status", header: "สถานะออเดอร์", render: (r) => <StatusBadge label={r.status} tone="info" /> },
            { key: "total_amount", header: "ยอดรวม", render: (r) => `฿${Number(r.total_amount || 0).toFixed(2)}` },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => {
                const options = nextStatusByCurrent[r.status] || [];
                if (options.length === 0) return <span className="text-muted-foreground">-</span>;
                return (
                  <select
                    className="border rounded px-2 py-1"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      void handleStatusChange(r, e.target.value);
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">เลือกสถานะถัดไป</option>
                    {options.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                );
              },
            },
          ]}
          rows={filteredOrders}
        />
      )}
      {loading ? <p className="text-sm text-muted-foreground mt-3">กำลังโหลด...</p> : null}
      <PaymentSlipPreviewModal
        payment={activePayment}
        isOpen={previewOpen}
        onClose={closePaymentPreview}
        onApprove={(payment) => handleApproveFromModal(payment)}
        onReject={(payment) => handleRejectFromModal(payment)}
        rejectReason={modalRejectReason}
        onRejectReasonChange={setModalRejectReason}
      />
    </AdminLayout>
  );
}
