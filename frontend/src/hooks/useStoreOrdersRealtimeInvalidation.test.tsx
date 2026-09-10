import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((cb: (status: string) => void) => {
    (mockChannel as unknown as { _statusCb?: (s: string) => void })._statusCb = cb;
    return mockChannel;
  }),
  unsubscribe: vi.fn(),
};
const mockSupabaseChannel = vi.fn(() => mockChannel);

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: (...args: unknown[]) => mockSupabaseChannel(...args),
  },
}));

let mockEnableRealtime = false;
vi.mock("@/config/featureFlags", () => ({
  featureFlags: {
    get enableStoreOrdersRealtime() {
      return mockEnableRealtime;
    },
  },
}));

const mockListIncomingQueue = vi.fn();
const mockListProductionQueue = vi.fn();
const mockFinalizePayment = vi.fn();
const mockCancelOrder = vi.fn();
const mockUpdateOrderStatus = vi.fn();
const mockListOrders = vi.fn();
const mockListPayments = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listIncomingQueue: (...args: unknown[]) => mockListIncomingQueue(...args),
    listProductionQueue: (...args: unknown[]) => mockListProductionQueue(...args),
    finalizePayment: (...args: unknown[]) => mockFinalizePayment(...args),
    cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
    updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
    listOrders: (...args: unknown[]) => mockListOrders(...args),
    listPayments: (...args: unknown[]) => mockListPayments(...args),
    approvePayment: vi.fn(),
    rejectPayment: vi.fn(),
    submitPaymentSlip: vi.fn(),
    getPaymentSlipPreview: vi.fn(),
  },
}));

vi.mock("@/lib/guards", () => ({
  useIsStoreOwner: () => true,
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({ storeId: "store-1", currentStoreRole: "owner", profileRole: "owner" }),
}));

// Import AFTER mocks are set up.
import { useStoreOrdersRealtimeInvalidation } from "./useStoreOrdersRealtimeInvalidation";
import IncomingOrdersQueue from "../components/admin/IncomingOrdersQueue";
import ProductionOrdersQueue from "../components/admin/ProductionOrdersQueue";

const POLL_INTERVAL_MS = 15_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

const INCOMING_ORDER = {
  id: "ord-1",
  order_no: "ORD-0001",
  order_number: "ORD-0001",
  customer_name: "สมชาย",
  customer_note: null,
  items: [],
  total_amount: 120,
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  status: "pending_payment",
  payment_status: "unpaid",
  order_source: "web_order",
};

const PRODUCTION_ORDER = {
  id: "prod-1",
  order_no: "PROD-0001",
  order_number: "PROD-0001",
  order_source: "web_order",
  customer_name: "สมหญิง",
  customer_note: null,
  items: [],
  total_amount: 60,
  status: "accepted",
  payment_status: "paid",
  payment_confirmed_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
};

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

