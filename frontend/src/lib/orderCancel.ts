// ─── Staff order cancellation UX guard ──────────────────────────────────────
//
// This module ONLY supports the Staff-facing cancellation *UX*. It does NOT
// implement or replace any business logic. The backend remains the single
// source of truth for whether a cancellation is permitted. These helpers exist
// purely to (a) reduce human error in the Staff UI and (b) translate backend
// rejection enums into friendly Thai messages.
//
// Owner-approved rule (mirrored here, NOT invented):
//   Staff may cancel only unpaid / pending-payment / no-slip orders, plus
//   waiting_payment_review when the backend still treats it as unpaid/no-slip.
//   Staff must not cancel paid / under-review-with-real-slip / accepted /
//   preparing / ready / completed / archived / already-cancelled orders.

function normalize(status?: string | null): string {
  return (status ?? "").toString().toLowerCase();
}

/**
 * Statuses we can *clearly* identify, from already-loaded data, as not
 * cancellable by Staff. For these we hide/disable the cancel action and show a
 * helper note. Anything not in this set (e.g. pending_payment,
 * waiting_payment_review, unpaid, pending) stays cancel-attemptable: we show the
 * confirmation dialog and rely on the backend response as final authority.
 *
 * Note: waiting_payment_review / pending_review are intentionally NOT listed.
 * They can be "unpaid/no-slip" (cancellable) or "real slip submitted"
 * (blocked) — the frontend cannot reliably tell, so we defer to the backend.
 */
const STAFF_BLOCKED_STATUSES = new Set<string>([
  "paid",
  "accepted",
  "preparing",
  "ready",
  "ready_for_pickup",
  "completed",
  "fulfilled",
  "cancelled",
  "voided",
  "rejected",
  "archived",
]);

/**
 * True when the order's status is clearly one Staff is not allowed to cancel.
 * UI-only convenience — never a security boundary.
 */
export function isClearlyUncancellableByStaff(status?: string | null): boolean {
  return STAFF_BLOCKED_STATUSES.has(normalize(status));
}

/** Short Thai helper text explaining why the Staff cancel action is unavailable. */
export const STAFF_CANCEL_BLOCKED_HINT =
  "ออเดอร์นี้ไม่สามารถยกเลิกได้จากการทำงานของ Staff (ใช้ได้เฉพาะออเดอร์ที่ยังไม่ชำระเงินหรือยังไม่มีสลิป)";

/**
 * Map a backend cancellation-rejection enum to a friendly Thai message.
 * Returns null when the message is not a known cancellation enum, so callers
 * can fall back to their existing generic handling.
 */
const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  insufficient_role_for_status:
    "ไม่สามารถยกเลิกออเดอร์นี้ได้ เนื่องจากสถานะไม่อยู่ในเงื่อนไขที่ Staff ยกเลิกได้",
  staff_cannot_cancel_paid_order: "ออเดอร์นี้ชำระเงินแล้ว Staff ไม่สามารถยกเลิกได้",
  order_already_completed: "ออเดอร์นี้เสร็จสิ้นแล้ว ไม่สามารถยกเลิกได้",
  order_already_archived: "ออเดอร์นี้ถูกยกเลิกหรือจัดเก็บแล้ว",
};

export function friendlyCancelError(message?: string | null): string | null {
  if (!message) return null;
  return CANCEL_ERROR_MESSAGES[message] ?? null;
}
