import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Inbox, RefreshCw, ClipboardList } from "lucide-react";
import {
  storeAdminApi,
  type ProductionQueueOrder,
} from "@/services/storeAdminApi";
import { formatTHB } from "@/lib/format";
import { useIsStoreOwner } from "@/lib/guards";
import { useProfileRole } from "@/contexts/RoleContext";
import { useStoreOrdersRealtimeInvalidation } from "@/hooks/useStoreOrdersRealtimeInvalidation";
import OwnerCancelDialog from "./OwnerCancelDialog";

/** Canonical V1 polling interval (ms). */
const POLL_INTERVAL_MS = 15_000;

/** UI clock refresh interval (ms) — keeps elapsed display current without API calls. */
const CLOCK_TICK_MS = 30_000;

function formatElapsedDuration(ms: number): string {
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

function parseConfirmedAt(order: ProductionQueueOrder): number {
  if (!order.payment_confirmed_at) return 0;
  const t = Date.parse(order.payment_confirmed_at);
  return Number.isFinite(t) ? t : 0;
}

function sourceLabel(source: string | null | undefined): string {
  const s = (source || "").toLowerCase();
  if (s === "web_order") return "สั่งเอง";
  if (s === "kiosk") return "หน้าร้าน";
  return source || "-";
}

function statusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "accepted") return "รอเริ่มทำ";
  if (s === "preparing") return "กำลังจัดเตรียม";
  if (s === "ready") return "พร้อมรับ";
  return s || "-";
}

function statusToneClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "accepted") return "bg-sky-100 text-sky-800";
  if (s === "preparing") return "bg-amber-100 text-amber-800";
  if (s === "ready") return "bg-emerald-100 text-emerald-800";
  return "bg-muted text-muted-foreground";
}

function nextAction(status: string): { label: string; nextStatus: string } | null {
  const s = (status || "").toLowerCase();
  if (s === "accepted") return { label: "เริ่มทำ", nextStatus: "preparing" };
  if (s === "preparing") return { label: "พร้อมรับ", nextStatus: "ready" };
  if (s === "ready") return { label: "ส่งมอบแล้ว", nextStatus: "completed" };
  return null;
}

function friendlyProductionError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m === "missing_token" || m === "invalid_token" || m === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (m === "store_access_denied" || m === "no_store_membership" || m === "store_mismatch") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (m === "insufficient_role") {
    return "สิทธิ์ไม่เพียงพอสำหรับการเข้าถึงคิวผลิต";
  }
  if (m === "invalid_status_transition") {
    return "ไม่สามารถเปลี่ยนสถานะได้ กรุณารีเฟรชและลองอีกครั้ง";
  }
  if (m === "order_not_found") {
    return "ไม่พบคำสั่งซื้อ อาจถูกอัปเดตโดยผู้อื่นแล้ว กรุณารีเฟรช";
  }
  if (m === "network" || m === "fetch_failed") {
    return "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตและลองอีกครั้ง";
  }
  if (m.includes("supabase") || m.includes("postgres") || m.includes("fastapi") || m.includes("stack")) {
    return "ไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองอีกครั้ง";
  }
  return message || "ไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองอีกครั้ง";
}

/**
 * Canonical V1 Staff Production Queue.
 *
 * Source: `GET /api/store-admin/orders/production` via
 * `storeAdminApi.listProductionQueue()`.
 *
 * Backend V1.1 filters to paid orders (web_order + kiosk) with statuses
 * accepted/preparing/ready, ordered by `payment_confirmed_at` ASC.
 * Frontend preserves backend FIFO order and deduplicates by `order.id`.
 *
 * Polls every 15 seconds. A separate UI clock ticks every 30 seconds to
 * keep the elapsed-time display current without making API calls.
 *
 * Operational status transitions via:
 *   PATCH /api/store-admin/orders/{id}/status
 * through `storeAdminApi.updateOrderStatus()`.
 *
 * Sequential actions only:
 *   accepted → preparing → ready → completed
 *
 * This component does NOT:
 * - Implement finalizePayment (FE-06 scope).
 * - Implement cancellation (FE-07 scope).
 * - Render slip/bank-transfer/payment-review UI.
 * - Use `listOrders` or `listPayments` as canonical source.
 * - Use Supabase Realtime (FE-08 scope).
 */
