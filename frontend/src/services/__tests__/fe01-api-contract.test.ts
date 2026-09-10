import { afterEach, describe, expect, it, vi } from "vitest";

import { customerApi, type CustomerOrderCreatePayload } from "../customerApi";
import {
  storeAdminApi,
  type IncomingQueueResponse,
  type ProductionQueueResponse,
  type FinalizePaymentResponse,
} from "../storeAdminApi";

// ── fetch mock helper ──────────────────────────────────────────────────────

type FetchCall = [input: string, init?: { method?: string; body?: string; headers?: Record<string, string> }];

function getLastFetchCall(): FetchCall {
  const calls = (globalThis.fetch as unknown as { mock: { calls: FetchCall[] } }).mock.calls;
  return calls[calls.length - 1];
}

function mockFetchOnce(payload: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }) as Response,
    ),
  );
}

function mockFetchSequence(...responses: { payload: unknown; status?: number }[]): void {
  const queue = [...responses];
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    const next = queue.shift();
    if (!next) throw new Error("no more mock responses");
    return Promise.resolve(
      new Response(JSON.stringify(next.payload), {
        status: next.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }) as Response,
    );
  });
}

// Supabase session mock for storeAdminApi Bearer auth
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: "test-token" } }, error: null }),
    },
  },
  getSupabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: "test-token" } }, error: null }),
    },
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// ── F01: customer payload phone optional ───────────────────────────────────

describe("F01 customer create order — phone optional", () => {
  it("accepts a payload without phone", () => {
    const payload: CustomerOrderCreatePayload = {
      customer: { name: "Somchai" },
      items: [{ product_id: "p1", quantity: 1 }],
    };
    // Type-level check: phone is optional, so this compiles.
    expect(payload.customer.phone).toBeUndefined();
  });

  it("sends the payload without phone to the backend", async () => {
    mockFetchOnce({ order_id: "ord-1", status: "pending_payment" });
    await customerApi.createOrder({
      customer: { name: "Somchai" },
      items: [{ product_id: "p1", quantity: 1 }],
    });
    const call = getLastFetchCall();
    const body = JSON.parse(call[1].body);
    expect(body.customer.phone).toBeUndefined();
    expect(body.customer.name).toBe("Somchai");
  });
});

// ── F02: customer payload pickup_time optional ─────────────────────────────

describe("F02 customer create order — pickup_time optional", () => {
  it("accepts a payload without pickup_time", () => {
    const payload: CustomerOrderCreatePayload = {
      customer: { name: "Somchai" },
      items: [{ product_id: "p1", quantity: 1 }],
    };
    expect(payload.pickup_time).toBeUndefined();
  });

  it("sends the payload without pickup_time to the backend", async () => {
    mockFetchOnce({ order_id: "ord-1", status: "pending_payment" });
    await customerApi.createOrder({
      customer: { name: "Somchai" },
      items: [{ product_id: "p1", quantity: 1 }],
    });
    const call = getLastFetchCall();
    const body = JSON.parse(call[1].body);
    expect(body.pickup_time).toBeUndefined();
  });
});

// ── F03: no price/cost/_system required by createOrder type ────────────────

describe("F03 customer create order — no price/cost/_system in type", () => {
  it("type does not require price, cost, total, or _system fields", () => {
    const payload: CustomerOrderCreatePayload = {
      customer: { name: "Somchai" },
      items: [{ product_id: "p1", quantity: 1 }],
    };
    // The type should not have these fields at the top level.
    expect("price" in payload).toBe(false);
    expect("cost" in payload).toBe(false);
    expect("total" in payload).toBe(false);
    expect("_system" in payload).toBe(false);
    expect("usage_breakdown" in payload).toBe(false);
  });
});

// ── F04: incoming queue service calls exact canonical route ────────────────

describe("F04 Incoming Queue — canonical route", () => {
  it("calls GET /api/store-admin/orders/incoming", async () => {
    const mockResponse: IncomingQueueResponse = { orders: [], store_id: "store-1" };
    mockFetchOnce(mockResponse);
    await storeAdminApi.listIncomingQueue();
    const call = getLastFetchCall();
    expect(call[0]).toContain("/api/store-admin/orders/incoming");
    expect(call[1].method).toBeUndefined(); // GET
  });
});

// ── F05: production queue service calls exact canonical route ──────────────

