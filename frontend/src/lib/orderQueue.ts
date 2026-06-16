// ─── Staff order-queue filtering & FIFO ordering (frontend-only) ────────────
//
// Display/sort helpers for the Staff order queue. None of this touches backend
// business logic: orders are not mutated, statuses are not reinterpreted for
// the server, and nothing here is a security boundary. These helpers only
// decide what a Staff member SEES in each operational tab and in what order,
// using data the frontend has already loaded.
//
// Two operational rules are encoded here (owner-approved, mirrored not invented):
//   1. Cancelled / archived orders must not appear in active work tabs
//      (รอตรวจสลิป, กำลังเตรียม, พร้อมรับ, คิวออเดอร์).
//   2. Active work tabs are processed FIFO — oldest received first.

type StatusLike = string | null | undefined;

function normalize(status: StatusLike): string {
  return (status ?? "").toString().toLowerCase();
}

/** Order statuses that represent a cancelled / archived order. */
export function isCancelledOrArchivedStatus(status: StatusLike): boolean {
  const s = normalize(status);
  return s === "cancelled" || s === "voided" || s === "archived";
}

type OrderLike = {
  status?: StatusLike;
  archived?: boolean | null;
};

/**
 * True when an order should be excluded from active operational tabs because it
 * is cancelled, voided, or archived. Considers both the `archived` flag and the
 * status string so either source of truth triggers exclusion.
 */
export function isCancelledOrArchivedOrder(order: OrderLike): boolean {
  return Boolean(order.archived) || isCancelledOrArchivedStatus(order.status);
}

type PaymentReviewLike = {
  status?: StatusLike;
  order_status?: StatusLike;
  slip_submitted?: boolean | null;
  slip_storage_path?: string | null;
  slip_url?: string | null;
  submitted_at?: string | null;
};

// Payment states that are already finalised — nothing left for Staff to review.
const FINALISED_PAYMENT_STATUSES = new Set<string>([
  "approved",
  "paid",
  "completed",
  "refunded",
  "cancelled",
  "rejected",
]);

/**
 * Decide whether a payment truly belongs in the "รอตรวจสลิป" (slip review)
 * queue, using the most accurate already-loaded data:
 *   - exclude payments whose ORDER is cancelled / voided / archived,
 *   - exclude payments already finalised (approved / paid / rejected / ...),
 *   - include only payments that actually have something to review: a slip is
 *     present (slip_submitted / storage path / url / submitted_at) OR the
 *     payment is explicitly in a review-pending state.
 *
 * A pending payment with no slip yet is a "waiting for payment / no-slip" state
 * — not a true slip-review item — so it is intentionally excluded here.
 */
export function shouldShowPaymentInReviewQueue(payment: PaymentReviewLike): boolean {
  if (isCancelledOrArchivedStatus(payment.order_status)) {
    return false;
  }
  const status = normalize(payment.status);
  if (FINALISED_PAYMENT_STATUSES.has(status)) {
    return false;
  }
  const hasSlip = Boolean(
    payment.slip_submitted ||
      payment.slip_storage_path ||
      payment.slip_url ||
      payment.submitted_at,
  );
  const reviewPending = status === "pending_review" || status === "waiting_payment_review";
  return hasSlip || reviewPending;
}

// ─── FIFO comparators ───────────────────────────────────────────────────────

const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

function timestamp(value: string | null | undefined): number {
  if (!value) return FAR_FUTURE; // missing timestamps sort last, after known ones
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : FAR_FUTURE;
}

/** Ascending, numeric-aware order-number comparison used as a stable fallback. */
function compareOrderNoAsc(a: StatusLike, b: StatusLike): number {
  return (a ?? "").toString().localeCompare((b ?? "").toString(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

type OrderFifoLike = {
  created_at?: string | null;
  order_no?: string | null;
};

/**
 * FIFO comparator for active order queues: oldest `created_at` first, then
 * `order_no` ascending as a deterministic tie-breaker. Orders without a
 * created_at fall to the end.
 */
export function compareOrdersFifo(a: OrderFifoLike, b: OrderFifoLike): number {
  const at = timestamp(a.created_at);
  const bt = timestamp(b.created_at);
  if (at !== bt) return at - bt;
  return compareOrderNoAsc(a.order_no, b.order_no);
}

type PaymentFifoLike = {
  submitted_at?: string | null;
  created_at?: string | null;
  order_no?: string | null;
};

/**
 * FIFO comparator for the slip-review queue: the first slip received is
 * reviewed first. Uses the best available received timestamp (slip
 * `submitted_at`, then `created_at`), then `order_no` ascending as fallback.
 */
export function comparePaymentsFifo(a: PaymentFifoLike, b: PaymentFifoLike): number {
  const at = Math.min(timestamp(a.submitted_at), timestamp(a.created_at));
  const bt = Math.min(timestamp(b.submitted_at), timestamp(b.created_at));
  if (at !== bt) return at - bt;
  return compareOrderNoAsc(a.order_no, b.order_no);
}
