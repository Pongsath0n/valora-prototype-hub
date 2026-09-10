import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, X, ChevronRight } from "lucide-react";
import {
  type IncomingQueueOrder,
} from "@/services/storeAdminApi";
import { formatTHB } from "@/lib/format";
import CounterPaymentDialog from "@/components/admin/CounterPaymentDialog";
import type { UseKioskIncomingAlert } from "@/features/staff/kiosk/useKioskIncomingAlert";

/** 15-minute waiting warning threshold (ms) — display only. */
const WAIT_WARNING_MS = 15 * 60 * 1000;

/**
 * PF-03.1: Maximum number of Incoming order previews rendered inline.
 *
 * The Kiosk must remain the primary Staff working surface. Rendering every
 * pending order inline would push menu selection, cart, and Walk-in
 * operation far down the page. We render at most this many previews from
 * the canonical Backend FIFO response (oldest first) and summarize the rest
 * as an overflow count + "ดูทั้งหมด" action.
 */
const MAX_PREVIEW_ORDERS = 3;

function formatWaitingDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 1) return `${seconds} วินาที`;
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours} ชม. ${remMinutes} นาที`;
}

function parseCreatedAt(order: IncomingQueueOrder): number {
  if (!order.created_at) return 0;
  const t = Date.parse(order.created_at);
  return Number.isFinite(t) ? t : 0;
}

function itemCount(order: IncomingQueueOrder): number {
  return (order.items ?? []).reduce((sum, item) => sum + (item.quantity || 0), 0);
}

type KioskIncomingAlertProps = {
  alert: UseKioskIncomingAlert;
};

/**
 * PF-03 Kiosk Incoming Alert.
 *
 * A compact operational VIEW of the canonical Incoming Queue
 * (`GET /api/store-admin/orders/incoming`). Lives inside /staff/kiosk so
 * Staff notice pending Self-orders without watching /staff/orders.
 *
 * Architecture:
 * - Canonical source remains `storeAdminApi.listIncomingQueue()`.
 * - Does NOT create a duplicate order, does NOT copy Self-orders into the
 *   Kiosk cart, does NOT add a "รับออเดอร์" action (presence in Incoming
 *   already means received).
 * - Payment reuses the EXISTING `CounterPaymentDialog` (FE-06). No new
 *   payment logic, no slip/gateway, no direct payment-row API, no frontend
 *   stock mutation.
 * - On payment success: refetches the canonical Incoming Queue. Backend
 *   snapshot owns the result (no optimistic removal, no manual Production
 *   insertion, no manual accepted-status mutation).
 *
 * Privacy: only safe operational fields are rendered (order_no,
 * customer_name, item count, total, wait time). Never phone, LINE,
 * public_token, _system, usage_breakdown, cost, or stock internals.
 */
export default function KioskIncomingAlert({ alert }: KioskIncomingAlertProps) {
  const navigate = useNavigate();
  const [paymentOrder, setPaymentOrder] = useState<IncomingQueueOrder | null>(null);

  const { orders, count, loading, error, notice, dismissNotice, refetch, oldestWaitMs } = alert;

  // PF-03.1: Bounded preview — first MAX_PREVIEW_ORDERS from canonical Backend
  // FIFO response (oldest first). No client re-sort. The summary count
  // represents ALL canonical Incoming orders, not only the visible previews.
  const previewOrders = orders.slice(0, MAX_PREVIEW_ORDERS);
  const overflowCount = Math.max(0, count - previewOrders.length);

  // Nothing to show: no pending orders, no notice, and initial load done.
  // During initial loading we render nothing (no false alert).
  if (count === 0 && !notice && !loading) return null;

  const oldestOverdue = oldestWaitMs >= WAIT_WARNING_MS;

  return (
    <div className="space-y-2" data-testid="kiosk-incoming-alert">
      {/* Aggregated new/initial-order notice banner (dismissible). */}
      {notice ? (
        <div
          className="flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
          role="status"
          aria-live="polite"
          data-testid="incoming-notice"
        >
          <div className="flex items-start gap-2">
            <Bell className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">
              {notice.kind === "initial"
                ? `มีออเดอร์ออนไลน์รออยู่ ${notice.count} รายการ`
                : `มีออเดอร์ออนไลน์ใหม่ ${notice.count} รายการ`}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissNotice}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิดการแจ้งเตือน"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Persistent indicator + compact order list. Remains visible while the
          canonical Incoming snapshot is non-empty, even after the notice is
          dismissed. */}
      {count > 0 ? (
        <div
          className="rounded-xl border bg-card p-4 shadow-sm"
          data-testid="incoming-indicator"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-sm font-semibold text-foreground">
                ออเดอร์ออนไลน์ {count} รายการ
              </span>
            </div>
            <div className="flex items-center gap-2">
              {oldestWaitMs > 0 ? (
                <span
                  className={
                    oldestOverdue
                      ? "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
                      : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                  }
                  data-testid="oldest-wait"
                >
                  {oldestOverdue ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
                  เก่าสุดรอ {formatWaitingDuration(oldestWaitMs)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => navigate("/staff/orders")}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                aria-label="ดูออเดอร์ทั้งหมดในคิว"
                data-testid="view-orders"
              >
                ดูออเดอร์
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>

          {/* Compact order list — bounded to MAX_PREVIEW_ORDERS (Backend FIFO,
              oldest first). The summary count above represents ALL canonical
              Incoming orders, not only the visible previews. */}
          <div className="mt-3 space-y-2" data-testid="incoming-preview-list">
            {previewOrders.map((order) => {
              const created = parseCreatedAt(order);
              const waitingMs = created > 0 ? Math.max(0, Date.now() - created) : 0;
              const isOverdue = waitingMs >= WAIT_WARNING_MS;
              return (
                <div
                  key={order.id}
                  className="rounded-lg border bg-background p-3"
                  data-testid="incoming-order"
                  data-order-id={order.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {order.order_no || order.order_number || "-"}
                      </p>
                      <p className="text-sm font-bold text-foreground" data-customer-name>
                        {order.customer_name || "-"}
                      </p>
                    </div>
                    <span
                      className={
                        isOverdue
                          ? "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                      data-testid="waiting-time"
                    >
                      {isOverdue ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
                      รอ {formatWaitingDuration(waitingMs)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span data-item-count>{itemCount(order)} รายการ</span>
                    <span className="font-semibold text-foreground" data-testid="total-amount">
                      {formatTHB(order.total_amount)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPaymentOrder(order)}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    aria-label="รับชำระเงิน"
                    data-payment-action
                  >
                    รับชำระเงิน
                  </button>
                </div>
              );
            })}
          </div>

          {/* Overflow summary — shown when total count exceeds the preview
              limit. Does NOT render the remaining orders inline. */}
          {overflowCount > 0 ? (
            <p
              className="mt-2 text-center text-xs font-medium text-muted-foreground"
              data-testid="incoming-overflow"
            >
              + อีก {overflowCount} รายการ
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => navigate("/staff/orders")}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-full border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
            aria-label="ดูออเดอร์ทั้งหมดในหน้าคิว"
            data-testid="view-all"
          >
            ดูทั้งหมด
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Initial-load error (no prior snapshot) — non-disruptive, Walk-in
          remains usable. */}
      {error && count === 0 ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          role="status"
          aria-live="polite"
          data-testid="incoming-error"
        >
          {error}
        </div>
      ) : null}

      {/* Reused canonical Counter Payment dialog (FE-06). No new payment
          logic. On success: refetch canonical Incoming Queue. */}
      <CounterPaymentDialog
        order={paymentOrder ?? PLACEHOLDER_ORDER}
        open={paymentOrder !== null}
        onClose={() => setPaymentOrder(null)}
        onSuccess={() => {
          setPaymentOrder(null);
          refetch();
        }}
        onReconcile={() => {
          refetch();
        }}
      />
    </div>
  );
}

// Placeholder order used only when the dialog is closed; the dialog
// short-circuits on `open === false` so this object is never rendered.
const PLACEHOLDER_ORDER: IncomingQueueOrder = {
  id: "",
  order_no: null,
  order_number: null,
  customer_name: "",
  customer_note: null,
  items: [],
  total_amount: 0,
  created_at: null,
  status: "pending_payment",
  payment_status: "unpaid",
  order_source: null,
};
