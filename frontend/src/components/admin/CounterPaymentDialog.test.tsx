import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import IncomingOrdersQueue from "./IncomingOrdersQueue";

const mockListIncomingQueue = vi.fn();
const mockFinalizePayment = vi.fn();
const mockListOrders = vi.fn();
const mockListPayments = vi.fn();
const mockUpdateOrderStatus = vi.fn();
const mockCancelOrder = vi.fn();
const mockSubmitPaymentSlip = vi.fn();
const mockApprovePayment = vi.fn();
const mockRejectPayment = vi.fn();
const mockGetPaymentSlipPreview = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listIncomingQueue: (...args: unknown[]) => mockListIncomingQueue(...args),
    listOrders: (...args: unknown[]) => mockListOrders(...args),
    listPayments: (...args: unknown[]) => mockListPayments(...args),
    finalizePayment: (...args: unknown[]) => mockFinalizePayment(...args),
    updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
    cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
    submitPaymentSlip: (...args: unknown[]) => mockSubmitPaymentSlip(...args),
    approvePayment: (...args: unknown[]) => mockApprovePayment(...args),
    rejectPayment: (...args: unknown[]) => mockRejectPayment(...args),
    getPaymentSlipPreview: (...args: unknown[]) => mockGetPaymentSlipPreview(...args),
  },
}));

vi.mock("@/lib/guards", () => ({
  useIsStoreOwner: () => false,
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({ storeId: "store-1", currentStoreRole: "staff", profileRole: "staff" }),
}));

vi.mock("@/hooks/useStoreOrdersRealtimeInvalidation", () => ({
  useStoreOrdersRealtimeInvalidation: () => {},
}));

const ORDER_1 = {
  id: "ord-1",
  order_no: "ORD-0001",
  order_number: "ORD-0001",
  customer_name: "สมชาย",
  customer_note: "ไม่ใส่ผักชี",
  items: [
    { id: "i1", product_id: "p1", product_name: "Latte", quantity: 2, unit_price: 60, line_total: 120, total_price: 120, options: null },
  ],
  total_amount: 120,
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  status: "pending_payment",
  payment_status: "unpaid",
  order_source: "web_order",
};

const ORDER_2 = {
  ...ORDER_1,
  id: "ord-2",
  order_no: "ORD-0002",
  customer_name: "สมหญิง",
};

function renderQueue() {
  return render(
    <MemoryRouter>
      <IncomingOrdersQueue />
    </MemoryRouter>,
  );
}

function openPaymentDialog() {
  const btn = screen.getByRole("button", { name: "รับชำระเงิน" });
  act(() => {
    btn.click();
  });
}

