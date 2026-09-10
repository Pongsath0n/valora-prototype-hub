import { useEffect, useState } from "react";
import { X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { storeAdminApi } from "@/services/storeAdminApi";
import { formatTHB } from "@/lib/format";

// ── Canonical Backend V1.1 cancel success result whitelist ─────────────────
// Source: backend/app/api/store_admin.py:_cancel_order_business
// - pending_payment → result = "cancelled_unpaid" (no stock return)
// - accepted → result = "cancelled" (atomic stock return via RPC)
// - already cancelled → result = "already_cancelled" (idempotent)
// Any other result value MUST be treated as NOT success (fail-closed).
const SUCCESS_RESULTS = new Set(["cancelled_unpaid", "cancelled", "already_cancelled"]);

// ── Concurrent / stale-order error codes ───────────────────────────────────
// Source: backend/app/api/store_admin.py:_cancel_order_business + atomic_rpc.py
const CONCURRENT_STATE_ERRORS = new Set([
  "invalid_status_for_cancellation",
  "invalid_status_for_cancellation",
  "idempotency_conflict",
]);

function isConcurrentStateError(message: string): boolean {
  return CONCURRENT_STATE_ERRORS.has((message || "").toLowerCase());
}

function friendlyCancelError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m === "owner_role_required") {
    return "เฉพาะเจ้าของร้านเท่านั้นที่สามารถยกเลิกออเดอร์ได้";
  }
  if (isConcurrentStateError(m)) {
    return "สถานะออเดอร์เปลี่ยนไปแล้ว ไม่สามารถยกเลิกได้";
  }
  if (m === "order_not_found" || m === "order_not_found_for_store") {
    return "ไม่พบคำสั่งซื้อ อาจถูกอัปเดตโดยผู้อื่นแล้ว กรุณารีเฟรช";
  }
  if (m === "missing_token" || m === "invalid_token" || m === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (m === "store_access_denied" || m === "no_store_membership" || m === "store_mismatch" || m === "actor_not_member_of_store") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (m === "insufficient_stock") {
    return "สต็อกไม่เพียงพอ ไม่สามารถดำเนินการได้ กรุณาตรวจสอบสต็อกหรือแจ้งผู้ดูแล";
  }
  if (m === "network" || m === "fetch_failed") {
    return "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตและลองอีกครั้ง";
  }
  if (m.includes("supabase") || m.includes("postgres") || m.includes("fastapi") || m.includes("stack")) {
    return "ไม่สามารถยกเลิกออเดอร์ได้ในขณะนี้ กรุณาลองอีกครั้ง";
  }
  return message || "ไม่สามารถยกเลิกออเดอร์ได้ในขณะนี้ กรุณาลองอีกครั้ง";
}

type OwnerCancelDialogProps = {
  order: {
    id: string;
    order_no?: string | null;
    order_number?: string | null;
    customer_name?: string | null;
    status?: string | null;
    total_amount?: number;
  };
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Read-only reconciliation refetch (used for unknown-result / concurrent-state cases). */
  onReconcile?: () => void;
};

/**
 * Canonical V1 Owner-only cancellation dialog.
 *
 * Calls `storeAdminApi.cancelOrder(orderId, { reason })` — the canonical
 * POST /api/store-admin/orders/{id}/cancel endpoint. Never uses PATCH
 * /status, never uses the legacy atomic-cancel route, never restores
 * ingredient quantities locally.
 *
 * Backend is authoritative for:
 * - status validation
 * - authorization (owner_role_required)
 * - ingredient restoration (accepted → atomic RPC)
 * - transaction atomicity
 * - final cancelled state
 *
 * Result handling is FAIL-CLOSED: only canonical success results
 * ("cancelled_unpaid", "cancelled", "already_cancelled") are treated as
 * success. Unknown results trigger a read-only reconciliation refetch.
 *
 * Cancellation is NOT a payment reversal. The dialog never claims money
 * was returned to the customer. For accepted orders, the dialog explains
 * Backend will restore ingredients per recorded usage — but does NOT
 * claim a payment reversal transaction.
 */
