import { describe, expect, it } from "vitest";
import {
  GENERIC_PAYMENT_ERROR,
  compareAmountToOrder,
  friendlyPaymentError,
  paymentHasSlip,
  paymentSlipStatus,
} from "./paymentReview";

describe("paymentHasSlip", () => {
  it("returns false when no slip fields are present", () => {
    expect(paymentHasSlip({})).toBe(false);
  });

  it("returns true when any slip field is present", () => {
    expect(paymentHasSlip({ slip_submitted: true })).toBe(true);
    expect(paymentHasSlip({ slip_storage_path: "path/to/slip" })).toBe(true);
    expect(paymentHasSlip({ slip_url: "https://x/y.jpg" })).toBe(true);
  });
});

describe("paymentSlipStatus", () => {
  it("reports no slip", () => {
    expect(paymentSlipStatus({}).kind).toBe("none");
    expect(paymentSlipStatus({}).label).toBe("ยังไม่มีสลิป");
  });

  it("reports slip waiting for review when pending", () => {
    const status = paymentSlipStatus({ slip_submitted: true, status: "pending_review" });
    expect(status.kind).toBe("waiting");
    expect(status.tone).toBe("warning");
  });

  it("reports submitted slip for non-pending states", () => {
    const status = paymentSlipStatus({ slip_submitted: true, status: "paid" });
    expect(status.kind).toBe("submitted");
  });
});

describe("compareAmountToOrder", () => {
  it("flags no slip when there is nothing to compare", () => {
    expect(compareAmountToOrder(120, { amount: 120 }).kind).toBe("no_slip");
  });

  it("flags a match when amounts are equal (with slip)", () => {
    const result = compareAmountToOrder(120, { amount: 120, slip_submitted: true });
    expect(result.kind).toBe("match");
    expect(result.label).toBe("ยอดตรงกับออเดอร์");
    expect(result.tone).toBe("success");
  });

  it("tolerates floating point rounding", () => {
    expect(compareAmountToOrder(120.0, { amount: 120.004, slip_submitted: true }).kind).toBe("match");
  });

  it("flags a mismatch when amounts differ", () => {
    const result = compareAmountToOrder(120, { amount: 100, slip_submitted: true });
    expect(result.kind).toBe("mismatch");
    expect(result.label).toBe("ยอดไม่ตรงกับออเดอร์");
    expect(result.tone).toBe("danger");
  });

  it("treats non-finite values as not comparable", () => {
    expect(compareAmountToOrder(null, { amount: 120, slip_submitted: true }).kind).toBe("no_slip");
  });
});

describe("friendlyPaymentError", () => {
  it("maps known enums to friendly Thai", () => {
    expect(friendlyPaymentError("payment_already_reviewed")).toBe("รายการชำระเงินนี้ถูกตรวจสอบแล้ว");
    expect(friendlyPaymentError("slip_not_submitted")).toBe("ยังไม่มีสลิปให้ตรวจสอบ");
    expect(friendlyPaymentError("insufficient_role")).toBe(
      "บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับรายการชำระเงินนี้",
    );
  });

  it("is case-insensitive", () => {
    expect(friendlyPaymentError("PAYMENT_ALREADY_REVIEWED")).toBe("รายการชำระเงินนี้ถูกตรวจสอบแล้ว");
  });

  it("falls back to a generic message for unknown / raw values", () => {
    expect(friendlyPaymentError("some_internal_trace_xyz")).toBe(GENERIC_PAYMENT_ERROR);
    expect(friendlyPaymentError(undefined)).toBe(GENERIC_PAYMENT_ERROR);
    expect(friendlyPaymentError("")).toBe(GENERIC_PAYMENT_ERROR);
  });
});