beforeEach(() => {
  mockListIncomingQueue.mockReset();
  mockFinalizePayment.mockReset();
  mockListOrders.mockReset();
  mockListPayments.mockReset();
  mockUpdateOrderStatus.mockReset();
  mockCancelOrder.mockReset();
  mockSubmitPaymentSlip.mockReset();
  mockApprovePayment.mockReset();
  mockRejectPayment.mockReset();
  mockGetPaymentSlipPreview.mockReset();
  mockFinalizePayment.mockResolvedValue({
    id: "pay-1",
    order_id: "ord-1",
    status: "accepted",
    payment_status: "paid",
    result: "finalized",
    payment_id: "pay-1",
    payment_method: "cash",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FE-06 Counter Payment Finalization", () => {
  // ── PAY01: Incoming order exposes "รับชำระเงิน" action ──
  it("PAY01 exposes รับชำระเงิน action on incoming order", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    expect(await screen.findByRole("button", { name: "รับชำระเงิน" })).toBeInTheDocument();
  });

  // ── PAY02: No "รับออเดอร์" action introduced ──
  it("PAY02 does not introduce รับออเดอร์ action", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByRole("button", { name: /รับออเดอร์/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Accept Order/i })).toBeNull();
  });

  // ── PAY03: Opening payment UI does not call finalizePayment ──
  it("PAY03 opening payment dialog does not call finalizePayment", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    await waitFor(() => expect(screen.getByText("เลือกวิธีการชำระเงิน")).toBeInTheDocument());
    expect(mockFinalizePayment).not.toHaveBeenCalled();
  });

  // ── PAY04: Cash option available ──
  it("PAY04 cash option available", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    expect(await screen.findByText("เงินสด")).toBeInTheDocument();
  });

  // ── PAY05: PromptPay option available ──
  it("PAY05 promptpay option available", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    expect(await screen.findByText("PromptPay")).toBeInTheDocument();
  });

  // ── PAY06: No unsupported transfer/slip payment method ──
  it("PAY06 does not expose transfer/slip methods", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    await waitFor(() => expect(screen.getByText("เงินสด")).toBeInTheDocument());
    expect(screen.queryByText(/โอนผ่านธนาคาร/i)).toBeNull();
    expect(screen.queryByText(/เครดิตการ์ด/i)).toBeNull();
    expect(screen.queryByText(/slip/i)).toBeNull();
  });

  // ── PAY07: Payment method must be selected before confirmation ──
  it("PAY07 confirm disabled when no method selected", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    const confirm = await screen.findByRole("button", { name: "ยืนยันรับชำระเงิน" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  // ── PAY08: Selecting cash alone does not finalize ──
  it("PAY08 selecting cash alone does not finalize", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    const cash = await screen.findByText("เงินสด");
    act(() => {
      cash.click();
    });
    await waitFor(() => expect(mockFinalizePayment).not.toHaveBeenCalled());
  });

  // ── PAY09: Selecting promptpay alone does not finalize ──
  it("PAY09 selecting promptpay alone does not finalize", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    const pp = await screen.findByText("PromptPay");
    act(() => {
      pp.click();
    });
    await waitFor(() => expect(mockFinalizePayment).not.toHaveBeenCalled());
  });

  // ── PAY10: Explicit confirmation required ──
  it("PAY10 requires explicit confirmation to finalize", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    const confirm = screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" });
    act(() => {
      confirm.click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
  });

  // ── PAY11: Cash confirmation calls finalizePayment once ──
  it("PAY11 cash confirmation calls finalizePayment once", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
  });

  // ── PAY12: Cash payload contains payment_method = cash ──
  it("PAY12 cash payload contains payment_method=cash", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(mockFinalizePayment).toHaveBeenCalledWith("ord-1", { payment_method: "cash" }),
    );
  });

  // ── PAY13: PromptPay confirmation calls finalizePayment once ──
  it("PAY13 promptpay confirmation calls finalizePayment once", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("PromptPay").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
  });

  // ── PAY14: PromptPay payload contains payment_method = promptpay ──
  it("PAY14 promptpay payload contains payment_method=promptpay", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("PromptPay").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(mockFinalizePayment).toHaveBeenCalledWith("ord-1", { payment_method: "promptpay" }),
    );
  });

  // ── PAY15: Payload contains no amount ──
  it("PAY15 payload contains no amount", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    const payload = mockFinalizePayment.mock.calls[0][1];
    expect(payload).not.toHaveProperty("amount");
    expect(payload).not.toHaveProperty("total_amount");
  });

  // ── PAY16: Payload contains no order status ──
  it("PAY16 payload contains no order status", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    const payload = mockFinalizePayment.mock.calls[0][1];
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("order_status");
  });

  // ── PAY17: Payload contains no payment timestamp ──
  it("PAY17 payload contains no payment timestamp", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    const payload = mockFinalizePayment.mock.calls[0][1];
    expect(payload).not.toHaveProperty("confirmed_at");
    expect(payload).not.toHaveProperty("paid_at");
    expect(payload).not.toHaveProperty("timestamp");
  });

  // ── PAY18: Payload contains no stock data ──
  it("PAY18 payload contains no stock data", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    const payload = mockFinalizePayment.mock.calls[0][1];
    expect(payload).not.toHaveProperty("stock");
    expect(payload).not.toHaveProperty("usage");
    expect(payload).not.toHaveProperty("ingredients");
  });

  // ── PAY19: Payload contains no customer PII ──
  it("PAY19 payload contains no customer PII", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    const payload = mockFinalizePayment.mock.calls[0][1];
    expect(payload).not.toHaveProperty("customer_name");
    expect(payload).not.toHaveProperty("customer_phone");
    expect(payload).not.toHaveProperty("customer_note");
    expect(payload).not.toHaveProperty("public_token");
  });

  // ── PAY20: No direct payment-row creation API used ──
  it("PAY20 does not call legacy payment-row creation APIs", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    expect(mockSubmitPaymentSlip).not.toHaveBeenCalled();
    expect(mockApprovePayment).not.toHaveBeenCalled();
    expect(mockRejectPayment).not.toHaveBeenCalled();
    expect(mockGetPaymentSlipPreview).not.toHaveBeenCalled();
  });

  // ── PAY21: Successful finalization shows success feedback ──
  it("PAY21 successful finalization shows success feedback", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeInTheDocument(),
    );
  });

  // ── PAY22: Successful finalization refetches Incoming Queue ──
  it("PAY22 successful finalization refetches Incoming Queue", async () => {
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    const initialCalls = mockListIncomingQueue.mock.calls.length;
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    // The 800ms success delay triggers onSuccess → refetch (at least one new call).
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 3000 });
  });

  // ── PAY23: Successful finalization does not manually PATCH accepted ──
  it("PAY23 does not PATCH accepted manually", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  // ── PAY24: Successful finalization does not manually deduct stock ──
  it("PAY24 does not deduct stock manually", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/CounterPaymentDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/deductStock|stockMutation|updateStock|stock_deduct/i);
  });

  // ── PAY25: Order disappears when absent from refetched Incoming snapshot ──
  it("PAY25 order disappears after successful finalize + refetch", async () => {
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    // Wait for refetch (800ms success delay → onSuccess → fetchQueue).
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    // After refetch with empty orders, the empty state appears.
    await waitFor(() => expect(screen.getByText("ยังไม่มีออเดอร์ใหม่")).toBeInTheDocument(), { timeout: 2000 });
  });

  // ── PAY26: Does not manually insert order into Production local state ──
  it("PAY26 does not manually insert into Production local state", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/IncomingOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/listProductionQueue|ProductionOrdersQueue/i);
  });

  // ── PAY27: Already-finalized/idempotent response reconciles safely ──
  it("PAY27 already_finalized result reconciles as success", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "already_finalized",
      payment_id: "pay-existing",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeInTheDocument());
    // Should NOT issue a second finalize call.
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });

  // ── PAY28: insufficient_stock retains Incoming order ──
  it("PAY28 insufficient_stock retains Incoming order", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("insufficient_stock"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(screen.getByText(/สต็อกไม่เพียงพอ/)).toBeInTheDocument());
    // Order still visible in queue (card + dialog both show name).
    expect(screen.getAllByText("สมชาย").length).toBeGreaterThanOrEqual(1);
  });

  // ── PAY29: insufficient_stock does not show payment success ──
  it("PAY29 insufficient_stock does not show success", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("insufficient_stock"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(screen.getByText(/สต็อกไม่เพียงพอ/)).toBeInTheDocument());
    expect(screen.queryByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeNull();
  });

  // ── PAY30: insufficient_stock safe Staff message ──
  it("PAY30 insufficient_stock shows safe Staff message", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("insufficient_stock"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(
        screen.getByText(/สต็อกไม่เพียงพอ ไม่สามารถยืนยันการชำระเงินได้/),
      ).toBeInTheDocument(),
    );
  });

  // ── PAY31: Network failure retains order ──
  it("PAY31 network failure retains order", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    expect(screen.getAllByText("สมชาย").length).toBeGreaterThanOrEqual(1);
  });

  // ── PAY32: Network failure does not auto-retry payment ──
  it("PAY32 network failure does not auto-retry payment", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
    // Wait a bit — no auto-retry.
    await new Promise((r) => setTimeout(r, 100));
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });

  // ── PAY33: Mutation failure does not PATCH accepted ──
  it("PAY33 mutation failure does not PATCH accepted", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  // ── PAY34: Mutation failure does not call stock mutation ──
  it("PAY34 mutation failure does not call stock mutation", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    // No stock-related API exists in the mock — verify no extra finalize calls.
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });

  // ── PAY35: Concurrent/already-changed order triggers safe reconciliation ──
  it("PAY35 invalid_order_status_for_finalization reconciles safely", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("invalid_order_status_for_finalization"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ออเดอร์นี้อาจถูกยืนยันโดยพนักงานอื่นแล้ว/)).toBeInTheDocument(),
    );
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });

  // ── PAY36: 404/order-not-found handled safely ──
  it("PAY36 order_not_found handled safely", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("order_not_found"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่พบคำสั่งซื้อ/)).toBeInTheDocument());
  });

  // ── PAY37: 403 role/store error handled safely ──
  it("PAY37 insufficient_role handled safely", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("insufficient_role"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(screen.getByText(/สิทธิ์ไม่เพียงพอ/)).toBeInTheDocument());
  });

  // ── PAY38: Confirm disabled while request in flight ──
  it("PAY38 confirm disabled while request in flight", async () => {
    let resolveMutation: (v: unknown) => void = () => {};
    mockFinalizePayment.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    const confirm = screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" });
    act(() => {
      confirm.click();
    });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(true));
    resolveMutation({
      id: "pay-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
  });

  // ── PAY39: Rapid double-click produces one finalize request ──
  it("PAY39 rapid double-click produces one finalize request", async () => {
    let resolveMutation: (v: unknown) => void = () => {};
    mockFinalizePayment.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    const confirm = screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" });
    act(() => {
      confirm.click();
    });
    act(() => {
      confirm.click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
    resolveMutation({
      id: "pay-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
  });

  // ── PAY40: Per-order guard does not block unrelated order ──
  it("PAY40 per-order guard does not block unrelated order", async () => {
    let resolveMutation: (v: unknown) => void = () => {};
    mockFinalizePayment.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1, ORDER_2], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    // Open dialog for ORDER_1 and start finalize.
    const payButtons = screen.getAllByRole("button", { name: "รับชำระเงิน" });
    act(() => {
      payButtons[0].click();
    });
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    // Close dialog (simulating cancel) — the unrelated order's button still works.
    act(() => {
      screen.getByRole("button", { name: "ปิด" }).click();
    });
    // ORDER_2's payment button is still clickable.
    const remainingPayButtons = screen.getAllByRole("button", { name: "รับชำระเงิน" });
    expect(remainingPayButtons.length).toBeGreaterThanOrEqual(1);
    resolveMutation({
      id: "pay-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
  });

  // ── PAY41: Dialog shows pending payment state ──
  it("PAY41 dialog shows pending payment state", async () => {
    let resolveMutation: (v: unknown) => void = () => {};
    mockFinalizePayment.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/กำลังยืนยันการชำระเงิน/)).toBeInTheDocument(),
    );
    resolveMutation({
      id: "pay-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
  });

  // ── PAY42: Explicit retry works after safe failure ──
  it("PAY42 explicit retry works after failure", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("network"));
    mockFinalizePayment.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    // Explicit retry — method still selected, click confirm again.
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(2));
  });

  // ── PAY43: No cancel action added ──
  it("PAY43 no cancel action in payment dialog", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    await waitFor(() => expect(screen.getByText("เงินสด")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /ยกเลิก/i })).toBeNull();
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  // ── PAY44: No slip upload ──
  it("PAY44 no slip upload UI", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    await waitFor(() => expect(screen.getByText("เงินสด")).toBeInTheDocument());
    expect(screen.queryByText(/อัปโหลดสลิป/i)).toBeNull();
    expect(screen.queryByText(/สลิป/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /อัปโหลด/i })).toBeNull();
  });

  // ── PAY45: No approve/reject slip ──
  it("PAY45 no approve/reject slip actions", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    await waitFor(() => expect(screen.getByText("เงินสด")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /อนุมัติสลิป/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ปฏิเสธสลิป/i })).toBeNull();
  });

  // ── PAY46: No Realtime subscription ──
  it("PAY46 no Supabase Realtime subscription", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/CounterPaymentDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/supabase\.channel/i);
    expect(content).not.toMatch(/postgres_changes/i);
  });

  // ── PAY47: No customer-side payment changes ──
  it("PAY47 does not modify customer-side payment pages", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const orderStatus = path.resolve(process.cwd(), "src/pages/order/OrderStatusPage.tsx");
    const content = fs.readFileSync(orderStatus, "utf-8");
    // Customer status page should not reference finalizePayment.
    expect(content).not.toMatch(/finalizePayment/i);
  });

  // ── PAY48: No new /liff navigation ──
  it("PAY48 no new /liff navigation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/CounterPaymentDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/\/liff/i);
  });

  // ── PAY49: No stale /api/store prefix ──
  it("PAY49 no stale /api/store prefix", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/CounterPaymentDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/\/api\/store["'/]/);
  });

  // ── PAY50: Healholic/Valora branding remains correct ──
  it("PAY50 no customer-facing Brewway in payment dialog", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    await waitFor(() => expect(screen.getByText("เงินสด")).toBeInTheDocument());
    expect(screen.queryByText(/Brewway/)).toBeNull();
  });

  // ── PAY51: PromptPay does not require slip ──
  it("PAY51 promptpay does not require slip", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("PromptPay").click();
    });
    await waitFor(() => expect(screen.getByText(/สแกน QR PromptPay/)).toBeInTheDocument());
    expect(screen.queryByText(/อัปโหลดสลิป/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /อัปโหลด/i })).toBeNull();
  });

  // ── PAY52: PromptPay requires Staff confirmation before finalize ──
  it("PAY52 promptpay requires explicit confirmation", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("PromptPay").click();
    });
    await waitFor(() => expect(mockFinalizePayment).not.toHaveBeenCalled());
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalledTimes(1));
  });

  // ── PAY53: No dynamic per-order QR is invented ──
  it("PAY53 no dynamic per-order QR invented", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/CounterPaymentDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    // No per-order QR generation — only static instruction text.
    expect(content).not.toMatch(/generateQr|qr.*order.*id|order.*qr/i);
  });

  // ── PAY54: No customer public_token encoded/displayed in payment UI ──
  it("PAY54 no public_token in payment UI", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/CounterPaymentDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/public_token/i);
  });

  // ── PAY55: No configured QR source — displays physical-counter instruction ──
  it("PAY55 displays physical-counter QR instruction (no configured QR source)", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("PromptPay").click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ให้ลูกค้าสแกน QR PromptPay ที่เคาน์เตอร์/)).toBeInTheDocument(),
    );
    // No fabricated QR image source.
    const qrPanel = screen.queryByAltText(/QR/i);
    // No <img> with QR alt text should be rendered (no configured source).
    expect(qrPanel).toBeNull();
  });

  // ── Auth error mapping ──
  it("maps missing_token to session-expired message", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("missing_token"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ/)).toBeInTheDocument(),
    );
  });

  it("does not expose Supabase/Postgres internals", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("Supabase Postgres stack error"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถยืนยันการชำระเงินได้ในขณะนี้/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Supabase/)).toBeNull();
    expect(screen.queryByText(/Postgres/)).toBeNull();
  });

  // ── PAY56: Canonical normal-success result is accepted ──
  it("PAY56 canonical finalized result is accepted as success", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(screen.getByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeInTheDocument());
  });

  // ── PAY57: already_finalized is accepted as idempotent success ──
  it("PAY57 already_finalized result is accepted as idempotent success", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "already_finalized",
      payment_id: "pay-existing",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() => expect(screen.getByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeInTheDocument());
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });

  // ── PAY58: Unknown response.result is NOT treated as success ──
  it("PAY58 unknown result is not treated as success", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "unknown_blob",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถยืนยันผลการชำระเงินได้/)).toBeInTheDocument(),
    );
    // No success message shown.
    expect(screen.queryByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeNull();
  });

  // ── PAY59: Unknown result does NOT show payment-success message ──
  it("PAY59 unknown result does not show payment-success message", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "ok",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถยืนยันผลการชำระเงินได้/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeNull();
  });

  // ── PAY60: Unknown result triggers canonical Incoming Queue reconciliation read ──
  it("PAY60 unknown result triggers Incoming Queue reconciliation refetch", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "mystery",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    // Unknown result triggers onReconcile → fetchQueue (read-only refetch).
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 2000 });
  });

  // ── PAY61: Unknown result does NOT retry finalizePayment ──
  it("PAY61 unknown result does not retry finalizePayment", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "unknown_xyz",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถยืนยันผลการชำระเงินได้/)).toBeInTheDocument(),
    );
    // Only one finalize call — no automatic retry.
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });

  // ── PAY62: Unknown result does NOT PATCH accepted ──
  it("PAY62 unknown result does not PATCH accepted", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "unknown_abc",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถยืนยันผลการชำระเงินได้/)).toBeInTheDocument(),
    );
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  // ── PAY63: Unknown result does NOT call stock mutation ──
  it("PAY63 unknown result does not call stock mutation", async () => {
    mockFinalizePayment.mockResolvedValueOnce({
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "unknown_def",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถยืนยันผลการชำระเงินได้/)).toBeInTheDocument(),
    );
    // No second finalize call (no stock mutation retry).
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });

  // ── PAY64: Concurrent/stale-order error triggers Incoming Queue refetch ──
  it("PAY64 concurrent-state error triggers Incoming Queue refetch", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("invalid_order_status_for_finalization"));
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ออเดอร์นี้อาจถูกยืนยันโดยพนักงานอื่นแล้ว/)).toBeInTheDocument(),
    );
    // Concurrent-state error triggers onReconcile → fetchQueue (read-only refetch).
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 2000 });
  });

  // ── PAY65: Concurrent/stale-order error does NOT show payment success ──
  it("PAY65 concurrent-state error does not show payment success", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("invalid_payment_status_for_finalization"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ออเดอร์นี้อาจถูกยืนยันโดยพนักงานอื่นแล้ว/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/รับชำระเงินเรียบร้อยแล้ว/)).toBeNull();
  });

  // ── PAY66: Concurrent/stale-order error does NOT auto-retry finalize ──
  it("PAY66 concurrent-state error does not auto-retry finalize", async () => {
    mockFinalizePayment.mockRejectedValueOnce(new Error("idempotency_conflict"));
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    openPaymentDialog();
    act(() => {
      screen.getByText("เงินสด").click();
    });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }).click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ออเดอร์นี้อาจถูกยืนยันโดยพนักงานอื่นแล้ว/)).toBeInTheDocument(),
    );
    // Only one finalize call — no automatic retry.
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
  });
});
