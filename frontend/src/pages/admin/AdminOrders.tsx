import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Download, Search } from "lucide-react";
import {
  storeAdminApi,
  type ApiOrder,
  type ApiPayment,
  type OrderPayload,
} from "@/services/storeAdminApi";
import { saveBlobAsFile } from "@/lib/download";
import { PaymentSlipPreviewModal } from "@/components/admin/PaymentSlipPreviewModal";
import {
  formatOrderStatus,
  orderStatusTone,
  formatPaymentStatus,
  paymentStatusTone,
  formatTHB,
  formatDateTime,
} from "@/lib/format";

type TabKey =
  | "queue"
  | "payments"
  | "preparing"
  | "ready"
  | "ready_for_pickup"
  | "completed"
  | "cancelled"
  | "rejected";

const statusTabs: { key: TabKey; label: string; filter: string[] }[] = [
  {
    key: "queue",
    label: "คิวออเดอร์",
    filter: [
      "pending_payment",
      "waiting_payment_review",
      "pending_review",
      "accepted",
      "preparing",
      "ready",
      "ready_for_pickup",
    ],
  },
  { key: "payments", label: "รายการรอตรวจสลิป", filter: ["waiting_payment_review", "pending_review"] },
  { key: "preparing", label: "กำลังเตรียม", filter: ["preparing", "accepted"] },
  { key: "ready", label: "พร้อมรับ (Ready)", filter: ["ready"] },
  { key: "ready_for_pickup", label: "พร้อมรับ (Legacy)", filter: ["ready_for_pickup"] },
  { key: "completed", label: "เสร็จสิ้น", filter: ["completed", "paid"] },
  { key: "cancelled", label: "ยกเลิกแล้ว", filter: ["cancelled"] },
  { key: "rejected", label: "ถูกปฏิเสธ", filter: ["rejected"] },
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
  const [searchText, setSearchText] = useState("");
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
  const [exportingOrders, setExportingOrders] = useState(false);
  const [exportingPayments, setExportingPayments] = useState(false);

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

  const handleExportOrders = async () => {
    setExportingOrders(true);
    try {
      const { blob, filename } = await storeAdminApi.exportOrdersCsv();
      saveBlobAsFile(blob, filename ?? "orders.csv");
    } catch (err: any) {
      setError(err?.message || "ส่งออกออเดอร์ไม่สำเร็จ");
    } finally {
      setExportingOrders(false);
    }
  };

  const handleExportPayments = async () => {
    setExportingPayments(true);
    try {
      const { blob, filename } = await storeAdminApi.exportPaymentsCsv();
      saveBlobAsFile(blob, filename ?? "payments.csv");
    } catch (err: any) {
      setError(err?.message || "ส่งออกการชำระเงินไม่สำเร็จ");
    } finally {
      setExportingPayments(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filteredOrders = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const tab = statusTabs.find((t) => t.key === activeTab);
    const base = tab ? rows.filter((r) => tab.filter.includes(r.status)) : rows;
    const searched = query
      ? base.filter((order) => {
          const shortId = order.id.slice(-6).toLowerCase();
          return (
            order.order_no?.toLowerCase().includes(query) ||
            order.id.toLowerCase().includes(query) ||
            shortId.includes(query) ||
            order.customer_name?.toLowerCase().includes(query) ||
            order.customer_phone?.toLowerCase().includes(query)
          );
        })
      : base;

    if (["queue", "preparing", "ready", "ready_for_pickup"].includes(activeTab)) {
      return [...searched].sort((a, b) => {
        const aTs = a.pickup_time ? new Date(a.pickup_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTs = b.pickup_time ? new Date(b.pickup_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTs - bTs;
      });
    }
    return searched;
  }, [rows, activeTab, searchText]);

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
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs"
            onClick={handleExportOrders}
            disabled={exportingOrders}
          >
            <Download className="w-3 h-3" />
            {exportingOrders ? "กำลังส่งออก..." : "Export Orders"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs"
            onClick={handleExportPayments}
            disabled={exportingPayments}
          >
            <Download className="w-3 h-3" />
            {exportingPayments ? "กำลังส่งออก..." : "Export Payments"}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground bg-background">
          <Search className="w-3.5 h-3.5" />
          <input
            className="bg-transparent text-foreground placeholder:text-muted-foreground text-xs focus:outline-none"
            placeholder="ค้นหาเลขออเดอร์ / ลูกค้า / โทร"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
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
              key: "order_no",
              header: "เลขออเดอร์",
              render: (r) => (
                <Link to={`/store-admin/orders/${r.order_id}`} className="underline font-mono text-xs">
                  {r.order_no || r.order_id}
                </Link>
              ),
            },
            {
              key: "customer_name",
              header: "ลูกค้า",
              render: (r) => (
                <div className="flex flex-col">
                  <span>{r.customer_name || "-"}</span>
                  <span className="text-xs text-muted-foreground">{r.customer_phone || "-"}</span>
                </div>
              ),
            },
            { key: "amount", header: "ยอดชำระ", render: (r) => formatTHB(r.amount || 0) },
            { key: "method", header: "วิธีชำระ" },
            {
              key: "slip",
              header: "หลักฐาน",
              render: (r) => (
                <button
                  type="button"
                  className="underline"
                  onClick={() => openPaymentPreview(r)}
                  disabled={!r.slip_submitted && !r.slip_storage_path && !r.slip_url}
                >
                  ตรวจสลิป
                </button>
              ),
            },
            {
              key: "submitted_at",
              header: "ส่งเมื่อ",
              render: (r) =>
                r.submitted_at
                  ? formatDateTime(r.submitted_at)
                  : r.slip_submitted
                    ? "แนบแล้ว"
                    : "-",
            },
            {
              key: "status",
              header: "สถานะชำระเงิน",
              render: (r) => (
                <div className="flex flex-col gap-1">
                  <StatusBadge label={formatPaymentStatus(r.status)} tone={paymentStatusTone(r.status)} />
                  {r.order_status ? (
                    <StatusBadge label={`ออเดอร์: ${formatOrderStatus(r.order_status)}`} tone={orderStatusTone(r.order_status)} />
                  ) : null}
                  {r.order_payment_status ? (
                    <StatusBadge label={`ชำระ: ${formatPaymentStatus(r.order_payment_status)}`} tone={paymentStatusTone(r.order_payment_status)} />
                  ) : null}
                </div>
              ),
            },
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
                  {r.order_no || r.id}
                </Link>
              ),
            },
            {
              key: "customer_name",
              header: "ลูกค้า",
              render: (r) => (
                <div className="flex flex-col">
                  <span>{r.customer_name || "-"}</span>
                  <span className="text-xs text-muted-foreground">{r.customer_phone || "-"}</span>
                </div>
              ),
            },
            { key: "pickup_time", header: "เวลารับ", render: (r) => (r.pickup_time ? formatDateTime(r.pickup_time) : "-") },
            { key: "channel_name", header: "ช่องทาง", render: (r) => r.channel_name || "-" },
            {
              key: "payment_status",
              header: "สถานะชำระเงิน",
              render: (r) => <StatusBadge label={formatPaymentStatus(r.payment_status)} tone={paymentStatusTone(r.payment_status)} />,
            },
            {
              key: "status",
              header: "สถานะออเดอร์",
              render: (r) => <StatusBadge label={formatOrderStatus(r.status)} tone={orderStatusTone(r.status)} />,
            },
            {
              key: "latest_payment",
              header: "ชำระล่าสุด",
              render: (r) => {
                const latest = r.latest_payment;
                if (!latest) {
                  return <span className="text-xs text-muted-foreground">-</span>;
                }
                const amount = typeof latest.amount === "number" ? formatTHB(latest.amount) : "-";
                return (
                  <div className="flex flex-col text-xs">
                    <span>สถานะ: {formatPaymentStatus(latest.status)}</span>
                    <span>ยอด: {amount}</span>
                    <span className={latest.slip_submitted ? "text-emerald-600" : "text-muted-foreground"}>
                      {latest.slip_submitted ? "มีสลิป" : "ยังไม่แนบสลิป"}
                    </span>
                  </div>
                );
              },
            },
            { key: "total_amount", header: "ยอดรวม", render: (r) => formatTHB(r.total_amount || 0) },
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
