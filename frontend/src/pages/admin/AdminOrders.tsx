import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Download, Search, ClipboardList, Inbox, AlertTriangle } from "lucide-react";
import {
  storeAdminApi,
  type ApiOrder,
  type ApiPayment,
  type OrderPayload,
} from "@/services/storeAdminApi";
import { saveBlobAsFile } from "@/lib/download";
import { PaymentSlipPreviewModal } from "@/components/admin/PaymentSlipPreviewModal";
import { CancelOrderDialog } from "@/components/admin/CancelOrderDialog";
import { friendlyCancelError, isClearlyUncancellableByStaff } from "@/lib/orderCancel";
import {
  formatOrderStatus,
  orderStatusTone,
  formatPaymentStatus,
  paymentStatusTone,
  formatNextStatusAction,
  formatTHB,
  formatDateTime,
} from "@/lib/format";

/**
 * The manual "create pickup order" form only collects pickup_time + note —
 * it cannot create a complete order (no customer, items, quantities, channel,
 * totals, or cost/profit snapshot). Until a full Manual Sales Entry flow
 * exists, the form is dev-only and must not appear in production.
 */
export function shouldShowDevCreateOrderForm(isDevBuild: boolean): boolean {
  return isDevBuild;
}
const showDevCreateOrderForm = shouldShowDevCreateOrderForm(Boolean(import.meta.env.DEV));

type TabKey =
  | "queue"
  | "payments"
  | "preparing"
  | "ready"
  | "completed";

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
  { key: "payments", label: "รอตรวจสลิป", filter: ["waiting_payment_review", "pending_review"] },
  { key: "preparing", label: "กำลังเตรียม", filter: ["preparing", "accepted"] },
  { key: "ready", label: "พร้อมรับ", filter: ["ready", "ready_for_pickup"] },
  { key: "completed", label: "เสร็จสิ้น", filter: ["completed", "paid"] },
];

const normalizeStatus = (value: string | null | undefined): string => (value ?? "").toLowerCase();

const doesTabContainStatus = (tabKey: TabKey, status: string | null | undefined): boolean => {
  const tab = statusTabs.find((t) => t.key === tabKey);
  if (!tab) return false;
  const normalized = normalizeStatus(status);
  return tab.filter.some((value) => value === normalized);
};

const isArchivedStatus = (status: string | null | undefined): boolean => {
  const normalized = normalizeStatus(status);
  return normalized === "cancelled" || normalized === "voided";
};

const nextStatusByCurrent: Record<string, string[]> = {
  pending_payment: ["waiting_payment_review", "cancelled"],
  waiting_payment_review: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "completed", "cancelled"],
  ready: ["completed", "cancelled"],
};

/**
 * A short, human-readable "what to do next" hint for a queued order, derived
 * entirely from already-loaded order/payment status. `attention` marks orders
 * that need immediate Staff action (slip waiting for review).
 */
type QueueHint = { label: string; tone: "attention" | "info" | "muted" };

function getQueueHint(order: ApiOrder): QueueHint | null {
  const payment = normalizeStatus(order.payment_status);
  const status = normalizeStatus(order.status);
  if (payment === "waiting_payment_review" || payment === "pending_review") {
    return { label: "ต้องตรวจสลิป", tone: "attention" };
  }
  if (status === "pending_payment") {
    return { label: "รอลูกค้าชำระเงิน", tone: "muted" };
  }
  if (status === "accepted") {
    return { label: "พร้อมเริ่มเตรียม", tone: "info" };
  }
  if (status === "preparing") {
    return { label: "กำลังเตรียม", tone: "info" };
  }
  if (status === "ready" || status === "ready_for_pickup") {
    return { label: "รอลูกค้ามารับ", tone: "info" };
  }
  return null;
}

const queueHintClasses: Record<QueueHint["tone"], string> = {
  attention: "text-amber-700",
  info: "text-blue-700",
  muted: "text-muted-foreground",
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
  // Cancellation-specific backend enums (single source of friendly copy).
  const cancelMessage = friendlyCancelError(message);
  if (cancelMessage) {
    return cancelMessage;
  }
  return message;
}

