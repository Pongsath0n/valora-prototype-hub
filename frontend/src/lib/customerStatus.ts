/**
 * Customer-facing status labels.
 *
 * Customers must never see raw internal status codes such as
 * `waiting_payment_review` or `pending_review`. This module maps every known
 * internal order/payment status to a Thai customer-friendly label and provides
 * a safe generic fallback for unknown codes. Staff/admin pages keep using
 * lib/format.ts, which may show more technical labels.
 */

export type CustomerStatusTone = "success" | "warning" | "info" | "danger" | "muted";

export type CustomerStatusLabel = {
  label: string;
  tone: CustomerStatusTone;
};

const ORDER_STATUS_LABELS: Record<string, CustomerStatusLabel> = {
  draft: { label: "กำลังสร้างออเดอร์", tone: "muted" },
  pending: { label: "รอร้านตรวจสอบออเดอร์", tone: "warning" },
  pending_review: { label: "รอร้านตรวจสอบออเดอร์", tone: "warning" },
  pending_payment: { label: "รอชำระเงิน", tone: "warning" },
  waiting_payment: { label: "รอชำระเงิน", tone: "warning" },
  waiting_payment_review: { label: "รอตรวจสอบการชำระเงิน", tone: "info" },
  accepted: { label: "ร้านยืนยันออเดอร์แล้ว", tone: "success" },
  confirmed: { label: "ร้านยืนยันออเดอร์แล้ว", tone: "success" },
  preparing: { label: "กำลังจัดเตรียม", tone: "info" },
  ready: { label: "พร้อมรับสินค้า", tone: "success" },
  ready_for_pickup: { label: "พร้อมรับสินค้า", tone: "success" },
  completed: { label: "รับสินค้าเรียบร้อย", tone: "success" },
  paid: { label: "ชำระเงินแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิกแล้ว", tone: "muted" },
  voided: { label: "ยกเลิกแล้ว", tone: "muted" },
};

const PAYMENT_STATUS_LABELS: Record<string, CustomerStatusLabel> = {
  pending: { label: "รอชำระเงิน", tone: "warning" },
  unpaid: { label: "รอชำระเงิน", tone: "warning" },
  waiting_payment: { label: "รอชำระเงิน", tone: "warning" },
  pending_review: { label: "รอตรวจสอบการชำระเงิน", tone: "info" },
  waiting_payment_review: { label: "รอตรวจสอบการชำระเงิน", tone: "info" },
  paid: { label: "ชำระเงินแล้ว", tone: "success" },
  payment_confirmed: { label: "ชำระเงินแล้ว", tone: "success" },
  rejected: { label: "หลักฐานการชำระเงินไม่ผ่าน", tone: "danger" },
  payment_rejected: { label: "หลักฐานการชำระเงินไม่ผ่าน", tone: "danger" },
  refunded: { label: "คืนเงินแล้ว", tone: "muted" },
};

const UNKNOWN_ORDER_STATUS: CustomerStatusLabel = { label: "กำลังดำเนินการ", tone: "info" };
const UNKNOWN_PAYMENT_STATUS: CustomerStatusLabel = { label: "กำลังตรวจสอบ", tone: "info" };

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Thai label for an order status. Never returns a raw internal code. */
export function customerOrderStatus(value: string | null | undefined): CustomerStatusLabel {
  return ORDER_STATUS_LABELS[normalize(value)] ?? UNKNOWN_ORDER_STATUS;
}

/** Thai label for a payment status. Never returns a raw internal code. */
export function customerPaymentStatus(value: string | null | undefined): CustomerStatusLabel {
  return PAYMENT_STATUS_LABELS[normalize(value)] ?? UNKNOWN_PAYMENT_STATUS;
}
