import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Inbox, RefreshCw, ClipboardList } from "lucide-react";
import { storeAdminApi, type IncomingQueueOrder } from "@/services/storeAdminApi";
import { formatTHB } from "@/lib/format";
import { useIsStoreOwner } from "@/lib/guards";
import { useProfileRole } from "@/contexts/RoleContext";
import { useStoreOrdersRealtimeInvalidation } from "@/hooks/useStoreOrdersRealtimeInvalidation";
import CounterPaymentDialog from "./CounterPaymentDialog";
import OwnerCancelDialog from "./OwnerCancelDialog";

/** Canonical V1 polling interval (ms). */
const POLL_INTERVAL_MS = 15_000;

/** 15-minute waiting warning threshold (ms). */
const WAIT_WARNING_MS = 15 * 60 * 1000;

/** UI clock refresh interval (ms) — keeps waiting time current without API calls. */
const CLOCK_TICK_MS = 30_000;

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

function friendlyQueueError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m === "missing_token" || m === "invalid_token" || m === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (m === "store_access_denied" || m === "no_store_membership" || m === "store_mismatch") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (m === "insufficient_role") {
    return "สิทธิ์ไม่เพียงพอสำหรับการเข้าถึงคิวออเดอร์";
  }
  if (m === "network" || m === "fetch_failed") {
    return "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตและลองอีกครั้ง";
  }
  // Never expose Supabase/Postgres/FastAPI internals.
  if (m.includes("supabase") || m.includes("postgres") || m.includes("fastapi") || m.includes("stack")) {
    return "ไม่สามารถโหลดคิวออเดอร์ได้ในขณะนี้ กรุณาลองอีกครั้ง";
  }
  return message || "ไม่สามารถโหลดคิวออเดอร์ได้ในขณะนี้ กรุณาลองอีกครั้ง";
}

/**
 * Canonical V1 Staff Incoming Queue.
 *
 * Source: `GET /api/store-admin/orders/incoming` via
 * `storeAdminApi.listIncomingQueue()`.
 *
 * The backend already filters to `order_source = web_order`,
 * `status = pending_payment`, `payment_status = unpaid`, ordered by
 * `created_at` ASC (oldest first). Frontend preserves backend FIFO order
 * and deduplicates by `order.id`.
 *
 * Polls every 15 seconds. A separate UI clock ticks every 30 seconds to
 * keep the waiting-duration display current without making API calls.
 *
 * 15-minute waiting warning is frontend-derived only — no backend
 * mutation, no queue reprioritization, no status change.
 *
 * This component does NOT:
 * - Render a manual "รับออเดอร์" / Accept Order action.
 * - PATCH `status = accepted`.
 * - Call `finalizePayment`.
 * - Render cancellation actions.
 * - Render slip preview / bank transfer / payment review UI.
 * - Call `listOrders`, `listPayments`, `approvePayment`, `rejectPayment`.
 */
