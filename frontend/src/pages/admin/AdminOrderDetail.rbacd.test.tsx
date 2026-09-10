import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminOrderDetailPage from "./AdminOrderDetail";

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

// Mutable role state — tests can change this between renders.
let mockRoleState: {
  role: string | null;
  currentStoreRole: string | null;
  loading: boolean;
  refreshRole: ReturnType<typeof vi.fn>;
};

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

const mockedGetOrder = vi.fn();
const mockedListOrderPayments = vi.fn();
const mockedListOrderItems = vi.fn();
const mockedCancelOrder = vi.fn();
const mockedUpdateOrderStatus = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    getOrder: (...a: unknown[]) => mockedGetOrder(...a),
    listOrderPayments: (...a: unknown[]) => mockedListOrderPayments(...a),
    listOrderItems: (...a: unknown[]) => mockedListOrderItems(...a),
    cancelOrder: (...a: unknown[]) => mockedCancelOrder(...a),
    updateOrderStatus: (...a: unknown[]) => mockedUpdateOrderStatus(...a),
  },
}));

vi.mock("@/components/admin/CancelOrderDialog", () => ({
  CancelOrderDialog: ({
    open,
    order,
    submitting,
    onConfirm,
    onClose,
  }: {
    open: boolean;
    order: { id: string; order_no?: string } | null;
    submitting: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="cancel-dialog">
        <p>confirm-cancel</p>
        <span>{order?.order_no ?? order?.id}</span>
        <button type="button" disabled={submitting} onClick={onConfirm}>
          {submitting ? "submitting" : "confirm"}
        </button>
        <button type="button" onClick={onClose}>back</button>
      </div>
    );
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ id: "ord_1" }) };
});

function setRole(profileRole: string | null, storeRole: string | null) {
  mockRoleState = {
    role: profileRole,
    currentStoreRole: storeRole,
    loading: false,
    refreshRole: vi.fn(),
  };
}

function makeOrder(status: string) {
  return {
    id: "ord_1",
    status,
    payment_status: "pending_payment",
    order_no: "A001",
    customer_name: "TestCustomer",
    customer_phone: "0812345678",
    total_amount: 120,
    total_cost: 0,
    channel_fee: 0,
    gross_profit: 0,
    items: [],
  };
}

const CANCEL_BTN = { name: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C" };

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminOrderDetailPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedGetOrder.mockReset();
  mockedListOrderPayments.mockReset();
  mockedListOrderItems.mockReset();
  mockedCancelOrder.mockReset();
  mockedUpdateOrderStatus.mockReset();
  mockedListOrderPayments.mockResolvedValue({ items: [], order_id: "ord_1", store_id: "s1" });
  mockedListOrderItems.mockResolvedValue({ items: [], order_id: "ord_1", store_id: "s1" });
  mockedCancelOrder.mockResolvedValue({ status: "cancelled", id: "ord_1" });
  mockedUpdateOrderStatus.mockResolvedValue({});
});

async function waitForOrderLoad() {
  // Wait for the order to load by checking for the customer name (ASCII)
  await screen.findByText(/TestCustomer/);
}

// ── RBACD01: Owner sees cancel on eligible pending_payment order detail ───
describe("RBACD01 owner sees cancel on pending_payment", () => {
  it("owner + pending_payment -> cancel button visible", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    expect(await screen.findByRole("button", CANCEL_BTN)).toBeInTheDocument();
  });
});

// ── RBACD02: Owner sees cancel on eligible accepted order detail ──────────
describe("RBACD02 owner sees cancel on accepted", () => {
  it("owner + accepted -> cancel button visible", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("accepted"));
    renderPage();
    expect(await screen.findByRole("button", CANCEL_BTN)).toBeInTheDocument();
  });
});

