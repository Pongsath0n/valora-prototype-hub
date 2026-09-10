import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import AdminOrdersPage from "./AdminOrders";

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

const mockRoleState = { role: "owner" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

const mockedListOrders = vi.fn();
const mockedListIncomingQueue = vi.fn();
const mockedListProductionQueue = vi.fn();
const mockedCancelOrder = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listOrders: (...args: unknown[]) => mockedListOrders(...args),
    listIncomingQueue: (...args: unknown[]) => mockedListIncomingQueue(...args),
    listProductionQueue: (...args: unknown[]) => mockedListProductionQueue(...args),
    cancelOrder: (...args: unknown[]) => mockedCancelOrder(...args),
  },
}));

vi.mock("@/components/admin/IncomingOrdersQueue", () => ({
  default: () => <div data-testid="incoming-queue-mock" />,
}));

vi.mock("@/components/admin/ProductionOrdersQueue", () => ({
  default: () => <div data-testid="production-queue-mock" />,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminOrdersPage />
    </MemoryRouter>,
  );
}

describe("AdminOrdersPage filter tabs (FE-10 cleanup)", () => {
  beforeEach(() => {
    mockedListOrders.mockReset();
    mockedListIncomingQueue.mockReset();
    mockedListProductionQueue.mockReset();
    mockedCancelOrder.mockReset();
    mockedListIncomingQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    mockedListProductionQueue.mockResolvedValue({ orders: [], store_id: "s1" });
    mockedCancelOrder.mockResolvedValue({ status: "cancelled", id: "ord_1" });
  });

  it("renders the canonical operational tabs", () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    renderPage();
    expect(screen.getByRole("button", { name: "คิวออเดอร์ใหม่" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "คิวผลิต" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "กำลังเตรียม" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "พร้อมรับ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เสร็จสิ้น" })).toBeInTheDocument();
  });

  it("does not render legacy payments/queue tabs", () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    renderPage();
    expect(screen.queryByRole("button", { name: "รอตรวจสลิป" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "คิวออเดอร์" })).not.toBeInTheDocument();
  });

  it("does not render legacy terminal status tabs", () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    renderPage();
    expect(screen.queryByRole("button", { name: "พร้อมรับ (Legacy)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ยกเลิกแล้ว" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ถูกปฏิเสธ" })).not.toBeInTheDocument();
  });

  it("does not call listPayments (legacy slip review removed)", () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    renderPage();
    // listPayments is not even mocked — if the page tried to call it,
    // it would throw. The page should not call any payment listing.
    expect(mockedListOrders).toHaveBeenCalledTimes(1);
  });

  it("does not render export payments button (legacy removed)", () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    renderPage();
    expect(screen.queryByRole("button", { name: /ส่งออกการชำระเงิน/ })).not.toBeInTheDocument();
  });
});
