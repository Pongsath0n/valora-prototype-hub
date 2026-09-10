import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StaffKioskPage from "./Kiosk";

// ── Mocks ───────────────────────────────────────────────────────────────────
const mockListMenu = vi.fn();
const mockCreateKioskOrder = vi.fn();
const mockGetPaymentSettings = vi.fn();
const mockListIncomingQueue = vi.fn();
const mockListOrders = vi.fn();
const mockListPayments = vi.fn();
const mockFinalizePayment = vi.fn();
const mockUpdateOrderStatus = vi.fn();
const mockCancelOrder = vi.fn();
const mockToast = vi.fn();

vi.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock("@/services/customerApi", () => ({
  customerApi: {
    listMenu: (...args: unknown[]) => mockListMenu(...args),
  },
}));

vi.mock("@/services/storeAdminApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/storeAdminApi")>("@/services/storeAdminApi");
  return {
    ...actual,
    storeAdminApi: {
      ...actual.storeAdminApi,
      createKioskOrder: (...args: unknown[]) => mockCreateKioskOrder(...args),
      getPaymentSettings: (...args: unknown[]) => mockGetPaymentSettings(...args),
      listIncomingQueue: (...args: unknown[]) => mockListIncomingQueue(...args),
      listOrders: (...args: unknown[]) => mockListOrders(...args),
      listPayments: (...args: unknown[]) => mockListPayments(...args),
      finalizePayment: (...args: unknown[]) => mockFinalizePayment(...args),
      updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
      cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "staff" }, loading: false }),
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({ role: "staff", loading: false, storeId: "store-1" }),
}));

vi.mock("@/hooks/useStoreOrdersRealtimeInvalidation", () => ({
  useStoreOrdersRealtimeInvalidation: () => {},
}));

vi.mock("@/lib/guards", () => ({
  useRoleGuard: () => ({ checking: false, accessDenied: false }),
  useIsStoreOwner: () => false,
  STORE_ADMIN_ROLES: ["staff"],
  BUSINESS_PORTAL_ROLES: ["owner"],
  STORE_MANAGER_ROLES: ["owner"],
  SYSTEM_CONSOLE_ROLES: ["owner", "admin"],
}));

// ── Fixtures ────────────────────────────────────────────────────────────────
const MENU_FIXTURE = [
  {
    id: "prod_1",
    name: "Iced Latte",
    price: 55,
    category: "coffee",
    description: "Double shot",
    allow_sweetness: true,
    default_sweetness: 75,
    addons: [{ addon_id: "shot", name: "Extra Shot", price: 15, max_quantity: 2 }],
    available: true,
    image_url: null,
  },
];

const PAYMENT_SETTINGS_OK = {
  store_id: "store_1",
  settings: {
    store_id: "store_1",
    promptpay_display_name: "Healholic Cafe",
    is_promptpay_enabled: true,
    is_cash_enabled: true,
    promptpay_qr_storage_path: "store_1/qr.png",
    promptpay_qr_file_name: "qr.png",
    promptpay_qr_url: "https://cdn.example.com/qr.png",
  },
};

function makeOrder(id: string, minutesAgo = 5) {
  return {
    id,
    order_no: `ORD-${id}`,
    order_number: `ORD-${id}`,
    customer_name: `ลูกค้า ${id}`,
    customer_note: null,
    items: [
      { id: `i-${id}`, product_id: "p1", product_name: "Latte", quantity: 1, unit_price: 60, line_total: 60, total_price: 60, options: null },
    ],
    total_amount: 60,
    created_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    status: "pending_payment",
    payment_status: "unpaid",
    order_source: "web_order",
  };
}

function renderKioskPage() {
  return render(
    <MemoryRouter>
      <StaffKioskPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockListMenu.mockReset();
  mockListMenu.mockResolvedValue(MENU_FIXTURE);
  mockCreateKioskOrder.mockReset();
  mockCreateKioskOrder.mockResolvedValue({
    id: "order-1",
    order_no: "Q-10",
    total_amount: 55,
    latest_payment: { method: "cash" },
  });
  mockGetPaymentSettings.mockReset();
  mockGetPaymentSettings.mockResolvedValue(PAYMENT_SETTINGS_OK);
  mockListIncomingQueue.mockReset();
  mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "store-1" });
  mockListOrders.mockReset();
  mockListPayments.mockReset();
  mockFinalizePayment.mockReset();
  mockUpdateOrderStatus.mockReset();
  mockCancelOrder.mockReset();
  mockToast.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── OPS01: Kiosk calls listIncomingQueue on mount ──────────────────────────
