import type {
  UserPlan,
  Invoice,
  PaymentSubmission,
  PlanId,
} from "@/features/billing/types";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const KEY_USER_PLAN = "valora:user_plan";
const KEY_INVOICES = "valora:invoices";
const KEY_SUBMISSIONS = "valora:submissions";

// ─── Plan Pricing (one-time purchase) ─────────────────────────────────────────
export const PLAN_PRICES: Record<PlanId, number> = {
  free: 0,
  starter: 590,
  pro: 1490,
};

// ─── Demo Seed Data ───────────────────────────────────────────────────────────
const DEMO_USER_ID = "user_demo_001";
const DEMO_EMAIL = "demo@valora.app";

const SEED_USER_PLAN: UserPlan = {
  user_id: DEMO_USER_ID,
  current_plan: "free",
  status: "FREE",
  purchased_at: null,
};

const SEED_INVOICES: Invoice[] = [
  {
    invoice_id: "INV-001",
    user_id: DEMO_USER_ID,
    plan: "starter",
    amount: 590,
    reference_code: "VAL-20250223-4821",
    status: "UNPAID",
    created_at: "2026-02-23T06:00:00.000Z",
  },
  {
    invoice_id: "INV-002",
    user_id: DEMO_USER_ID,
    plan: "pro",
    amount: 1490,
    reference_code: "VAL-20250210-7734",
    status: "PAID",
    created_at: "2026-02-10T09:00:00.000Z",
  },
];

const SEED_SUBMISSIONS: PaymentSubmission[] = [
  {
    submission_id: "SUB-001",
    invoice_id: "INV-001",
    paid_amount: 590,
    paid_at: "2026-02-23T08:30:00.000Z",
    proof_url: null,
    status: "PAYMENT_SUBMITTED",
    admin_note: null,
    approved_by: null,
    approved_at: null,
  },
  {
    submission_id: "SUB-002",
    invoice_id: "INV-002",
    paid_amount: 1490,
    paid_at: "2026-02-10T12:00:00.000Z",
    proof_url: null,
    status: "VERIFIED",
    admin_note: "ตรวจสอบสลิปแล้ว — ตรงกับยอดโอน",
    approved_by: "admin@valora.app",
    approved_at: "2026-02-10T14:22:00.000Z",
  },
];

// ─── Local helpers ─────────────────────────────────────────────────────────────
function load<T>(key: string, seed: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : seed;
  } catch {
    return seed;
  }
}

function save<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function initSeed(): void {
  if (!localStorage.getItem(KEY_USER_PLAN)) save(KEY_USER_PLAN, SEED_USER_PLAN);
  if (!localStorage.getItem(KEY_INVOICES)) save(KEY_INVOICES, SEED_INVOICES);
  if (!localStorage.getItem(KEY_SUBMISSIONS)) save(KEY_SUBMISSIONS, SEED_SUBMISSIONS);
}
initSeed();

// ─── Unique ID generator ───────────────────────────────────────────────────────
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function genRefCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `VAL-${date}-${rand}`;
}

// ─── userPlanService ─────────────────────────────────────────────────────────
export const userPlanService = {
  get(): UserPlan {
    return load<UserPlan>(KEY_USER_PLAN, SEED_USER_PLAN);
  },
  set(plan: UserPlan): void {
    save(KEY_USER_PLAN, plan);
  },
  getUserId(): string {
    return this.get().user_id;
  },
  getDemoEmail(): string {
    return DEMO_EMAIL;
  },
};

// ─── invoiceService ───────────────────────────────────────────────────────────
export const invoiceService = {
  getAll(): Invoice[] {
    return load<Invoice[]>(KEY_INVOICES, SEED_INVOICES);
  },

  getById(id: string): Invoice | null {
    return this.getAll().find((inv) => inv.invoice_id === id) ?? null;
  },

  getByUser(userId: string): Invoice[] {
    return this.getAll().filter((inv) => inv.user_id === userId);
  },

  /** Create a new UNPAID invoice for a one-time plan purchase */
  create(plan: PlanId): Invoice {
    const amount = PLAN_PRICES[plan];
    const invoice: Invoice = {
      invoice_id: genId("INV"),
      user_id: userPlanService.getUserId(),
      plan,
      amount,
      reference_code: genRefCode(),
      status: "UNPAID",
      created_at: new Date().toISOString(),
    };
    const all = this.getAll();
    save(KEY_INVOICES, [...all, invoice]);
    return invoice;
  },

  update(updated: Invoice): void {
    const all = this.getAll().map((inv) =>
      inv.invoice_id === updated.invoice_id ? updated : inv
    );
    save(KEY_INVOICES, all);
  },

  getLatest(userId: string): Invoice | null {
    const byUser = this.getByUser(userId).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return byUser[0] ?? null;
  },
};

// ─── submissionService ────────────────────────────────────────────────────────
export const submissionService = {
  getAll(): PaymentSubmission[] {
    return load<PaymentSubmission[]>(KEY_SUBMISSIONS, SEED_SUBMISSIONS);
  },

  getById(id: string): PaymentSubmission | null {
    return this.getAll().find((s) => s.submission_id === id) ?? null;
  },

  getByInvoice(invoiceId: string): PaymentSubmission | null {
    return (
      this.getAll()
        .filter((s) => s.invoice_id === invoiceId)
        .sort((a, b) =>
          new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
        )[0] ?? null
    );
  },

  /** User submits payment proof */
  create(
    invoiceId: string,
    paidAmount: number,
    paidAt: string,
    proofUrl: string | null
  ): PaymentSubmission {
    const sub: PaymentSubmission = {
      submission_id: genId("SUB"),
      invoice_id: invoiceId,
      paid_amount: paidAmount,
      paid_at: paidAt,
      proof_url: proofUrl,
      status: "PAYMENT_SUBMITTED",
      admin_note: null,
      approved_by: null,
      approved_at: null,
    };
    const all = this.getAll();
    save(KEY_SUBMISSIONS, [...all, sub]);

    // Update UserPlan status → PENDING
    const plan = userPlanService.get();
    userPlanService.set({ ...plan, status: "PENDING" });

    return sub;
  },

  update(updated: PaymentSubmission): void {
    const all = this.getAll().map((s) =>
      s.submission_id === updated.submission_id ? updated : s
    );
    save(KEY_SUBMISSIONS, all);
  },
};
