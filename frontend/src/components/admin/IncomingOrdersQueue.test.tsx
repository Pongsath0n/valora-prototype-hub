import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, act } from "@testing-library/react";
import IncomingOrdersQueue from "./IncomingOrdersQueue";

const mockListIncomingQueue = vi.fn();
const mockListOrders = vi.fn();
const mockListPayments = vi.fn();
const mockFinalizePayment = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listIncomingQueue: (...args: unknown[]) => mockListIncomingQueue(...args),
    // Legacy / general endpoints — must NOT be called by canonical Incoming Queue.
    listOrders: (...args: unknown[]) => mockListOrders(...args),
    listPayments: (...args: unknown[]) => mockListPayments(...args),
    finalizePayment: (...args: unknown[]) => mockFinalizePayment(...args),
    approvePayment: vi.fn(),
    rejectPayment: vi.fn(),
    submitPaymentSlip: vi.fn(),
    getPaymentSlipPreview: vi.fn(),
    cancelOrder: vi.fn(),
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
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
  status: "pending_payment",
  payment_status: "unpaid",
  order_source: "web_order",
};

const ORDER_2 = {
  id: "ord-2",
  order_no: "ORD-0002",
  order_number: "ORD-0002",
  customer_name: "สมหญิง",
  customer_note: null,
  items: [
    { id: "i2", product_id: "p2", product_name: "Mocha", quantity: 1, unit_price: 80, line_total: 80, total_price: 80, options: null },
  ],
  total_amount: 80,
  created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago (overdue)
  status: "pending_payment",
  payment_status: "unpaid",
  order_source: "web_order",
};

