import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AdminOrdersPage from "./AdminOrders";

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
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
});