export default function IncomingOrdersQueue() {
  const [orders, setOrders] = useState<IncomingQueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [, setClockTick] = useState(0);
  const [paymentOrder, setPaymentOrder] = useState<IncomingQueueOrder | null>(null);
  const [cancelOrder, setCancelOrder] = useState<IncomingQueueOrder | null>(null);
  // Same-order mutation lock: prevents payment + cancel from racing on the same order.
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const isStoreOwner = useIsStoreOwner();
  const { storeId } = useProfileRole();

  const inFlightRef = useRef(false);
  // Dirty flag: if a Realtime invalidation arrives while a fetch is in
  // flight, schedule exactly one follow-up fetch after the current one
  // finishes. Coalesces multiple events into a single follow-up.
  const dirtyRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQueue = useCallback(async (isInitial: boolean) => {
    if (inFlightRef.current) {
      // Mark dirty so the in-flight fetch schedules a follow-up.
      dirtyRef.current = true;
      return;
    }
    inFlightRef.current = true;
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const response = await storeAdminApi.listIncomingQueue();
      // Deduplicate by order.id; preserve backend FIFO order.
      const seen = new Set<string>();
      const deduped: IncomingQueueOrder[] = [];
      for (const order of response.orders ?? []) {
        if (!order?.id || seen.has(order.id)) continue;
        seen.add(order.id);
        deduped.push(order);
      }
      setOrders(deduped);
      setRefreshError(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      if (isInitial) {
        setOrders([]);
        setError(friendlyQueueError(raw));
      } else {
        // Temporary refresh failure: retain previously loaded queue.
        setRefreshError(friendlyQueueError(raw));
      }
    } finally {
      inFlightRef.current = false;
      if (isInitial) setLoading(false);
      // If a Realtime invalidation arrived during this fetch, schedule
      // exactly one follow-up canonical refetch.
      if (dirtyRef.current) {
        dirtyRef.current = false;
        void fetchQueue(false);
      }
    }
  }, []);

  // Initial fetch on mount.
  useEffect(() => {
    void fetchQueue(true);
  }, [fetchQueue]);

  // Polling: every 15 seconds.
  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollTimerRef.current = setTimeout(() => {
      void fetchQueue(false);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchQueue, orders]);

  // UI clock: ticks every 30 seconds to refresh waiting-duration display.
  // Does NOT trigger API calls.
  useEffect(() => {
    clockTimerRef.current = setInterval(() => {
      setClockTick((t) => t + 1);
    }, CLOCK_TICK_MS);
    return () => {
      if (clockTimerRef.current) {
        clearInterval(clockTimerRef.current);
        clockTimerRef.current = null;
      }
    };
  }, []);

  // Realtime invalidation (FE-08): subscribe to public.orders INSERT/UPDATE
  // scoped to the active store. On event, trigger a canonical refetch via
  // the dirty-aware fetchQueue. Polling remains the source-of-truth fallback.
  const handleRealtimeInvalidation = useCallback(() => {
    void fetchQueue(false);
  }, [fetchQueue]);
  useStoreOrdersRealtimeInvalidation(storeId, handleRealtimeInvalidation);

  const handleManualRefresh = useCallback(() => {
    void fetchQueue(false);
  }, [fetchQueue]);

  const now = Date.now();

  const renderedOrders = useMemo(() => orders, [orders]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4" role="status" aria-live="polite">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4 animate-pulse" aria-hidden />
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

  // ── Initial error state ──
  if (error && orders.length === 0) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => void fetchQueue(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          aria-label="รีเฟรชคิวออเดอร์อีกครั้ง"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          ลองอีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row: title + manual refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">คิวออเดอร์ใหม่</h2>
          <p className="text-xs text-muted-foreground">
            ออเดอร์ที่รับแล้ว รอเรียกชื่อลูกค้าเพื่อชำระเงินที่เคาน์เตอร์
          </p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
          aria-label="รีเฟรชคิวออเดอร์"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          รีเฟรช
        </button>
      </div>

      {/* Subtle refresh error (non-destructive — queue still visible) */}
      {refreshError ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          role="status"
          aria-live="polite"
        >
          {refreshError}
        </div>
      ) : null}

      {/* Empty state */}
      {renderedOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <Inbox className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">ยังไม่มีออเดอร์ใหม่</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ออเดอร์ใหม่จะปรากฏที่นี่โดยอัตโนมัติเมื่อมีลูกค้าสั่ง
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {renderedOrders.map((order) => {
            const created = parseCreatedAt(order);
            const waitingMs = created > 0 ? now - created : 0;
            const isOverdue = waitingMs >= WAIT_WARNING_MS;
            return (
              <div
                key={order.id}
                className="rounded-xl border bg-card p-4 shadow-sm"
                data-order-id={order.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {order.order_no || order.order_number || "-"}
                    </p>
                    <p className="text-lg font-bold text-foreground" data-customer-name>
                      {order.customer_name || "-"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      รอชำระเงิน
                    </span>
                    <span
                      className={
                        isOverdue
                          ? "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
                          : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                      }
                      data-waiting-time
                    >
                      {isOverdue ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
                      รอ {formatWaitingDuration(waitingMs)}
                    </span>
                  </div>
                </div>

                {/* 15-minute warning — text + icon, not color-only */}
                {isOverdue ? (
                  <p
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive"
                    data-waiting-warning
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    รอเกิน 15 นาที
                  </p>
                ) : null}

                {/* Customer note */}
                {order.customer_note ? (
                  <p className="mt-2 rounded-lg bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground" data-customer-note>
                    หมายเหตุ: {order.customer_note}
                  </p>
                ) : null}

                {/* Items */}
                <div className="mt-3 space-y-1" data-order-items>
                  {(order.items ?? []).map((item, idx) => (
                    <div key={`${item.product_id}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">
                        {item.product_name || "เมนู"}
                        <span className="ml-1 text-xs text-muted-foreground" data-item-quantity>
                          x{item.quantity}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTHB(item.line_total)}</span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <span className="text-xs text-muted-foreground">ยอดรวม</span>
                  <span className="text-sm font-semibold text-foreground" data-total-amount>
                    {formatTHB(order.total_amount)}
                  </span>
                </div>

                {/* Operational next-step hint + counter payment action */}
                <p className="mt-2 text-xs text-muted-foreground">
                  เรียกชื่อลูกค้าเพื่อชำระเงินที่เคาน์เตอร์
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setBusyOrderId(order.id);
                    setPaymentOrder(order);
                  }}
                  disabled={busyOrderId === order.id}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="รับชำระเงิน"
                  data-payment-action
                >
                  รับชำระเงิน
                </button>
                {isStoreOwner ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBusyOrderId(order.id);
                      setCancelOrder(order);
                    }}
                    disabled={busyOrderId === order.id}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-destructive/40 bg-background px-4 py-2 text-sm font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="ยกเลิกออเดอร์"
                    data-cancel-action
                  >
                    ยกเลิกออเดอร์
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Counter payment dialog */}
      <CounterPaymentDialog
        order={paymentOrder ?? PLACEHOLDER_ORDER}
        open={paymentOrder !== null}
        onClose={() => {
          setPaymentOrder(null);
          setBusyOrderId(null);
        }}
        onSuccess={() => {
          setPaymentOrder(null);
          setBusyOrderId(null);
          void fetchQueue(false);
        }}
        onReconcile={() => {
          void fetchQueue(false);
        }}
      />

      {/* Owner cancel dialog */}
      <OwnerCancelDialog
        order={cancelOrder ?? PLACEHOLDER_ORDER}
        open={cancelOrder !== null}
        onClose={() => {
          setCancelOrder(null);
          setBusyOrderId(null);
        }}
        onSuccess={() => {
          setCancelOrder(null);
          setBusyOrderId(null);
          void fetchQueue(false);
        }}
        onReconcile={() => {
          void fetchQueue(false);
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
