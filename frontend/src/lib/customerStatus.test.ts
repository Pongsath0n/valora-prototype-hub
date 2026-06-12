import { describe, expect, it } from "vitest";
import { customerOrderStatus, customerPaymentStatus } from "./customerStatus";

const RAW_CODES = [
  "waiting_payment_review",
  "pending_review",
  "pending_payment",
  "ready_for_pickup",
  "payment_confirmed",
  "payment_rejected",
];

describe("customer-facing status labels", () => {
  it("maps payment statuses to Thai labels", () => {
    expect(customerPaymentStatus("pending").label).toBe("รอชำระเงิน");
    expect(customerPaymentStatus("waiting_payment").label).toBe("รอชำระเงิน");
    expect(customerPaymentStatus("waiting_payment_review").label).toBe("รอตรวจสอบการชำระเงิน");
    expect(customerPaymentStatus("pending_review").label).toBe("รอตรวจสอบการชำระเงิน");
    expect(customerPaymentStatus("paid").label).toBe("ชำระเงินแล้ว");
    expect(customerPaymentStatus("payment_confirmed").label).toBe("ชำระเงินแล้ว");
    expect(customerPaymentStatus("rejected").label).toBe("หลักฐานการชำระเงินไม่ผ่าน");
    expect(customerPaymentStatus("payment_rejected").label).toBe("หลักฐานการชำระเงินไม่ผ่าน");
    expect(customerPaymentStatus("refunded").label).toBe("คืนเงินแล้ว");
  });

  it("maps order statuses to Thai labels", () => {
    expect(customerOrderStatus("pending").label).toBe("รอร้านตรวจสอบออเดอร์");
    expect(customerOrderStatus("pending_review").label).toBe("รอร้านตรวจสอบออเดอร์");
    expect(customerOrderStatus("confirmed").label).toBe("ร้านยืนยันออเดอร์แล้ว");
    expect(customerOrderStatus("accepted").label).toBe("ร้านยืนยันออเดอร์แล้ว");
    expect(customerOrderStatus("preparing").label).toBe("กำลังจัดเตรียม");
    expect(customerOrderStatus("ready").label).toBe("พร้อมรับสินค้า");
    expect(customerOrderStatus("completed").label).toBe("รับสินค้าเรียบร้อย");
    expect(customerOrderStatus("cancelled").label).toBe("ยกเลิกแล้ว");
  });

  it("never returns raw internal codes, even for unknown values", () => {
    for (const code of [...RAW_CODES, "some_unknown_status", "", null, undefined]) {
      const order = customerOrderStatus(code as string | null | undefined);
      const payment = customerPaymentStatus(code as string | null | undefined);
      expect(order.label).not.toBe(code);
      expect(order.label).not.toMatch(/_/);
      expect(payment.label).not.toBe(code);
      expect(payment.label).not.toMatch(/_/);
    }
  });
});