function QueueLoadingState() {
  return (
    <div className="rounded-xl border bg-card p-4" role="status" aria-live="polite">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <ClipboardList className="h-4 w-4 animate-pulse" />
        กำลังโหลดคิวออเดอร์...
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
    </div>
  );
}

function QueueEmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

const emptyStateCopy: Record<TabKey, { title: string; hint: string }> = {
  queue: { title: "ยังไม่มีออเดอร์ในคิว", hint: "ออเดอร์ใหม่จะปรากฏที่นี่โดยอัตโนมัติเมื่อมีลูกค้าสั่ง" },
  payments: { title: "ไม่มีสลิปรอตรวจสอบ", hint: "เมื่อมีลูกค้าส่งสลิปการชำระเงิน รายการจะแสดงที่นี่" },
  preparing: { title: "ยังไม่มีออเดอร์ที่กำลังเตรียม", hint: "ออเดอร์ที่ยืนยันแล้วจะย้ายมาที่นี่เพื่อเริ่มเตรียม" },
  ready: { title: "ยังไม่มีออเดอร์พร้อมรับ", hint: "ออเดอร์ที่เตรียมเสร็จจะแสดงที่นี่เพื่อรอลูกค้ามารับ" },
  completed: { title: "ยังไม่มีออเดอร์ที่เสร็จสิ้น", hint: "ออเดอร์ที่ปิดงานแล้วจะถูกเก็บไว้ที่นี่" },
};

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
  const [pendingCancel, setPendingCancel] = useState<ApiOrder | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const applyOrderStatusOptimistic = (orderId: string, nextStatus: string) => {
    setRows((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status: nextStatus } : order)),
    );
  };

  const removePaymentFromQueue = (paymentId: string) => {
    setPaymentQueue((prev) => prev.filter((payment) => payment.id !== paymentId));
  };

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const [ordersData, paymentsData] = await Promise.all([
        storeAdminApi.listOrders(),
        storeAdminApi.listPayments(),
      ]);
      const orders = ordersData.items ?? [];
      const payments = paymentsData.payment_queue ?? [];

      const orderIds = new Set(orders.map((o) => o.id));
      const syntheticOrders: ApiOrder[] = payments
        .filter((p) => p.order_id && !orderIds.has(p.order_id))
        .map((p) => ({
          id: p.order_id!,
          store_id: p.store_id,
          order_no: p.order_no ?? null,
          status: p.order_status || "pending_payment",
          payment_status: p.order_payment_status || p.status,
          customer_name: p.customer_name ?? null,
          customer_phone: p.customer_phone ?? null,
          channel_id: null,
          channel_name: null,
          order_type: null,
          pickup_type: null,
          pickup_time: null,
          subtotal: p.amount,
          discount_amount: 0,
          channel_fee: 0,
          total_amount: p.amount,
          total_cost: 0,
          gross_profit: 0,
          note: null,
          cancelled_reason: null,
          cancelled_at: null,
          archived: false,
          created_at: p.created_at ?? null,
          updated_at: p.created_at ?? null,
          latest_payment: {
            id: p.id,
            payment_id: p.id,
            status: p.status,
            method: p.method,
            amount: p.amount,
            slip_submitted: p.slip_submitted ?? null,
            slip_file_name: p.slip_file_name ?? null,
            slip_storage_path: p.slip_storage_path ?? null,
            submitted_at: p.submitted_at ?? null,
            reject_reason: p.reject_reason ?? null,
          },
        }));

      setRows([...orders, ...syntheticOrders]);
      setPaymentQueue(payments);
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
    const baseRows = rows;
    const base = tab
      ? baseRows.filter((r) => {
          const statusMatch = tab.filter.includes(r.status);
          if (activeTab === "queue") {
            if (r.archived || isArchivedStatus(r.status)) {
              return false;
            }
            const isTerminal = ["completed", "cancelled", "rejected"].includes(r.status);
            const paymentMatch = ["waiting_payment_review", "pending_review"].includes(r.payment_status);
            return (statusMatch || paymentMatch) && !isTerminal;
          }
          return statusMatch;
        })
      : rows;
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

    if (activeTab === "queue") {
      return [...searched].sort((a, b) => {
        const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        if (aUpdated !== bUpdated) return bUpdated - aUpdated;

        const aSubmitted = a.latest_payment?.submitted_at ? new Date(a.latest_payment.submitted_at).getTime() : 0;
        const bSubmitted = b.latest_payment?.submitted_at ? new Date(b.latest_payment.submitted_at).getTime() : 0;
        if (aSubmitted !== bSubmitted) return bSubmitted - aSubmitted;

        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aCreated !== bCreated) return bCreated - aCreated;

        const aPickup = a.pickup_time ? new Date(a.pickup_time).getTime() : 0;
        const bPickup = b.pickup_time ? new Date(b.pickup_time).getTime() : 0;
        return bPickup - aPickup;
      });
    }

    if (["preparing", "ready"].includes(activeTab)) {
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
      applyOrderStatusOptimistic(order.id, nextStatus);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err?.message || "อัปเดตสถานะไม่สำเร็จ"));
    }
  };

  // Real order cancellation is gated behind an explicit confirmation dialog.
  // The queue dropdown only *requests* a cancellation here; nothing is sent
  // until the Staff confirms in CancelOrderDialog.
  const requestCancel = (order: ApiOrder) => {
    setPendingCancel(order);
  };

  const confirmCancel = async () => {
    if (!pendingCancel) return;
    setCancelSubmitting(true);
    await handleStatusChange(pendingCancel, "cancelled");
    setCancelSubmitting(false);
    setPendingCancel(null);
  };

  const handleApprovePayment = async (paymentId: string) => {
    setError("");
    try {
      const res = await storeAdminApi.approvePayment(paymentId, {});
      if (res.mock_notification) setInfo(res.mock_notification);
      removePaymentFromQueue(paymentId);
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
      removePaymentFromQueue(paymentId);
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
      {showDevCreateOrderForm ? (
      <div className="stat-card mb-4 space-y-3 border-amber-300">
        <h2 className="section-title text-base">สร้างออเดอร์ Pickup (เครื่องมือทดสอบ — ยังไม่พร้อมใช้งานจริง)</h2>
        <p className="text-xs text-amber-700">
          ฟอร์มนี้ยังไม่เก็บข้อมูลลูกค้า เมนู จำนวน ช่องทาง และยอดเงิน จึงสร้างได้เฉพาะออเดอร์เปล่าสำหรับทดสอบระบบเท่านั้น
          (แสดงเฉพาะโหมดพัฒนา)
        </p>
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
      ) : null}

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

      {error ? (
        <div className="stat-card mb-4 flex items-start gap-2 border-destructive/40 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
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

      {loading ? (
        <QueueLoadingState />
      ) : activeTab === "payments" ? (
        paymentQueue.length === 0 && !error ? (
          <QueueEmptyState title={emptyStateCopy.payments.title} hint={emptyStateCopy.payments.hint} />
        ) : (
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
              {
                key: "amount",
                header: "ยอดที่ต้องตรวจ",
                className: "whitespace-nowrap",
                render: (r) => <span className="font-semibold tabular-nums">{formatTHB(r.amount || 0)}</span>,
              },
              { key: "method", header: "วิธีชำระ", className: "hidden md:table-cell" },
              {
                key: "slip",
                header: "หลักฐาน",
                render: (r) => {
                  const hasSlip = Boolean(r.slip_submitted || r.slip_storage_path || r.slip_url);
                  return (
                    <button
                      type="button"
                      className="underline disabled:no-underline disabled:text-muted-foreground"
                      onClick={() => openPaymentPreview(r)}
                      disabled={!hasSlip}
                    >
                      {hasSlip ? "ตรวจสลิป" : "ยังไม่มีสลิป"}
                    </button>
                  );
                },
              },
              {
                key: "submitted_at",
                header: "ส่งเมื่อ",
                className: "hidden lg:table-cell whitespace-nowrap",
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
        )
      ) : filteredOrders.length === 0 && !error ? (
        <QueueEmptyState title={emptyStateCopy[activeTab].title} hint={emptyStateCopy[activeTab].hint} />
      ) : (
        <DataTable
          columns={[
            {
              key: "id",
              header: "เลขออเดอร์",
              render: (r) => {
                const hint = getQueueHint(r);
                return (
                  <div className="flex items-center gap-2">
                    {hint?.tone === "attention" ? (
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        aria-label="ต้องการการตรวจสอบ"
                      />
                    ) : null}
                    <Link to={`/store-admin/orders/${r.id}`} className="underline font-medium">
                      {r.order_no || r.id}
                    </Link>
                  </div>
                );
              },
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
            {
              key: "status",
              header: "สถานะ / ขั้นถัดไป",
              render: (r) => {
                const hint = getQueueHint(r);
                return (
                  <div className="flex flex-col gap-1">
                    <StatusBadge label={formatOrderStatus(r.status)} tone={orderStatusTone(r.status)} />
                    {hint ? (
                      <span className={`text-xs font-medium ${queueHintClasses[hint.tone]}`}>{hint.label}</span>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: "payment_status",
              header: "การชำระเงิน",
              render: (r) => {
                const latest = r.latest_payment;
                const hasSlip = Boolean(latest?.slip_submitted);
                return (
                  <div className="flex flex-col gap-1">
                    <StatusBadge label={formatPaymentStatus(r.payment_status)} tone={paymentStatusTone(r.payment_status)} />
                    <span className={`text-xs ${hasSlip ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {hasSlip ? "มีสลิปแนบ" : "ยังไม่แนบสลิป"}
                    </span>
                    {latest && typeof latest.amount === "number" ? (
                      <span className="text-xs text-muted-foreground tabular-nums">ยอดสลิป: {formatTHB(latest.amount)}</span>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: "total_amount",
              header: "ยอดรวม",
              className: "whitespace-nowrap",
              render: (r) => (
                <span className="font-semibold text-foreground tabular-nums">{formatTHB(r.total_amount || 0)}</span>
              ),
            },
            {
              key: "pickup_time",
              header: "เวลารับ",
              className: "hidden lg:table-cell whitespace-nowrap",
              render: (r) => (r.pickup_time ? formatDateTime(r.pickup_time) : "-"),
            },
            {
              key: "channel_name",
              header: "ช่องทาง",
              className: "hidden lg:table-cell",
              render: (r) => r.channel_name || "-",
            },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => {
                const rawOptions = nextStatusByCurrent[r.status] || [];
                // Hide the cancel option for statuses Staff clearly cannot cancel
                // (owner-approved rule). Other transitions are left untouched.
                // Backend remains the final authority regardless of this filter.
                const options = isClearlyUncancellableByStaff(r.status)
                  ? rawOptions.filter((s) => s !== "cancelled")
                  : rawOptions;
                if (options.length === 0) return <span className="text-muted-foreground">-</span>;
                return (
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    defaultValue=""
                    aria-label="เลือกการดำเนินการถัดไป"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) return;
                      // Reset the select first so it stays usable whether the
                      // user confirms, cancels, or the request fails.
                      e.currentTarget.value = "";
                      if (value === "cancelled") {
                        requestCancel(r);
                        return;
                      }
                      void handleStatusChange(r, value);
                    }}
                  >
                    <option value="">เลือกการดำเนินการ</option>
                    {options.map((s) => (
                      <option key={s} value={s}>{formatNextStatusAction(s)}</option>
                    ))}
                  </select>
                );
              },
            },
          ]}
          rows={filteredOrders}
        />
      )}
      <PaymentSlipPreviewModal
        payment={activePayment}
        isOpen={previewOpen}
        onClose={closePaymentPreview}
        onApprove={(payment) => handleApproveFromModal(payment)}
        onReject={(payment) => handleRejectFromModal(payment)}
        rejectReason={modalRejectReason}
        onRejectReasonChange={setModalRejectReason}
      />
      <CancelOrderDialog
        open={pendingCancel !== null}
        order={pendingCancel}
        submitting={cancelSubmitting}
        onConfirm={() => void confirmCancel()}
        onClose={() => {
          if (!cancelSubmitting) setPendingCancel(null);
        }}
      />
    </AdminLayout>
  );
}
