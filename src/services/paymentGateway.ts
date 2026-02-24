// ─── Payment Gateway Factory ──────────────────────────────────────────────────
// Single entry point for all payment operations.
// Default: mock gateway (demo). Switch via VITE_PAYMENT_GATEWAY env var.

import type { PaymentGatewayAdapter } from "./gateways/types";
import { mockGateway } from "./gateways/mock";
import { omiseGateway } from "./gateways/omise";

export type GatewayName = "mock" | "omise";

const ADAPTERS: Record<GatewayName, PaymentGatewayAdapter> = {
  mock: mockGateway,
  omise: omiseGateway,
};

function resolveGatewayName(): GatewayName {
  const env = (import.meta.env.VITE_PAYMENT_GATEWAY ?? "mock") as string;
  if (env in ADAPTERS) return env as GatewayName;

  console.warn(
    `[PaymentGateway] Unknown gateway "${env}", falling back to "mock".`
  );
  return "mock";
}

/** Active payment gateway singleton */
export const gateway: PaymentGatewayAdapter = ADAPTERS[resolveGatewayName()];

/** Re-export types for convenience */
export type {
  PaymentMethod,
  TokenRequest,
  ChargeRequest,
  ChargeResult,
  ChargeStatus,
  PaymentGatewayAdapter,
} from "./gateways/types";
