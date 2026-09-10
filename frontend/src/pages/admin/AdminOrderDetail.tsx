import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable, { type Column } from "@/components/shared/DataTable";
import { storeAdminApi, type ApiOrder, type ApiOrderItem, type ApiPayment } from "@/services/storeAdminApi";
import { CancelOrderDialog } from "@/components/admin/CancelOrderDialog";
import {
  friendlyCancelError,
  isOwnerCancellableStatus,
} from "@/lib/orderCancel";
import { formatOrderStatus, orderStatusTone, formatPaymentStatus, paymentStatusTone, formatTHB, formatNextStatusAction } from "@/lib/format";
import { useProfileRole } from "@/contexts/RoleContext";
import { useIsStoreOwner } from "@/lib/guards";

// Forward status actions. Thai labels come from the shared
// `formatNextStatusAction` helper so they match the order-queue wording exactly.
const NEXT_STATUS_OPTIONS = [
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
  const base = raw as Record<string, unknown>;
  const addons = Array.isArray(base.addons)
    ? base.addons
        .map((addon) => {
          if (!addon || typeof addon !== "object") return null;
          const casted = addon as Record<string, unknown>;
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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const canViewFinancials = role === "owner" || role === "admin" || role === "manager";

  // PF-04A: Cancellation is owner-only. The canonical `POST /orders/{id}/cancel`
  // endpoint raises `owner_role_required` (403) for non-owners. The cancel
  // button must be HIDDEN (not merely disabled) for staff/manager. Even for
  // owners, only `pending_payment` and `accepted` statuses are eligible.
  // This hook MUST be called before any early returns (Rules of Hooks).
  const isStoreOwner = useIsStoreOwner();

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

      const orderData = orderResult.value;
      const itemsData = itemsResult.status === "fulfilled" ? itemsResult.value.items ?? [] : [];
      const paymentData = paymentResult.status === "fulfilled" ? paymentResult.value.items ?? [] : [];

      setOrder(orderData);
      setPayments(paymentData);
      const mergedItems = itemsData.length ? itemsData : orderData.items ?? [];
      setOrderItems(mergedItems);
    } catch (err) {
      const message = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

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

  const handleStatusUpdate = async (payload: { status: string; note?: string }) => {
    setError("");
    try {
      const res = await storeAdminApi.updateOrderStatus(order.id, payload);
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message : undefined;
      setError(friendlyCancelError(raw) || raw || "อัปเดตสถานะไม่สำเร็จ");
    }
  };

  const handleStatus = async (next: string) => {
    await handleStatusUpdate({ status: next });
  };

  // Canonical cancellation uses `cancelOrder` (POST /api/store-admin/orders/{id}/cancel),
  // NOT the legacy PATCH status=cancelled flow.
  const handleCancel = async () => {
    setCancelSubmitting(true);
    setError("");
    try {
      await storeAdminApi.cancelOrder(order.id);
      setInfo("ยกเลิกออเดอร์แล้ว");
      await refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message : undefined;
      setError(friendlyCancelError(raw) || "ยกเลิกออเดอร์ไม่สำเร็จ");
    } finally {
      setCancelSubmitting(false);
      setCancelOpen(false);
    }
  };

  // PF-04A: Cancel button visibility — owner-only + eligible status.
  const canCancel = isStoreOwner && isOwnerCancellableStatus(order.status);

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
          {canCancel ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="px-3 py-1.5 rounded border text-sm text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              ยกเลิกออเดอร์
            </button>
          ) : null}
        </div>
      </div>

      <DataTable columns={itemColumns} rows={orderItems} />

      {/* Payment summary — read-only display of payment records. No slip review. */}
      <div className="stat-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">การชำระเงิน</h2>
        </div>

        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีรายการชำระเงินสำหรับออเดอร์นี้
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={formatPaymentStatus(payment.status)} tone={paymentStatusTone(payment.status)} />
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">ยอดที่ชำระ</p>
                    <p className="font-semibold tabular-nums">{formatTHBExact(payment.amount)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">วิธีชำระ</p>
                    <p className="font-medium">{payment.method || "—"}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">สถานะ</p>
                    <p className="font-medium">{formatPaymentStatus(payment.status)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <CancelOrderDialog
        open={cancelOpen}
        order={order}
        submitting={cancelSubmitting}
        onConfirm={() => void handleCancel()}
        onClose={() => {
          if (!cancelSubmitting) setCancelOpen(false);
        }}
      />
    </AdminLayout>
  );
}
