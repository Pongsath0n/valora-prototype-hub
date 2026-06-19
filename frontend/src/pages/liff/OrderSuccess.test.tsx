import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import OrderSuccessPage from "./OrderSuccess";

const mockGetOrder = vi.fn();
const mockGetInstructions = vi.fn();
const mockUploadSlip = vi.fn();
const mockGetOrderStatus = vi.fn();
vi.mock("@/services/customerApi", () => ({
  customerApi: {
    getOrder: (...args: unknown[]) => mockGetOrder(...args),
    getPaymentInstructions: () => mockGetInstructions(),
    uploadPaymentSlip: (...args: unknown[]) => mockUploadSlip(...args),
    getOrderStatusByToken: (...args: unknown[]) => mockGetOrderStatus(...args),
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
  mockUploadSlip.mockReset();
  mockGetOrderStatus.mockReset();
  mockStoredToken = "tok-abc";
  mockGetOrderStatus.mockResolvedValue({ payment: { slip_submitted: false } });
});

describe("OrderSuccessPage", () => {
  it("shows payment instructions and slip upload form for a new order that has not uploaded a slip", async () => {
    mockGetOrder.mockResolvedValue(order);
    mockGetInstructions.mockResolvedValue(instructions);
    mockGetOrderStatus.mockResolvedValue({ payment: { slip_submitted: false } });

    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("สั่งซื้อสำเร็จ")).toBeInTheDocument();
    expect(screen.getByText("ORD-1234")).toBeInTheDocument();
    expect(screen.getByText("ยอดที่ต้องชำระ")).toBeInTheDocument();
    expect(screen.getByText("ขั้นตอนถัดไป")).toBeInTheDocument();
    expect(screen.getByText("1. โอนเงินตามยอดที่แสดง")).toBeInTheDocument();
    expect(screen.getByText("2. อัปโหลดสลิปการโอน (ในหน้านี้ได้เลย)")).toBeInTheDocument();
    expect(screen.getByText("3. รอร้านตรวจสอบและยืนยันออเดอร์")).toBeInTheDocument();
    expect(screen.getByText("ธนาคารทดสอบ")).toBeInTheDocument();
    expect(screen.queryByText(/pending_payment|waiting_payment_review/)).toBeNull();
    expect(screen.getAllByText("รอชำระเงิน").length).toBeGreaterThan(0);
    expect(screen.queryByText("ส่งสลิปแล้ว รอร้านตรวจสอบ")).toBeNull();

    // Slip upload is merged INLINE here (Part A) — no forced navigation away.
    expect(screen.getByLabelText("เลือกไฟล์สลิปการโอน")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ส่งหลักฐานการโอน" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "อัปโหลดสลิปการโอน" })).toBeNull();

    expect(screen.getByRole("link", { name: "ดูสถานะของออเดอร์" })).toHaveAttribute(
      "href",
      "/order/status?token=tok-abc",
    );
    expect(screen.getByRole("link", { name: "สั่งเพิ่ม" })).toBeInTheDocument();
  });

  it("uploads the slip inline and shows the waiting-review state while hiding the upload form", async () => {
    mockGetOrder.mockResolvedValue(order);
    mockGetInstructions.mockResolvedValue(instructions);
    mockGetOrderStatus.mockResolvedValue({ payment: { slip_submitted: false } });
    mockUploadSlip.mockResolvedValue({
      payment_status: "pending_review",
      payment: { slip_submitted: true },
    });

    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    const input = (await screen.findByLabelText("เลือกไฟล์สลิปการโอน")) as HTMLInputElement;
    const file = new File(["slip-bytes"], "slip.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งหลักฐานการโอน" }));

    expect(await screen.findByText("ส่งสลิปแล้ว รอร้านตรวจสอบ")).toBeInTheDocument();
    expect(mockUploadSlip).toHaveBeenCalledWith("tok-abc", file);
    expect(screen.queryByRole("button", { name: "ส่งหลักฐานการโอน" })).toBeNull();
    expect(screen.getByRole("link", { name: "ดูสถานะของออเดอร์" })).toBeInTheDocument();
  });

  it("shows honest fallback when payment config is missing", async () => {
    mockGetOrder.mockResolvedValue(order);
    mockGetInstructions.mockResolvedValue({ ...instructions, enabled: false });
    mockGetOrderStatus.mockResolvedValue({ payment: { slip_submitted: false } });

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

  it("hides the status shortcut when no order token is available", async () => {
    mockStoredToken = null;
    mockGetOrder.mockResolvedValue(order);
    mockGetInstructions.mockResolvedValue(instructions);
    mockGetOrderStatus.mockResolvedValue({ payment: { slip_submitted: false } });

    render(
      <MemoryRouter>
        <OrderSuccessPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("สั่งซื้อสำเร็จ")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ดูสถานะของออเดอร์" })).toBeNull();
  });
});