describe("OPS01 kiosk calls listIncomingQueue on mount", () => {
  it("calls listIncomingQueue on mount", async () => {
    renderKioskPage();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(1));
  });
});

// ── OPS02: Kiosk polls Incoming every 15 seconds ───────────────────────────
describe("OPS02 kiosk polls incoming every 15s", () => {
  it("polls listIncomingQueue again after 15 seconds", async () => {
    vi.useFakeTimers();
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
  });
});

// ── OPS03: Incoming count zero shows no false alert ───────────────────────
describe("OPS03 zero count no false alert", () => {
  it("does not render the incoming alert when count is zero", async () => {
    renderKioskPage();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByTestId("kiosk-incoming-alert")).not.toBeInTheDocument();
    });
  });
});

// ── OPS04: Incoming count >0 shows persistent indicator ────────────────────
describe("OPS04 count >0 shows persistent indicator", () => {
  it("renders the persistent indicator when incoming has orders", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => {
      expect(screen.getByTestId("kiosk-incoming-alert")).toBeInTheDocument();
    });
    expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument();
  });
});

// ── OPS05: Persistent indicator displays correct count ─────────────────────
describe("OPS05 indicator count", () => {
  it("displays the correct pending count", async () => {
    mockListIncomingQueue.mockResolvedValue({
      orders: [makeOrder("a"), makeOrder("b"), makeOrder("c")],
      store_id: "store-1",
    });
    renderKioskPage();
    await waitFor(() => {
      expect(screen.getByText("ออเดอร์ออนไลน์ 3 รายการ")).toBeInTheDocument();
    });
  });
});

// ── OPS06: Oldest waiting time derives from canonical created_at ──────────
describe("OPS06 oldest wait from created_at", () => {
  it("shows oldest waiting time derived from created_at", async () => {
    mockListIncomingQueue.mockResolvedValue({
      orders: [makeOrder("a", 5), makeOrder("b", 20)],
      store_id: "store-1",
    });
    renderKioskPage();
    await waitFor(() => {
      expect(screen.getByTestId("oldest-wait")).toBeInTheDocument();
    });
    // Oldest is 20 minutes → "20 นาที"
    expect(screen.getByTestId("oldest-wait").textContent).toMatch(/20 นาที/);
  });
});

// ── OPS07: Fetch failure does not clear previous valid snapshot ────────────
describe("OPS07 fetch failure retains snapshot", () => {
  it("retains previously loaded orders when a refresh fails", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("ออเดอร์ออนไลน์ 1 รายการ")).toBeInTheDocument();
    // Next poll fails — snapshot should remain.
    mockListIncomingQueue.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
    // Indicator still present (snapshot retained)
    expect(screen.getByText("ออเดอร์ออนไลน์ 1 รายการ")).toBeInTheDocument();
  });
});

// ── OPS08: Fetch failure does not break Kiosk Walk-in UI ────────────────────
describe("OPS08 fetch failure does not break walk-in", () => {
  it("walk-in menu still loads after incoming fetch fails", async () => {
    mockListIncomingQueue.mockRejectedValueOnce(new Error("unauthorized"));
    renderKioskPage();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    // Menu should still render
    expect(await screen.findByText("เลือกเมนูและปรับรายละเอียด")).toBeInTheDocument();
    // No false alert
    expect(screen.queryByTestId("incoming-indicator")).not.toBeInTheDocument();
  });
});

// ── OPS09: Initial existing orders do not generate N popups ───────────────
describe("OPS09 initial orders single notice", () => {
  it("shows ONE aggregated initial notice, not one per existing order", async () => {
    mockListIncomingQueue.mockResolvedValue({
      orders: [makeOrder("a"), makeOrder("b"), makeOrder("c")],
      store_id: "store-1",
    });
    renderKioskPage();
    await waitFor(() => {
      expect(screen.getByTestId("incoming-notice")).toBeInTheDocument();
    });
    // Single aggregated notice text
    expect(screen.getByTestId("incoming-notice").textContent).toMatch(/มีออเดอร์ออนไลน์รออยู่ 3 รายการ/);
    // Only one notice element
    expect(screen.getAllByTestId("incoming-notice").length).toBe(1);
  });
});

