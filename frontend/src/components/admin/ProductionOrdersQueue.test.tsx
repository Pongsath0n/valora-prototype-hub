import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import ProductionOrdersQueue from "./ProductionOrdersQueue";

const mockListProductionQueue = vi.fn();
const mockListOrders = vi.fn();
const mockListPayments = vi.fn();
const mockUpdateOrderStatus = vi.fn();
const mockFinalizePayment = vi.fn();
const mockCancelOrder = vi.fn();
const mockListIncomingQueue = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listProductionQueue: (...args: unknown[]) => mockListProductionQueue(...args),
    listOrders: (...args: unknown[]) => mockListOrders(...args),
    listPayments: (...args: unknown[]) => mockListPayments(...args),
    listIncomingQueue: (...args: unknown[]) => mockListIncomingQueue(...args),
    updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
    finalizePayment: (...args: unknown[]) => mockFinalizePayment(...args),
    cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
    approvePayment: vi.fn(),
    rejectPayment: vi.fn(),
    submitPaymentSlip: vi.fn(),
    getPaymentSlipPreview: vi.fn(),
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

const ORDER_ACCEPTED = {
  id: "prod-1",
  order_no: "P-0001",
  order_number: "P-0001",
  order_source: "web_order",
  customer_name: "สมชาย",
  customer_note: "ไม่ใส่ผักชี",
  items: [
    { id: "i1", product_id: "p1", product_name: "Latte", quantity: 2, unit_price: 60, line_total: 120, total_price: 120, options: null },
  ],
  total_amount: 120,
  status: "accepted",
  payment_status: "paid",
  payment_confirmed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};

const ORDER_PREPARING = {
  ...ORDER_ACCEPTED,
  id: "prod-2",
  order_no: "P-0002",
  customer_name: "สมหญิง",
  customer_note: null,
  status: "preparing",
  payment_confirmed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
};

const ORDER_READY = {
  ...ORDER_ACCEPTED,
  id: "prod-3",
  order_no: "P-0003",
  customer_name: "สมศักดิ์",
  status: "ready",
  payment_confirmed_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
};

const ORDER_KIOSK = {
  ...ORDER_ACCEPTED,
  id: "prod-k",
  order_no: "P-KIOSK",
  order_source: "kiosk",
  customer_name: "ลูกค้าหน้าร้าน",
  payment_confirmed_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
};

const ORDER_BAD_TS = {
  ...ORDER_ACCEPTED,
  id: "prod-bad",
  order_no: "P-BAD",
  payment_confirmed_at: "not-a-date",
};

