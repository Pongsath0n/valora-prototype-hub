// ─── Staff payment / slip review UX helpers ─────────────────────────────────
//
// Display-only helpers for the Staff payment review experience. None of this
// changes backend business logic: amounts are NOT recalculated, approval /
// rejection rules are untouched, and slip upload behaviour is unchanged. These
// functions only turn data the frontend already loaded into clearer labels so
// Staff can compare the customer's transfer amount against the order total and
// see at a glance whether a slip exists.

import type { StatusTone } from "@/lib/format";

type SlipFields = {
  slip_submitted?: boolean | null;
  slip_storage_path?: string | null;
  slip_url?: string | null;
};

/**
 * Whether a payment has a slip/proof attached. Mirrors the exact condition the
 * Staff UI already used to enable the "ตรวจสลิป" button, so presence detection
 * stays consistent with existing behaviour (slip_file_name alone is metadata
 * and intentionally not treated as a usable slip).
 */
export function paymentHasSlip(payment: SlipFields): boolean {
  return Boolean(payment.slip_submitted || payment.slip_storage_path || payment.slip_url);
}

export type SlipStatusKind = "none" | "waiting" | "submitted";

export type SlipStatusDisplay = {
  kind: SlipStatusKind;
  label: string;
  tone: StatusTone;
};

/**
 * Human-friendly slip status that distinguishes "no slip yet" from
 * "slip submitted and waiting for review". Pure presentation — derived only
 * from already-loaded payment fields.
 */
export function paymentSlipStatus(payment: SlipFields & { status?: string | null }): SlipStatusDisplay {
  if (!paymentHasSlip(payment)) {
    return { kind: "none", label: "ยังไม่มีสลิป", tone: "neutral" };
  }
  const status = (payment.status ?? "").toString().toLowerCase();
  if (status === "pending" || status === "pending_review") {
    return { kind: "waiting", label: "มีสลิป รอตรวจสอบ", tone: "warning" };
  }
  return { kind: "submitted", label: "มีสลิปแล้ว", tone: "info" };
}

export type AmountMatchKind = "match" | "mismatch" | "no_slip";

export type AmountMatch = {
  kind: AmountMatchKind;
  label: string;
  tone: StatusTone;
};

/**
 * Compare the customer's transferred amount against the order total using ONLY
 * data already present on the frontend. No amounts are invented or recomputed.
 * When there is no slip we cannot meaningfully compare a transfer amount, so we
 * report "ยังไม่มีข้อมูลสลิป" instead of guessing.
 */
export function compareAmountToOrder(
  orderTotal: number | null | undefined,
  payment: SlipFields & { amount?: number | null },
): AmountMatch {
  if (!paymentHasSlip(payment)) {
    return { kind: "no_slip", label: "ยังไม่มีข้อมูลสลิป", tone: "neutral" };
  }
  const total = Number(orderTotal ?? NaN);
  const paid = Number(payment.amount ?? NaN);
  if (!Number.isFinite(total) || !Number.isFinite(paid)) {
    return { kind: "no_slip", label: "ยังไม่มีข้อมูลสลิป", tone: "neutral" };
  }
  // Small tolerance to avoid false mismatches from floating-point rounding.
  if (Math.abs(total - paid) < 0.01) {
    return { kind: "match", label: "ยอดตรงกับออเดอร์", tone: "success" };
  }
  return { kind: "mismatch", label: "ยอดไม่ตรงกับออเดอร์", tone: "danger" };
}

// ─── Friendly Thai error messages ───────────────────────────────────────────
//
// Map known backend/payment error enums to friendly Thai. Unknown values fall
// back to a generic message so raw internal traces, tokens, or env-style values
// are never surfaced to Staff.

export const GENERIC_PAYMENT_ERROR = "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลอีกครั้ง";

const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  payment_already_reviewed: "รายการชำระเงินนี้ถูกตรวจสอบแล้ว",
  already_reviewed: "รายการชำระเงินนี้ถูกตรวจสอบแล้ว",
  payment_not_pending: "รายการชำระเงินนี้ถูกตรวจสอบแล้ว",
  payment_already_approved: "รายการชำระเงินนี้ถูกตรวจสอบแล้ว",
  payment_already_rejected: "รายการชำระเงินนี้ถูกตรวจสอบแล้ว",
  invalid_payment_status: "รายการชำระเงินนี้ถูกตรวจสอบแล้ว",
  slip_not_submitted: "ยังไม่มีสลิปให้ตรวจสอบ",
  missing_slip: "ยังไม่มีสลิปให้ตรวจสอบ",
  payment_missing_slip: "ยังไม่มีสลิปให้ตรวจสอบ",
  no_slip: "ยังไม่มีสลิปให้ตรวจสอบ",
  insufficient_role: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับรายการชำระเงินนี้",
  insufficient_role_for_status: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับรายการชำระเงินนี้",
  forbidden: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับรายการชำระเงินนี้",
  unauthorized: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับรายการชำระเงินนี้",
  reject_reason_required: "กรุณาระบุเหตุผลการปฏิเสธก่อนกดปฏิเสธ",
};

/**
 * Translate a backend payment error into a Staff-friendly Thai message.
 * Returns the generic message for anything unrecognised so we never leak raw
 * internals.
 */
export function friendlyPaymentError(message?: string | null): string {
  if (!message) return GENERIC_PAYMENT_ERROR;
  const key = message.toString().trim().toLowerCase();
  return PAYMENT_ERROR_MESSAGES[key] ?? GENERIC_PAYMENT_ERROR;
}
