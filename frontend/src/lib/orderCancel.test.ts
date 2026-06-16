import { describe, expect, it } from "vitest";
import {
  friendlyCancelError,
  isClearlyUncancellableByStaff,
  STAFF_CANCEL_BLOCKED_HINT,
} from "./orderCancel";

describe("isClearlyUncancellableByStaff", () => {
  it("blocks statuses Staff must never cancel", () => {
    for (const status of [
      "paid",
      "accepted",
      "preparing",
      "ready",
      "ready_for_pickup",
      "completed",
      "fulfilled",
      "cancelled",
      "voided",
      "rejected",
      "archived",
    ]) {
      expect(isClearlyUncancellableByStaff(status)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isClearlyUncancellableByStaff("PAID")).toBe(true);
    expect(isClearlyUncancellableByStaff("Completed")).toBe(true);
  });

  it("allows cancel-attemptable / uncertain statuses (defers to backend)", () => {
    for (const status of [
      "pending_payment",
      "waiting_payment_review",
      "pending_review",
      "pending",
      "unpaid",
      "draft",
      "",
      null,
      undefined,
    ]) {
      expect(isClearlyUncancellableByStaff(status)).toBe(false);
    }
  });
});

describe("friendlyCancelError", () => {
  it("maps known backend enums to Thai copy", () => {
    expect(friendlyCancelError("insufficient_role_for_status")).toBe(
      "ไม่สามารถยกเลิกออเดอร์นี้ได้ เนื่องจากสถานะไม่อยู่ในเงื่อนไขที่ Staff ยกเลิกได้",
    );
    expect(friendlyCancelError("staff_cannot_cancel_paid_order")).toBe(
      "ออเดอร์นี้ชำระเงินแล้ว Staff ไม่สามารถยกเลิกได้",
    );
    expect(friendlyCancelError("order_already_completed")).toBe(
      "ออเดอร์นี้เสร็จสิ้นแล้ว ไม่สามารถยกเลิกได้",
    );
    expect(friendlyCancelError("order_already_archived")).toBe(
      "ออเดอร์นี้ถูกยกเลิกหรือจัดเก็บแล้ว",
    );
  });

  it("returns null for unknown / empty messages so callers can fall back", () => {
    expect(friendlyCancelError("some_other_error")).toBeNull();
    expect(friendlyCancelError("")).toBeNull();
    expect(friendlyCancelError(undefined)).toBeNull();
  });
});

describe("STAFF_CANCEL_BLOCKED_HINT", () => {
  it("is a non-empty helper string", () => {
    expect(STAFF_CANCEL_BLOCKED_HINT.length).toBeGreaterThan(0);
  });
});
