import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, act } from "@testing-library/react";
import OrderStatusPage from "./OrderStatusPage";

const mockGetStatusByToken = vi.fn();
vi.mock("@/services/customerApi", () => ({
  customerApi: {
    getOrderStatusByToken: (...args: unknown[]) => mockGetStatusByToken(...args),
    // Legacy methods kept in source but MUST NOT be called by canonical V1 status page.
    getPaymentInstructions: vi.fn(),
    uploadPaymentSlip: vi.fn(),
    lookupOrderStatus: vi.fn(),
  },
}));

let mockStoredToken: string | null = "tok-abc";
const mockSetLastOrderToken = vi.fn();
vi.mock("@/services/cartStorage", () => ({
  getLastOrderToken: () => mockStoredToken,
  setLastOrderToken: (t: string | null) => mockSetLastOrderToken(t),
}));

const summary = {
  order_no: "ORD-1234",
  order_status: "pending_payment",
  payment_status: "unpaid",
  public_token: "tok-abc",
  pickup_time: null,
  total_amount: 120,
  customer_name: "สมชาย",
  items: [{ product_name: "Latte", quantity: 2, line_total: 120, image_url: null }],
  payment: {
    status: "unpaid",
    amount: 120,
    slip_submitted: false,
    can_upload_slip: true,
    last_submitted_at: null,
    reject_reason: null,
    method: "bank_transfer",
  },
};

beforeEach(() => {
  mockGetStatusByToken.mockReset();
  mockSetLastOrderToken.mockReset();
  mockStoredToken = "tok-abc";
});

afterEach(() => {
  vi.useRealTimers();
});

function renderStatus(initialEntry = "/order/status?token=tok-abc") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <OrderStatusPage />
    </MemoryRouter>,
  );
}

