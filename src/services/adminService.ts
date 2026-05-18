import type {
  UserPlan,
  Invoice,
  PaymentSubmission,
  ApprovalRow,
  SubmissionStatus,
} from "@/features/billing/types";
import {
  invoiceService,
  submissionService,
  userPlanService,
} from "./billingService";
import {
  notifyPaymentVerified,
  notifyPaymentRejected,
} from "./notifier";

// ─── Query helpers ─────────────────────────────────────────────────────────────

export type ApprovalFilter = {
  status?: SubmissionStatus | "ALL";
  plan?: string;
};

/** Returns all approval rows (submission + invoice + userPlan) with optional filters */
export function getApprovalRows(filter: ApprovalFilter = {}): ApprovalRow[] {
  const submissions = submissionService.getAll();
  const rows: ApprovalRow[] = [];

  for (const sub of submissions) {
    const invoice = invoiceService.getById(sub.invoice_id);
    if (!invoice) continue;
    const userPlan = userPlanService.get(); // demo: single user

    // Filter by status
    if (filter.status && filter.status !== "ALL" && sub.status !== filter.status) continue;
    // Filter by plan
    if (filter.plan && filter.plan !== "ALL" && invoice.plan !== filter.plan) continue;

    rows.push({ submission: sub, invoice, userPlan });
  }

  // Sort: newest first
  return rows.sort(
    (a, b) =>
      new Date(b.submission.paid_at).getTime() -
      new Date(a.submission.paid_at).getTime()
  );
}

/** Returns a single approval row by submission_id */
export function getApprovalRow(submissionId: string): ApprovalRow | null {
  const sub = submissionService.getById(submissionId);
  if (!sub) return null;
  const invoice = invoiceService.getById(sub.invoice_id);
  if (!invoice) return null;
  const userPlan = userPlanService.get();
  return { submission: sub, invoice, userPlan };
}

// ─── Atomic Approval ──────────────────────────────────────────────────────────

/**
 * Approves a payment submission and activates the user's plan (one-time purchase).
 *
 * Steps:
 * 1. Mark submission as VERIFIED
 * 2. Mark invoice as PAID
 * 3. Update UserPlan to ACTIVE with purchased_at timestamp
 * 4. Fire PAYMENT_VERIFIED notification
 */
export function approvePayment(
  submissionId: string,
  adminEmail: string,
  adminNote: string
): { ok: true; userPlan: UserPlan } | { ok: false; error: string } {
  const row = getApprovalRow(submissionId);
  if (!row) return { ok: false, error: "ไม่พบข้อมูลการชำระเงิน" };
  if (row.submission.status === "VERIFIED") {
    return { ok: false, error: "การชำระเงินนี้ได้รับการยืนยันแล้ว" };
  }

  const now = new Date().toISOString();

  // 1. Update submission
  const updatedSub: PaymentSubmission = {
    ...row.submission,
    status: "VERIFIED",
    admin_note: adminNote || null,
    approved_by: adminEmail,
    approved_at: now,
  };
  submissionService.update(updatedSub);

  // 2. Update invoice
  const updatedInvoice: Invoice = { ...row.invoice, status: "PAID" };
  invoiceService.update(updatedInvoice);

  // 3. Activate user plan (one-time purchase — no expiry)
  const updatedPlan: UserPlan = {
    ...row.userPlan,
    current_plan: row.invoice.plan,
    status: "ACTIVE",
    purchased_at: now,
  };
  userPlanService.set(updatedPlan);

  // 4. Notify
  notifyPaymentVerified(
    submissionId,
    row.invoice.invoice_id,
    row.userPlan.user_id,
    adminEmail,
    adminNote
  );

  return { ok: true, userPlan: updatedPlan };
}

/**
 * Rejects a payment submission.
 * Requires a non-empty reason.
 * Does NOT change UserPlan (remains PENDING until user re-submits or cancels).
 */
export function rejectPayment(
  submissionId: string,
  adminEmail: string,
  reason: string
): { ok: true } | { ok: false; error: string } {
  if (!reason.trim()) {
    return { ok: false, error: "กรุณาระบุเหตุผลการปฏิเสธ" };
  }

  const sub = submissionService.getById(submissionId);
  if (!sub) return { ok: false, error: "ไม่พบข้อมูลการชำระเงิน" };
  if (sub.status === "VERIFIED") {
    return { ok: false, error: "ไม่สามารถปฏิเสธรายการที่ยืนยันแล้ว" };
  }

  const now = new Date().toISOString();

  const updated: PaymentSubmission = {
    ...sub,
    status: "REJECTED",
    admin_note: reason,
    approved_by: adminEmail,
    approved_at: now,
  };
  submissionService.update(updated);

  // Reset UserPlan pending status on rejection
  const plan = userPlanService.get();
  if (plan.status === "PENDING") {
    userPlanService.set({ ...plan, status: "FREE" });
  }

  // Notify
  const invoice = invoiceService.getById(sub.invoice_id);
  notifyPaymentRejected(
    submissionId,
    sub.invoice_id,
    invoice?.user_id ?? "",
    adminEmail,
    reason
  );

  return { ok: true };
}