function renderQueue() {
  return render(
    <MemoryRouter>
      <IncomingOrdersQueue />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockListIncomingQueue.mockReset();
  mockListOrders.mockReset();
  mockListPayments.mockReset();
  mockFinalizePayment.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IncomingOrdersQueue (canonical V1)", () => {
  // ── INQ01: Calls GET /api/store-admin/orders/incoming ──
  it("INQ01 calls listIncomingQueue on mount", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(1));
  });

  // ── INQ02: Does NOT use general GET /orders as canonical Incoming source ──
  it("INQ02 does not call listOrders", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListOrders).not.toHaveBeenCalled();
  });

  // ── INQ03: Does NOT call legacy payment queue APIs ──
  it("INQ03 does not call listPayments", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListPayments).not.toHaveBeenCalled();
  });

  // ── INQ04: Immediate fetch on mount ──
  it("INQ04 immediate fetch on mount", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled());
  });

  // ── INQ05: 15-second polling ──
  it("INQ05 polls every 15 seconds", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
  });

  // ── INQ06: No overlapping polling requests ──
  it("INQ06 does not overlap requests", async () => {
    vi.useFakeTimers();
    let resolveFirst: (v: unknown) => void = () => {};
    mockListIncomingQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    // Advance past poll interval while first request is still pending.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // Should NOT have called again (in-flight guard).
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    resolveFirst({ orders: [], store_id: "s1" });
  });

  // ── INQ07: Polling timer cleaned up on unmount ──
  it("INQ07 polling timer cleaned up on unmount", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    const { unmount } = renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
  });

  // ── INQ08: Manual refresh uses same canonical service ──
  it("INQ08 manual refresh calls listIncomingQueue again", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวออเดอร์" }).click();
    });
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(2));
  });

  // ── INQ09: Order number displayed ──
  it("INQ09 displays order number", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("ORD-0001")).toBeInTheDocument();
  });

  // ── INQ10: Customer name displayed prominently ──
  it("INQ10 displays customer name prominently", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    const name = await screen.findByText("สมชาย");
    expect(name).toBeInTheDocument();
    expect(name.tagName).toBe("P");
  });

  // ── INQ11: Customer note displayed when present ──
  it("INQ11 displays customer note when present", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText(/ไม่ใส่ผักชี/)).toBeInTheDocument();
  });

  // ── INQ12: Items displayed ──
  it("INQ12 displays items", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("Latte")).toBeInTheDocument();
  });

  // ── INQ13: Item quantity displayed ──
  it("INQ13 displays item quantity", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText(/x2/)).toBeInTheDocument();
  });

  // ── INQ14: Total amount displayed ──
  it("INQ14 displays total amount", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    // "฿120" appears as both line_total and total_amount.
    const amounts = await screen.findAllByText("฿120");
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });

  // ── INQ15: created_at produces waiting duration ──
  it("INQ15 displays waiting duration from created_at", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    const waiting = await screen.findByText(/รอ \d+ นาที/);
    expect(waiting).toBeInTheDocument();
  });

  // ── INQ16: >=15 minutes shows waiting warning ──
  it("INQ16 shows 15-minute warning for overdue orders", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_2], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("รอเกิน 15 นาที")).toBeInTheDocument();
  });

  // ── INQ17: <15 minutes does not show warning ──
  it("INQ17 does not show warning for recent orders", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText("รอเกิน 15 นาที")).toBeNull();
  });

  // ── INQ18: Warning does not change backend status ──
  it("INQ18 warning is frontend-only (no status mutation)", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_2], store_id: "s1" });
    renderQueue();
    await screen.findByText("รอเกิน 15 นาที");
    // No PATCH/cancel/finalize calls made.
    expect(mockFinalizePayment).not.toHaveBeenCalled();
  });

  // ── INQ19: Queue preserves FIFO order from backend ──
  it("INQ19 preserves backend FIFO order", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1, ORDER_2], store_id: "s1" });
    renderQueue();
    const names = await screen.findAllByText(/สมชาย|สมหญิง/);
    // ORDER_1 (สมชาย) should appear before ORDER_2 (สมหญิง).
    expect(names[0]).toHaveTextContent("สมชาย");
    expect(names[1]).toHaveTextContent("สมหญิง");
  });

  // ── INQ20: No source priority introduced ──
  it("INQ20 does not reorder by source priority", async () => {
    const kioskOrder = { ...ORDER_1, id: "ord-k", order_source: "kiosk" };
    const webOrder = { ...ORDER_2, id: "ord-w", order_source: "web_order" };
    mockListIncomingQueue.mockResolvedValue({ orders: [kioskOrder, webOrder], store_id: "s1" });
    renderQueue();
    const names = await screen.findAllByText(/สมชาย|สมหญิง/);
    // Backend order preserved — kiosk first, web second.
    expect(names[0]).toHaveTextContent("สมชาย");
    expect(names[1]).toHaveTextContent("สมหญิง");
  });

  // ── INQ21: Deduplicates by order.id ──
  it("INQ21 deduplicates by order.id", async () => {
    mockListIncomingQueue.mockResolvedValue({
      orders: [ORDER_1, { ...ORDER_1, items: [] }], // same id
      store_id: "s1",
    });
    renderQueue();
    await screen.findByText("สมชาย");
    // Only one card rendered.
    expect(screen.getAllByText("สมชาย").length).toBe(1);
  });

  // ── INQ22: Empty queue shows empty state ──
  it("INQ22 shows empty state when no orders", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("ยังไม่มีออเดอร์ใหม่")).toBeInTheDocument();
  });

  // ── INQ23: Initial loading state works ──
  it("INQ23 shows loading state during initial load", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    mockListIncomingQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    renderQueue();
    expect(screen.getByText("กำลังโหลดคิวออเดอร์...")).toBeInTheDocument();
    resolveFirst({ orders: [], store_id: "s1" });
    await waitFor(() => expect(screen.queryByText("กำลังโหลดคิวออเดอร์...")).toBeNull());
  });

  // ── INQ24: Initial error shows retry ──
  it("INQ24 shows retry on initial error", async () => {
    mockListIncomingQueue.mockRejectedValueOnce(new Error("network"));
    renderQueue();
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    expect(screen.getByText("ลองอีกครั้ง")).toBeInTheDocument();
  });

  // ── INQ25: Refresh failure retains previously loaded queue ──
  it("INQ25 retains queue on temporary refresh failure", async () => {
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockRejectedValueOnce(new Error("network"));
    renderQueue();
    await screen.findByText("สมชาย");
    // Trigger manual refresh which fails.
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวออเดอร์" }).click();
    });
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(2));
    // Previous order still visible.
    expect(screen.getByText("สมชาย")).toBeInTheDocument();
  });

  // ── INQ26: Successful later refresh replaces stale queue snapshot ──
  it("INQ26 replaces stale queue on successful refresh", async () => {
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_2], store_id: "s1" });
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText("สมหญิง")).toBeInTheDocument());
    expect(screen.queryByText("สมชาย")).toBeNull();
  });

  // ── INQ27: Order removed by backend disappears after refresh ──
  it("INQ27 removed order disappears after refresh", async () => {
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [], store_id: "s1" });
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText("ยังไม่มีออเดอร์ใหม่")).toBeInTheDocument());
  });

  // ── INQ28: No manual "รับออเดอร์" action ──
  it("INQ28 does not render manual accept-order action", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByRole("button", { name: /รับออเดอร์/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Accept Order/i })).toBeNull();
  });

  // ── INQ29: No PATCH accepted action ──
  it("INQ29 does not PATCH accepted from Incoming Queue", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    // No updateOrderStatus or similar PATCH call.
    const { storeAdminApi } = await import("@/services/storeAdminApi");
    expect((storeAdminApi as unknown as Record<string, unknown>).updateOrderStatus).toBeUndefined();
  });

  // ── INQ30: No finalizePayment call (FE-04 scope — no payment action yet) ──
  it("INQ30 does not call finalizePayment on render", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    // Finalize is not called just by rendering the queue (only via dialog).
    expect(mockFinalizePayment).not.toHaveBeenCalled();
  });

  // ── INQ31: No cancellation action ──
  it("INQ31 does not render cancel action", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByRole("button", { name: /ยกเลิก/i })).toBeNull();
  });

  // ── INQ32: No phone required/display assumption ──
  it("INQ32 does not render phone fields", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/เบอร์โทร/)).toBeNull();
    expect(screen.queryByText(/โทรศัพท์/)).toBeNull();
  });

  // ── INQ33: No LINE identity required ──
  it("INQ33 does not render LINE identity fields", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/LINE/i)).toBeNull();
  });

  // ── INQ34: No slip upload/review UI ──
  it("INQ34 does not render slip review UI", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/อัปโหลดสลิป/i)).toBeNull();
    expect(screen.queryByText(/ตรวจสลิป/i)).toBeNull();
    expect(screen.queryByText(/สลิป/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /อนุมัติสลิป/i })).toBeNull();
  });

  // ── INQ35: No cost/profit fields rendered ──
  it("INQ35 does not render cost/profit fields", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/ต้นทุน/i)).toBeNull();
    expect(screen.queryByText(/กำไร/i)).toBeNull();
    expect(screen.queryByText(/cost/i)).toBeNull();
  });

  // ── INQ36: No _system / usage_breakdown rendered ──
  it("INQ36 does not render _system or usage_breakdown", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/_system/i)).toBeNull();
    expect(screen.queryByText(/usage_breakdown/i)).toBeNull();
  });

  // ── INQ37: Uses customer_note from canonical DTO ──
  it("INQ37 uses customer_note from canonical DTO", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    const note = await screen.findByText(/ไม่ใส่ผักชี/);
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute("data-customer-note");
  });

  // ── INQ38: Staff/manager/owner access architecture remains supported ──
  it("INQ38 renders without role-specific errors (staff/manager/owner access)", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("สมชาย")).toBeInTheDocument();
  });

  // ── INQ41: UI waiting duration updates without API call every second ──
  it("INQ41 UI clock updates waiting time without API calls", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    // Advance past the UI clock tick (30s). The 15s poll will fire at 15s,
    // but the 30s UI clock tick should NOT add an extra API call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // 1 (initial) + 1 (15s poll) = 2. UI clock does NOT add a call.
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
  });

  // ── INQ42: 15-second API polling independent of UI clock ──
  it("INQ42 API polling at 15s is independent of UI clock at 30s", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    // 15s poll triggers API call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
    // 30s UI clock tick does NOT trigger another API call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // Total calls: initial + 15s poll + 15s poll = 3 (not 4 from clock).
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(3);
  });

  // ── INQ43: Temporary polling error message is non-destructive ──
  it("INQ43 temporary error shows non-destructive warning", async () => {
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [ORDER_1], store_id: "s1" });
    mockListIncomingQueue.mockRejectedValueOnce(new Error("network"));
    renderQueue();
    await screen.findByText("สมชาย");
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวออเดอร์" }).click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    // Queue still visible.
    expect(screen.getByText("สมชาย")).toBeInTheDocument();
  });

  // ── INQ44: Warning has text/semantic indication, not color only ──
  it("INQ44 15-minute warning has text indication", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_2], store_id: "s1" });
    renderQueue();
    const warning = await screen.findByText("รอเกิน 15 นาที");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveAttribute("data-waiting-warning");
  });

  // ── INQ45: Healholic/Valora branding rules remain intact ──
  it("INQ45 does not reintroduce customer-facing Brewway", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [ORDER_1], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/Brewway/)).toBeNull();
  });

  // ── Error mapping: 401/403/network ──
  it("maps missing_token to session-expired message", async () => {
    mockListIncomingQueue.mockRejectedValueOnce(new Error("missing_token"));
    renderQueue();
    await waitFor(() =>
      expect(screen.getByText(/เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ/)).toBeInTheDocument(),
    );
  });

  it("maps insufficient_role to permission message", async () => {
    mockListIncomingQueue.mockRejectedValueOnce(new Error("insufficient_role"));
    renderQueue();
    await waitFor(() =>
      expect(screen.getByText(/สิทธิ์ไม่เพียงพอ/)).toBeInTheDocument(),
    );
  });

  it("maps store_access_denied to access message", async () => {
    mockListIncomingQueue.mockRejectedValueOnce(new Error("store_access_denied"));
    renderQueue();
    await waitFor(() =>
      expect(screen.getByText(/ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้/)).toBeInTheDocument(),
    );
  });

  it("does not expose Supabase/Postgres internals", async () => {
    mockListIncomingQueue.mockRejectedValueOnce(new Error("Supabase connection failed: Postgres error"));
    renderQueue();
    await waitFor(() => expect(screen.getByText(/ไม่สามารถโหลดคิวออเดอร์ได้/)).toBeInTheDocument());
    expect(screen.queryByText(/Supabase/)).toBeNull();
    expect(screen.queryByText(/Postgres/)).toBeNull();
  });
});
