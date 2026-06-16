import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable, { type Column } from "@/components/shared/DataTable";
import { storeAdminApi, type ApiOrder, type ApiOrderItem, type ApiPayment } from "@/services/storeAdminApi";
import { PaymentSlipPreviewModal } from "@/components/admin/PaymentSlipPreviewModal";
import { CancelOrderDialog } from "@/components/admin/CancelOrderDialog";
import {
  friendlyCancelError,
  isClearlyUncancellableByStaff,
  STAFF_CANCEL_BLOCKED_HINT,
} from "@/lib/orderCancel";
import { formatOrderStatus, orderStatusTone, formatPaymentStatus, paymentStatusTone, formatTHB } from "@/lib/format";
import { useProfileRole } from "@/contexts/RoleContext";

const nextStatusActions: { label: string; next: string }[] = [
  { label: "Mark Waiting Payment Review", next: "waiting_payment_review" },
  { label: "Mark Accepted", next: "accepted" },
  { label: "Mark Preparing", next: "preparing" },
  { label: "Mark Ready", next: "ready" },
  { label: "Mark Completed", next: "completed" },
];

type OrderItemAddonSnapshot = {
  addon_id?: string;
  code?: string;
  name?: string;
  quantity?: number;
  unit_price?: number;
  price?: number;
};

type OrderItemOptionsSnapshot = {
  sweetness?: number;
  sweetness_label?: string;
  addons?: OrderItemAddonSnapshot[];
  note?: string;
};

