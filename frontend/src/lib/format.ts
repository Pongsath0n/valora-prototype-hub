// ─── THB / Currency ───────────────────────────────────────────────────────────

/**
 * Format a number as Thai Baht.
 * @example formatTHB(1999) → "฿1,999"
 */
export function formatTHB(amount: number, showSign = true): string {
  const formatted = Math.abs(amount).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return showSign ? `฿${formatted}` : formatted;
}

/**
 * Format THB with VAT included label.
 * @example formatTHBWithVAT(199) → "฿199 (+ VAT 7%)"
 */
export function formatTHBWithVAT(amount: number): string {
  return `${formatTHB(amount)} (+ VAT 7%)`;
}

// ─── Date / Time ─────────────────────────────────────────────────────────────

/**
 * Format ISO date string to Thai short date.
 * @example formatDate("2025-03-01T...") → "1 มี.ค. 2568"
 */
export function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

/**
 * Format ISO date string to Thai date + time.
 * @example formatDateTime("2025-03-01T10:30:00Z") → "1 มี.ค. 2568 17:30 น."
 */
export function formatDateTime(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

/**
 * Returns a human-readable "X วันที่เหลือ" string.
 * Negative = expired.
 */
export function daysRemaining(activeUntil: string | null): string {
  if (!activeUntil) return "—";
  const diff = Math.ceil(
    (new Date(activeUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff <= 0) return "หมดอายุแล้ว";
  if (diff === 1) return "เหลือ 1 วัน";
  return `เหลือ ${diff} วัน`;
}

// ─── Status Tone Helpers ───────────────────────────────────────────────────────

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export type StatusDisplay = {
  label: string;
  tone: StatusTone;
};

type StatusMap = Record<string, StatusDisplay>;

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").toString().toLowerCase();
}

function fallbackStatusDisplay(value: string | null | undefined): StatusDisplay {
  const raw = (value ?? "").toString().trim();
  if (!raw) {
    return { label: "ไม่ทราบสถานะ", tone: "neutral" };
  }
  return { label: `ไม่ทราบสถานะ (${raw})`, tone: "neutral" };
}

const ORDER_STATUS_MAP: StatusMap = {
  pending_payment: { label: "รอชำระเงิน", tone: "warning" },
  waiting_payment_review: { label: "รอตรวจสอบสลิป", tone: "warning" },
  pending_review: { label: "รอตรวจสอบสลิป", tone: "warning" },
  payment_uploaded: { label: "รอตรวจสอบสลิป", tone: "warning" },
  payment_submitted: { label: "รอตรวจสอบสลิป", tone: "warning" },
  pending: { label: "รอดำเนินการ", tone: "warning" },
  accepted: { label: "ร้านยืนยันแล้ว", tone: "info" },
  preparing: { label: "กำลังเตรียม", tone: "info" },
  ready: { label: "พร้อมรับ", tone: "info" },
  ready_for_pickup: { label: "พร้อมรับ (Legacy)", tone: "info" },
  completed: { label: "เสร็จสิ้น", tone: "success" },
  paid: { label: "ชำระเงินแล้ว", tone: "success" },
  fulfilled: { label: "จัดส่งแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิกแล้ว", tone: "danger" },
  voided: { label: "ยกเลิก (Void)", tone: "danger" },
  rejected: { label: "ถูกปฏิเสธ", tone: "danger" },
  draft: { label: "ฉบับร่าง", tone: "neutral" },
};

const PAYMENT_STATUS_MAP: StatusMap = {
  pending_payment: { label: "รอชำระเงิน", tone: "warning" },
  pending: { label: "รอชำระเงิน", tone: "warning" },
  unpaid: { label: "ยังไม่ชำระ", tone: "warning" },
  waiting_payment_review: { label: "รอตรวจสอบสลิป", tone: "warning" },
  pending_review: { label: "รอตรวจสอบสลิป", tone: "warning" },
  payment_uploaded: { label: "รอตรวจสอบสลิป", tone: "warning" },
  payment_submitted: { label: "รอตรวจสอบสลิป", tone: "warning" },
  paid: { label: "ชำระเงินแล้ว", tone: "success" },
  approved: { label: "ยืนยันการชำระแล้ว", tone: "success" },
  completed: { label: "ชำระเสร็จสิ้น", tone: "success" },
  rejected: { label: "สลิปไม่ผ่าน ต้องอัปโหลดใหม่", tone: "danger" },
  cancelled: { label: "ยกเลิกรายการชำระ", tone: "danger" },
  refunded: { label: "คืนเงินแล้ว", tone: "info" },
};

function resolveStatusDisplay(map: StatusMap, value: string | null | undefined): StatusDisplay {
  const key = normalizeStatus(value);
  if (!key) return fallbackStatusDisplay(value);
  return map[key] ?? fallbackStatusDisplay(value);
}

export function getOrderStatusDisplay(status: string | null | undefined): StatusDisplay {
  return resolveStatusDisplay(ORDER_STATUS_MAP, status);
}

export function formatOrderStatus(status: string | null | undefined): string {
  return getOrderStatusDisplay(status).label;
}

export function orderStatusTone(status: string | null | undefined): StatusTone {
  return getOrderStatusDisplay(status).tone;
}

export function getPaymentStatusDisplay(status: string | null | undefined): StatusDisplay {
  return resolveStatusDisplay(PAYMENT_STATUS_MAP, status);
}

export function formatPaymentStatus(status: string | null | undefined): string {
  return getPaymentStatusDisplay(status).label;
}

export function paymentStatusTone(status: string | null | undefined): StatusTone {
  return getPaymentStatusDisplay(status).tone;
}

/**
 * Friendly Thai labels for the "next status" action dropdown so Staff see an
 * action verb instead of a raw backend enum (e.g. "waiting_payment_review").
 * The enum value is still sent to the backend unchanged; only the label shown
 * to the user is mapped here.
 */
const NEXT_STATUS_ACTION_MAP: Record<string, string> = {
  waiting_payment_review: "ส่งเข้าตรวจสลิป",
  pending_review: "ส่งเข้าตรวจสลิป",
  accepted: "ยืนยันรับออเดอร์",
  preparing: "เริ่มเตรียม",
  ready: "เปลี่ยนเป็นพร้อมรับ",
  ready_for_pickup: "เปลี่ยนเป็นพร้อมรับ",
  completed: "ปิดออเดอร์ (เสร็จสิ้น)",
  cancelled: "ยกเลิกออเดอร์",
};

export function formatNextStatusAction(status: string | null | undefined): string {
  const key = normalizeStatus(status);
  return NEXT_STATUS_ACTION_MAP[key] ?? formatOrderStatus(status);
}

export function formatBooleanStatus(value: boolean | null | undefined, options?: { trueLabel?: string; falseLabel?: string }): string {
  const { trueLabel = "ใช้งาน", falseLabel = "ปิดใช้งาน" } = options ?? {};
  return value ? trueLabel : falseLabel;
}

// ─── Status Labels ────────────────────────────────────────────────────────────

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  PAYMENT_SUBMITTED: "รอตรวจสอบ",
  VERIFIED: "ยืนยันแล้ว",
  REJECTED: "ปฏิเสธ",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  UNPAID: "ยังไม่ชำระ",
  PAID: "ชำระแล้ว",
  EXPIRED: "หมดอายุ",
};

const PLAN_STATUS_LABELS: Record<string, string> = {
  FREE: "แผนฟรี",
  PENDING: "รอการตรวจสอบ",
  ACTIVE: "ใช้งานอยู่",
  EXPIRED: "หมดอายุ",
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: "รายเดือน",
  yearly: "รายปี",
};

export function formatSubmissionStatus(status: string): string {
  return SUBMISSION_STATUS_LABELS[status] ?? status;
}

export function formatInvoiceStatus(status: string): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}

export function formatPlanStatus(status: string): string {
  return PLAN_STATUS_LABELS[status] ?? status;
}

export function formatPlanLabel(plan: string): string {
  return PLAN_LABELS[plan] ?? plan;
}

export function formatCycleLabel(cycle: string): string {
  return CYCLE_LABELS[cycle] ?? cycle;
}

/** Status badge color class mapping */
export function submissionStatusColor(status: string): string {
  const map: Record<string, string> = {
    PAYMENT_SUBMITTED: "bg-warning/15 text-warning",
    VERIFIED: "bg-success/15 text-success",
    REJECTED: "bg-destructive/15 text-destructive",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

export function planStatusColor(status: string): string {
  const map: Record<string, string> = {
    FREE: "bg-muted text-muted-foreground",
    PENDING: "bg-warning/15 text-warning",
    ACTIVE: "bg-success/15 text-success",
    EXPIRED: "bg-destructive/15 text-destructive",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}
