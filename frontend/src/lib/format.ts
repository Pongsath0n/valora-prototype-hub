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
