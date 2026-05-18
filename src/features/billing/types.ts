// ─── Plan & Billing Domain Types ──────────────────────────────────────────────

export type PlanId = "free" | "starter" | "pro";

/** Overall purchase status for the user */
export type PlanStatus = "FREE" | "PENDING" | "ACTIVE";

/** Invoice payment status */
export type InvoiceStatus = "UNPAID" | "PAID" | "EXPIRED";

/** Status of a payment proof submission */
export type SubmissionStatus =
  | "PAYMENT_SUBMITTED"
  | "VERIFIED"
  | "REJECTED";

/** Payment method used for gateway charges */
export type PaymentMethod = "credit_card" | "promptpay" | "bank_transfer";

/** Notification event types for the notifier stub */
export type NotificationEvent =
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_REJECTED";

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface UserPlan {
  user_id: string;
  current_plan: PlanId;
  status: PlanStatus;
  /** ISO 8601 date string when the purchase was activated — null for FREE / PENDING */
  purchased_at: string | null;
}

export interface Invoice {
  invoice_id: string;
  user_id: string;
  plan: PlanId;
  /** THB amount before VAT (one-time) */
  amount: number;
  /** Unique reference code user quotes when transferring */
  reference_code: string;
  status: InvoiceStatus;
  created_at: string;
}

export interface PaymentSubmission {
  submission_id: string;
  invoice_id: string;
  /** Email of the user who submitted this payment */
  user_email?: string;
  /** THB amount the user claims to have paid */
  paid_amount: number;
  /** ISO date string of when user transferred */
  paid_at: string;
  /** Base64 data-URL of proof image, or null */
  proof_url: string | null;
  status: SubmissionStatus;
  admin_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  /** Payment method used (default: bank_transfer for legacy submissions) */
  payment_method?: PaymentMethod;
  /** Gateway charge ID (e.g. chrg_test_xxx) — null for manual transfers */
  gateway_charge_id?: string | null;
}


export interface PlanChangeRequest {
  request_id: string;
  user_id: string;
  plan: PlanId;
  invoice_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
}

// ─── Derived / view types ────────────────────────────────────────────────────

/** Convenience bundle for the admin approvals list */
export interface ApprovalRow {
  submission: PaymentSubmission;
  invoice: Invoice;
  userPlan: UserPlan;
}