export default function OwnerCancelDialog({
  order,
  open,
  onClose,
  onSuccess,
  onReconcile,
}: OwnerCancelDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset state when dialog opens for a new order.
  useEffect(() => {
    if (open) {
      setReason("");
      setSubmitting(false);
      setError(null);
      setSuccess(false);
    }
  }, [open, order.id]);

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

  const orderLabel = order.order_no || order.order_number || `#${order.id}`;
  const isAccepted = (order.status || "").toLowerCase() === "accepted";

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = (reason || "").trim();
      const payload = trimmed ? { reason: trimmed } : {};
      const response = await storeAdminApi.cancelOrder(order.id, payload);
      // FAIL-CLOSED: only canonical Backend success results are accepted.
      const result = (response?.result || "").toLowerCase();
      if (SUCCESS_RESULTS.has(result)) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 800);
      } else {
        // Unknown result — FAIL CLOSED.
        setError("ไม่สามารถยืนยันผลการยกเลิกได้ กรุณาตรวจสอบคิวอีกครั้ง");
        if (onReconcile) {
          setTimeout(() => {
            onReconcile();
          }, 200);
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      setError(friendlyCancelError(raw));
      if (isConcurrentStateError(raw) && onReconcile) {
        setTimeout(() => {
          onReconcile();
        }, 200);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-cancel-title"
      data-owner-cancel-dialog
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="owner-cancel-title" className="text-base font-semibold text-destructive">
              ยืนยันการยกเลิกออเดอร์
            </h2>
            <p className="text-xs text-muted-foreground">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
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
          <p className="text-sm font-semibold text-foreground">{orderLabel}</p>
          {order.customer_name ? (
            <p className="text-base font-bold text-foreground" data-customer-name>
              {order.customer_name}
            </p>
          ) : null}
          {order.status ? (
            <p className="text-xs text-muted-foreground">
              สถานะปัจจุบัน: <span data-current-status>{order.status}</span>
            </p>
          ) : null}
          {typeof order.total_amount === "number" ? (
            <p className="text-xs text-muted-foreground">
              ยอดรวม: <span data-total-amount>{formatTHB(order.total_amount)}</span>
            </p>
          ) : null}
        </div>

        {/* Accepted-order ingredient restoration notice (no payment reversal claim) */}
        {isAccepted ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-stock-notice>
            ออเดอร์นี้ชำระเงินแล้ว การยกเลิกจะให้ระบบคืนสต็อกตามข้อมูลการใช้งานที่บันทึกไว้
          </div>
        ) : null}

        {/* Success state */}
        {success ? (
          <div
            className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800"
            role="status"
            aria-live="polite"
            data-success-message
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            ยกเลิกออเดอร์เรียบร้อยแล้ว
          </div>
        ) : (
          <>
            {/* Optional reason input */}
            <label className="mt-4 block text-xs font-semibold text-muted-foreground" htmlFor="cancel-reason">
              เหตุผลในการยกเลิก (ไม่บังคับ)
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
              placeholder="ระบุเหตุผลได้หากต้องการ"
              data-reason-input
            />

            {/* Irreversible warning */}
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-irreversible-warning>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>คำเตือน: การยกเลิกออเดอร์เป็นการดำเนินการที่ไม่สามารถย้อนกลับได้</span>
            </div>

            {/* Error message */}
            {error ? (
              <div
                className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
                data-cancel-error
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Confirm / cancel buttons */}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
                data-secondary-action
              >
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="ยืนยันยกเลิกออเดอร์"
                data-confirm-button
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    กำลังยกเลิกออเดอร์...
                  </>
                ) : (
                  "ยืนยันยกเลิกออเดอร์"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