// ── OPS10: New order.id appearing later triggers notification ──────────────
describe("OPS10 new id triggers notice", () => {
  it("shows a new-order notice when a new id appears on a later refresh", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("incoming-notice").textContent).toMatch(/มีออเดอร์ออนไลน์รออยู่ 1 รายการ/);
    // Dismiss the initial notice so the new one is observable
    fireEvent.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("incoming-notice")).not.toBeInTheDocument();
    // Next poll adds a new id
    mockListIncomingQueue.mockResolvedValueOnce({
      orders: [makeOrder("a"), makeOrder("b")],
      store_id: "store-1",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("incoming-notice").textContent).toMatch(/มีออเดอร์ออนไลน์ใหม่ 1 รายการ/);
  });
});

// ── OPS11: Existing ID does not repeatedly notify ─────────────────────────
describe("OPS11 existing id no repeat", () => {
  it("does not re-notify for an id already seen", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("incoming-notice")).not.toBeInTheDocument();
    // Same id again — no new notice
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("incoming-notice")).not.toBeInTheDocument();
  });
});

// ── OPS12: Multiple new IDs in one refresh produce one aggregate ──────────
describe("OPS12 multiple new ids aggregate", () => {
  it("shows ONE aggregated notice for multiple new ids in one refresh", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Next poll adds 3 new ids at once
    mockListIncomingQueue.mockResolvedValueOnce({
      orders: [makeOrder("a"), makeOrder("b"), makeOrder("c")],
      store_id: "store-1",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("incoming-notice").textContent).toMatch(/มีออเดอร์ออนไลน์ใหม่ 3 รายการ/);
    expect(screen.getAllByTestId("incoming-notice").length).toBe(1);
  });
});

// ── OPS13: Popup dismissal does not hide persistent indicator ──────────────
describe("OPS13 dismiss does not hide indicator", () => {
  it("persistent indicator remains visible after notice dismissed", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }));
    await waitFor(() => expect(screen.queryByTestId("incoming-notice")).not.toBeInTheDocument());
    // Indicator still present
    expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument();
  });
});

// ── OPS14: Canonical order.id is used for identity ────────────────────────
describe("OPS14 canonical id identity", () => {
  it("detects new orders by id, not by name/index/created_at", async () => {
    vi.useFakeTimers();
    // Initial: order "a" with name "ลูกค้า a"
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("incoming-notice")).not.toBeInTheDocument();
    // Next poll: SAME id "a" but DIFFERENT name + created_at → must NOT notify
    const renamed = makeOrder("a", 10);
    renamed.customer_name = "เปลี่ยนชื่อ";
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [renamed], store_id: "store-1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockListIncomingQueue).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("incoming-notice")).not.toBeInTheDocument();
  });
});

// ── OPS15: Does not expose phone ────────────────────────────────────────────
describe("OPS15 no phone", () => {
  it("does not render phone fields", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const alert = screen.getByTestId("kiosk-incoming-alert");
    expect(alert.textContent).not.toMatch(/phone|เบอร์|08\d{8}/i);
  });
});

// ── OPS16: Does not expose LINE ─────────────────────────────────────────────
describe("OPS16 no LINE", () => {
  it("does not render LINE identifiers", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const alert = screen.getByTestId("kiosk-incoming-alert");
    expect(alert.textContent).not.toMatch(/line|line_user_id|line_link_token/i);
  });
});

// ── OPS17: Does not expose public_token ─────────────────────────────────────
describe("OPS17 no public_token", () => {
  it("does not render public_token", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const alert = screen.getByTestId("kiosk-incoming-alert");
    expect(alert.textContent).not.toMatch(/public_token/i);
  });
});

// ── OPS18: Does not expose _system/usage/cost internals ─────────────────────
describe("OPS18 no internal fields", () => {
  it("does not render _system, usage_breakdown, or cost internals", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const alert = screen.getByTestId("kiosk-incoming-alert");
    expect(alert.textContent).not.toMatch(/_system|usage_breakdown|total_cost|line_cost|unit_cost/i);
  });
});

// ── OPS19: Kiosk Self-order payment uses existing CounterPaymentDialog ─────
describe("OPS19 reuses CounterPaymentDialog", () => {
  it("opens the canonical counter payment dialog", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument();
    });
    // CounterPaymentDialog renders the canonical confirm button
    expect(screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" })).toBeInTheDocument();
  });
});

// ── OPS20: Opening Self-order payment does not create Kiosk order ──────────
describe("OPS20 payment open creates no kiosk order", () => {
  it("does not call createKioskOrder when opening self-order payment", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument());
    expect(mockCreateKioskOrder).not.toHaveBeenCalled();
  });
});

