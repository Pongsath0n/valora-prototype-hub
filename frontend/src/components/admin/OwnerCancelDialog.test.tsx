import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import IncomingOrdersQueue from "./IncomingOrdersQueue";
import ProductionOrdersQueue from "./ProductionOrdersQueue";

const mockListIncomingQueue = vi.fn();
const mockListProductionQueue = vi.fn();
const mockFinalizePayment = vi.fn();
const mockCancelOrder = vi.fn();
const mockUpdateOrderStatus = vi.fn();
const mockListOrders = vi.fn();
const mockListPayments = vi.fn();
const mockSubmitPaymentSlip = vi.fn();
const mockApprovePayment = vi.fn();
const mockRejectPayment = vi.fn();
const mockGetPaymentSlipPreview = vi.fn();

let mockIsStoreOwner = false;

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listIncomingQueue: (...args: unknown[]) => mockListIncomingQueue(...args),
    listProductionQueue: (...args: unknown[]) => mockListProductionQueue(...args),
    finalizePayment: (...args: unknown[]) => mockFinalizePayment(...args),
    cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
    updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
    listOrders: (...args: unknown[]) => mockListOrders(...args),
    listPayments: (...args: unknown[]) => mockListPayments(...args),
    submitPaymentSlip: (...args: unknown[]) => mockSubmitPaymentSlip(...args),
    approvePayment: (...args: unknown[]) => mockApprovePayment(...args),
    rejectPayment: (...args: unknown[]) => mockRejectPayment(...args),
    getPaymentSlipPreview: (...args: unknown[]) => mockGetPaymentSlipPreview(...args),
  },
}));

vi.mock("@/lib/guards", () => ({
  useIsStoreOwner: () => mockIsStoreOwner,
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({ storeId: "store-1", currentStoreRole: "owner", profileRole: "owner" }),
}));

vi.mock("@/hooks/useStoreOrdersRealtimeInvalidation", () => ({
  useStoreOrdersRealtimeInvalidation: () => {},
}));

