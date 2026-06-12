import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import OrderStatusPage from "./OrderStatusPage";

const mockGetStatusByToken = vi.fn();
const mockGetInstructions = vi.fn();
vi.mock("@/services/customerApi", () => ({
  customerApi: {
    getOrderStatusByToken: (...args: unknown[]) => mockGetStatusByToken(...args),
    getPaymentInstructions: () => mockGetInstructions(),
    lookupOrderStatus: vi.fn(),
    uploadPaymentSlip: vi.fn(),
  },
}));

vi.mock("@/services/cartStorage", () => ({
  getLastOrderNo: () => null,
  getLastOrderToken: () => null,
  setLastOrderNo: vi.fn(),
  setLastOrderToken: vi.fn(),
}));

const summary = {
  order_no: "ORD-1234",
  order_status: "pending_payment",
  payment_status: "pending",
  public_token: "tok-abc",
  pickup_time: null,
  total_amount: 120,
  items: [{ product_name: "Latte", quantity: 2, line_total: 120, image_url: null }],
  payment: {
    status: "pending",
    amount: 120,
    slip_submitted: false,
    can_upload_slip: true,
    last_submitted_at: null,
    reject_reason: null,
    method: "bank_transfer",
  },
};

const instructions = {
  enabled: true,
  method_label: "โอนผ่านบัญชีธนาคาร",
  bank_name: "ธนาคารทดสอบ",
  account_name: "ร้านทดสอบ",
  account_number: "000-000-0000",
  promptpay_id: null,
  note_lines: [],
  allowed_file_types: ["image/jpeg", "image/png", "image/webp"],
  max_file_mb: 5,
};

beforeEach(() => {
  mockGetStatusByToken.mockReset();
  mockGetInstructions.mockReset();
});

describe("OrderStatusPage", () => {
  it("with token: shows status + prominent slip upload, hides manual search form, no raw codes", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    mockGetInstructions.mockResolvedValue(instructions);

    render(
      <MemoryRouter initialEntries={["/order/status?token=tok-abc"]}>
        <OrderStatusPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("ORD-1234")).toBeInTheDocument();
    // Slip upload section present and actionable
    expect(screen.getByText("อัปโหลดสลิปการโอน")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "ส่งหลักฐานการโอน" });
    expect(submit).toBeDisabled(); // disabled until a file is selected
    // Manual search form hidden when a direct status link is used
    expect(screen.queryByText("ค้นหาสถานะด้วยเลขออเดอร์")).toBeNull();
    // Raw internal codes never rendered
    expect(screen.queryByText(/pending_payment|waiting_payment_review|pending_review/)).toBeNull();
    // Customer-friendly labels rendered instead
    expect(screen.getAllByText("รอชำระเงิน").length).toBeGreaterThan(0);
  });

  it("without token: shows the manual search form", async () => {
    mockGetInstructions.mockResolvedValue(instructions);

    render(
      <MemoryRouter initialEntries={["/order/status"]}>
        <OrderStatusPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("ค้นหาสถานะด้วยเลขออเดอร์")).toBeInTheDocument();
    expect(screen.getByLabelText("เลขออเดอร์")).toBeInTheDocument();
    expect(screen.getByLabelText("เบอร์โทรศัพท์ที่ใช้สั่งซื้อ")).toBeInTheDocument();
  });

  it("shows honest fallback when payment config is missing", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    mockGetInstructions.mockResolvedValue({ ...instructions, enabled: false });

    render(
      <MemoryRouter initialEntries={["/order/status?token=tok-abc"]}>
        <OrderStatusPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("ร้านยังไม่ได้ตั้งค่าข้อมูลบัญชีรับชำระเงิน กรุณาติดต่อร้านโดยตรงเพื่อชำระเงิน"),
    ).toBeInTheDocument();
    expect(screen.queryByText("ธนาคารทดสอบ")).toBeNull();
  });
});
