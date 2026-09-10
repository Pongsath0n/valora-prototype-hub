import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { cn } from "@/lib/utils";
import { customerApi, type OrderStatusSummary } from "@/services/customerApi";
import { customerOrderStatus } from "@/lib/customerStatus";
import { getLastOrderToken, setLastOrderToken } from "@/services/cartStorage";
import { mapCustomerStatusError } from "@/lib/customerErrors";

/** Canonical V1 polling interval (ms). */
const POLL_INTERVAL_MS = 15_000;

/** Terminal order statuses that should stop polling. */
const TERMINAL_STATUSES = new Set(["completed", "cancelled", "voided"]);

const TIMELINE: { key: string; label: string }[] = [
  { key: "received", label: "รับออเดอร์แล้ว" },
  { key: "payment", label: "ชำระเงินที่เคาน์เตอร์" },
  { key: "preparing", label: "กำลังจัดเตรียม" },
  { key: "ready", label: "พร้อมรับสินค้า" },
  { key: "completed", label: "เสร็จสิ้น" },
];

function timelineIndexForStatus(status: string): number {
  switch (status) {
    case "pending_payment":
    case "waiting_payment_review":
      return 0;
    case "accepted":
      return 1;
    case "preparing":
      return 2;
    case "ready":
      return 3;
    case "completed":
      return 4;
    default:
      return 0;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

function normalizeStatus(value: string | undefined | null): string {
  return (value || "").toLowerCase();
}

/**
 * Canonical V1 Customer Status Page.
 *
 * Loads order status via `GET /api/customer/orders/status?token=<public_token>`.
 * The public_token is sourced from the URL query (if present) or the persisted
 * `getLastOrderToken()` from FE-02. No phone lookup is required.
 *
 * Polls every 15 seconds while the order is in an active state. Stops polling
 * on terminal statuses (completed, cancelled, voided). Temporary network
 * failures retain the last valid status and show a subtle retry affordance.
 *
 * This page does NOT:
 * - Render slip upload controls or bank-transfer instructions.
 * - Call `getPaymentInstructions`, `uploadPaymentSlip`, or `lookupOrderStatus`.
 * - Consume `payment.can_upload_slip`, `payment.slip_submitted`, or
 *   `payment.reject_reason` to build payment UI.
 * - Display the public_token visibly.
 */
export default function OrderStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get("token")?.trim() || "";
  const storedToken = getLastOrderToken();
  const initialToken = tokenFromQuery || storedToken || "";

  const [activeToken, setActiveToken] = useState<string>(initialToken);
  const [statusData, setStatusData] = useState<OrderStatusSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);

  const inFlightRef = useRef(false);
  const lastFetchedTokenRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(
    async (tokenValue: string, isInitial: boolean) => {
      if (!tokenValue) {
        setStatusData(null);
        setActiveToken("");
        return;
      }
      if (inFlightRef.current) return; // prevent overlapping requests
      inFlightRef.current = true;
      lastFetchedTokenRef.current = tokenValue;
      if (isInitial) setLoading(true);
      setError(null);
      try {
        const response = await customerApi.getOrderStatusByToken(tokenValue);
        setStatusData(response);
        setRefreshError(null);
        const resolvedToken = response.public_token ?? tokenValue;
        setActiveToken(resolvedToken);
        if (resolvedToken && resolvedToken !== storedToken) {
          setLastOrderToken(resolvedToken);
        }
        // Persist URL token if it differs from query.
        if (resolvedToken && resolvedToken !== tokenFromQuery) {
          const next = new URLSearchParams(searchParams);
          next.set("token", resolvedToken);
          setSearchParams(next, { replace: true });
        }
      } catch (err) {
        if (isInitial) {
          setStatusData(null);
          setError(mapCustomerStatusError(err));
        } else {
          // Temporary refresh failure: retain previous valid status.
          setRefreshError(mapCustomerStatusError(err));
        }
      } finally {
        inFlightRef.current = false;
        if (isInitial) setLoading(false);
      }
    },
    [searchParams, setSearchParams, storedToken, tokenFromQuery],
  );

  // Initial + token-change fetch.
  useEffect(() => {
    const next = (tokenFromQuery || storedToken || "").trim();
    if (next && next !== lastFetchedTokenRef.current) {
      void fetchStatus(next, true);
    } else if (!next) {
      setStatusData(null);
      setActiveToken("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromQuery, storedToken]);

  // Entrance animation.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Polling: every POLL_INTERVAL_MS while order is active.
  const normalizedStatus = normalizeStatus(statusData?.order_status);
  const isTerminal = TERMINAL_STATUSES.has(normalizedStatus);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (!activeToken || isTerminal) return;

    pollTimerRef.current = setTimeout(() => {
      void fetchStatus(activeToken, false);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [activeToken, isTerminal, fetchStatus, statusData]);

  const handleManualRefresh = useCallback(() => {
    if (activeToken) {
      void fetchStatus(activeToken, false);
    }
  }, [activeToken, fetchStatus]);

  const isCancelled = normalizedStatus === "cancelled" || normalizedStatus === "voided";
  const isCompleted = normalizedStatus === "completed";

  const timelineSteps = useMemo(() => {
    const index = timelineIndexForStatus(normalizedStatus);
    return TIMELINE.map((step, idx) => ({
      ...step,
      active: !isCompleted && !isCancelled && index === idx,
      completed: isCompleted ? true : index > idx,
    }));
  }, [normalizedStatus, isCompleted, isCancelled]);

  const banner = useMemo(() => {
    if (!statusData) return null;
    if (isCancelled) {
      return {
        tone: "muted" as const,
        title: "ออเดอร์ถูกยกเลิก",
        desc: "หากต้องการสั่งใหม่ กรุณาเปิดเมนูร้านอีกครั้ง",
      };
    }
    switch (normalizedStatus) {
      case "pending_payment":
      case "waiting_payment_review":
        return {
          tone: "warning" as const,
          title: "รับออเดอร์แล้ว",
          desc: "กรุณารอพนักงานเรียกชื่อเพื่อชำระเงินที่เคาน์เตอร์",
        };
      case "accepted":
        return {
          tone: "success" as const,
          title: "ชำระเงินเรียบร้อยแล้ว",
          desc: "ออเดอร์ของคุณอยู่ในคิว",
        };
      case "preparing":
        return {
          tone: "info" as const,
          title: "กำลังจัดเตรียมออเดอร์",
          desc: "ร้านกำลังเตรียมออเดอร์ของคุณ",
        };
      case "ready":
        return {
          tone: "success" as const,
          title: "ออเดอร์พร้อมรับแล้ว",
          desc: "กรุณารับสินค้าที่เคาน์เตอร์",
        };
      case "completed":
        return {
          tone: "success" as const,
          title: "ออเดอร์เสร็จสิ้น",
          desc: "ขอบคุณที่อุดหนุน",
        };
      default:
        return {
          tone: "info" as const,
          title: "กำลังตรวจสอบสถานะออเดอร์",
          desc: "กรุณารอสักครู่",
        };
    }
  }, [statusData, isCancelled, normalizedStatus]);

  // ── No token: empty state ──
  if (!activeToken && !loading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-8">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">สถานะออเดอร์</h1>
        </header>
        <div className="bw-card p-6 text-center">
          <p className="text-base font-semibold text-muted-foreground">ไม่พบออเดอร์ล่าสุด</p>
          <p className="mt-1 text-sm text-muted-foreground">
            กรุณาสั่งซื้อก่อน จึงจะสามารถติดตามสถานะได้
          </p>
          <Link
            to="/order"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            กลับไปที่เมนู
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2 text-center">
        <p className="text-sm font-semibold text-primary/80">ติดตามออเดอร์ของคุณ</p>
        <h1 className="text-3xl font-bold tracking-tight">สถานะออเดอร์</h1>
      </header>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            onClick={() => activeToken && void fetchStatus(activeToken, true)}
            className="ml-3 underline font-semibold"
          >
            ลองอีกครั้ง
          </button>
        </div>
      ) : null}

      {/* ── Status banner ── */}
      {banner ? (
        <div
          className={cn(
            "rounded-2xl border p-4 shadow-sm",
            banner.tone === "success" && "border-emerald-200 bg-emerald-50",
            banner.tone === "info" && "border-sky-200 bg-sky-50",
            banner.tone === "warning" && "border-amber-200 bg-amber-50",
            banner.tone === "muted" && "border-border bg-muted/40",
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold",
                banner.tone === "success" && "bg-emerald-100 text-emerald-700",
                banner.tone === "info" && "bg-sky-100 text-sky-700",
                banner.tone === "warning" && "bg-amber-100 text-amber-700",
                banner.tone === "muted" && "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {banner.tone === "success" ? "✓" : banner.tone === "muted" ? "–" : "•"}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-base font-semibold",
                  banner.tone === "success" && "text-emerald-800",
                  banner.tone === "info" && "text-sky-800",
                  banner.tone === "warning" && "text-amber-800",
                  banner.tone === "muted" && "text-foreground",
                )}
              >
                {banner.title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{banner.desc}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Order summary card ── */}
      <section
        className={cn(
          "bw-card p-5 transition-all duration-500",
          animated ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        )}
      >
        {loading ? (
          <div className="space-y-3">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : statusData ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">เลขออเดอร์</p>
                <p className="text-2xl font-semibold">{statusData.order_no || "-"}</p>
              </div>
              <div className="flex items-center gap-2">
                {refreshError ? (
                  <span className="text-xs text-destructive">{refreshError}</span>
                ) : null}
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  className="text-sm font-medium text-primary"
                >
                  รีเฟรช
                </button>
              </div>
            </div>

            {statusData.customer_name ? (
              <p className="text-sm text-muted-foreground">
                ชื่อลูกค้า: <span className="font-semibold text-foreground">{statusData.customer_name}</span>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {customerOrderStatus(statusData.order_status).label}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>ยังไม่มีข้อมูลสถานะให้แสดง</p>
          </div>
        )}
      </section>

      {/* ── Order items ── */}
      {statusData ? (
        <section className="bw-card p-5">
          <h2 className="text-base font-semibold">สรุปรายการสินค้า</h2>
          <div className="mt-3 space-y-3">
            {statusData.items.map((item, idx) => (
              <div key={`${item.product_name}-${idx}`} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-lg border bg-muted">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.product_name || "เมนู"}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                        ไม่มีรูป
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{item.product_name || "เมนู"}</p>
                    <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold">{formatCurrency(item.line_total)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <p className="text-sm text-muted-foreground">ยอดรวม</p>
            <p className="text-lg font-semibold">{formatCurrency(statusData.total_amount)}</p>
          </div>
        </section>
      ) : null}

      {/* ── Status timeline ── */}
      {statusData ? (
        <section className="bw-card p-5">
          <h2 className="text-base font-semibold">ความคืบหน้า</h2>
          <ol className="relative mt-3 space-y-1">
            {timelineSteps.map((step, idx) => (
              <li key={step.key} className="flex items-stretch gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      step.active
                        ? "bg-primary text-primary-foreground"
                        : step.completed
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                    aria-current={step.active ? "step" : undefined}
                  >
                    {step.completed ? "✓" : step.active ? "•" : idx + 1}
                  </span>
                  {idx < timelineSteps.length - 1 ? (
                    <span
                      className={cn("my-1 w-0.5 flex-1", step.completed ? "bg-primary/30" : "bg-muted")}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <p
                  className={cn(
                    "py-0.5 text-sm",
                    step.active
                      ? "font-semibold text-foreground"
                      : step.completed
                        ? "font-medium text-foreground/80"
                        : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* ── Actions ── */}
      <div className="flex flex-wrap gap-3">
        <Link to="/order" className="bw-btn-outline flex-1">
          สั่งเพิ่ม
        </Link>
      </div>
    </div>
  );
}
