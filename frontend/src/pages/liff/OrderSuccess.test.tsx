import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import OrderSuccessPage from "./OrderSuccess";

const mockGetOrder = vi.fn();
const mockGetInstructions = vi.fn();
vi.mock("@/services/customerApi", () => ({
  customerApi: {
    getOrder: (...args: unknown[]) => mockGetOrder(...args),
    getPaymentInstructions: () => mockGetInstructions(),
  },
}));

vi.mock("@/services/cartStorage", () => ({
  clearCart: vi.fn(),
  getLastOrderId: () => "order-1",
  getLastOrderNo: () => "ORD-1234",
  getLastOrderToken: () => "tok-abc",
  setLastOrderId: vi.fn(),
  setLastOrderNo: vi.fn(),
  setLastOrderToken: vi.fn(),
}));

const order = {
  order_id: "order-1",
  order_number: "ORD-1234",
  status: "pending_payment",
  payment_status: "pending",
  pickup_time: null,
  total_amount: 150,
  items: [
    { product_id: "p1", product_name: "Latte", quantity: 2, unit_price: 75, line_total: 150 },
  ],
};

const instructions = {
  enabled: true,
  method_label: "โอนผ่านบัญชีธนาคาร",
  bank_name: "ธนาคารทดสอบ",
  account_name: "ร้านทดสอบ",
  account_number: "000-000-0000",
  promptpay_id: null,
  note_lines: [],
  allowed_file_types: [],
  max_file_mb: 5,
};

beforeEach(() => {
  mockGetOrder.mockReset();
  mockGetInstructions.mockReset();
});

describe("OrderSuccessPage", () => {
  it("shows order number, total, friendly statuses, next steps, and payment card in the first view", async () => {
    mockGetOrder.mockResolvedValue(order);
    mockGetInstructions.mockResolvedValue(instructions);

    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("สั่งซื้อสำเร็จ")).toBeInTheDocument();
    expect(screen.getByText("ORD-1234")).toBeInTheDocument();
    expect(screen.getByText("ยอดที่ต้องชำระ")).toBeInTheDocument();
    // Next steps
    expect(screen.getByText("ขั้นตอนถัดไป")).toBeInTheDocument();
    expect(screen.getByText("1. โอนเงินตามยอดที่แสดง")).toBeInTheDocument();
    expect(screen.getByText("2. อัปโหลดสลิปการโอน")).toBeInTheDocument();
    expect(screen.getByText("3. รอร้านตรวจสอบและยืนยันออเดอร์")).toBeInTheDocument();
    // Payment instruction card
    expect(screen.getByText("ธนาคารทดสอบ")).toBeInTheDocument();
    // Friendly statuses, no raw codes
    expect(screen.queryByText(/pending_payment|waiting_payment_review/)).toBeNull();
    expect(screen.getAllByText("รอชำระเงิน").length).toBeGreaterThan(0);
    // CTA priority
    expect(screen.getByRole("link", { name: "อัปโหลดสลิปการโอน" })).toHaveAttribute(
      "href",
      "/order/status?token=tok-abc",
    );
    expect(screen.getByRole("link", { name: "ดูสถานะออเดอร์" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "สั่งเพิ่ม" })).toBeInTheDocument();
    // "clear data" is de-emphasized, not a primary button
    expect(screen.queryByText("เคลียร์ข้อมูลและกลับไปหน้าแรก")).toBeNull();
  });

  it("shows honest fallback when payment config is missing", async () => {
    mockGetOrder.mockResolvedValue(order);
    mockGetInstructions.mockResolvedValue({ ...instructions, enabled: false });

    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("ร้านยังไม่ได้ตั้งค่าข้อมูลบัญชีรับชำระเงิน กรุณาติดต่อร้านโดยตรงเพื่อชำระเงิน"),
    ).toBeInTheDocument();
    expect(screen.queryByText("ธนาคารทดสอบ")).toBeNull();
  });
});
