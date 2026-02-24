// ─── Payment Gateway Types ────────────────────────────────────────────────────
// Strategy Pattern interface for payment gateway adapters.
// All UI code talks to PaymentGatewayAdapter — never to Omise SDK directly.

/** Supported payment methods */
export type PaymentMethod = "credit_card" | "promptpay";

/** Credit card details for tokenization */
export interface CardDetails {
  name: string;
  number: string;
  expiration_month: number;
  expiration_year: number;
  security_code: string;
}

/** Request to create a payment token (client-side) */
export interface TokenRequest {
  method: PaymentMethod;
  /** Required when method = "credit_card" */
  card?: CardDetails;
}

/** Successfully created token */
export interface TokenResult {
  token: string;
}

/** Request to create a charge */
export interface ChargeRequest {
  token: string;
  /** Amount in satang (THB × 100). e.g. ฿199 = 19900 */
  amount: number;
  currency: "THB";
  invoiceId: string;
  description: string;
  method: PaymentMethod;
}

/** Charge status */
export type ChargeStatus = "successful" | "pending" | "failed" | "expired";

/** Result from creating or querying a charge */
export interface ChargeResult {
  chargeId: string;
  status: ChargeStatus;
  method: PaymentMethod;
  /** Amount in satang */
  amount: number;
  /** PromptPay QR code data URI (only when method = "promptpay" & status = "pending") */
  qrCodeUri?: string;
  /** Human-readable failure message */
  failureMessage?: string;
  /** ISO timestamp of charge creation */
  createdAt: string;
}

// ─── Gateway Adapter Interface ────────────────────────────────────────────────

export interface PaymentGatewayAdapter {
  /** Adapter display name (e.g. "Omise", "Mock") */
  readonly name: string;

  /** Create a payment token from card details or PromptPay source (client-side safe) */
  createToken(req: TokenRequest): Promise<TokenResult>;

  /** Create a charge using a token (production: calls backend API) */
  createCharge(req: ChargeRequest): Promise<ChargeResult>;

  /** Retrieve charge status by ID */
  getCharge(chargeId: string): Promise<ChargeResult>;
}
