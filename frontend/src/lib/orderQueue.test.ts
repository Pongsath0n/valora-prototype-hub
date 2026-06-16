import { describe, expect, it } from "vitest";
import {
  compareOrdersFifo,
  comparePaymentsFifo,
  isCancelledOrArchivedOrder,
  isCancelledOrArchivedStatus,
  shouldShowPaymentInReviewQueue,
} from "./orderQueue";

describe("isCancelledOrArchivedStatus", () => {
  it("flags cancelled / voided / archived statuses", () => {
    expect(isCancelledOrArchivedStatus("cancelled")).toBe(true);
    expect(isCancelledOrArchivedStatus("VOIDED")).toBe(true);
    expect(isCancelledOrArchivedStatus("archived")).toBe(true);
  });

  it("does not flag active statuses", () => {
    expect(isCancelledOrArchivedStatus("preparing")).toBe(false);
    expect(isCancelledOrArchivedStatus("waiting_payment_review")).toBe(false);
    expect(isCancelledOrArchivedStatus(null)).toBe(false);
  });
});

describe("isCancelledOrArchivedOrder", () => {
  it("uses the archived flag and the status string", () => {
    expect(isCancelledOrArchivedOrder({ status: "preparing", archived: true })).toBe(true);
    expect(isCancelledOrArchivedOrder({ status: "cancelled" })).toBe(true);
    expect(isCancelledOrArchivedOrder({ status: "preparing", archived: false })).toBe(false);
  });
});

describe("shouldShowPaymentInReviewQueue", () => {
  it("excludes payments whose order is cancelled / archived", () => {
    expect(
      shouldShowPaymentInReviewQueue({ status: "pending_review", order_status: "cancelled", slip_submitted: true }),
    ).toBe(false);
  });

  it("excludes already-finalised payments", () => {
    expect(shouldShowPaymentInReviewQueue({ status: "approved", slip_submitted: true })).toBe(false);
    expect(shouldShowPaymentInReviewQueue({ status: "rejected", slip_submitted: true })).toBe(false);
    expect(shouldShowPaymentInReviewQueue({ status: "paid" })).toBe(false);
  });

  it("includes payments with a submitted slip", () => {
    expect(shouldShowPaymentInReviewQueue({ status: "pending", slip_submitted: true })).toBe(true);
    expect(shouldShowPaymentInReviewQueue({ status: "pending", submitted_at: "2024-01-01T00:00:00Z" })).toBe(true);
    expect(shouldShowPaymentInReviewQueue({ status: "pending", slip_storage_path: "p/slip.jpg" })).toBe(true);
  });

  it("includes explicit review-pending statuses even without slip flags", () => {
    expect(shouldShowPaymentInReviewQueue({ status: "pending_review" })).toBe(true);
    expect(shouldShowPaymentInReviewQueue({ status: "waiting_payment_review" })).toBe(true);
  });

  it("excludes a pending payment with no slip yet (no-slip state)", () => {
    expect(shouldShowPaymentInReviewQueue({ status: "pending", slip_submitted: false })).toBe(false);
  });
});

describe("compareOrdersFifo", () => {
  it("orders oldest created_at first", () => {
    const a = { created_at: "2024-01-01T00:00:00Z", order_no: "A" };
    const b = { created_at: "2024-01-02T00:00:00Z", order_no: "B" };
    expect([b, a].sort(compareOrdersFifo).map((o) => o.order_no)).toEqual(["A", "B"]);
  });

  it("falls back to order_no ascending when timestamps tie", () => {
    const a = { created_at: "2024-01-01T00:00:00Z", order_no: "A002" };
    const b = { created_at: "2024-01-01T00:00:00Z", order_no: "A001" };
    expect([a, b].sort(compareOrdersFifo).map((o) => o.order_no)).toEqual(["A001", "A002"]);
  });

  it("pushes orders without created_at to the end", () => {
    const a = { created_at: null, order_no: "A" };
    const b = { created_at: "2024-01-02T00:00:00Z", order_no: "B" };
    expect([a, b].sort(compareOrdersFifo).map((o) => o.order_no)).toEqual(["B", "A"]);
  });
});

describe("comparePaymentsFifo", () => {
  it("orders earliest submitted slip first", () => {
    const a = { submitted_at: "2024-01-02T00:00:00Z", order_no: "A" };
    const b = { submitted_at: "2024-01-01T00:00:00Z", order_no: "B" };
    expect([a, b].sort(comparePaymentsFifo).map((o) => o.order_no)).toEqual(["B", "A"]);
  });

  it("falls back to created_at then order_no", () => {
    const a = { created_at: "2024-01-01T00:00:00Z", order_no: "A002" };
    const b = { created_at: "2024-01-01T00:00:00Z", order_no: "A001" };
    expect([a, b].sort(comparePaymentsFifo).map((o) => o.order_no)).toEqual(["A001", "A002"]);
  });
});