// ── RBACD03: Staff does NOT see cancel on order detail ────────────────────
describe("RBACD03 staff hidden", () => {
  it("staff + pending_payment -> cancel button NOT visible", async () => {
    setRole("staff", "staff");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD04: Manager does NOT see cancel on order detail ──────────────────
describe("RBACD04 manager hidden", () => {
  it("manager + pending_payment -> cancel button NOT visible", async () => {
    setRole("manager", "manager");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD05: profile admin + store manager does NOT see cancel ────────────
describe("RBACD05 profile admin + store manager hidden", () => {
  it("profileRole=admin + currentStoreRole=manager -> cancel NOT visible", async () => {
    setRole("admin", "manager");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD06: profile owner + store manager does NOT see cancel ────────────
describe("RBACD06 profile owner + store manager hidden", () => {
  it("profileRole=owner + currentStoreRole=manager -> cancel NOT visible", async () => {
    setRole("owner", "manager");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD07: currentStoreRole owner is the visibility source ──────────────
describe("RBACD07 currentStoreRole is source", () => {
  it("profileRole=staff + currentStoreRole=owner -> cancel visible", async () => {
    setRole("staff", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    expect(await screen.findByRole("button", CANCEL_BTN)).toBeInTheDocument();
  });

  it("profileRole=admin + currentStoreRole=owner -> cancel visible", async () => {
    setRole("admin", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    expect(await screen.findByRole("button", CANCEL_BTN)).toBeInTheDocument();
  });
});

// ── RBACD08: Preparing order does NOT show cancel ─────────────────────────
describe("RBACD08 preparing hidden", () => {
  it("owner + preparing -> cancel NOT visible", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("preparing"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD09: Ready order does NOT show cancel ─────────────────────────────
describe("RBACD09 ready hidden", () => {
  it("owner + ready -> cancel NOT visible", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("ready"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD10: Completed order does NOT show cancel ─────────────────────────
describe("RBACD10 completed hidden", () => {
  it("owner + completed -> cancel NOT visible", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("completed"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD11: Cancelled/voided order does NOT show cancel ──────────────────
describe("RBACD11 cancelled/voided hidden", () => {
  it("owner + cancelled -> cancel NOT visible", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("cancelled"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });

  it("owner + voided -> cancel NOT visible", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("voided"));
    renderPage();
    await waitForOrderLoad();
    expect(screen.queryByRole("button", CANCEL_BTN)).not.toBeInTheDocument();
  });
});

// ── RBACD12: Canonical cancelOrder remains used ───────────────────────────
describe("RBACD12 canonical cancelOrder used", () => {
  it("owner cancel triggers storeAdminApi.cancelOrder", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    const cancelButton = await screen.findByRole("button", CANCEL_BTN);
    fireEvent.click(cancelButton);
    await screen.findByText("confirm-cancel");
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    await waitFor(() => {
      expect(mockedCancelOrder).toHaveBeenCalledWith("ord_1");
    });
  });

  it("AdminOrderDetail source imports cancelOrder from storeAdminApi", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./AdminOrderDetail.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/cancelOrder/);
  });
});

// ── RBACD13: No PATCH cancelled ───────────────────────────────────────────
describe("RBACD13 no PATCH cancelled", () => {
  it("AdminOrderDetail does not use PATCH status=cancelled", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./AdminOrderDetail.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/status:\s*["']cancelled["']/);
  });

  it("cancel flow does not call updateOrderStatus with cancelled", async () => {
    setRole("owner", "owner");
    mockedGetOrder.mockResolvedValue(makeOrder("pending_payment"));
    renderPage();
    const cancelButton = await screen.findByRole("button", CANCEL_BTN);
    fireEvent.click(cancelButton);
    await screen.findByText("confirm-cancel");
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    await waitFor(() => {
      expect(mockedCancelOrder).toHaveBeenCalledWith("ord_1");
    });
    expect(mockedUpdateOrderStatus).not.toHaveBeenCalledWith(
      "ord_1",
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});

// ── RBACD14: No /cancel-atomic ────────────────────────────────────────────
describe("RBACD14 no cancel-atomic", () => {
  it("AdminOrderDetail does not reference cancel-atomic", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./AdminOrderDetail.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/cancel-atomic/);
  });

  it("storeAdminApi does not expose cancel-atomic", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../services/storeAdminApi.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/cancel-atomic/);
  });
});
