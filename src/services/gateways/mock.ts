// ─── Mock Payment Gateway ─────────────────────────────────────────────────────
// Simulates Omise payment flow for demo/prototype purposes.
// Card payments: always succeed immediately.
// PromptPay payments: return pending + QR, auto-succeed on getCharge().

import type {
  PaymentGatewayAdapter,
  TokenRequest,
  TokenResult,
  ChargeRequest,
  ChargeResult,
  ChargeStatus,
} from "./types";

// In-memory charge store (cleared on page reload)
const chargeStore = new Map<string, ChargeResult>();

function genId(prefix: string): string {
  return `${prefix}_test_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Minimal SVG-based QR placeholder for PromptPay demo
function generateMockQrDataUri(amount: number): string {
  const amountText = `฿${(amount / 100).toLocaleString()}`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240">
      <rect width="200" height="240" fill="#fff" rx="12"/>
      <rect x="20" y="20" width="160" height="160" fill="#f0f0f0" rx="8"/>
      <text x="100" y="90" text-anchor="middle" font-family="monospace" font-size="12" fill="#666">MOCK QR CODE</text>
      <text x="100" y="115" text-anchor="middle" font-family="monospace" font-size="11" fill="#999">PromptPay Demo</text>
      <!-- Grid pattern to look like QR -->
      ${Array.from({ length: 8 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) =>
          Math.random() > 0.4
            ? `<rect x="${35 + c * 16}" y="${30 + r * 16}" width="12" height="12" fill="#333" rx="1"/>`
            : ""
        ).join("")
      ).join("")}
      <text x="100" y="210" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1e2a45">${amountText}</text>
      <text x="100" y="230" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#999">สแกนเพื่อชำระเงิน (Demo)</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export const mockGateway: PaymentGatewayAdapter = {
  name: "Mock",

  async createToken(req: TokenRequest): Promise<TokenResult> {
    await delay(400); // Simulate network latency

    if (req.method === "credit_card" && !req.card) {
      throw new Error("Card details required for credit_card method");
    }

    // Validate card number format (basic)
    if (req.method === "credit_card" && req.card) {
      const num = req.card.number.replace(/\s/g, "");
      if (num.length < 13 || num.length > 19) {
        throw new Error("หมายเลขบัตรไม่ถูกต้อง");
      }
    }

    return { token: genId("tokn") };
  },

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    await delay(800); // Simulate processing

    if (!req.token) throw new Error("Token is required");
    if (req.amount <= 0) throw new Error("Amount must be positive");

    const chargeId = genId("chrg");
    const now = new Date().toISOString();

    let result: ChargeResult;

    if (req.method === "credit_card") {
      // Card charges: always succeed in mock
      result = {
        chargeId,
        status: "successful",
        method: "credit_card",
        amount: req.amount,
        createdAt: now,
      };
    } else {
      // PromptPay: returns pending + QR code
      result = {
        chargeId,
        status: "pending",
        method: "promptpay",
        amount: req.amount,
        qrCodeUri: generateMockQrDataUri(req.amount),
        createdAt: now,
      };
    }

    chargeStore.set(chargeId, result);
    return result;
  },

  async getCharge(chargeId: string): Promise<ChargeResult> {
    await delay(300);

    const charge = chargeStore.get(chargeId);
    if (!charge) {
      throw new Error(`Charge ${chargeId} not found`);
    }

    // Auto-complete PromptPay after first poll (simulates user scanning QR)
    if (charge.status === "pending" && charge.method === "promptpay") {
      const updated: ChargeResult = {
        ...charge,
        status: "successful" as ChargeStatus,
        qrCodeUri: undefined,
      };
      chargeStore.set(chargeId, updated);
      return updated;
    }

    return charge;
  },
};
