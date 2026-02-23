import type { NotificationEvent } from "@/features/billing/types";

// ─── Notifier Stub ────────────────────────────────────────────────────────────
// TODO: Replace console.log with real notification delivery:
//   - Email: POST /api/notifications/email
//   - Line Notify: POST https://notify-api.line.me/api/notify
//   - Webhook: POST to configured admin webhook URL

export interface NotificationPayload {
  event: NotificationEvent;
  submission_id?: string;
  invoice_id?: string;
  user_id?: string;
  plan?: string;
  amount?: number;
  reference_code?: string;
  admin_note?: string;
  approved_by?: string;
  timestamp: string;
}

/**
 * Sends an admin notification event.
 * Currently logs to console and stores in localStorage event log.
 *
 * TODO: Implement actual notification delivery (email, Line Notify, webhook).
 */
export function sendAdminNotification(payload: NotificationPayload): void {
  // Stub: log to console
  console.info(`[Valora Notify] ${payload.event}`, payload);

  // Persist to event log for audit trail (localStorage)
  try {
    const raw = localStorage.getItem("valora:notification_log");
    const log: NotificationPayload[] = raw ? JSON.parse(raw) : [];
    log.push(payload);
    // Keep last 100 events
    if (log.length > 100) log.splice(0, log.length - 100);
    localStorage.setItem("valora:notification_log", JSON.stringify(log));
  } catch {
    // Non-critical — ignore storage errors
  }
}

// ─── Convenience event constructors ──────────────────────────────────────────

export function notifyPaymentSubmitted(
  submission_id: string,
  invoice_id: string,
  user_id: string,
  plan: string,
  amount: number,
  reference_code: string
): void {
  sendAdminNotification({
    event: "PAYMENT_SUBMITTED",
    submission_id,
    invoice_id,
    user_id,
    plan,
    amount,
    reference_code,
    timestamp: new Date().toISOString(),
  });
}

export function notifyPaymentVerified(
  submission_id: string,
  invoice_id: string,
  user_id: string,
  approved_by: string,
  admin_note?: string
): void {
  sendAdminNotification({
    event: "PAYMENT_VERIFIED",
    submission_id,
    invoice_id,
    user_id,
    approved_by,
    admin_note,
    timestamp: new Date().toISOString(),
  });
}

export function notifyPaymentRejected(
  submission_id: string,
  invoice_id: string,
  user_id: string,
  approved_by: string,
  admin_note: string
): void {
  sendAdminNotification({
    event: "PAYMENT_REJECTED",
    submission_id,
    invoice_id,
    user_id,
    approved_by,
    admin_note,
    timestamp: new Date().toISOString(),
  });
}