describe("F05 Production Queue — canonical route", () => {
  it("calls GET /api/store-admin/orders/production", async () => {
    const mockResponse: ProductionQueueResponse = { orders: [], store_id: "store-1" };
    mockFetchOnce(mockResponse);
    await storeAdminApi.listProductionQueue();
    const call = getLastFetchCall();
    expect(call[0]).toContain("/api/store-admin/orders/production");
    expect(call[1].method).toBeUndefined(); // GET
  });
});

// ── F06: production DTO captures payment_confirmed_at ──────────────────────

describe("F06 Production Queue — payment_confirmed_at in DTO", () => {
  it("response type includes payment_confirmed_at", async () => {
    const mockResponse: ProductionQueueResponse = {
      orders: [
        {
          id: "ord-1",
          order_no: "ORD-001",
          order_number: "ORD-001",
          order_source: "web_order",
          customer_name: "Somchai",
          customer_note: null,
          items: [],
          total_amount: 120,
          status: "accepted",
          payment_status: "paid",
          payment_confirmed_at: "2025-01-01T00:00:00Z",
        },
      ],
      store_id: "store-1",
    };
    mockFetchOnce(mockResponse);
    const result = await storeAdminApi.listProductionQueue();
    expect(result.orders[0].payment_confirmed_at).toBe("2025-01-01T00:00:00Z");
  });
});

// ── F07: finalizePayment uses POST /finalize-payment ───────────────────────

describe("F07 finalizePayment — canonical route", () => {
  it("calls POST /api/store-admin/orders/{id}/finalize-payment", async () => {
    const mockResponse: FinalizePaymentResponse = {
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    };
    mockFetchOnce(mockResponse);
    await storeAdminApi.finalizePayment("ord-1", { payment_method: "cash" });
    const call = getLastFetchCall();
    expect(call[0]).toContain("/api/store-admin/orders/ord-1/finalize-payment");
    expect(call[1].method).toBe("POST");
  });
});

// ── F08: payment method accepts cash ───────────────────────────────────────

describe("F08 finalizePayment — cash accepted", () => {
  it("accepts payment_method: cash", async () => {
    const mockResponse: FinalizePaymentResponse = {
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    };
    mockFetchOnce(mockResponse);
    const result = await storeAdminApi.finalizePayment("ord-1", { payment_method: "cash" });
    expect(result.payment_method).toBe("cash");
    const call = getLastFetchCall();
    const body = JSON.parse(call[1].body);
    expect(body.payment_method).toBe("cash");
  });
});

// ── F09: payment method accepts promptpay ─────────────────────────────────

describe("F09 finalizePayment — promptpay accepted", () => {
  it("accepts payment_method: promptpay", async () => {
    const mockResponse: FinalizePaymentResponse = {
      id: "ord-1",
      order_id: "ord-1",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "promptpay",
    };
    mockFetchOnce(mockResponse);
    const result = await storeAdminApi.finalizePayment("ord-1", { payment_method: "promptpay" });
    expect(result.payment_method).toBe("promptpay");
    const call = getLastFetchCall();
    const body = JSON.parse(call[1].body);
    expect(body.payment_method).toBe("promptpay");
  });
});

// ── F10: cancelOrder uses POST /cancel ─────────────────────────────────────

describe("F10 cancelOrder — canonical route", () => {
  it("calls POST /api/store-admin/orders/{id}/cancel", async () => {
    mockFetchOnce({ id: "ord-1", status: "cancelled" });
    await storeAdminApi.cancelOrder("ord-1", { reason: "test" });
    const call = getLastFetchCall();
    expect(call[0]).toContain("/api/store-admin/orders/ord-1/cancel");
    expect(call[1].method).toBe("POST");
  });
});

// ── F11: no V1 service uses /cancel-atomic ─────────────────────────────────

describe("F11 no /cancel-atomic in V1 service code", () => {
  it("storeAdminApi source does not reference cancel-atomic", () => {
    // The service object method is cancelOrder → /cancel.
    // We verify the method name is cancelOrder (not cancelAtomic).
    expect(typeof storeAdminApi.cancelOrder).toBe("function");
    expect((storeAdminApi as Record<string, unknown>).cancelAtomic).toBeUndefined();
  });

  it("cancelOrder route does not contain cancel-atomic", async () => {
    mockFetchOnce({ id: "ord-1", status: "cancelled" });
    await storeAdminApi.cancelOrder("ord-1", {});
    const call = getLastFetchCall();
    expect(call[0]).not.toContain("cancel-atomic");
    expect(call[0]).toContain("/cancel");
  });
});
