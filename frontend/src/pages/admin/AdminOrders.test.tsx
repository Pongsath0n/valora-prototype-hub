import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AdminOrdersPage from "./AdminOrders";

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

const mockRoleState = { role: "owner" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

const mockedListOrders = vi.fn();
const mockedListPayments = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listOrders: (...args: any[]) => mockedListOrders(...args),
    listPayments: (...args: any[]) => mockedListPayments(...args),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminOrdersPage />
    </MemoryRouter>,
  );
}

describe("AdminOrdersPage filter tabs", () => {
  beforeEach(() => {
    mockedListOrders.mockReset();
    mockedListPayments.mockReset();
  });

  it("renders the main operational tabs", () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    mockedListPayments.mockResolvedValue({ payment_queue: [] });
    renderPage();
    expect(screen.getByRole("button", { name: "คิวออเดอร์" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "รอตรวจสลิป" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "กำลังเตรียม" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "พร้อมรับ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เสร็จสิ้น" })).toBeInTheDocument();
  });

  it("does not render legacy or terminal status tabs", () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    mockedListPayments.mockResolvedValue({ payment_queue: [] });
    renderPage();
    expect(screen.queryByRole("button", { name: "พร้อมรับ (Legacy)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "พร้อมรับ (Ready)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ยกเลิกแล้ว" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ถูกปฏิเสธ" })).not.toBeInTheDocument();
  });

  it("queue tab includes order with payment_status waiting_payment_review", async () => {
    mockedListOrders.mockResolvedValue({
      items: [
        { id: "ord_1", status: "accepted", payment_status: "waiting_payment_review", order_no: "A001", total_amount: 100 },
      ],
    });
    mockedListPayments.mockResolvedValue({ payment_queue: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText("A001")).toBeInTheDocument());
  });

  it("queue tab includes order with payment_status pending_review", async () => {
    mockedListOrders.mockResolvedValue({
      items: [
        { id: "ord_2", status: "accepted", payment_status: "pending_review", order_no: "A002", total_amount: 200 },
      ],
    });
    mockedListPayments.mockResolvedValue({ payment_queue: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText("A002")).toBeInTheDocument());
  });

  it("payments tab shows payment-review payment from listPayments", async () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    mockedListPayments.mockResolvedValue({
      payment_queue: [
        { id: "pay_1", order_id: "ord_1", order_no: "A001", amount: 120, status: "pending_review", customer_name: "Test" },
      ],
    });
    renderPage();

    const paymentsTab = screen.getByRole("button", { name: "รอตรวจสลิป" });
    fireEvent.click(paymentsTab);

    await waitFor(() => expect(screen.getByText("A001")).toBeInTheDocument());
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("queue tab excludes completed, cancelled, and rejected orders", async () => {
    mockedListOrders.mockResolvedValue({
      items: [
        { id: "ord_3", status: "completed", payment_status: "paid", order_no: "C001", total_amount: 100 },
        { id: "ord_4", status: "cancelled", payment_status: "cancelled", order_no: "X001", total_amount: 50 },
        { id: "ord_5", status: "rejected", payment_status: "rejected", order_no: "R001", total_amount: 75 },
        { id: "ord_6", status: "preparing", payment_status: "waiting_payment_review", order_no: "P001", total_amount: 150 },
      ],
    });
    mockedListPayments.mockResolvedValue({ payment_queue: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText("P001")).toBeInTheDocument());
    expect(screen.queryByText("C001")).not.toBeInTheDocument();
    expect(screen.queryByText("X001")).not.toBeInTheDocument();
    expect(screen.queryByText("R001")).not.toBeInTheDocument();
  });

  it("queue tab sorts oldest order first (FIFO)", async () => {
    mockedListOrders.mockResolvedValue({
      items: [
        { id: "ord_old", status: "pending_payment", payment_status: "pending", order_no: "OLD01", total_amount: 100, subtotal: 100, discount_amount: 0, channel_fee: 0, total_cost: 0, gross_profit: 0, updated_at: "2024-01-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
        { id: "ord_new", status: "accepted", payment_status: "waiting_payment_review", order_no: "NEW01", total_amount: 200, subtotal: 200, discount_amount: 0, channel_fee: 0, total_cost: 0, gross_profit: 0, updated_at: "2024-01-02T00:00:00Z", created_at: "2024-01-02T00:00:00Z" },
      ],
    });
    mockedListPayments.mockResolvedValue({ payment_queue: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText("OLD01")).toBeInTheDocument());
    const rows = screen.getAllByRole("row");
    expect(rows[1].textContent).toContain("OLD01");
    expect(rows[2].textContent).toContain("NEW01");
  });

  it("queue tab keeps older order before newer payment-review order (FIFO)", async () => {
    mockedListOrders.mockResolvedValue({
      items: [
        { id: "ord_old", status: "pending_payment", payment_status: "pending", order_no: "OLD01", total_amount: 100, subtotal: 100, discount_amount: 0, channel_fee: 0, total_cost: 0, gross_profit: 0, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
      ],
    });
    mockedListPayments.mockResolvedValue({
      payment_queue: [
        { id: "pay_1", order_id: "ord_new", order_no: "NEW01", amount: 120, status: "pending_review", customer_name: "New", created_at: "2024-01-02T00:00:00Z", store_id: "store_1" },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("NEW01")).toBeInTheDocument());
    const rows = screen.getAllByRole("row");
    expect(rows[1].textContent).toContain("OLD01");
    expect(rows[2].textContent).toContain("NEW01");
  });

  it("payments tab excludes a cancelled order's payment", async () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    mockedListPayments.mockResolvedValue({
      payment_queue: [
        { id: "pay_live", order_id: "ord_live", order_no: "LIVE01", amount: 120, status: "pending_review", slip_submitted: true, customer_name: "Active", order_status: "waiting_payment_review", created_at: "2024-01-01T00:00:00Z", store_id: "store_1" },
        { id: "pay_cancel", order_id: "ord_cancel", order_no: "CXL01", amount: 80, status: "pending_review", slip_submitted: true, customer_name: "Cancelled", order_status: "cancelled", created_at: "2024-01-02T00:00:00Z", store_id: "store_1" },
      ],
    });
    renderPage();

    const paymentsTab = screen.getByRole("button", { name: "รอตรวจสลิป" });
    fireEvent.click(paymentsTab);

    await waitFor(() => expect(screen.getByText("LIVE01")).toBeInTheDocument());
    expect(screen.queryByText("CXL01")).not.toBeInTheDocument();
  });

  it("does not duplicate rows when order exists in both orders and paymentQueue", async () => {
    mockedListOrders.mockResolvedValue({
      items: [
        { id: "ord_1", status: "accepted", payment_status: "pending_review", order_no: "A001", total_amount: 100, subtotal: 100, discount_amount: 0, channel_fee: 0, total_cost: 0, gross_profit: 0, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
      ],
    });
    mockedListPayments.mockResolvedValue({
      payment_queue: [
        { id: "pay_1", order_id: "ord_1", order_no: "A001", amount: 100, status: "pending_review", customer_name: "Test", created_at: "2024-01-01T00:00:00Z", store_id: "store_1" },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("A001")).toBeInTheDocument());
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(2);
  });

  it("queue tab includes synthetic order from paymentQueue when missing from orders", async () => {
    mockedListOrders.mockResolvedValue({ items: [] });
    mockedListPayments.mockResolvedValue({
      payment_queue: [
        { id: "pay_1", order_id: "ord_new", order_no: "SYN01", amount: 150, status: "pending_review", customer_name: "Synth", created_at: "2024-01-02T00:00:00Z", store_id: "store_1" },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("SYN01")).toBeInTheDocument());
  });
});
