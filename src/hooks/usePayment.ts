// ─── usePayment Hook ──────────────────────────────────────────────────────────
// Wraps the payment gateway for React components.
// Handles loading state, error state, and charge polling for PromptPay.

import { useState, useCallback, useRef } from "react";
import { gateway } from "@/services/paymentGateway";
import type {
  PaymentMethod,
  TokenRequest,
  ChargeResult,
} from "@/services/paymentGateway";

interface UsePaymentReturn {
  /** Process a full payment: tokenize → charge → return result */
  processPayment: (params: ProcessPaymentParams) => Promise<ChargeResult>;
  /** Poll a pending charge (e.g. PromptPay QR) until it completes */
  pollCharge: (chargeId: string) => Promise<ChargeResult>;
  /** Current charge result (null before first payment) */
  charge: ChargeResult | null;
  /** True while processing or polling */
  isProcessing: boolean;
  /** Error message if last operation failed */
  error: string | null;
  /** Clear error and charge state */
  reset: () => void;
}

interface ProcessPaymentParams {
  method: PaymentMethod;
  amount: number;
  invoiceId: string;
  description: string;
  card?: TokenRequest["card"];
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // 60 seconds max wait

export function usePayment(): UsePaymentReturn {
  const [charge, setCharge] = useState<ChargeResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    setCharge(null);
    setError(null);
    setIsProcessing(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const processPayment = useCallback(
    async (params: ProcessPaymentParams): Promise<ChargeResult> => {
      setIsProcessing(true);
      setError(null);
      setCharge(null);

      try {
        // Step 1: Create token
        const tokenReq: TokenRequest = {
          method: params.method,
          card: params.card,
        };
        const { token } = await gateway.createToken(tokenReq);

        // Step 2: Create charge
        const result = await gateway.createCharge({
          token,
          amount: params.amount,
          currency: "THB",
          invoiceId: params.invoiceId,
          description: params.description,
          method: params.method,
        });

        setCharge(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "การชำระเงินล้มเหลว";
        setError(msg);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const pollCharge = useCallback(
    (chargeId: string): Promise<ChargeResult> => {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        setIsProcessing(true);

        pollRef.current = setInterval(async () => {
          attempts++;

          try {
            const result = await gateway.getCharge(chargeId);
            setCharge(result);

            if (result.status !== "pending" || attempts >= MAX_POLLS) {
              clearInterval(pollRef.current!);
              pollRef.current = null;
              setIsProcessing(false);

              if (result.status === "pending") {
                const timeoutErr = "หมดเวลาการชำระเงิน กรุณาลองใหม่";
                setError(timeoutErr);
                reject(new Error(timeoutErr));
              } else {
                resolve(result);
              }
            }
          } catch (err) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setIsProcessing(false);
            const msg =
              err instanceof Error ? err.message : "ตรวจสอบสถานะล้มเหลว";
            setError(msg);
            reject(err);
          }
        }, POLL_INTERVAL_MS);
      });
    },
    []
  );

  return { processPayment, pollCharge, charge, isProcessing, error, reset };
}