function renderQueue() {
  return render(
    <MemoryRouter>
      <ProductionOrdersQueue />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockListProductionQueue.mockReset();
  mockListOrders.mockReset();
  mockListPayments.mockReset();
  mockUpdateOrderStatus.mockReset();
  mockFinalizePayment.mockReset();
  mockCancelOrder.mockReset();
  mockListIncomingQueue.mockReset();
  mockUpdateOrderStatus.mockResolvedValue({ id: "x", status: "ok" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProductionOrdersQueue (canonical V1)", () => {
  // ── PROD01: Calls listProductionQueue ──
  it("PROD01 calls listProductionQueue on mount", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalledTimes(1));
  });

  // ── PROD02: Canonical endpoint ──
  it("PROD02 canonical endpoint is /api/store-admin/orders/production", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/services/storeAdminApi.ts");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).toMatch(/\/api\/store-admin\/orders\/production/);
  });

  // ── PROD03: Does not use listOrders ──
  it("PROD03 does not call listOrders", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListOrders).not.toHaveBeenCalled();
  });

  // ── PROD04: Does not use legacy payment queue ──
  it("PROD04 does not call listPayments", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListPayments).not.toHaveBeenCalled();
  });

  // ── PROD05: Immediate fetch ──
  it("PROD05 immediate fetch on mount", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalled());
  });

  // ── PROD06: 15-second polling ──
  it("PROD06 polls every 15 seconds", async () => {
    vi.useFakeTimers();
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListProductionQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListProductionQueue).toHaveBeenCalledTimes(2);
  });

  // ── PROD07: No overlapping queue fetch ──
  it("PROD07 does not overlap queue fetch", async () => {
    vi.useFakeTimers();
    let resolveFirst: (v: unknown) => void = () => {};
    mockListProductionQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListProductionQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListProductionQueue).toHaveBeenCalledTimes(1);
    resolveFirst({ orders: [], store_id: "s1" });
  });

  // ── PROD08: Polling cleanup on unmount ──
  it("PROD08 polling cleanup on unmount", async () => {
    vi.useFakeTimers();
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    const { unmount } = renderQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListProductionQueue).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockListProductionQueue).toHaveBeenCalledTimes(1);
  });

  // ── PROD09: Manual refresh uses canonical service ──
  it("PROD09 manual refresh uses listProductionQueue", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockListProductionQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวผลิต" }).click();
    });
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalledTimes(2));
  });

  // ── PROD10: Preserves Backend FIFO ──
  it("PROD10 preserves backend FIFO order", async () => {
    mockListProductionQueue.mockResolvedValue({
      orders: [ORDER_ACCEPTED, ORDER_PREPARING, ORDER_READY],
      store_id: "s1",
    });
    renderQueue();
    const names = await screen.findAllByText(/สมชาย|สมหญิง|สมศักดิ์/);
    expect(names[0]).toHaveTextContent("สมชาย");
    expect(names[1]).toHaveTextContent("สมหญิง");
    expect(names[2]).toHaveTextContent("สมศักดิ์");
  });

  // ── PROD11: Uses payment_confirmed_at ──
  it("PROD11 uses payment_confirmed_at as operational timestamp", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const ts = await screen.findByText(/รอ \d+ นาที/);
    expect(ts).toBeInTheDocument();
    expect(ts).toHaveAttribute("data-confirmed-time");
  });

  // ── PROD12: Does not use created_at as FIFO ──
  it("PROD12 does not sort by created_at", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/ProductionOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    // Component should reference payment_confirmed_at, not created_at for elapsed time.
    expect(content).toMatch(/payment_confirmed_at/);
    expect(content).not.toMatch(/created_at/);
  });

  // ── PROD13: No source priority ──
  it("PROD13 does not reorder by source priority", async () => {
    mockListProductionQueue.mockResolvedValue({
      orders: [ORDER_ACCEPTED, ORDER_KIOSK],
      store_id: "s1",
    });
    renderQueue();
    const names = await screen.findAllByText(/สมชาย|ลูกค้าหน้าร้าน/);
    // Backend order preserved — web_order first, kiosk second.
    expect(names[0]).toHaveTextContent("สมชาย");
    expect(names[1]).toHaveTextContent("ลูกค้าหน้าร้าน");
  });

  // ── PROD14: web_order source displayed safely ──
  it("PROD14 displays web_order source as สั่งเอง", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("สั่งเอง")).toBeInTheDocument();
  });

  // ── PROD15: kiosk source displayed safely ──
  it("PROD15 displays kiosk source as หน้าร้าน", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_KIOSK], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("หน้าร้าน")).toBeInTheDocument();
  });

  // ── PROD16: Dedup by order.id ──
  it("PROD16 deduplicates by order.id", async () => {
    mockListProductionQueue.mockResolvedValue({
      orders: [ORDER_ACCEPTED, { ...ORDER_ACCEPTED, items: [] }],
      store_id: "s1",
    });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.getAllByText("สมชาย").length).toBe(1);
  });

  // ── PROD17: Malformed timestamp does not crash ──
  it("PROD17 malformed payment_confirmed_at does not crash", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_BAD_TS], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("เวลาเข้าคิวไม่พร้อมใช้งาน")).toBeInTheDocument();
  });

  // ── PROD18: Malformed timestamp does not cause created_at fallback ──
  it("PROD18 malformed timestamp shows safe fallback, not created_at sort", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/ProductionOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    // No created_at fallback for timestamp display.
    expect(content).not.toMatch(/created_at/);
  });

  // ── PROD19: Order number displayed ──
  it("PROD19 displays order number", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("P-0001")).toBeInTheDocument();
  });

  // ── PROD20: Customer name displayed ──
  it("PROD20 displays customer name", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("สมชาย")).toBeInTheDocument();
  });

  // ── PROD21: Customer note displayed when present ──
  it("PROD21 displays customer note when present", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText(/ไม่ใส่ผักชี/)).toBeInTheDocument();
  });

  // ── PROD22: Items displayed ──
  it("PROD22 displays items", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("Latte")).toBeInTheDocument();
  });

  // ── PROD23: Quantity displayed ──
  it("PROD23 displays item quantity", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText(/x2/)).toBeInTheDocument();
  });

  // ── PROD24: Total displayed ──
  it("PROD24 displays total amount", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const totals = await screen.findAllByText("฿120");
    expect(totals.length).toBeGreaterThanOrEqual(1);
  });

  // ── PROD25: accepted label ──
  it("PROD25 displays accepted label รอเริ่มทำ", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("รอเริ่มทำ")).toBeInTheDocument();
  });

  // ── PROD26: preparing label ──
  it("PROD26 displays preparing label กำลังจัดเตรียม", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_PREPARING], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("กำลังจัดเตรียม")).toBeInTheDocument();
  });

  // ── PROD27: ready label ──
  it("PROD27 displays ready label พร้อมรับ", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_READY], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("พร้อมรับ")).toBeInTheDocument();
  });

  // ── PROD28: No internal/cost/slip fields ──
  it("PROD28 does not render internal/cost/slip fields", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/ต้นทุน/)).toBeNull();
    expect(screen.queryByText(/กำไร/)).toBeNull();
    expect(screen.queryByText(/cost/i)).toBeNull();
    expect(screen.queryByText(/สลิป/i)).toBeNull();
    expect(screen.queryByText(/_system/i)).toBeNull();
    expect(screen.queryByText(/usage_breakdown/i)).toBeNull();
  });

  // ── PROD29: accepted shows เริ่มทำ action ──
  it("PROD29 accepted shows เริ่มทำ action", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByRole("button", { name: "เริ่มทำ" })).toBeInTheDocument();
  });

  // ── PROD30: accepted action sends preparing ──
  it("PROD30 accepted action sends status=preparing", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "เริ่มทำ" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() =>
      expect(mockUpdateOrderStatus).toHaveBeenCalledWith("prod-1", { status: "preparing" }),
    );
  });

  // ── PROD31: preparing shows พร้อมรับ action ──
  it("PROD31 preparing shows พร้อมรับ action", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_PREPARING], store_id: "s1" });
    renderQueue();
    expect(await screen.findByRole("button", { name: "พร้อมรับ" })).toBeInTheDocument();
  });

  // ── PROD32: preparing action sends ready ──
  it("PROD32 preparing action sends status=ready", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_PREPARING], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "พร้อมรับ" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() =>
      expect(mockUpdateOrderStatus).toHaveBeenCalledWith("prod-2", { status: "ready" }),
    );
  });

  // ── PROD33: ready shows ส่งมอบแล้ว action ──
  it("PROD33 ready shows ส่งมอบแล้ว action", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_READY], store_id: "s1" });
    renderQueue();
    expect(await screen.findByRole("button", { name: "ส่งมอบแล้ว" })).toBeInTheDocument();
  });

  // ── PROD34: ready action sends completed ──
  it("PROD34 ready action sends status=completed", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_READY], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "ส่งมอบแล้ว" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() =>
      expect(mockUpdateOrderStatus).toHaveBeenCalledWith("prod-3", { status: "completed" }),
    );
  });

  // ── PROD35: Uses PATCH status-only operational service ──
  it("PROD35 uses updateOrderStatus (operational PATCH /status)", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "เริ่มทำ" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalled());
  });

  // ── PROD36: Does NOT use general PATCH /orders/{id} ──
  it("PROD36 does not use general updateOrder (non-status PATCH)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/ProductionOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    // Should use updateOrderStatus, not updateOrder.
    expect(content).toMatch(/updateOrderStatus/);
    expect(content).not.toMatch(/storeAdminApi\.updateOrder\b/);
  });

  // ── PROD37: Does NOT send cancelled ──
  it("PROD37 does not send status=cancelled", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED, ORDER_PREPARING, ORDER_READY], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    const buttons = screen.getAllByRole("button");
    const actionButtons = buttons.filter((b) =>
      ["เริ่มทำ", "พร้อมรับ", "ส่งมอบแล้ว"].includes(b.textContent || ""),
    );
    for (const b of actionButtons) {
      await act(async () => {
        b.click();
      });
    }
    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalled());
    for (const call of mockUpdateOrderStatus.mock.calls) {
      expect(call[1]).not.toEqual({ status: "cancelled" });
      expect(call[1]).not.toEqual({ status: "voided" });
    }
  });

  // ── PROD38: Does NOT send voided ──
  it("PROD38 does not send status=voided", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_READY], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "ส่งมอบแล้ว" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalled());
    for (const call of mockUpdateOrderStatus.mock.calls) {
      expect(call[1]).not.toEqual({ status: "voided" });
    }
  });

  // ── PROD39: No accepted→completed shortcut ──
  it("PROD39 does not expose accepted→completed shortcut", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    // Only เริ่มทำ button should exist for accepted — no ส่งมอบแล้ว shortcut.
    expect(screen.queryByRole("button", { name: "ส่งมอบแล้ว" })).toBeNull();
    expect(screen.queryByRole("button", { name: "พร้อมรับ" })).toBeNull();
  });

  // ── PROD40: Per-order mutation disabled while in flight ──
  it("PROD40 disables action button while mutation in flight", async () => {
    let resolveMutation: (v: unknown) => void = () => {};
    mockUpdateOrderStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const btn = (await screen.findByRole("button", { name: "เริ่มทำ" })) as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(btn.disabled).toBe(true));
    resolveMutation({ id: "prod-1", status: "preparing" });
    await waitFor(() => expect(btn.disabled).toBe(false));
  });

  // ── PROD41: Double-click does not duplicate mutation ──
  it("PROD41 double-click does not duplicate status mutation", async () => {
    let resolveMutation: (v: unknown) => void = () => {};
    mockUpdateOrderStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "เริ่มทำ" });
    await act(async () => {
      btn.click();
    });
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledTimes(1));
    resolveMutation({ id: "prod-1", status: "preparing" });
  });

  // ── PROD42: Mutation failure retains current order/status ──
  it("PROD42 mutation failure retains current order", async () => {
    mockUpdateOrderStatus.mockRejectedValueOnce(new Error("invalid_status_transition"));
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    const btn = screen.getByRole("button", { name: "เริ่มทำ" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalled());
    // Order still visible with accepted status.
    expect(screen.getByText("สมชาย")).toBeInTheDocument();
    expect(screen.getByText("รอเริ่มทำ")).toBeInTheDocument();
  });

  // ── PROD43: Mutation failure shows safe error UX ──
  it("PROD43 mutation failure shows safe error message", async () => {
    mockUpdateOrderStatus.mockRejectedValueOnce(new Error("invalid_status_transition"));
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "เริ่มทำ" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถเปลี่ยนสถานะได้/)).toBeInTheDocument(),
    );
  });

  // ── PROD44: Successful mutation triggers refetch ──
  it("PROD44 successful mutation triggers listProductionQueue refetch", async () => {
    mockListProductionQueue.mockResolvedValueOnce({ orders: [ORDER_READY], store_id: "s1" });
    mockListProductionQueue.mockResolvedValueOnce({ orders: [], store_id: "s1" });
    mockUpdateOrderStatus.mockResolvedValueOnce({ id: "prod-3", status: "completed" });
    renderQueue();
    await screen.findByText("สมศักดิ์");
    const btn = screen.getByRole("button", { name: "ส่งมอบแล้ว" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalledTimes(2));
  });

  // ── PROD45: Completed order disappears from refetched snapshot ──
  it("PROD45 completed order disappears after refetch", async () => {
    mockListProductionQueue.mockResolvedValueOnce({ orders: [ORDER_READY], store_id: "s1" });
    mockListProductionQueue.mockResolvedValueOnce({ orders: [], store_id: "s1" });
    mockUpdateOrderStatus.mockResolvedValueOnce({ id: "prod-3", status: "completed" });
    renderQueue();
    await screen.findByText("สมศักดิ์");
    const btn = screen.getByRole("button", { name: "ส่งมอบแล้ว" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(screen.getByText("ยังไม่มีออเดอร์ในคิวผลิต")).toBeInTheDocument());
  });

  // ── PROD46: No finalizePayment call ──
  it("PROD46 does not call finalizePayment", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(mockFinalizePayment).not.toHaveBeenCalled();
  });

  // ── PROD47: No cancel action ──
  it("PROD47 does not render cancel action", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByRole("button", { name: /ยกเลิก/i })).toBeNull();
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  // ── PROD48: No slip review UI ──
  it("PROD48 does not render slip review UI", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/อัปโหลดสลิป/i)).toBeNull();
    expect(screen.queryByText(/ตรวจสลิป/i)).toBeNull();
    expect(screen.queryByText(/สลิป/i)).toBeNull();
  });

  // ── PROD49: No Supabase Realtime ──
  it("PROD49 does not use Supabase Realtime", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/ProductionOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/supabase\.channel/i);
    expect(content).not.toMatch(/postgres_changes/i);
  });

  // ── PROD50: No stale /api/store prefix ──
  it("PROD50 does not use stale /api/store prefix", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/ProductionOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/\/api\/store["'/]/);
  });

  // ── PROD51: Staff/manager/owner route architecture ──
  it("PROD51 renders without role-specific errors", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("สมชาย")).toBeInTheDocument();
  });

  // ── PROD52: Branding rules intact ──
  it("PROD52 does not reintroduce customer-facing Brewway", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    expect(screen.queryByText(/Brewway/)).toBeNull();
  });

  // ── PROD53: Empty queue state ──
  it("PROD53 shows empty state when no production orders", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    renderQueue();
    expect(await screen.findByText("ยังไม่มีออเดอร์ในคิวผลิต")).toBeInTheDocument();
  });

  // ── PROD54: Initial loading state ──
  it("PROD54 shows loading state during initial load", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    mockListProductionQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    renderQueue();
    expect(screen.getByText("กำลังโหลดคิวผลิต...")).toBeInTheDocument();
    resolveFirst({ orders: [], store_id: "s1" });
    await waitFor(() => expect(screen.queryByText("กำลังโหลดคิวผลิต...")).toBeNull());
  });

  // ── PROD55: Initial error retry ──
  it("PROD55 shows retry on initial error", async () => {
    mockListProductionQueue.mockRejectedValueOnce(new Error("network"));
    renderQueue();
    await waitFor(() => expect(screen.getByText(/ไม่สามารถเชื่อมต่อระบบได้/)).toBeInTheDocument());
    expect(screen.getByText("ลองอีกครั้ง")).toBeInTheDocument();
  });

  // ── PROD56: Temporary polling failure retains previous queue ──
  it("PROD56 retains queue on temporary refresh failure", async () => {
    mockListProductionQueue.mockResolvedValueOnce({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    mockListProductionQueue.mockRejectedValueOnce(new Error("network"));
    renderQueue();
    await screen.findByText("สมชาย");
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวผลิต" }).click();
    });
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalledTimes(2));
    expect(screen.getByText("สมชาย")).toBeInTheDocument();
  });

  // ── PROD57: Successful refresh replaces stale snapshot ──
  it("PROD57 successful refresh replaces stale snapshot", async () => {
    mockListProductionQueue.mockResolvedValueOnce({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    mockListProductionQueue.mockResolvedValueOnce({ orders: [ORDER_PREPARING], store_id: "s1" });
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวผลิต" }).click();
    });
    await waitFor(() => expect(screen.getByText("สมหญิง")).toBeInTheDocument());
    expect(screen.queryByText("สมชาย")).toBeNull();
  });

  // ── PROD58: Order removed by backend disappears ──
  it("PROD58 removed order disappears after refresh", async () => {
    mockListProductionQueue.mockResolvedValueOnce({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    await screen.findByText("สมชาย");
    mockListProductionQueue.mockResolvedValueOnce({ orders: [], store_id: "s1" });
    await act(async () => {
      screen.getByRole("button", { name: "รีเฟรชคิวผลิต" }).click();
    });
    await waitFor(() => expect(screen.getByText("ยังไม่มีออเดอร์ในคิวผลิต")).toBeInTheDocument());
  });

  // ── PROD59: Status presentation not color-only ──
  it("PROD59 status label has text indication", async () => {
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const label = await screen.findByText("รอเริ่มทำ");
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute("data-status-label");
  });

  // ── PROD60: No new /liff navigation ──
  it("PROD60 does not introduce /liff navigation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const full = path.resolve(process.cwd(), "src/components/admin/ProductionOrdersQueue.tsx");
    const content = fs.readFileSync(full, "utf-8");
    expect(content).not.toMatch(/\/liff/i);
  });

  // ── Error mapping ──
  it("maps missing_token to session-expired message", async () => {
    mockListProductionQueue.mockRejectedValueOnce(new Error("missing_token"));
    renderQueue();
    await waitFor(() =>
      expect(screen.getByText(/เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ/)).toBeInTheDocument(),
    );
  });

  it("maps insufficient_role to permission message", async () => {
    mockListProductionQueue.mockRejectedValueOnce(new Error("insufficient_role"));
    renderQueue();
    await waitFor(() => expect(screen.getByText(/สิทธิ์ไม่เพียงพอ/)).toBeInTheDocument());
  });

  it("maps store_access_denied to access message", async () => {
    mockListProductionQueue.mockRejectedValueOnce(new Error("store_access_denied"));
    renderQueue();
    await waitFor(() =>
      expect(screen.getByText(/ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้/)).toBeInTheDocument(),
    );
  });

  it("maps order_not_found in mutation to safe message", async () => {
    mockUpdateOrderStatus.mockRejectedValueOnce(new Error("order_not_found"));
    mockListProductionQueue.mockResolvedValue({ orders: [ORDER_ACCEPTED], store_id: "s1" });
    renderQueue();
    const btn = await screen.findByRole("button", { name: "เริ่มทำ" });
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(screen.getByText(/ไม่พบคำสั่งซื้อ/)).toBeInTheDocument());
  });

  it("does not expose Supabase/Postgres internals", async () => {
    mockListProductionQueue.mockRejectedValueOnce(new Error("Supabase Postgres error"));
    renderQueue();
    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถดำเนินการได้ในขณะนี้/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Supabase/)).toBeNull();
    expect(screen.queryByText(/Postgres/)).toBeNull();
  });
});