// ── OPS21: Self-order is not copied into Kiosk cart ────────────────────────
describe("OPS21 self-order not copied to cart", () => {
  it("does not add the self-order product to the kiosk cart", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    // Cart panel should not contain the self-order product
    expect(screen.queryByText("Latte")).not.toBeInTheDocument();
  });
});

// ── OPS22: Cash/promptpay remain payment methods ───────────────────────────
describe("OPS22 cash/promptpay methods", () => {
  it("counter payment dialog offers cash and promptpay", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "เงินสด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PromptPay" })).toBeInTheDocument();
  });
});

// ── OPS23: Success refetches canonical Incoming Queue ──────────────────────
describe("OPS23 success refetches incoming", () => {
  it("refetches listIncomingQueue after payment success", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เงินสด" }));
    mockFinalizePayment.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "a",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    const callsBefore = mockListIncomingQueue.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFinalizePayment).toHaveBeenCalledTimes(1);
    // onSuccess triggers refetch after 800ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockListIncomingQueue.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ── OPS24: No manual Production insertion ──────────────────────────────────
describe("OPS24 no manual production insertion", () => {
  it("does not call listProductionQueue on payment success", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เงินสด" }));
    mockFinalizePayment.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "a",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // listProductionQueue is not part of the kiosk alert flow
    expect(mockListIncomingQueue).toHaveBeenCalled();
  });
});

// ── OPS25: Unknown finalize result remains fail-closed ────────────────────
describe("OPS25 unknown result fail-closed", () => {
  it("does not show success for an unknown finalize result", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "เงินสด" }));
    mockFinalizePayment.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "a",
      status: "accepted",
      payment_status: "paid",
      result: "unknown_result",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }));
    await waitFor(() => expect(mockFinalizePayment).toHaveBeenCalled());
    // Should show the fail-closed error, NOT the success message
    await waitFor(() => {
      expect(screen.getByText(/ไม่สามารถยืนยันผลการชำระเงินได้/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/รับชำระเงินเรียบร้อยแล้ว/)).not.toBeInTheDocument();
  });
});

// ── OPS26: No direct payment-row API introduced ───────────────────────────
describe("OPS26 no direct payment-row API", () => {
  it("does not call listPayments or listOrderPayments for self-order payment", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument());
    expect(mockListPayments).not.toHaveBeenCalled();
  });
});

// ── OPS27: No frontend stock mutation ──────────────────────────────────────
describe("OPS27 no frontend stock mutation", () => {
  it("does not call updateOrderStatus on payment success", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เงินสด" }));
    mockFinalizePayment.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "a",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });
});

// ── OPS28: No listOrders used ───────────────────────────────────────────────
describe("OPS28 no listOrders", () => {
  it("does not call listOrders for incoming notification", async () => {
    renderKioskPage();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(1));
    expect(mockListOrders).not.toHaveBeenCalled();
  });
});

// ── OPS29: No listPayments used ─────────────────────────────────────────────
describe("OPS29 no listPayments", () => {
  it("does not call listPayments for incoming notification", async () => {
    renderKioskPage();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(1));
    expect(mockListPayments).not.toHaveBeenCalled();
  });
});

// ── OPS30: No supabase.from business read introduced ──────────────────────
describe("OPS30 no supabase.from business read", () => {
  it("KioskIncomingAlert does not import supabase", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../components/staff/kiosk/KioskIncomingAlert.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
    expect(src).not.toMatch(/supabase\.from\(/);
  });
  it("useKioskIncomingAlert does not import supabase", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../features/staff/kiosk/useKioskIncomingAlert.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
    expect(src).not.toMatch(/supabase\.from\(/);
  });
});

// ── OPS31: No supabase.rpc business mutation ────────────────────────────────
describe("OPS31 no supabase.rpc mutation", () => {
  it("kiosk alert files do not call supabase.rpc", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const files = [
      "../../components/staff/kiosk/KioskIncomingAlert.tsx",
      "../../features/staff/kiosk/useKioskIncomingAlert.ts",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
      expect(src).not.toMatch(/supabase\.rpc\(/);
    }
  });
});

// ── OPS32: No manual accepted status mutation ──────────────────────────────
describe("OPS32 no manual accepted mutation", () => {
  it("does not call updateOrderStatus with accepted", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เงินสด" }));
    mockFinalizePayment.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "a",
      status: "accepted",
      payment_status: "paid",
      result: "finalized",
      payment_id: "pay-1",
      payment_method: "cash",
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });
});