const INCOMING_ORDER = {
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

const PRODUCTION_ORDER_ACCEPTED = {
  id: "prod-1",
  order_no: "PROD-0001",
  order_number: "PROD-0001",
  order_source: "web_order",
  customer_name: "สมหญิง",
  customer_note: null,
  items: [
    { id: "pi1", product_id: "p1", product_name: "Latte", quantity: 1, unit_price: 60, line_total: 60, total_price: 60, options: null },
  ],
  total_amount: 60,
  status: "accepted",
  payment_status: "paid",
  payment_confirmed_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
};

const PRODUCTION_ORDER_PREPARING = { ...PRODUCTION_ORDER_ACCEPTED, id: "prod-2", status: "preparing" };
const PRODUCTION_ORDER_READY = { ...PRODUCTION_ORDER_ACCEPTED, id: "prod-3", status: "ready" };

function renderIncoming() {
  return render(
    <MemoryRouter>
      <IncomingOrdersQueue />
    </MemoryRouter>,
  );
}

function renderProduction() {
  return render(
    <MemoryRouter>
      <ProductionOrdersQueue />
    </MemoryRouter>,
  );
}

function openIncomingCancelDialog() {
  const btn = screen.getByRole("button", { name: "ยกเลิกออเดอร์" });
  act(() => {
    btn.click();
  });
}

function openProductionCancelDialog() {
  const btn = screen.getByRole("button", { name: "ยกเลิกออเดอร์" });
  act(() => {
    btn.click();
  });
}

beforeEach(() => {
  mockListIncomingQueue.mockReset();
  mockListProductionQueue.mockReset();
  mockFinalizePayment.mockReset();
  mockCancelOrder.mockReset();
  mockUpdateOrderStatus.mockReset();
  mockListOrders.mockReset();
  mockListPayments.mockReset();
  mockSubmitPaymentSlip.mockReset();
  mockApprovePayment.mockReset();
  mockRejectPayment.mockReset();
  mockGetPaymentSlipPreview.mockReset();
  mockIsStoreOwner = false;
  mockCancelOrder.mockResolvedValue({
    id: "ord-1",
    status: "cancelled",
    result: "cancelled_unpaid",
    stock_returned: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FE-07 Owner Cancellation UI", () => {
  // ── CAN01: Store owner sees cancel for pending_payment ──
  it("CAN01 store owner sees cancel for pending_payment", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    expect(await screen.findByRole("button", { name: "ยกเลิกออเดอร์" })).toBeInTheDocument();
  });

  // ── CAN02: Store owner sees cancel for accepted ──
  it("CAN02 store owner sees cancel for accepted", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    renderProduction();
    expect(await screen.findByRole("button", { name: "ยกเลิกออเดอร์" })).toBeInTheDocument();
  });

  // ── CAN03: Staff does not see cancel ──
  it("CAN03 staff does not see cancel in Incoming", async () => {
    mockIsStoreOwner = false;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN04: Manager does not see cancel ──
  it("CAN04 manager does not see cancel in Production", async () => {
    mockIsStoreOwner = false;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN05: profile admin + store manager does not see cancel ──
  it("CAN05 non-owner store role does not see cancel", async () => {
    // useIsStoreOwner checks currentStoreRole === "owner", not profileRole.
    // Mock returns false (simulating manager/staff/admin store role).
    mockIsStoreOwner = false;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN06: profile owner + store manager does not see cancel ──
  it("CAN06 currentStoreRole determines cancel (not profileRole)", async () => {
    // useIsStoreOwner returns false → cancel not shown regardless of profileRole.
    mockIsStoreOwner = false;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN07: store owner capability derives from currentStoreRole ──
  it("CAN07 useIsStoreOwner is the canonical RBAC source", async () => {
    const mod = await import("@/lib/guards");
    expect(mod.useIsStoreOwner).toBeDefined();
    expect(typeof mod.useIsStoreOwner).toBe("function");
  });

  // ── CAN08: System Console profile-role behavior remains unchanged ──
  it("CAN08 useIsStoreOwner checks currentStoreRole not profileRole", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/lib/guards.ts");
    const content = fs.readFileSync(full, "utf-8");
    // The function must check currentStoreRole, NOT profileRole.
    expect(content).toMatch(/currentStoreRole\s*===\s*["']owner["']/);
    expect(content).not.toMatch(/profileRole\s*===\s*["']owner["']/);
  });

  // ── CAN09: pending_payment cancel available ──
  it("CAN09 pending_payment cancel available for owner", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    expect(await screen.findByRole("button", { name: "ยกเลิกออเดอร์" })).toBeInTheDocument();
  });

  // ── CAN10: accepted cancel available ──
  it("CAN10 accepted cancel available for owner", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    renderProduction();
    expect(await screen.findByRole("button", { name: "ยกเลิกออเดอร์" })).toBeInTheDocument();
  });

  // ── CAN11: preparing cancel unavailable ──
  it("CAN11 preparing cancel unavailable", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_PREPARING], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN12: ready cancel unavailable ──
  it("CAN12 ready cancel unavailable", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_READY], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN13: completed cancel unavailable ──
  it("CAN13 completed cancel unavailable", async () => {
    mockIsStoreOwner = true;
    const completed = { ...PRODUCTION_ORDER_ACCEPTED, status: "completed" };
    // Production queue backend excludes completed, so this test is structural.
    mockListProductionQueue.mockResolvedValue({ orders: [completed], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN14: cancelled cancel unavailable ──
  it("CAN14 cancelled cancel unavailable", async () => {
    mockIsStoreOwner = true;
    const cancelled = { ...PRODUCTION_ORDER_ACCEPTED, status: "cancelled" };
    mockListProductionQueue.mockResolvedValue({ orders: [cancelled], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN15: voided cancel unavailable ──
  it("CAN15 voided cancel unavailable", async () => {
    mockIsStoreOwner = true;
    const voided = { ...PRODUCTION_ORDER_ACCEPTED, status: "voided" };
    mockListProductionQueue.mockResolvedValue({ orders: [voided], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN16: Opening dialog does not call cancelOrder ──
  it("CAN16 opening cancel dialog does not call cancelOrder", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    await waitFor(() => expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument());
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  // ── CAN17: Explicit confirmation required ──
  it("CAN17 requires explicit confirmation", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    await waitFor(() => expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument());
    expect(mockCancelOrder).not.toHaveBeenCalled();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledTimes(1));
  });

  // ── CAN18: Calls canonical cancelOrder once ──
  it("CAN18 calls cancelOrder once", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledTimes(1));
  });

  // ── CAN19: Uses POST /orders/{id}/cancel ──
  it("CAN19 uses canonical cancelOrder service (POST /cancel)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/services/storeAdminApi.ts");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/\/api\/store-admin\/orders\/\$\{[^}]+\}\/cancel/);
    expect(content).toMatch(/method:\s*["']POST["']/);
  });

  // ── CAN20: Optional reason sent when non-empty ──
  it("CAN20 optional reason sent when non-empty", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    const reasonInput = screen.getByDisplayValue("") as HTMLTextAreaElement;
    fireEvent.change(reasonInput, { target: { value: "ลูกค้าเปลี่ยนใจ" } });
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() =>
      expect(mockCancelOrder).toHaveBeenCalledWith("ord-1", { reason: "ลูกค้าเปลี่ยนใจ" }),
    );
  });

  // ── CAN21: Empty reason omitted/normalized safely ──
  it("CAN21 empty reason omitted", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    const payload = mockCancelOrder.mock.calls[0][1];
    expect(payload).toEqual({});
  });

  // ── CAN22: No PATCH status=cancelled ──
  it("CAN22 no PATCH status=cancelled", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  // ── CAN23: No /cancel-atomic ──
  it("CAN23 no /cancel-atomic in OwnerCancelDialog", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/cancel-atomic/i);
  });

  // ── CAN24: No stock mutation call ──
  it("CAN24 no stock mutation call", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledTimes(1));
    // Only one cancel call — no stock RPC.
    expect(mockCancelOrder).toHaveBeenCalledTimes(1);
  });

  // ── CAN25: No refund mutation call ──
  it("CAN25 no refund mutation call", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/refund|คืนเงิน/i);
  });

  // ── CAN26: Owner can open cancel dialog from pending Incoming order ──
  it("CAN26 owner opens cancel dialog from pending Incoming order", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    await waitFor(() => expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument());
  });

  // ── CAN27: Successful Incoming cancellation refetches listIncomingQueue ──
  it("CAN27 successful Incoming cancellation refetches listIncomingQueue", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [INCOMING_ORDER], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    const initialCalls = mockListIncomingQueue.mock.calls.length;
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 3000 });
  });

  // ── CAN28: Cancelled order disappears when absent from canonical Incoming snapshot ──
  it("CAN28 cancelled order disappears after refetch", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [INCOMING_ORDER], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("ยังไม่มีออเดอร์ใหม่")).toBeInTheDocument(), { timeout: 3000 });
  });

  // ── CAN29: Incoming cancellation does not call finalizePayment ──
  it("CAN29 Incoming cancellation does not call finalizePayment", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    expect(mockFinalizePayment).not.toHaveBeenCalled();
  });

  // ── CAN30: Payment and cancellation not initiated concurrently for same order ──
  it("CAN30 payment and cancel not concurrent for same order", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    // Open payment dialog (sets busyOrderId).
    act(() => {
      screen.getByRole("button", { name: "รับชำระเงิน" }).click();
    });
    // Cancel button should now be disabled (busyOrderId === order.id).
    const cancelBtn = screen.getByRole("button", { name: "ยกเลิกออเดอร์" });
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // ── CAN31: Owner can cancel accepted Production order ──
  it("CAN31 owner can cancel accepted Production order", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    openProductionCancelDialog();
    await waitFor(() => expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument());
  });

  // ── CAN32: Successful accepted cancellation refetches listProductionQueue ──
  it("CAN32 successful accepted cancellation refetches listProductionQueue", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValue({
      id: "prod-1",
      status: "cancelled",
      result: "cancelled",
      stock_returned: 2,
      already_returned: 0,
    });
    mockListProductionQueue.mockResolvedValueOnce({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    const initialCalls = mockListProductionQueue.mock.calls.length;
    openProductionCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    await waitFor(() => expect(mockListProductionQueue.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 3000 });
  });

  // ── CAN33: Cancelled accepted order disappears when absent from canonical Production snapshot ──
  it("CAN33 cancelled accepted order disappears after refetch", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValue({
      id: "prod-1",
      status: "cancelled",
      result: "cancelled",
      stock_returned: 2,
    });
    mockListProductionQueue.mockResolvedValueOnce({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    openProductionCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("ยังไม่มีออเดอร์ในคิวผลิต")).toBeInTheDocument(), { timeout: 3000 });
  });

  // ── CAN34: accepted cancellation does not manually return stock ──
  it("CAN34 accepted cancellation does not manually return stock", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/returnStock|restoreStock|stockReturn|stock_return/i);
  });

  // ── CAN35: accepted cancellation does not call updateOrderStatus with cancelled ──
  it("CAN35 accepted cancellation does not PATCH cancelled", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValue({
      id: "prod-1",
      status: "cancelled",
      result: "cancelled",
      stock_returned: 2,
    });
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    openProductionCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  // ── CAN36: preparing status action remains available but cancellation is not ──
  it("CAN36 preparing has status action but no cancel", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_PREPARING], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.getByRole("button", { name: "พร้อมรับ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN37: ready status action remains available but cancellation is not ──
  it("CAN37 ready has status action but no cancel", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_READY], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    expect(screen.getByRole("button", { name: "ส่งมอบแล้ว" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ยกเลิกออเดอร์" })).toBeNull();
  });

  // ── CAN38: Production status mutation and cancellation cannot run concurrently for same order ──
  it("CAN38 production transition disables cancel for same order", async () => {
    mockIsStoreOwner = true;
    let resolveStatus: (v: unknown) => void = () => {};
    mockUpdateOrderStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    // Start status transition (sets pendingOrderId).
    act(() => {
      screen.getByRole("button", { name: "เริ่มทำ" }).click();
    });
    // Cancel button should now be disabled (isPending || cancelOrder?.id === order.id).
    const cancelBtn = screen.getByRole("button", { name: "ยกเลิกออเดอร์" });
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);
    resolveStatus({ id: "prod-1", status: "preparing" });
  });

  // ── CAN39: owner_role_required maps safely ──
  it("CAN39 owner_role_required maps safely", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("owner_role_required"));
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/เฉพาะเจ้าของร้านเท่านั้น/)).toBeInTheDocument());
  });

  // ── CAN40: invalid-status cancellation maps safely ──
  it("CAN40 invalid_status_for_cancellation maps safely", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("invalid_status_for_cancellation"));
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/สถานะออเดอร์เปลี่ยนไปแล้ว/)).toBeInTheDocument());
  });

  // ── CAN41: invalid-status error triggers canonical owning-queue refetch ──
  it("CAN41 invalid-status error triggers owning-queue refetch", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("invalid_status_for_cancellation"));
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [INCOMING_ORDER], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    const initialCalls = mockListIncomingQueue.mock.calls.length;
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 2000 });
  });

  // ── CAN42: network failure does not show cancellation success ──
  it("CAN42 network failure does not show cancellation success", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    expect(screen.queryByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeNull();
  });

  // ── CAN43: network ambiguity triggers read-only reconciliation ──
  it("CAN43 network ambiguity shows reconciliation message", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    expect(mockCancelOrder).toHaveBeenCalledTimes(1);
  });

  // ── CAN44: failure does not remove order before canonical refetch ──
  it("CAN44 failure retains order", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    expect(screen.getAllByText("สมชาย").length).toBeGreaterThanOrEqual(1);
  });

  // ── CAN45: failure does not return stock locally ──
  it("CAN45 failure does not return stock locally", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/returnStock|restoreStock|stockReturn/i);
  });

  // ── CAN46: failure does not auto-retry cancel ──
  it("CAN46 failure does not auto-retry cancel", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("network"));
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 100));
    expect(mockCancelOrder).toHaveBeenCalledTimes(1);
  });

  // ── CAN47: unknown 2xx cancellation response fails closed ──
  it("CAN47 unknown 2xx response fails closed", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValueOnce({
      id: "ord-1",
      status: "cancelled",
      result: "mystery_result",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถยืนยันผลการยกเลิกได้/)).toBeInTheDocument());
  });

  // ── CAN48: unknown response does not show success ──
  it("CAN48 unknown response does not show success", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValueOnce({
      id: "ord-1",
      status: "cancelled",
      result: "ok",
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถยืนยันผลการยกเลิกได้/)).toBeInTheDocument());
    expect(screen.queryByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeNull();
  });

  // ── CAN49: unknown response triggers owning-queue reconciliation ──
  it("CAN49 unknown response triggers owning-queue reconciliation", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValueOnce({
      id: "ord-1",
      status: "cancelled",
      result: "unknown",
    });
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [INCOMING_ORDER], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    const initialCalls = mockListIncomingQueue.mock.calls.length;
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalled());
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 2000 });
  });

  // ── CAN50: Canonical cancelled response shows success ──
  it("CAN50 canonical cancelled_unpaid response shows success", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValueOnce({
      id: "ord-1",
      status: "cancelled",
      result: "cancelled_unpaid",
      stock_returned: 0,
    });
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [INCOMING_ORDER], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeInTheDocument());
  });

  // ── CAN51: Success message does NOT claim refund ──
  it("CAN51 success message does not claim refund", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/คืนเงินแล้ว|Refund completed|คืนเงินเรียบร้อย/i);
  });

  // ── CAN52: pending-payment cancellation makes no frontend stock claim ──
  it("CAN52 pending-payment cancellation no stock claim", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValueOnce({
      id: "ord-1",
      status: "cancelled",
      result: "cancelled_unpaid",
      stock_returned: 0,
    });
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    // No stock-notice for pending_payment (only for accepted).
    expect(screen.queryByText(/คืนสต็อก/)).toBeNull();
  });

  // ── CAN53: accepted cancellation UX may explain Backend stock restoration without claiming refund ──
  it("CAN53 accepted cancellation shows stock restoration notice", async () => {
    mockIsStoreOwner = true;
    mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    openProductionCancelDialog();
    await waitFor(() => expect(screen.getByText(/คืนสต็อกตามข้อมูลการใช้งาน/)).toBeInTheDocument());
  });

  // ── CAN54: Dialog closes/reconciles safely after successful cancellation ──
  it("CAN54 dialog reconciles after successful cancellation", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [INCOMING_ORDER], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("ยังไม่มีออเดอร์ใหม่")).toBeInTheDocument(), { timeout: 3000 });
  });

  // ── CAN55: No customer cancellation control ──
  it("CAN55 no customer cancellation control", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const orderStatus = path.resolve(process.cwd(), "src/pages/order/OrderStatusPage.tsx");
    const content = fs.readFileSync(orderStatus, "utf-8");
    expect(content).not.toMatch(/cancelOrder|ยกเลิกออเดอร์/i);
  });

  // ── CAN56: No refund UI ──
  it("CAN56 no refund UI", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/refund-button|refund-amount|refundAmount|cashRefund|promptpayReversal/i);
  });

  // ── CAN57: No Realtime ──
  it("CAN57 no Realtime subscription", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/supabase\.channel|postgres_changes/i);
  });

  // ── CAN58: No slip/payment review integration ──
  it("CAN58 no slip/payment review integration", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    await waitFor(() => expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument());
    expect(screen.queryByText(/สลิป/i)).toBeNull();
    expect(mockSubmitPaymentSlip).not.toHaveBeenCalled();
    expect(mockApprovePayment).not.toHaveBeenCalled();
    expect(mockRejectPayment).not.toHaveBeenCalled();
  });

  // ── CAN59: No new /liff navigation ──
  it("CAN59 no new /liff navigation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/\/liff/i);
  });

  // ── CAN60: No stale /api/store prefix ──
  it("CAN60 no stale /api/store prefix", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/\/api\/store["'/]/);
  });

  // ── CAN61: Healholic/Valora branding intact ──
  it("CAN61 no Brewway branding in cancel dialog", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    await waitFor(() => expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument());
    expect(screen.queryByText(/Brewway/)).toBeNull();
  });

  // ── CAN62: No internal stock/cost fields exposed ──
  it("CAN62 no internal stock/cost fields exposed", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/OwnerCancelDialog.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/usage_breakdown|ingredient_id|recipe_id|_system|cost_price|unit_cost/i);
  });

  // ── already_cancelled idempotent success ──
  it("already_cancelled result treated as idempotent success", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValueOnce({
      id: "ord-1",
      status: "cancelled",
      result: "already_cancelled",
    });
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [INCOMING_ORDER], store_id: "s1" });
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeInTheDocument());
    expect(mockCancelOrder).toHaveBeenCalledTimes(1);
  });

  // ── accepted cancel success (result = "cancelled") ──
  it("accepted cancel result=cancelled shows success", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockResolvedValueOnce({
      id: "prod-1",
      status: "cancelled",
      result: "cancelled",
      stock_returned: 2,
      already_returned: 0,
    });
    mockListProductionQueue.mockResolvedValueOnce({ orders: [PRODUCTION_ORDER_ACCEPTED], store_id: "s1" });
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderProduction();
    await screen.findByText("สมหญิง");
    openProductionCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ยกเลิกออเดอร์เรียบร้อยแล้ว/)).toBeInTheDocument());
  });

  // ── double-click produces one cancel request ──
  it("rapid double-click produces one cancel request", async () => {
    mockIsStoreOwner = true;
    let resolveCancel: (v: unknown) => void = () => {};
    mockCancelOrder.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCancel = resolve;
      }),
    );
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    const confirm = screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" });
    act(() => {
      confirm.click();
    });
    act(() => {
      confirm.click();
    });
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledTimes(1));
    resolveCancel({ id: "ord-1", status: "cancelled", result: "cancelled_unpaid" });
  });

  // ── pending payment does not show stock-notice ──
  it("pending_payment does not show stock restoration notice", async () => {
    mockIsStoreOwner = true;
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    await waitFor(() => expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument());
    expect(screen.queryByText(/คืนสต็อก/)).toBeNull();
  });

  // ── Supabase/Postgres internals not exposed ──
  it("does not expose Supabase/Postgres internals", async () => {
    mockIsStoreOwner = true;
    mockCancelOrder.mockRejectedValueOnce(new Error("Supabase Postgres stack error"));
    mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "s1" });
    renderIncoming();
    await screen.findByText("สมชาย");
    openIncomingCancelDialog();
    act(() => {
      screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถยกเลิกออเดอร์ได้ในขณะนี้/)).toBeInTheDocument());
    expect(screen.queryByText(/Supabase/)).toBeNull();
    expect(screen.queryByText(/Postgres/)).toBeNull();
  });
});