export default function ProductionOrdersQueue() {
  const [orders, setOrders] = useState<ProductionQueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [cancelOrder, setCancelOrder] = useState<ProductionQueueOrder | null>(null);
  const isStoreOwner = useIsStoreOwner();
  const { storeId } = useProfileRole();
  const [, setClockTick] = useState(0);

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
      const response = await storeAdminApi.listProductionQueue();
      // Deduplicate by order.id; preserve backend FIFO order.
      const seen = new Set<string>();
      const deduped: ProductionQueueOrder[] = [];
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
        setError(friendlyProductionError(raw));
      } else {
        // Temporary refresh failure: retain previously loaded queue.
        setRefreshError(friendlyProductionError(raw));
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

  // UI clock: ticks every 30 seconds — no API calls.
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

  const handleStatusAction = useCallback(
    async (order: ProductionQueueOrder, nextStatus: string) => {
      if (pendingOrderId === order.id) return; // per-order in-flight guard
      setPendingOrderId(order.id);
      setActionError(null);
      try {
        await storeAdminApi.updateOrderStatus(order.id, { status: nextStatus });
        // Refetch canonical Production Queue after successful mutation.
        await fetchQueue(false);
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err ?? "");
        setActionError(friendlyProductionError(raw));
        // Do NOT advance local status. Refetch to reconcile.
        void fetchQueue(false);
      } finally {
        setPendingOrderId(null);
      }
    },
    [pendingOrderId, fetchQueue],
  );

  const now = Date.now();
  const renderedOrders = useMemo(() => orders, [orders]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4" role="status" aria-live="polite">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4 animate-pulse" aria-hidden />
          กำลังโหลดคิวผลิต...
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
          aria-label="รีเฟรชคิวผลิตอีกครั้ง"
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
          <h2 className="text-base font-semibold">คิวผลิต</h2>
          <p className="text-xs text-muted-foreground">
            ออเดอร์ที่ชำระเงินแล้ว รอเตรียมและส่งมอบ
          </p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
          aria-label="รีเฟรชคิวผลิต"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          รีเฟรช
        </button>
      </div>

      {/* Subtle refresh error (non-destructive) */}
      {refreshError ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          role="status"
          aria-live="polite"
        >
          {refreshError}
        </div>
      ) : null}

      {/* Action error (per-action, non-destructive) */}
      {actionError ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      {/* Empty state */}
      {renderedOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <Inbox className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">ยังไม่มีออเดอร์ในคิวผลิต</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ออเดอร์ที่ชำระเงินแล้วจะปรากฏที่นี่โดยอัตโนมัติ
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {renderedOrders.map((order) => {
            const confirmed = parseConfirmedAt(order);
            const hasValidTs = confirmed > 0;
            const elapsedMs = hasValidTs ? now - confirmed : 0;
            const action = nextAction(order.status);
            const isPending = pendingOrderId === order.id;
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
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusToneClass(order.status)}`}
                      data-status-label
                    >
                      {statusLabel(order.status)}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground" data-source>
                      {sourceLabel(order.order_source)}
                    </span>
                  </div>
                </div>

                {/* Payment confirmed time / elapsed */}
                <p className="mt-2 text-xs text-muted-foreground" data-confirmed-time>
                  {hasValidTs ? (
                    <>รอ {formatElapsedDuration(elapsedMs)}</>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      เวลาเข้าคิวไม่พร้อมใช้งาน
                    </span>
                  )}
                </p>

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

                {/* Operational action button */}
                {action ? (
                  <button
                    type="button"
                    onClick={() => void handleStatusAction(order, action.nextStatus)}
                    disabled={isPending}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={action.label}
                    data-action-status={action.nextStatus}
                  >
                    {isPending ? "กำลังอัปเดต..." : action.label}
                  </button>
                ) : null}

                {/* Owner-only cancel action — accepted orders only */}
                {isStoreOwner && order.status === "accepted" ? (
                  <button
                    type="button"
                    onClick={() => setCancelOrder(order)}
                    disabled={isPending || cancelOrder?.id === order.id}
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

      {/* Owner cancel dialog */}
      <OwnerCancelDialog
        order={cancelOrder ?? PLACEHOLDER_ORDER}
        open={cancelOrder !== null}
        onClose={() => setCancelOrder(null)}
        onSuccess={() => {
          setCancelOrder(null);
          void fetchQueue(false);
        }}
        onReconcile={() => {
          void fetchQueue(false);
        }}
      />
    </div>
  );
}

// Placeholder order used only when the dialog is closed.
const PLACEHOLDER_ORDER: ProductionQueueOrder = {
  id: "",
  order_no: null,
  order_number: null,
  order_source: null,
  customer_name: "",
  customer_note: null,
  items: [],
  total_amount: 0,
  status: "accepted",
  payment_status: "paid",
  payment_confirmed_at: null,
};