function formatTHBExact(amount: number | null | undefined): string {
  const numeric = Number(amount ?? 0);
  if (!Number.isFinite(numeric)) {
    return formatTHB(0);
  }
  return `฿${numeric.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOrderItemOptions(raw: ApiOrderItem["options"]): OrderItemOptionsSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const base = raw as Record<string, any>;
  const addons = Array.isArray(base.addons)
    ? base.addons
        .map((addon) => {
          if (!addon || typeof addon !== "object") return null;
          const casted = addon as Record<string, any>;
          const quantity = toNumber(casted.quantity);
          return {
            addon_id: typeof casted.addon_id === "string" ? casted.addon_id : undefined,
            code: typeof casted.code === "string" ? casted.code : undefined,
            name: typeof casted.name === "string" ? casted.name : undefined,
            quantity,
            unit_price: toNumber(casted.unit_price ?? casted.price),
            price: toNumber(casted.price),
          } as OrderItemAddonSnapshot;
        })
        .filter((addon): addon is OrderItemAddonSnapshot => Boolean(addon && (addon.quantity ?? 0) > 0))
    : undefined;

  return {
    sweetness: typeof base.sweetness === "number" ? base.sweetness : toNumber(base.sweetness),
    sweetness_label: typeof base.sweetness_label === "string" ? base.sweetness_label : undefined,
    addons,
    note: typeof base.note === "string" ? base.note.trim() || undefined : undefined,
  };
}

function renderOrderItemOptions(item: ApiOrderItem) {
  const options = parseOrderItemOptions(item.options);
  if (!options) return null;
  const nodes: JSX.Element[] = [];
  const sweetnessLabel = options.sweetness_label || (options.sweetness !== undefined ? `ความหวาน ${options.sweetness}%` : null);
  if (sweetnessLabel) {
    nodes.push(
      <p key="sweetness" className="text-xs text-muted-foreground">
        {sweetnessLabel}
      </p>,
    );
  }
  options.addons?.forEach((addon, index) => {
    const name = addon.name || addon.code || "เพิ่มตัวเลือก";
    const unitPrice = addon.unit_price ?? addon.price;
    const priceLabel = unitPrice !== undefined ? ` (+${formatTHBExact(unitPrice)}/แก้ว)` : "";
    nodes.push(
      <p key={addon.addon_id ?? `${addon.code ?? "addon"}-${index}`} className="text-xs text-muted-foreground">
        {name} x{addon.quantity ?? 0}
        {priceLabel}
      </p>,
    );
  });
  if (options.note) {
    nodes.push(
      <p key="note" className="text-xs text-muted-foreground">
        หมายเหตุ: {options.note}
      </p>,
    );
  }

  if (!nodes.length) return null;
  return <div className="mt-1 space-y-0.5">{nodes}</div>;
}

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const { role } = useProfileRole();
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [orderItems, setOrderItems] = useState<ApiOrderItem[]>([]);
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [rejectReasonByPaymentId, setRejectReasonByPaymentId] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<ApiPayment | null>(null);
  const [modalRejectReason, setModalRejectReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const refresh = async () => {
    if (!id) return;
    setError("");
    try {
      const [orderResult, paymentResult, itemsResult] = await Promise.allSettled([
        storeAdminApi.getOrder(id),
        storeAdminApi.listOrderPayments(id),
        storeAdminApi.listOrderItems(id),
      ]);

      if (orderResult.status === "rejected") {
        throw orderResult.reason;
      }
      if (paymentResult.status === "rejected") {
        throw paymentResult.reason;
      }

      const orderData = orderResult.value;
      const paymentData = paymentResult.value;
      const itemsData = itemsResult.status === "fulfilled" ? itemsResult.value.items ?? [] : [];

      setOrder(orderData);
      setPayments(paymentData.items ?? []);
      const mergedItems = itemsData.length ? itemsData : orderData.items ?? [];
      setOrderItems(mergedItems);
    } catch (err: any) {
      setError(err?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const openPaymentPreview = (payment: ApiPayment) => {
    setActivePayment(payment);
    setModalRejectReason(rejectReasonByPaymentId[payment.id] || "");
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
    const resolved = modalRejectReason.trim() || "rejected_by_admin";
    setRejectReasonByPaymentId((prev) => ({ ...prev, [payment.id]: resolved }));
    await handleRejectPayment(payment.id, resolved);
    closePaymentPreview();
  };

  const canViewFinancials = role === "owner" || role === "admin" || role === "manager";

  useEffect(() => {
    void refresh();
  }, [id]);

  if (loading) {
    return (
      <AdminLayout title="รายละเอียดออเดอร์" subtitle="">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!order) {
    return (
      <AdminLayout title="รายละเอียดออเดอร์" subtitle="">
        <div className="stat-card">
          <p>ไม่พบออเดอร์</p>
          <Link to="/store-admin/orders" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> กลับไปที่ Order Queue
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const handleStatusUpdate = async (payload: { status: string; note?: string; cancelled_reason?: string }) => {
    setError("");
    try {
      const res = await storeAdminApi.updateOrderStatus(order.id, payload);
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err: any) {
      const raw = err?.message;
      setError(friendlyCancelError(raw) || raw || "อัปเดตสถานะไม่สำเร็จ");
    }
  };

  const handleStatus = async (next: string) => {
    await handleStatusUpdate({ status: next });
  };

  // Real cancellation is sent only after the Staff confirms in the dialog.
  const handleCancel = async () => {
    await handleStatusUpdate({ status: "cancelled", cancelled_reason: "cancelled_by_admin" });
  };

  const confirmCancel = async () => {
    setCancelSubmitting(true);
    await handleCancel();
    setCancelSubmitting(false);
    setCancelOpen(false);
  };

  const cancelBlocked = isClearlyUncancellableByStaff(order.status);

  const handleApprovePayment = async (paymentId: string) => {
    setError("");
    try {
      const res = await storeAdminApi.approvePayment(paymentId, {});
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "อนุมัติไม่สำเร็จ");
    }
  };

  const handleRejectPayment = async (paymentId: string, providedReason?: string) => {
    setError("");
    try {
      const reason = providedReason?.trim() || rejectReasonByPaymentId[paymentId] || "rejected_by_admin";
      const res = await storeAdminApi.rejectPayment(paymentId, { reason });
      if (res.message) setInfo(res.message);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "ปฏิเสธไม่สำเร็จ");
    }
  }

  const summaryMetrics = [
    { key: "sales", label: "ยอดขาย", value: order.total_amount },
    { key: "cost", label: "ต้นทุน", value: order.total_cost, restricted: true },
    { key: "channel_fee", label: "ค่าช่องทาง", value: order.channel_fee },
    { key: "profit", label: "กำไร", value: order.gross_profit, restricted: true },
  ];
  const visibleMetrics = summaryMetrics.filter((metric) => canViewFinancials || !metric.restricted);

  const itemColumns: Column<ApiOrderItem>[] = [
    {
      key: "product_name",
      header: "เมนู",
      render: (row) => (
        <div>
          <p className="font-medium">{row.product_name || "-"}</p>
          {renderOrderItemOptions(row)}
        </div>
      ),
    },
    { key: "quantity", header: "จำนวน", render: (r) => `x${r.quantity ?? 0}` },
    { key: "unit_price", header: "ราคา/หน่วย", render: (r) => formatTHBExact(r.unit_price) },
  ];

  if (canViewFinancials) {
    itemColumns.push(
      { key: "unit_cost", header: "ต้นทุน/หน่วย", render: (r) => formatTHBExact(r.unit_cost) },
      { key: "line_profit", header: "กำไร", render: (r) => formatTHBExact(r.line_profit) },
    );
  }

  return (
    <AdminLayout title="รายละเอียดออเดอร์" subtitle={`Order ${order.order_no || `#${order.id}`}`}>
      <div className="stat-card space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={formatOrderStatus(order.status)} tone={orderStatusTone(order.status)} />
          <StatusBadge label={formatPaymentStatus(order.payment_status)} tone={paymentStatusTone(order.payment_status)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {visibleMetrics.map((metric) => (
            <div key={metric.key} className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="font-semibold">{formatTHBExact(metric.value)}</p>
            </div>
          ))}
        </div>
        {!canViewFinancials ? (
          <p className="text-xs text-muted-foreground">ข้อมูลต้นทุนและกำไรแสดงเฉพาะ Owner/Admin/Manager</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          ลูกค้า: {order.customer_name || "-"} ({order.customer_phone || "-"})
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
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            disabled={cancelBlocked}
            className="px-3 py-1.5 rounded border text-sm text-destructive border-destructive/40 hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Cancel Order
          </button>
        </div>
        {cancelBlocked ? (
          <p className="text-xs text-muted-foreground">{STAFF_CANCEL_BLOCKED_HINT}</p>
        ) : null}
      </div>

      <DataTable columns={itemColumns} rows={orderItems} />

      <div className="stat-card">
        <h2 className="section-title mb-2">การชำระเงิน</h2>
        <DataTable
          columns={[
            { key: "id", header: "Payment ID" },
            { key: "amount", header: "จำนวนเงิน", render: (r) => formatTHB(r.amount || 0) },
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
              key: "status",
              header: "สถานะ",
              render: (r) => <StatusBadge label={formatPaymentStatus(r.status)} tone={paymentStatusTone(r.status)} />,
            },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex flex-col gap-1">
                  {(r.status === "pending" || r.status === "pending_review") ? (
                    <>
                      <button type="button" className="underline text-left" onClick={() => handleApprovePayment(r.id)}>อนุมัติ</button>
                      <input
                        className="border rounded px-2 py-1 text-xs"
                        placeholder="เหตุผลการปฏิเสธ"
                        value={rejectReasonByPaymentId[r.id] || ""}
                        onChange={(e) => setRejectReasonByPaymentId((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      />
                      <button type="button" className="underline text-left text-destructive" onClick={() => handleRejectPayment(r.id)}>ปฏิเสธ</button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </div>
              ),
            },
          ]}
          rows={payments}
        />
      </div>
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
        open={cancelOpen}
        order={order}
        submitting={cancelSubmitting}
        onConfirm={() => void confirmCancel()}
        onClose={() => {
          if (!cancelSubmitting) setCancelOpen(false);
        }}
      />
    </AdminLayout>
  );
}
