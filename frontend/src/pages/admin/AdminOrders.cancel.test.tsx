import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AdminOrdersPage from "./AdminOrders";

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

const mockRoleState = { role: "owner" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

const mockedListOrders = vi.fn();
const mockedListPayments = vi.fn();
const mockedUpdateOrderStatus = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listOrders: (...a: any[]) => mockedListOrders(...a),
    listPayments: (...a: any[]) => mockedListPayments(...a),
    updateOrderStatus: (...a: any[]) => mockedUpdateOrderStatus(...a),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminOrdersPage />
    </MemoryRouter>,
  );
}

const cancellableOrder = {
  id: "ord_1",
  status: "pending_payment",
  payment_status: "pending_payment",
  order_no: "A001",
  customer_name: "คุณสมชาย",
  total_amount: 120,
};

describe("AdminOrders Staff cancellation confirmation", () => {
  beforeEach(() => {
    mockedListOrders.mockReset();
    mockedListPayments.mockReset();
    mockedUpdateOrderStatus.mockReset();
    mockedListPayments.mockResolvedValue({ payment_queue: [] });
    mockedUpdateOrderStatus.mockResolvedValue({});
  });

  it("does not submit cancellation until the dialog is confirmed", async () => {
    mockedListOrders.mockResolvedValue({ items: [cancellableOrder] });
    renderPage();
    await screen.findByText("A001");

    const select = screen.getByRole("combobox", { name: "เลือกการดำเนินการถัดไป" });
    fireEvent.change(select, { target: { value: "cancelled" } });

    // Dialog appears; no request sent yet.
    expect(await screen.findByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument();
    expect(mockedUpdateOrderStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }));
    await waitFor(() => {
      expect(mockedUpdateOrderStatus).toHaveBeenCalledWith("ord_1", { status: "cancelled" });
    });
  });

  it("does not submit when the dialog is dismissed via กลับไปตรวจสอบ", async () => {
    mockedListOrders.mockResolvedValue({ items: [cancellableOrder] });
    renderPage();
    await screen.findByText("A001");

    fireEvent.change(screen.getByRole("combobox", { name: "เลือกการดำเนินการถัดไป" }), {
      target: { value: "cancelled" },
    });
    await screen.findByText("ยืนยันการยกเลิกออเดอร์");
    fireEvent.click(screen.getByRole("button", { name: "กลับไปตรวจสอบ" }));

    await waitFor(() => {
      expect(screen.queryByText("ยืนยันการยกเลิกออเดอร์")).not.toBeInTheDocument();
    });
    expect(mockedUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("non-cancel transitions still submit immediately without a dialog", async () => {
    mockedListOrders.mockResolvedValue({ items: [cancellableOrder] });
    renderPage();
    await screen.findByText("A001");

    fireEvent.change(screen.getByRole("combobox", { name: "เลือกการดำเนินการถัดไป" }), {
      target: { value: "waiting_payment_review" },
    });

    await waitFor(() => {
      expect(mockedUpdateOrderStatus).toHaveBeenCalledWith("ord_1", { status: "waiting_payment_review" });
    });
    expect(screen.queryByText("ยืนยันการยกเลิกออเดอร์")).not.toBeInTheDocument();
  });
});
