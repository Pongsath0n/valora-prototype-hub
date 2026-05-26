// ─── Omise Payment Gateway (Placeholder) ─────────────────────────────────────
// Real Omise adapter — requires a backend server for Charge API (secret key).
// Client-side tokenization works with Omise.js + public key.
//
// This file is a compile-safe placeholder. It will throw on createCharge()
// until a backend API is available.
//
// When backend is ready, implement:
//   createCharge → POST /api/payments/charge { token, amount, ... }
//   getCharge    → GET  /api/payments/charge/:id

import type {
  PaymentGatewayAdapter,
  TokenRequest,
  TokenResult,
  ChargeRequest,
  ChargeResult,
} from "./types";

// ─── Omise.js CDN Loader ──────────────────────────────────────────────────────

declare global {
  interface Window {
    Omise?: {
      setPublicKey: (key: string) => void;
      createToken: (
        type: "card",
        cardInfo: Record<string, unknown>,
        callback: (statusCode: number, response: { id?: string; message?: string }) => void
      ) => void;
      createSource: (
        type: string,
        sourceInfo: Record<string, unknown>,
        callback: (statusCode: number, response: { id?: string; message?: string }) => void
      ) => void;
    };
  }
}

let scriptLoaded = false;

function loadOmiseJs(): Promise<void> {
  if (scriptLoaded && window.Omise) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (window.Omise) {
      scriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.omise.co/omise.js";
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Omise.js"));
    document.head.appendChild(script);
  });
}

function getPublicKey(): string {
  const key = import.meta.env.VITE_OMISE_PUBLIC_KEY;
  if (!key) throw new Error("VITE_OMISE_PUBLIC_KEY is not set in .env");
  return key;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export const omiseGateway: PaymentGatewayAdapter = {
  name: "Omise",

  async createToken(req: TokenRequest): Promise<TokenResult> {
    await loadOmiseJs();
    const omise = window.Omise!;
    omise.setPublicKey(getPublicKey());

    return new Promise((resolve, reject) => {
      if (req.method === "credit_card") {
        if (!req.card) return reject(new Error("Card details required"));

        omise.createToken(
          "card",
          {
            name: req.card.name,
            number: req.card.number,
            expiration_month: req.card.expiration_month,
            expiration_year: req.card.expiration_year,
            security_code: req.card.security_code,
          },
          (status, response) => {
            if (status !== 200 || !response.id) {
              reject(new Error(response.message || "Token creation failed"));
              return;
            }
            resolve({ token: response.id });
          }
        );
      } else if (req.method === "promptpay") {
        omise.createSource(
          "promptpay",
          { type: "promptpay", amount: 0, currency: "THB" },
          (status, response) => {
            if (status !== 200 || !response.id) {
              reject(new Error(response.message || "Source creation failed"));
              return;
            }
            resolve({ token: response.id });
          }
        );
      } else {
        reject(new Error(`Unsupported payment method: ${req.method}`));
      }
    });
  },

  async createCharge(_req: ChargeRequest): Promise<ChargeResult> {
    // ⚠️ Charge creation requires Secret Key — must go through backend.
    // When backend is ready, this will POST to /api/payments/charge
    throw new Error(
      "[Omise Gateway] createCharge() requires a backend server. " +
      "Implement POST /api/payments/charge on your backend with Secret Key. " +
      "Use the 'mock' gateway for demo/prototyping."
    );
  },

  async getCharge(_chargeId: string): Promise<ChargeResult> {
    // ⚠️ Charge retrieval also requires Secret Key on server.
    throw new Error(
      "[Omise Gateway] getCharge() requires a backend server. " +
      "Implement GET /api/payments/charge/:id on your backend."
    );
  },
};
