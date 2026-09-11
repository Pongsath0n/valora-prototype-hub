import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  storeAdminApi,
  type FinalizePaymentMethod,
  type IncomingQueueOrder,
} from "@/services/storeAdminApi";
import { formatTHB } from "@/lib/format";

type PaymentMethod = FinalizePaymentMethod | "";

// ── Canonical Backend V1.1 finalize-payment success result whitelist ───────
// Source: backend/app/services/atomic_rpc.py + backend/app/tests/test_atomic_endpoints.py
// Normal success: result = "finalized" (status = "accepted", payment_status = "paid")
// Idempotent success: result = "already_finalized" (already accepted+paid)
// Any other result value MUST be treated as NOT success (fail-closed).
const SUCCESS_RESULTS = new Set(["finalized", "already_finalized"]);

// ── Concurrent / stale-order error codes ───────────────────────────────────
// Source: backend/app/services/atomic_rpc.py:_ERROR_HTTP_MAP
// These indicate the order may have been changed by another Staff browser.
// They trigger a reconciliation refetch (NOT a payment success, NOT an auto-retry).
const CONCURRENT_STATE_ERRORS = new Set([
  "invalid_order_status_for_finalization",
  "invalid_payment_status_for_finalization",
  "idempotency_conflict",
  "ambiguous_payment_state",
  "inconsistent_paid_payment_state",
]);

function isConcurrentStateError(message: string): boolean {
  return CONCURRENT_STATE_ERRORS.has((message || "").toLowerCase());
}

function friendlyFinalizeError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m === "insufficient_stock") {
    return "สต็อกไม่เพียงพอ ไม่สามารถยืนยันการชำระเงินได้ กรุณาตรวจสอบสต็อกหรือแจ้งผู้ดูแล";
  }
  if (m === "missing_token" || m === "invalid_token" || m === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (m === "store_access_denied" || m === "no_store_membership" || m === "store_mismatch" || m === "actor_not_member_of_store") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (m === "insufficient_role") {
    return "สิทธิ์ไม่เพียงพอสำหรับการยืนยันการชำระเงิน";
  }
  if (m === "order_not_found" || m === "order_not_found_for_store") {
    return "ไม่พบคำสั่งซื้อ อาจถูกอัปเดตโดยผู้อื่นแล้ว กรุณารีเฟรช";
  }
  if (isConcurrentStateError(m)) {
    return "ออเดอร์นี้อาจถูกยืนยันโดยพนักงานอื่นแล้ว กรุณารีเฟรชคิว";
  }
  if (m === "invalid_payment_method") {
    return "วิธีการชำระเงินไม่ถูกต้อง กรุณาเลือกใหม่";
  }
  if (m === "network" || m === "fetch_failed") {
    return "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตและลองอีกครั้ง";
  }
  if (m.includes("supabase") || m.includes("postgres") || m.includes("fastapi") || m.includes("stack")) {
    return "ไม่สามารถยืนยันการชำระเงินได้ในขณะนี้ กรุณาลองอีกครั้ง";
  }
  return message || "ไม่สามารถยืนยันการชำระเงินได้ในขณะนี้ กรุณาลองอีกครั้ง";
}

type CounterPaymentDialogProps = {
  order: IncomingQueueOrder;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Read-only reconciliation refetch (used for unknown-result / concurrent-state cases). */
  onReconcile?: () => void;
};

/**
 * Canonical V1 Staff Counter Payment dialog.
 *
 * Lives inside the Incoming Queue flow. Staff explicitly choose cash or
 * PromptPay, then explicitly confirm payment receipt. Only then does the
 * dialog call `storeAdminApi.finalizePayment(orderId, { payment_method })`.
 *
 * The Backend is authoritative for payment creation, payment confirmation,
 * stock deduction, stock movement, order status (accepted), and payment
 * status (paid). The frontend sends ONLY `payment_method` — no amount,
 * no status, no timestamp, no stock data, no PII.
 *
 * Result handling is FAIL-CLOSED: only the canonical Backend success
 * results ("finalized", "already_finalized") are treated as success.
 * Any unknown result triggers a read-only reconciliation refetch and a
 * safe "cannot confirm payment result" message — never a success message,
 * never an automatic retry, never a manual status/stock mutation.
 *
 * Concurrent/stale-order errors (invalid_order_status_for_finalization,
 * invalid_payment_status_for_finalization, idempotency_conflict,
 * ambiguous_payment_state, inconsistent_paid_payment_state) trigger a
 * read-only reconciliation refetch — NOT a payment success, NOT an
 * auto-retry of finalize-payment.
 *
 * PromptPay in Healholic V1 is a STATIC QR at the counter. There is no
 * online gateway, no webhook, no slip upload, no customer-side
 * confirmation. Staff manually verify receipt and press "ยืนยันรับชำระเงิน".
 *
 * No configured static QR image source exists in the frontend config
 * (`STORE_QR_CONFIG.qrImageUrl === null`). The dialog therefore shows
 * the physical-counter QR instruction without fabricating a QR source.
 * A future phase can wire `STORE_QR_CONFIG.qrImageUrl` to a real URL.
 */
