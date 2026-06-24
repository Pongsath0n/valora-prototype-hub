import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FileImage, ImageOff, Receipt, XCircle } from "lucide-react";
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
import {
  compareAmountToOrder,
  friendlyPaymentError,
  paymentHasSlip,
  paymentSlipStatus,
} from "@/lib/paymentReview";
import { formatOrderStatus, orderStatusTone, formatPaymentStatus, paymentStatusTone, formatTHB, formatNextStatusAction } from "@/lib/format";
import { useProfileRole } from "@/contexts/RoleContext";

// Order of the forward status actions. Thai labels come from the shared
// `formatNextStatusAction` helper so they match the order-queue wording exactly.
const NEXT_STATUS_OPTIONS = [
  "waiting_payment_review",
  "accepted",
  "preparing",
  "ready",
  "completed",
] as const;

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
  // Lightweight confirmation guard for inline payment approval (human-error
  // protection only — the backend remains the authority on whether approval is
  // allowed). Holds the payment id currently awaiting an "are you sure" confirm.
  const [confirmingApproveId, setConfirmingApproveId] = useState<string | null>(null);
  const [actionPaymentId, setActionPaymentId] = useState<string | null>(null);

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
          <Link to="/staff/orders" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> กลับไปที่คิวออเดอร์
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
    setConfirmingApproveId(null);
    setActionPaymentId(paymentId);
    try {
      const res = await storeAdminApi.approvePayment(paymentId, {});
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err: any) {
      setError(friendlyPaymentError(err?.message));
    } finally {
      setActionPaymentId(null);
    }
  };

  const handleRejectPayment = async (paymentId: string, providedReason?: string) => {
    setError("");
    setActionPaymentId(paymentId);
    try {
      const reason = providedReason?.trim() || rejectReasonByPaymentId[paymentId] || "rejected_by_admin";
      const res = await storeAdminApi.rejectPayment(paymentId, { reason });
      if (res.message) setInfo(res.message);
      await refresh();
    } catch (err: any) {
      setError(friendlyPaymentError(err?.message));
    } finally {
      setActionPaymentId(null);
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
    <AdminLayout title="รายละเอียดออเดอร์" subtitle={`ออเดอร์ ${order.order_no || `#${order.id}`}`}>
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
          {NEXT_STATUS_OPTIONS.map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => handleStatus(next)}
              className="px-3 py-1.5 rounded border text-sm hover:bg-muted"
            >
              {formatNextStatusAction(next)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            disabled={cancelBlocked}
            className="px-3 py-1.5 rounded border text-sm text-destructive border-destructive/40 hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            ยกเลิกออเดอร์
          </button>
        </div>
        {cancelBlocked ? (
          <p className="text-xs text-muted-foreground">{STAFF_CANCEL_BLOCKED_HINT}</p>
        ) : null}
      </div>

      <DataTable columns={itemColumns} rows={orderItems} />

      <div className="stat-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">การชำระเงิน</h2>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-sm">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">ยอดออเดอร์</span>
            <span className="font-semibold tabular-nums text-foreground">{formatTHBExact(order.total_amount)}</span>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีรายการชำระเงินสำหรับออเดอร์นี้
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => {
              const hasSlip = paymentHasSlip(payment);
              const slip = paymentSlipStatus(payment);
              const match = compareAmountToOrder(order.total_amount, payment);
              const isPending = payment.status === "pending" || payment.status === "pending_review";
              const isBusy = actionPaymentId === payment.id;
              const rejectReason = rejectReasonByPaymentId[payment.id] || "";
              return (
                <div key={payment.id} className="rounded-xl border bg-card p-4 space-y-4">
                  {/* Status + amount-match summary, easy to scan */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={formatPaymentStatus(payment.status)} tone={paymentStatusTone(payment.status)} />
                      <StatusBadge label={slip.label} tone={slip.tone} />
                    </div>
                    <StatusBadge label={match.label} tone={match.tone} />
                  </div>

                  {/* Amount comparison — order total vs what the customer transferred */}
                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">ยอดออเดอร์</p>
                      <p className="font-semibold tabular-nums">{formatTHBExact(order.total_amount)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">ยอดที่ลูกค้าแจ้ง (จากสลิป)</p>
                      <p
                        className={`font-semibold tabular-nums ${
                          match.kind === "mismatch"
                            ? "text-red-600"
                            : match.kind === "match"
                              ? "text-emerald-600"
                              : "text-foreground"
                        }`}
                      >
                        {hasSlip ? formatTHBExact(payment.amount) : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">วิธีชำระ</p>
                      <p className="font-medium">{payment.method || "—"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">สลิป/หลักฐาน</p>
                      <p className="font-medium">{slip.label}</p>
                    </div>
                  </div>

                  {payment.reject_reason ? (
                    <p className="text-xs text-muted-foreground">
                      เหตุผลการปฏิเสธก่อนหน้า: <span className="text-foreground">{payment.reject_reason}</span>
                    </p>
                  ) : null}

                  {/* Slip viewer — clearly labelled present/absent */}
                  <button
                    type="button"
                    onClick={() => openPaymentPreview(payment)}
                    disabled={!hasSlip}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {hasSlip ? <FileImage className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}
                    {hasSlip ? "ดูสลิป / ตรวจสอบหลักฐาน" : "ยังไม่มีสลิปให้ตรวจสอบ"}
                  </button>

                  {/* Approve / reject — separated, with a lightweight approve confirm */}
                  {isPending ? (
                    <div className="space-y-3 border-t pt-3">
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        โปรดตรวจสอบยอดเงิน วันที่ เวลา และบัญชีผู้รับเงินจากสลิปก่อนอนุมัติ
                      </p>
                      <div className="space-y-2">
                        {confirmingApproveId === payment.id ? (
                          <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-sm text-emerald-800">
                              ยืนยันอนุมัติการชำระเงินนี้? โปรดตรวจสอบว่ายอดและสลิปถูกต้อง
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmingApproveId(null)}
                                disabled={isBusy}
                                className="rounded-lg border bg-white px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleApprovePayment(payment.id)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {isBusy ? "กำลังอนุมัติ..." : "ยืนยันอนุมัติ"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingApproveId(payment.id)}
                            disabled={isBusy}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 sm:w-auto"
                          >
                            <CheckCircle2 className="h-4 w-4" /> อนุมัติการชำระเงิน
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                          เหตุผลการปฏิเสธ <span className="text-muted-foreground">(บังคับเมื่อกดปฏิเสธ)</span>
                        </label>
                        <textarea
                          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          rows={2}
                          placeholder="เช่น ยอดเงินไม่ตรง / สลิปหมดอายุ / อ่านสลิปไม่ได้"
                          value={rejectReason}
                          onChange={(e) =>
                            setRejectReasonByPaymentId((prev) => ({ ...prev, [payment.id]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => void handleRejectPayment(payment.id)}
                          disabled={isBusy || !rejectReason.trim()}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          <XCircle className="h-4 w-4" />
                          {isBusy ? "กำลังปฏิเสธ..." : "ปฏิเสธการชำระเงิน"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="border-t pt-3 text-xs text-muted-foreground">
                      รายการนี้ตรวจสอบแล้ว ไม่มีการดำเนินการที่ต้องทำ
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PaymentSlipPreviewModal
        payment={activePayment}
        orderTotal={order.total_amount}
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