describe("OrderStatusPage (canonical V1)", () => {
  // ── STAT01: loads using persisted public_token ──
  it("STAT01 loads using persisted public_token when no URL token", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus("/order/status");

    expect(await screen.findByText("ORD-1234")).toBeInTheDocument();
    expect(mockGetStatusByToken).toHaveBeenCalledWith("tok-abc");
  });

  // ── STAT02: No phone required ──
  it("STAT02 does not render a phone input", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();

    await screen.findByText("ORD-1234");
    expect(screen.queryByLabelText(/เบอร์โทร/)).toBeNull();
    expect(screen.queryByPlaceholderText("08xxxxxxxx")).toBeNull();
  });

  // ── STAT03: No order_no + phone lookup required ──
  it("STAT03 does not render an order-no lookup form", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();

    await screen.findByText("ORD-1234");
    expect(screen.queryByText("ค้นหาสถานะด้วยเลขออเดอร์")).toBeNull();
    expect(screen.queryByLabelText("เลขออเดอร์")).toBeNull();
  });

  // ── STAT04: Missing token shows empty state and does not call backend ──
  it("STAT04 missing token shows empty state and does not call backend", async () => {
    mockStoredToken = null;
    renderStatus("/order/status");

    expect(await screen.findByText("ไม่พบออเดอร์ล่าสุด")).toBeInTheDocument();
    expect(mockGetStatusByToken).not.toHaveBeenCalled();
  });

  // ── STAT05: Backend status endpoint uses token ──
  it("STAT05 calls getOrderStatusByToken with the token", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus("/order/status?token=tok-xyz");

    await screen.findByText("ORD-1234");
    expect(mockGetStatusByToken).toHaveBeenCalledWith("tok-xyz");
  });

  // ── STAT06-STAT12: status mapping ──
  it("STAT06 pending_payment maps to wait-for-name message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "pending_payment" });
    renderStatus();
    // "รับออเดอร์แล้ว" appears in both banner title and timeline label.
    expect(await screen.findAllByText("รับออเดอร์แล้ว")).toHaveLength(2);
    expect(screen.getByText(/กรุณารอพนักงานเรียกชื่อเพื่อชำระเงินที่เคาน์เตอร์/)).toBeInTheDocument();
  });

  it("STAT07 accepted maps to paid/in-queue message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "accepted" });
    renderStatus();
    expect(await screen.findByText("ชำระเงินเรียบร้อยแล้ว")).toBeInTheDocument();
    expect(screen.getByText("ออเดอร์ของคุณอยู่ในคิว")).toBeInTheDocument();
  });

  it("STAT08 preparing maps to preparing message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "preparing" });
    renderStatus();
    expect(await screen.findByText("กำลังจัดเตรียมออเดอร์")).toBeInTheDocument();
  });

  it("STAT09 ready maps to ready message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "ready" });
    renderStatus();
    expect(await screen.findByText("ออเดอร์พร้อมรับแล้ว")).toBeInTheDocument();
  });

  it("STAT10 completed maps to completed message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "completed" });
    renderStatus();
    expect(await screen.findByText("ออเดอร์เสร็จสิ้น")).toBeInTheDocument();
  });

  it("STAT11 cancelled maps to cancelled message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "cancelled" });
    renderStatus();
    expect(await screen.findByText("ออเดอร์ถูกยกเลิก")).toBeInTheDocument();
  });

  it("STAT12 voided maps to cancelled message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "voided" });
    renderStatus();
    expect(await screen.findByText("ออเดอร์ถูกยกเลิก")).toBeInTheDocument();
  });

  // ── STAT13: Unknown status does not crash ──
  it("STAT13 unknown status shows safe generic message", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "unknown_future_state" });
    renderStatus();
    expect(await screen.findByText("กำลังตรวจสอบสถานะออเดอร์")).toBeInTheDocument();
  });

  // ── STAT14-STAT16: customer data displayed ──
  it("STAT14 displays order number", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    expect(await screen.findByText("ORD-1234")).toBeInTheDocument();
  });

  it("STAT15 displays customer name", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    expect(await screen.findByText("สมชาย")).toBeInTheDocument();
  });

  it("STAT16 displays total amount", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    // "฿120.00" appears as both line_total and total_amount.
    expect(await screen.findAllByText("฿120.00")).toHaveLength(2);
  });

  // ── STAT17: Items rendered from status endpoint shape ──
  it("STAT17 renders items using product_name/quantity/line_total", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    expect(await screen.findByText("Latte")).toBeInTheDocument();
    expect(screen.getByText(/x2/)).toBeInTheDocument();
  });

  // ── STAT18: Does not require product_id/unit_price/options ──
  it("STAT18 does not crash when items lack product_id/unit_price/options", async () => {
    const minimalSummary = {
      ...summary,
      items: [{ product_name: "Espresso", quantity: 1, line_total: 60, image_url: null }],
    };
    mockGetStatusByToken.mockResolvedValue(minimalSummary);
    renderStatus();
    expect(await screen.findByText("Espresso")).toBeInTheDocument();
  });

  // ── STAT19-STAT20: No legacy slip/bank UI ──
  it("STAT19 does not render slip upload controls", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    expect(screen.queryByText("อัปโหลดสลิปการโอน")).toBeNull();
    expect(screen.queryByRole("button", { name: "ส่งหลักฐานการโอน" })).toBeNull();
  });

  it("STAT20 does not render bank-transfer instructions", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    expect(screen.queryByText("ช่องทางการชำระเงิน")).toBeNull();
    expect(screen.queryByText("ธนาคาร:")).toBeNull();
    expect(screen.queryByText("เลขบัญชี:")).toBeNull();
  });

  // ── STAT21-STAT24: Legacy payment not consumed ──
  it("STAT21 does not consume can_upload_slip to build UI", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, payment: { ...summary.payment, can_upload_slip: true } });
    renderStatus();
    await screen.findByText("ORD-1234");
    expect(screen.queryByText("อัปโหลดสลิป")).toBeNull();
  });

  it("STAT22 does not call getPaymentInstructions", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    const { customerApi } = await import("@/services/customerApi");
    expect(customerApi.getPaymentInstructions).not.toHaveBeenCalled();
  });

  it("STAT23 does not call uploadPaymentSlip", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    const { customerApi } = await import("@/services/customerApi");
    expect(customerApi.uploadPaymentSlip).not.toHaveBeenCalled();
  });

  it("STAT24 does not call lookupOrderStatus in canonical flow", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    const { customerApi } = await import("@/services/customerApi");
    expect(customerApi.lookupOrderStatus).not.toHaveBeenCalled();
  });

  // ── STAT25: Initial fetch happens immediately ──
  it("STAT25 initial fetch happens immediately on mount", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await waitFor(() => expect(mockGetStatusByToken).toHaveBeenCalled());
  });

  // ── STAT26: Active order polls automatically ──
  it("STAT26 active order triggers a poll after interval", async () => {
    vi.useFakeTimers();
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    // Flush initial fetch (microtask + effect).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
    // Advance past the poll interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(2);
  });

  // ── STAT28-STAT30: Terminal statuses stop polling ──
  it("STAT28 terminal completed stops polling", async () => {
    vi.useFakeTimers();
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "completed" });
    renderStatus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
  });

  it("STAT29 terminal cancelled stops polling", async () => {
    vi.useFakeTimers();
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "cancelled" });
    renderStatus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
  });

  it("STAT30 terminal voided stops polling", async () => {
    vi.useFakeTimers();
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "voided" });
    renderStatus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
  });

  // ── STAT31: Polling cleaned up on unmount ──
  it("STAT31 polling cleaned up on unmount", async () => {
    vi.useFakeTimers();
    mockGetStatusByToken.mockResolvedValue(summary);
    const { unmount } = renderStatus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
  });

  // ── STAT32: Temporary refresh failure retains previous valid status ──
  it("STAT32 temporary refresh failure retains previous valid status", async () => {
    mockGetStatusByToken.mockResolvedValueOnce(summary);
    mockGetStatusByToken.mockRejectedValueOnce(new Error("network"));
    renderStatus();
    await screen.findByText("ORD-1234");
    // Trigger manual refresh which fails.
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรช" }).click();
    });
    await waitFor(() => expect(mockGetStatusByToken).toHaveBeenCalledTimes(2));
    // Previous valid status still displayed.
    expect(screen.getByText("ORD-1234")).toBeInTheDocument();
  });

  // ── STAT33: Initial failure shows retry state ──
  it("STAT33 initial failure shows retry state", async () => {
    mockGetStatusByToken.mockRejectedValue(new Error("order_not_found"));
    renderStatus();
    await waitFor(() => expect(mockGetStatusByToken).toHaveBeenCalledTimes(1));
    expect(screen.getByText("ไม่พบคำสั่งซื้อ")).toBeInTheDocument();
    expect(screen.getByText("ลองอีกครั้ง")).toBeInTheDocument();
  });

  // ── STAT34: Manual refresh works ──
  it("STAT34 manual refresh calls the endpoint again", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    expect(mockGetStatusByToken).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรช" }).click();
    });
    await waitFor(() => expect(mockGetStatusByToken).toHaveBeenCalledTimes(2));
  });

  // ── STAT35: 404 order_not_found mapped safely ──
  it("STAT35 order_not_found mapped safely", async () => {
    mockGetStatusByToken.mockRejectedValue(new Error("order_not_found"));
    renderStatus();
    await waitFor(() => expect(mockGetStatusByToken).toHaveBeenCalled());
    expect(screen.getByText("ไม่พบคำสั่งซื้อ")).toBeInTheDocument();
  });

  // ── STAT36: token_required mapped safely ──
  it("STAT36 token_required mapped safely", async () => {
    mockGetStatusByToken.mockRejectedValue(new Error("token_required"));
    renderStatus();
    await waitFor(() => expect(mockGetStatusByToken).toHaveBeenCalled());
    expect(screen.getByText("ไม่พบออเดอร์ล่าสุด")).toBeInTheDocument();
  });

  // ── STAT37: Success page status link opens /order/status ──
  it("STAT37 /order/status route renders the status page", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus("/order/status?token=tok-abc");
    expect(await screen.findByText("สถานะออเดอร์")).toBeInTheDocument();
  });

  // ── STAT38: Persisted token survives page reload scenario ──
  it("STAT38 persisted token loads status without URL token", async () => {
    mockStoredToken = "persisted-tok";
    mockGetStatusByToken.mockResolvedValue({ ...summary, public_token: "persisted-tok" });
    renderStatus("/order/status");
    await waitFor(() => expect(mockGetStatusByToken).toHaveBeenCalledWith("persisted-tok"));
    expect(screen.getByText("ORD-1234")).toBeInTheDocument();
  });

  // ── STAT41: legacy payment.method="transfer" does not create transfer UI ──
  it("STAT41 payment.method=transfer does not create transfer UI", async () => {
    mockGetStatusByToken.mockResolvedValue({
      ...summary,
      payment: { ...summary.payment, method: "transfer" },
    });
    renderStatus();
    await screen.findByText("ORD-1234");
    expect(screen.queryByText("โอนเงิน")).toBeNull();
    expect(screen.queryByText("ธนาคาร:")).toBeNull();
  });

  // ── STAT42: waiting_payment_review legacy state does not create slip UI ──
  it("STAT42 waiting_payment_review does not create slip UI", async () => {
    mockGetStatusByToken.mockResolvedValue({ ...summary, order_status: "waiting_payment_review" });
    renderStatus();
    await screen.findAllByText("รับออเดอร์แล้ว");
    expect(screen.queryByText("อัปโหลดสลิป")).toBeNull();
  });

  // ── STAT43: public_token is not rendered visibly ──
  it("STAT43 public_token is not rendered visibly", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    expect(screen.queryByText("tok-abc")).toBeNull();
  });

  // ── STAT44: No customer PII fields added ──
  it("STAT44 does not render phone/email/LINE input fields", async () => {
    mockGetStatusByToken.mockResolvedValue(summary);
    renderStatus();
    await screen.findByText("ORD-1234");
    expect(screen.queryByLabelText(/เบอร์โทร/)).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/LINE/i)).toBeNull();
  });
});