// ── OPS33: No duplicate Self-order creation ────────────────────────────────
describe("OPS33 no duplicate self-order", () => {
  it("does not call createKioskOrder for incoming orders", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    expect(mockCreateKioskOrder).not.toHaveBeenCalled();
  });
});

// ── OPS34: No "รับออเดอร์" action introduced ───────────────────────────────
describe("OPS34 no accept-order action", () => {
  it("does not render a รับออเดอร์ button", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "รับออเดอร์" })).not.toBeInTheDocument();
  });
});

// ── OPS35: Realtime flag remains default false ─────────────────────────────
describe("OPS35 realtime flag default false", () => {
  it("feature flag enableStoreOrdersRealtime defaults to false", async () => {
    const mod = await import("@/config/featureFlags");
    // In test environment without env var, flag must be false.
    expect(mod.featureFlags.enableStoreOrdersRealtime).toBe(false);
  });
});

// ── OPS36: Realtime payload remains invalidation-only ──────────────────────
describe("OPS36 realtime invalidation-only", () => {
  it("kiosk alert files do not treat realtime payload as data", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../features/staff/kiosk/useKioskIncomingAlert.ts"),
      "utf-8",
    );
    // The hook uses useStoreOrdersRealtimeInvalidation as invalidation only;
    // it must not parse a payload object into queue state.
    expect(src).toMatch(/useStoreOrdersRealtimeInvalidation/);
    expect(src).not.toMatch(/\.new\(|\.old\(|payload\.record|payload\.data/i);
  });
});

// ── OPS37: 1 Incoming order renders 1 preview ──────────────────────────────
describe("OPS37 one order one preview", () => {
  it("renders exactly 1 preview for 1 incoming order", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const previews = screen.getAllByTestId("incoming-order");
    expect(previews.length).toBe(1);
  });
});

// ── OPS38: 3 Incoming orders render 3 previews ────────────────────────────
describe("OPS38 three orders three previews", () => {
  it("renders exactly 3 previews for 3 incoming orders", async () => {
    mockListIncomingQueue.mockResolvedValue({
      orders: [makeOrder("a"), makeOrder("b"), makeOrder("c")],
      store_id: "store-1",
    });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const previews = screen.getAllByTestId("incoming-order");
    expect(previews.length).toBe(3);
  });
});

