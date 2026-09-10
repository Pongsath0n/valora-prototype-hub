import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import OrderSuccessPage from "./OrderSuccess";

const mockGetOrder = vi.fn();
vi.mock("@/services/customerApi", () => ({
  customerApi: {
    getOrder: (...args: unknown[]) => mockGetOrder(...args),
    // Legacy methods kept in source but MUST NOT be called by canonical V1 success page.
    getPaymentInstructions: vi.fn(),
    uploadPaymentSlip: vi.fn(),
    getOrderStatusByToken: vi.fn(),
  },
}));

let mockStoredToken: string | null = "tok-abc";
vi.mock("@/services/cartStorage", () => ({
  clearCart: vi.fn(),
  getLastOrderId: () => "order-1",
  getLastOrderNo: () => "ORD-1234",
  getLastOrderToken: () => mockStoredToken,
  setLastOrderId: vi.fn(),
  setLastOrderNo: vi.fn(),
  setLastOrderToken: vi.fn(),
}));

const order = {
  order_id: "order-1",
  order_number: "ORD-1234",
  status: "pending_payment",
  payment_status: "unpaid",
  total_amount: 150,
  customer_name: "สมชาย",
  items: [
    { product_id: "p1", product_name: "Latte", quantity: 2, unit_price: 75, line_total: 150 },
  ],
};

beforeEach(() => {
  mockGetOrder.mockReset();
  mockStoredToken = "tok-abc";
});

describe("OrderSuccessPage (canonical V1)", () => {
  it("shows the canonical waiting experience with order number and customer name", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("รับออเดอร์เรียบร้อยแล้ว")).toBeInTheDocument();
    expect(screen.getByText("ORD-1234")).toBeInTheDocument();
    expect(screen.getByText("สมชาย")).toBeInTheDocument();
  });

  it("instructs the customer to wait for staff to call their name", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText("กรุณารอพนักงานเรียกชื่อของคุณ")).toHaveLength(2);
  });

  it("instructs the customer to pay at the counter", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/ชำระเงินที่เคาน์เตอร์/)).toBeInTheDocument();
  });

  it("does NOT render slip upload controls", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    await screen.findByText("รับออเดอร์เรียบร้อยแล้ว");
    expect(screen.queryByLabelText("เลือกไฟล์สลิปการโอน")).toBeNull();
    expect(screen.queryByRole("button", { name: "ส่งหลักฐานการโอน" })).toBeNull();
  });

  it("does NOT render bank-transfer instructions", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    await screen.findByText("รับออเดอร์เรียบร้อยแล้ว");
    expect(screen.queryByText("ช่องทางการชำระเงิน")).toBeNull();
    expect(screen.queryByText("ธนาคารทดสอบ")).toBeNull();
    expect(screen.queryByText("เลขบัญชี")).toBeNull();
  });

  it("does NOT call getPaymentInstructions", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    await screen.findByText("รับออเดอร์เรียบร้อยแล้ว");
    // The mock for getPaymentInstructions is a vi.fn() — verify it was never called.
    const { customerApi } = await import("@/services/customerApi");
    expect(customerApi.getPaymentInstructions).not.toHaveBeenCalled();
  });

  it("does NOT call uploadPaymentSlip", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    await screen.findByText("รับออเดอร์เรียบร้อยแล้ว");
    const { customerApi } = await import("@/services/customerApi");
    expect(customerApi.uploadPaymentSlip).not.toHaveBeenCalled();
  });

  it("preserves public_token in the status link", async () => {
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    const statusLink = await screen.findByRole("link", { name: "ดูสถานะออเดอร์" });
    expect(statusLink).toHaveAttribute("href", "/order/status?token=tok-abc");
  });

  it("falls back to /order/status when no token is available", async () => {
    mockStoredToken = null;
    mockGetOrder.mockResolvedValue(order);
    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    const statusLink = await screen.findByRole("link", { name: "ดูสถานะออเดอร์" });
    expect(statusLink).toHaveAttribute("href", "/order/status");
  });
});