export default function CounterPaymentDialog({
  order,
  open,
  onClose,
  onSuccess,
  onReconcile,
}: CounterPaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Track pending success/reconcile timeouts so they can be cancelled
  // when the dialog unmounts or closes. Without this, a timeout scheduled
  // by handleConfirm could fire after unmount, calling onSuccess/onReconcile
  // and triggering a stale parent refetch.
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const scheduleCallback = (cb: () => void, delay: number) => {
    const id = setTimeout(() => {
      pendingTimeoutsRef.current.delete(id);
      cb();
    }, delay);
    pendingTimeoutsRef.current.add(id);
  };

  const clearPendingTimeouts = () => {
    pendingTimeoutsRef.current.forEach((id) => clearTimeout(id));
    pendingTimeoutsRef.current.clear();
  };

  // Reset state when dialog opens for a new order.
  useEffect(() => {
    if (open) {
      setMethod("");
      setSubmitting(false);
      setError(null);
      setSuccess(false);
    }
  }, [open, order.id]);

  // Clear any pending timeouts on unmount.
  useEffect(() => {
    return () => clearPendingTimeouts();
  }, []);

  // Close on Escape key (when not submitting).
  useEffect(() => {
    if (!open || submitting) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const canConfirm = method === "cash" || method === "promptpay";

  const handleConfirm = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await storeAdminApi.finalizePayment(order.id, {
        payment_method: method as FinalizePaymentMethod,
      });
      // FAIL-CLOSED: only canonical Backend success results are accepted.
      const result = (response?.result || "").toLowerCase();
      if (SUCCESS_RESULTS.has(result)) {
        // "finalized" = normal success; "already_finalized" = idempotent success.
        // Do NOT issue a second payment for already_finalized.
        setSuccess(true);
        // Notify parent to refetch Incoming Queue after a brief success UX.
        scheduleCallback(() => {
          onSuccess();
        }, 800);
      } else {
        // Unknown result — FAIL CLOSED. Do NOT show success. Do NOT auto-retry.
        // Do NOT manually mutate status/payment/stock. Trigger a read-only
        // reconciliation refetch so the canonical Backend snapshot reconciles.
        setError("ไม่สามารถยืนยันผลการชำระเงินได้ กรุณาตรวจสอบคิวอีกครั้ง");
        if (onReconcile) {
          scheduleCallback(() => {
            onReconcile();
          }, 200);
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      setError(friendlyFinalizeError(raw));
      // Concurrent/stale-order errors trigger a read-only reconciliation
      // refetch (NOT a payment success, NOT an auto-retry).
      if (isConcurrentStateError(raw) && onReconcile) {
        scheduleCallback(() => {
          onReconcile();
        }, 200);
      }
      // Retain selected method + order context for explicit retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="counter-payment-title"
      data-counter-payment-dialog
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="counter-payment-title" className="text-base font-semibold">
              รับชำระเงิน
            </h2>
            <p className="text-xs text-muted-foreground">ยืนยันการชำระเงินที่เคาน์เตอร์</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Order summary */}
        <div className="mt-4 space-y-1 rounded-lg bg-muted/40 p-3" data-order-summary>
          <p className="text-sm font-semibold text-foreground">
            {order.order_no || order.order_number || "-"}
          </p>
          <p className="text-lg font-bold text-foreground" data-customer-name>
            {order.customer_name || "-"}
          </p>
          {order.customer_note ? (
            <p className="text-xs text-muted-foreground" data-customer-note>
              หมายเหตุ: {order.customer_note}
            </p>
          ) : null}
          <div className="mt-2 space-y-0.5" data-order-items>
            {(order.items ?? []).map((item, idx) => (
              <div key={`${item.product_id}-${idx}`} className="flex items-center justify-between text-xs">
                <span className="text-foreground">
                  {item.product_name || "เมนู"} x{item.quantity}
                </span>
                <span className="text-muted-foreground">{formatTHB(item.line_total)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <span className="text-xs text-muted-foreground">ยอดรวม</span>
            <span className="text-base font-bold text-foreground" data-total-amount>
              {formatTHB(order.total_amount)}
            </span>
          </div>
        </div>

        {/* Success state */}
        {success ? (
          <div
            className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800"
            role="status"
            aria-live="polite"
            data-success-message
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            รับชำระเงินเรียบร้อยแล้ว ออเดอร์ถูกส่งเข้าคิวผลิต
          </div>
        ) : (
          <>
            {/* Payment method selection */}
            <fieldset className="mt-4" data-payment-methods>
              <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                เลือกวิธีการชำระเงิน
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod("cash")}
                  disabled={submitting}
                  aria-pressed={method === "cash"}
                  data-method="cash"
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                    method === "cash"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  เงินสด
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("promptpay")}
                  disabled={submitting}
                  aria-pressed={method === "promptpay"}
                  data-method="promptpay"
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                    method === "promptpay"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  PromptPay
                </button>
              </div>
            </fieldset>

            {/* PromptPay static QR instruction */}
            {method === "promptpay" ? (
              <div
                className="mt-3 rounded-lg border border-dashed border-primary/40 bg-muted/20 p-3 text-center"
                data-promptpay-qr
              >
                <p className="text-sm font-semibold text-foreground">
                  ให้ลูกค้าสแกน QR PromptPay ที่เคาน์เตอร์
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  พนักงานตรวจสอบการรับเงินก่อนกดยืนยัน
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  (QR ร้านแบบไม่ระบุยอด — ลูกค้ากรอกยอดเอง)
                </p>
              </div>
            ) : null}

            {/* Error message */}
            {error ? (
              <div
                className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
                data-payment-error
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Confirm / pending state */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm || submitting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="ยืนยันรับชำระเงิน"
              data-confirm-button
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  กำลังยืนยันการชำระเงิน...
                </>
              ) : (
                "ยืนยันรับชำระเงิน"
              )}
            </button>
            {!canConfirm && !submitting ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                กรุณาเลือกวิธีการชำระเงินก่อนยืนยัน
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
