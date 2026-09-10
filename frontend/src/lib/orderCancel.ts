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
//
// PF-04A: The canonical `POST /orders/{id}/cancel` endpoint is OWNER-ONLY.
//   The backend raises `owner_role_required` (403) for non-owners via
//   `_require_owner_store_role`. The frontend must hide the cancel button
//   for non-owners entirely. Even for owners, the backend only accepts
//   `pending_payment` and `accepted` statuses for cancellation
//   (preparing/ready/completed → 409, cancelled → idempotent, other → 400).

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
 * PF-04A: Statuses eligible for owner cancellation via the canonical
 * `POST /orders/{id}/cancel` endpoint. The backend accepts these two
 * statuses only:
 *   - pending_payment → direct cancel (no stock return)
 *   - accepted → cancel_accepted_order_atomic (stock return via RPC)
 *
 * All other statuses (preparing, ready, completed, cancelled, voided, etc.)
 * are NOT eligible and the cancel button must NOT be shown.
 */
const OWNER_CANCELLABLE_STATUSES = new Set<string>([
  "pending_payment",
  "accepted",
]);

/**
 * True when the order's status is clearly one Staff is not allowed to cancel.
 * UI-only convenience — never a security boundary.
 */
export function isClearlyUncancellableByStaff(status?: string | null): boolean {
  return STAFF_BLOCKED_STATUSES.has(normalize(status));
}

/**
 * PF-04A: True when the order's status is eligible for owner cancellation
 * via the canonical `POST /orders/{id}/cancel` endpoint.
 * Only `pending_payment` and `accepted` are eligible.
 */
export function isOwnerCancellableStatus(status?: string | null): boolean {
  return OWNER_CANCELLABLE_STATUSES.has(normalize(status));
}

/** Short Thai helper text explaining why the Staff cancel action is unavailable. */
export const STAFF_CANCEL_BLOCKED_HINT =
  "ออเดอร์นี้ไม่สามารถยกเลิกได้จากการทำงานของ Staff (ใช้ได้เฉพาะออเดอร์ที่ยังไม่ชำระเงินหรือยังไม่มีสลิป)";

/**
 * Map a backend cancellation-rejection enum to a friendly Thai message.
 * Returns null when the message is not a known cancellation enum, so callers
 * can fall back to their existing generic handling.
 *
 * PF-04A: Verified against frozen Backend V1.1.
 *   - `POST /orders/{id}/cancel` raises `owner_role_required` (403) for
 *     non-owners via `_require_owner_store_role`.
 *   - The PATCH status flow (legacy) raises `insufficient_role_for_status`
 *     and `staff_cannot_cancel_paid_order`. These are retained for backward
 *     compatibility but the canonical endpoint uses `owner_role_required`.
 *   - 409 blocked statuses return a generic conflict (not an enum here).
 */
const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  owner_role_required:
    "ไม่สามารถยกเลิกออเดอร์นี้ได้ เนื่องจากต้องการสิทธิ์ Owner ของร้าน",
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