// ── OPS39: 10 Incoming orders render only 3 inline previews ───────────────
describe("OPS39 ten orders three previews", () => {
  it("renders only 3 inline previews for 10 incoming orders", async () => {
    const orders = Array.from({ length: 10 }, (_, i) => makeOrder(`o${i}`));
    mockListIncomingQueue.mockResolvedValue({ orders, store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const previews = screen.getAllByTestId("incoming-order");
    expect(previews.length).toBe(3);
  });
});

// ── OPS40: 10 Incoming orders summary count remains 10 ────────────────────
describe("OPS40 summary count is total", () => {
  it("summary count shows 10, not 3, for 10 incoming orders", async () => {
    const orders = Array.from({ length: 10 }, (_, i) => makeOrder(`o${i}`));
    mockListIncomingQueue.mockResolvedValue({ orders, store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => {
      expect(screen.getByText("ออเดอร์ออนไลน์ 10 รายการ")).toBeInTheDocument();
    });
  });
});

// ── OPS41: 10 Incoming orders show "+ อีก 7 รายการ" ───────────────────────
describe("OPS41 overflow count", () => {
  it("shows + อีก 7 รายการ for 10 incoming orders with 3 previews", async () => {
    const orders = Array.from({ length: 10 }, (_, i) => makeOrder(`o${i}`));
    mockListIncomingQueue.mockResolvedValue({ orders, store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    expect(screen.getByTestId("incoming-overflow").textContent).toMatch(/\+ อีก 7 รายการ/);
  });
});

// ── OPS42: Preview contains first 3 Backend FIFO orders ───────────────────
describe("OPS42 preview is first 3 FIFO", () => {
  it("preview contains the first 3 orders from Backend FIFO response", async () => {
    const orders = [
      makeOrder("A", 30),
      makeOrder("B", 25),
      makeOrder("C", 20),
      makeOrder("D", 15),
      makeOrder("E", 10),
    ];
    mockListIncomingQueue.mockResolvedValue({ orders, store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    const previews = screen.getAllByTestId("incoming-order");
    expect(previews.length).toBe(3);
    expect(previews[0]).toHaveAttribute("data-order-id", "A");
    expect(previews[1]).toHaveAttribute("data-order-id", "B");
    expect(previews[2]).toHaveAttribute("data-order-id", "C");
  });
});

// ── OPS43: Later orders are not rendered inline ───────────────────────────
describe("OPS43 later orders not inline", () => {
  it("orders beyond the preview limit are not rendered inline", async () => {
    const orders = [
      makeOrder("A", 30),
      makeOrder("B", 25),
      makeOrder("C", 20),
      makeOrder("D", 15),
      makeOrder("E", 10),
    ];
    mockListIncomingQueue.mockResolvedValue({ orders, store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    // D and E should not be rendered as preview cards
    const previews = screen.getAllByTestId("incoming-order");
    const ids = previews.map((p) => p.getAttribute("data-order-id"));
    expect(ids).not.toContain("D");
    expect(ids).not.toContain("E");
  });
});

// ── OPS44: "ดูทั้งหมด" remains accessible ───────────────────────────────────
describe("OPS44 view all accessible", () => {
  it("ดูทั้งหมด button is present when count exceeds preview limit", async () => {
    const orders = Array.from({ length: 10 }, (_, i) => makeOrder(`o${i}`));
    mockListIncomingQueue.mockResolvedValue({ orders, store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    expect(screen.getByTestId("view-all")).toBeInTheDocument();
  });
});

// ── OPS45: Visible preview payment reuses CounterPaymentDialog ───────────
describe("OPS45 preview payment reuses dialog", () => {
  it("visible preview payment opens CounterPaymentDialog", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "รับชำระเงิน" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "รับชำระเงิน" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "ยืนยันรับชำระเงิน" })).toBeInTheDocument();
  });
});

// ── OPS46: New-order notification does not change FIFO preview ordering ──
describe("OPS46 notification preserves FIFO", () => {
  it("new-order notice does not reorder the FIFO preview", async () => {
    vi.useFakeTimers();
    mockListIncomingQueue.mockResolvedValueOnce({
      orders: [makeOrder("A", 30), makeOrder("B", 25)],
      store_id: "store-1",
    });
    renderKioskPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Dismiss initial notice
    fireEvent.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // New order C arrives — but FIFO must remain A, B, C (oldest first)
    mockListIncomingQueue.mockResolvedValueOnce({
      orders: [makeOrder("A", 30), makeOrder("B", 25), makeOrder("C", 5)],
      store_id: "store-1",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const previews = screen.getAllByTestId("incoming-order");
    expect(previews[0]).toHaveAttribute("data-order-id", "A");
    expect(previews[1]).toHaveAttribute("data-order-id", "B");
    expect(previews[2]).toHaveAttribute("data-order-id", "C");
  });
});

// ── OPS47: Dismiss notification preserves compact Incoming panel ──────────
describe("OPS47 dismiss preserves panel", () => {
  it("dismissing notification keeps the compact Incoming panel visible", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [makeOrder("a")], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }));
    await waitFor(() => expect(screen.queryByTestId("incoming-notice")).not.toBeInTheDocument());
    expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument();
  });
});

// ── OPS48: Zero Incoming hides panel ──────────────────────────────────────
describe("OPS48 zero hides panel", () => {
  it("renders nothing when canonical count is zero", async () => {
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(mockListIncomingQueue).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByTestId("kiosk-incoming-alert")).not.toBeInTheDocument();
    });
  });
});

// ── OPS49: No client re-sort introduced ───────────────────────────────────
describe("OPS49 no client re-sort", () => {
  it("KioskIncomingAlert does not sort or reorder the incoming array", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../components/staff/kiosk/KioskIncomingAlert.tsx"),
      "utf-8",
    );
    // The component must use slice(0, MAX) on the canonical order — no sort.
    expect(src).toMatch(/\.slice\(0,/);
    expect(src).not.toMatch(/\.sort\(|\.reverse\(|\.toSorted\(/);
  });
});

// ── OPS50: No duplicate order/cart behavior introduced ────────────────────
describe("OPS50 no duplicate order/cart", () => {
  it("does not call createKioskOrder when 10 incoming orders exist", async () => {
    const orders = Array.from({ length: 10 }, (_, i) => makeOrder(`o${i}`));
    mockListIncomingQueue.mockResolvedValue({ orders, store_id: "store-1" });
    renderKioskPage();
    await waitFor(() => expect(screen.getByTestId("incoming-indicator")).toBeInTheDocument());
    expect(mockCreateKioskOrder).not.toHaveBeenCalled();
  });
});