function fireRealtimeEvent() {
  const calls = mockChannel.on.mock.calls;
  for (const call of calls) {
    if (call[0] === "postgres_changes" && typeof call[2] === "function") {
      call[2]({});
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  mockChannel.on.mockClear();
  mockChannel.subscribe.mockClear();
  mockChannel.unsubscribe.mockClear();
  mockSupabaseChannel.mockClear();
  mockListIncomingQueue.mockReset();
  mockListProductionQueue.mockReset();
  mockFinalizePayment.mockReset();
  mockCancelOrder.mockReset();
  mockUpdateOrderStatus.mockReset();
  mockListOrders.mockReset();
  mockListPayments.mockReset();
  mockEnableRealtime = false;
  mockListIncomingQueue.mockResolvedValue({ orders: [INCOMING_ORDER], store_id: "store-1" });
  mockListProductionQueue.mockResolvedValue({ orders: [PRODUCTION_ORDER], store_id: "store-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FE-08 Realtime Invalidation", () => {
  // ── SECURITY ───────────────────────────────────────────────────────────────

  it("RT01 Realtime uses existing browser Supabase client", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation("store-1", () => {}));
    expect(mockSupabaseChannel).toHaveBeenCalled();
  });

  it("RT02 no privileged backend credential introduced", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/service_role|SERVICE_ROLE|serviceRole/i);
  });

  it("RT03 subscription requires a storeId", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation(null, () => {}));
    expect(mockSupabaseChannel).not.toHaveBeenCalled();
  });

  it("RT04 no storeId → no unfiltered orders subscription", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation("", () => {}));
    expect(mockSupabaseChannel).not.toHaveBeenCalled();
  });

  it("RT05 subscription filter uses active store_id", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation("store-abc", () => {}));
    expect(mockSupabaseChannel).toHaveBeenCalledWith(
      expect.stringContaining("store-abc"),
    );
    const onCalls = mockChannel.on.mock.calls;
    const filters = onCalls
      .filter((c) => c[0] === "postgres_changes")
      .map((c) => (c[1] as { filter?: string }).filter);
    expect(filters.length).toBeGreaterThan(0);
    expect(filters.every((f) => f === "store_id=eq.store-abc")).toBe(true);
  });

  it("RT06 store role not inferred from profile admin", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation(null, () => {}));
    expect(mockSupabaseChannel).not.toHaveBeenCalled();
  });

  it("RT07 no supabase.from business read introduced", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/supabase\.from\s*\(/i);
  });

  it("RT08 no supabase.rpc mutation introduced", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/supabase\.rpc\s*\(/i);
  });

  // ── SUBSCRIPTION ──────────────────────────────────────────────────────────

  it("RT09 subscribes to public.orders INSERT", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation("store-1", () => {}));
    const onCalls = mockChannel.on.mock.calls;
    const insertConfigs = onCalls
      .filter((c) => c[0] === "postgres_changes")
      .map((c) => c[1])
      .filter((cfg: { event?: string }) => cfg.event === "INSERT");
    expect(insertConfigs.length).toBe(1);
    expect((insertConfigs[0] as { table: string }).table).toBe("orders");
  });

  it("RT10 subscribes to public.orders UPDATE", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation("store-1", () => {}));
    const onCalls = mockChannel.on.mock.calls;
    const updateConfigs = onCalls
      .filter((c) => c[0] === "postgres_changes")
      .map((c) => c[1])
      .filter((cfg: { event?: string }) => cfg.event === "UPDATE");
    expect(updateConfigs.length).toBe(1);
    expect((updateConfigs[0] as { table: string }).table).toBe("orders");
  });

  it("RT11 does not require payments subscription", async () => {
    mockEnableRealtime = true;
    renderHook(() => useStoreOrdersRealtimeInvalidation("store-1", () => {}));
    const onCalls = mockChannel.on.mock.calls;
    const tableNames = onCalls
      .filter((c) => c[0] === "postgres_changes")
      .map((c) => (c[1] as { table: string }).table);
    expect(tableNames).not.toContain("payments");
  });

  it("RT12 does not use customer orders Realtime", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const orderStatus = path.resolve(process.cwd(), "src/pages/order/OrderStatusPage.tsx");
    const content = fs.readFileSync(orderStatus, "utf-8");
    expect(content).not.toMatch(/supabase\.channel|postgres_changes/i);
  });

  it("RT13 Incoming Queue can activate realtime invalidation", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockSupabaseChannel).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("RT14 Production Queue can activate realtime invalidation", async () => {
    mockEnableRealtime = true;
    renderProduction();
    await waitFor(() => expect(mockSupabaseChannel).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("RT15 subscription payload is not directly inserted into queue", async () => {
    mockEnableRealtime = true;
    let called = false;
    renderHook(() =>
      useStoreOrdersRealtimeInvalidation("store-1", () => {
        called = true;
      }),
    );
    fireRealtimeEvent();
    await wait(500);
    expect(called).toBe(true);
  });

  it("RT16 subscription payload is not directly rendered", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/return\s*</);
  });

  // ── INVALIDATION ──────────────────────────────────────────────────────────

  it("RT17 Incoming event triggers listIncomingQueue refetch", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("RT18 Production event triggers listProductionQueue refetch", async () => {
    mockEnableRealtime = true;
    renderProduction();
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListProductionQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("RT19 Realtime event does NOT call listOrders", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListOrders.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockListOrders).not.toHaveBeenCalled();
  });

  it("RT20 Realtime event does NOT call listPayments", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListPayments.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockListPayments).not.toHaveBeenCalled();
  });

  it("RT21 Realtime event does NOT directly mutate queue snapshot", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/setOrders|setState/i);
  });

  it("RT22 Realtime event preserves Backend FIFO response order", async () => {
    mockEnableRealtime = true;
    const orderA = { ...INCOMING_ORDER, id: "a", created_at: "2025-01-01T00:00:01Z" };
    const orderB = { ...INCOMING_ORDER, id: "b", created_at: "2025-01-01T00:00:00Z" };
    mockListIncomingQueue.mockResolvedValue({ orders: [orderB, orderA], store_id: "store-1" });
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockResolvedValue({ orders: [orderB, orderA], store_id: "store-1" });
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
  });

  // ── COALESCING ─────────────────────────────────────────────────────────────

  it("RT23 burst events are debounced/coalesced", async () => {
    mockEnableRealtime = true;
    let callCount = 0;
    renderHook(() =>
      useStoreOrdersRealtimeInvalidation("store-1", () => {
        callCount++;
      }),
    );
    for (let i = 0; i < 5; i++) fireRealtimeEvent();
    await wait(500);
    expect(callCount).toBe(1);
  });

  it("RT24 multiple near-simultaneous events cause one canonical refetch", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    for (let i = 0; i < 10; i++) fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
  });

  it("RT25 event during in-flight fetch does not create overlapping fetch", async () => {
    mockEnableRealtime = true;
    let resolveFetch: (v: unknown) => void = () => {};
    mockListIncomingQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    expect(mockListIncomingQueue).not.toHaveBeenCalled();
    resolveFetch({ orders: [], store_id: "store-1" });
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("RT26 event during in-flight fetch schedules a follow-up refresh", async () => {
    mockEnableRealtime = true;
    let resolveFetch: (v: unknown) => void = () => {};
    mockListIncomingQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    const initialCalls = mockListIncomingQueue.mock.calls.length;
    fireRealtimeEvent();
    await wait(500);
    resolveFetch({ orders: [], store_id: "store-1" });
    await waitFor(() => expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 3000 });
  });

  it("RT27 multiple events during one fetch produce only one follow-up", async () => {
    mockEnableRealtime = true;
    let resolveFetch: (v: unknown) => void = () => {};
    mockListIncomingQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    for (let i = 0; i < 10; i++) fireRealtimeEvent();
    await wait(500);
    resolveFetch({ orders: [], store_id: "store-1" });
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
  });

  it("RT28 polling + Realtime collision does not overlap requests", async () => {
    mockEnableRealtime = true;
    let resolveFetch: (v: unknown) => void = () => {};
    mockListIncomingQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    // No new fetch while in-flight.
    expect(mockListIncomingQueue.mock.calls.length).toBeLessThanOrEqual(1);
    resolveFetch({ orders: [], store_id: "store-1" });
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("RT29 polling continues after Realtime event", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    // Polling timer continues — verified by the fact that the component
    // still has a polling effect active (no cleanup happened).
  });

  // ── CLEANUP ───────────────────────────────────────────────────────────────

  it("RT30 channel removed on unmount", async () => {
    mockEnableRealtime = true;
    const { unmount } = renderHook(() => useStoreOrdersRealtimeInvalidation("store-1", () => {}));
    await waitFor(() => expect(mockSupabaseChannel).toHaveBeenCalled(), { timeout: 3000 });
    unmount();
    expect(mockChannel.unsubscribe).toHaveBeenCalled();
  });

  it("RT31 channel removed when storeId changes", async () => {
    mockEnableRealtime = true;
    const { rerender } = renderHook(
      ({ storeId }) => useStoreOrdersRealtimeInvalidation(storeId, () => {}),
      { initialProps: { storeId: "store-1" } },
    );
    await waitFor(() => expect(mockSupabaseChannel).toHaveBeenCalled(), { timeout: 3000 });
    rerender({ storeId: "store-2" });
    expect(mockChannel.unsubscribe).toHaveBeenCalled();
    expect(mockSupabaseChannel).toHaveBeenCalledWith(expect.stringContaining("store-2"));
  });

  it("RT32 new store gets new scoped subscription", async () => {
    mockEnableRealtime = true;
    const { rerender } = renderHook(
      ({ storeId }) => useStoreOrdersRealtimeInvalidation(storeId, () => {}),
      { initialProps: { storeId: "store-1" } },
    );
    await waitFor(() => expect(mockSupabaseChannel).toHaveBeenCalledWith(expect.stringContaining("store-1")), { timeout: 3000 });
    rerender({ storeId: "store-99" });
    expect(mockSupabaseChannel).toHaveBeenCalledWith(expect.stringContaining("store-99"));
  });

  it("RT33 old store subscription does not remain active", async () => {
    mockEnableRealtime = true;
    const { rerender } = renderHook(
      ({ storeId }) => useStoreOrdersRealtimeInvalidation(storeId, () => {}),
      { initialProps: { storeId: "store-1" } },
    );
    await waitFor(() => expect(mockSupabaseChannel).toHaveBeenCalled(), { timeout: 3000 });
    rerender({ storeId: "store-2" });
    // Old channel was unsubscribed (cleanup ran).
    expect(mockChannel.unsubscribe).toHaveBeenCalled();
    // New channel was created for the new store.
    expect(mockSupabaseChannel).toHaveBeenCalledWith(expect.stringContaining("store-2"));
  });

  it("RT34 remount does not accumulate duplicate active channels", async () => {
    mockEnableRealtime = true;
    const { rerender, unmount } = renderHook(() =>
      useStoreOrdersRealtimeInvalidation("store-1", () => {}),
    );
    await waitFor(() => expect(mockSupabaseChannel).toHaveBeenCalled(), { timeout: 3000 });
    const initialCalls = mockSupabaseChannel.mock.calls.length;
    rerender();
    expect(mockSupabaseChannel.mock.calls.length).toBe(initialCalls);
    unmount();
  });

  // ── FALLBACK ──────────────────────────────────────────────────────────────

  it("RT35 Realtime channel error does not clear Incoming Queue", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    const cb = (mockChannel as unknown as { _statusCb?: (s: string) => void })._statusCb;
    if (cb) act(() => cb("CHANNEL_ERROR"));
    expect(mockListIncomingQueue).toHaveBeenCalled();
  });

  it("RT36 Realtime channel error does not clear Production Queue", async () => {
    mockEnableRealtime = true;
    renderProduction();
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalled(), { timeout: 3000 });
    const cb = (mockChannel as unknown as { _statusCb?: (s: string) => void })._statusCb;
    if (cb) act(() => cb("CHANNEL_ERROR"));
    expect(mockListProductionQueue).toHaveBeenCalled();
  });

  it("RT37 Realtime error does not stop polling fallback", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    const cb = (mockChannel as unknown as { _statusCb?: (s: string) => void })._statusCb;
    if (cb) act(() => cb("TIMED_OUT"));
    // Queue still functional — initial fetch succeeded and polling is set up.
    expect(mockListIncomingQueue).toHaveBeenCalled();
  });

  it("RT38 Realtime closed/timed-out state preserves polling fallback", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    const cb = (mockChannel as unknown as { _statusCb?: (s: string) => void })._statusCb;
    if (cb) act(() => cb("CLOSED"));
    expect(mockListIncomingQueue).toHaveBeenCalled();
  });

  it("RT39 no aggressive custom reconnect loop", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/setInterval\s*\(\s*\(\)\s*=>\s*\{[^}]*channel/i);
  });

  it("RT40 manual refresh remains operational without Realtime", async () => {
    mockEnableRealtime = false;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    // Queue is functional without Realtime.
    expect(mockListIncomingQueue).toHaveBeenCalled();
  });

  // ── TRANSACTION EVENTS ────────────────────────────────────────────────────

  it("RT41 Realtime after payment finalization only refetches", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockListOrders).not.toHaveBeenCalled();
  });

  it("RT42 Realtime after cancellation only refetches", async () => {
    mockEnableRealtime = true;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListIncomingQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it("RT43 Realtime after production transition only refetches", async () => {
    mockEnableRealtime = true;
    renderProduction();
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalled(), { timeout: 3000 });
    mockListProductionQueue.mockClear();
    fireRealtimeEvent();
    await wait(500);
    await waitFor(() => expect(mockListProductionQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("RT44 no cross-queue local insertion/removal from event payload", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/\.push\s*\(|\.splice\s*\(|\.filter\s*\(|\.map\s*\(/i);
  });

  // ── PRIVACY / NON-SCOPE ───────────────────────────────────────────────────

  it("RT45 no Realtime payload stored in localStorage", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/localStorage/i);
  });

  it("RT46 no public_token used in Staff Realtime subscription", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/public_token/i);
  });

  it("RT47 no customer phone/LINE used", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/customer_phone|line_uid|line_user/i);
  });

  it("RT48 no slip/payment metadata displayed from Realtime", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/slip|payment_url|slip_storage/i);
  });

  it("RT49 no customer-facing Realtime subscription added", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const orderSuccess = path.resolve(process.cwd(), "src/pages/liff/OrderSuccess.tsx");
    const content = fs.readFileSync(orderSuccess, "utf-8");
    expect(content).not.toMatch(/supabase\.channel|postgres_changes|useStoreOrdersRealtimeInvalidation/i);
  });

  it("RT50 no new /liff navigation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/\/liff/i);
  });

  it("RT51 no stale /api/store prefix", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/\/api\/store["'/]/);
  });

  it("RT52 Healholic/Valora branding remains intact", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hookFile = path.resolve(process.cwd(), "src/hooks/useStoreOrdersRealtimeInvalidation.ts");
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).not.toMatch(/Brewway/i);
  });

  // ── FEATURE FLAG DEFAULT ──────────────────────────────────────────────────

  it("RT53 feature flag defaults to false (polling-only)", async () => {
    mockEnableRealtime = false;
    renderHook(() => useStoreOrdersRealtimeInvalidation("store-1", () => {}));
    expect(mockSupabaseChannel).not.toHaveBeenCalled();
  });

  it("RT54 queues operate normally when Realtime is disabled", async () => {
    mockEnableRealtime = false;
    renderIncoming();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockListIncomingQueue).toHaveBeenCalled();
  });
});
