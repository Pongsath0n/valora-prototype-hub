import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AdminOrderDetailPage from "./AdminOrderDetail";

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

const mockRoleState = {
  role: "owner" as string | null,
  currentStoreRole: "owner" as string | null,
  loading: false,
  refreshRole: vi.fn(),
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
        <p>ยืนยันการยกเลิกออเดอร์</p>
        <span>{order?.order_no ?? order?.id}</span>
        <button type="button" disabled={submitting} onClick={onConfirm}>
          {submitting ? "กำลังยกเลิก..." : "ยืนยันยกเลิกออเดอร์"}
        </button>
        <button type="button" onClick={onClose}>กลับไปตรวจสอบ</button>
      </div>
    );
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ id: "ord_1" }) };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminOrderDetailPage />
    </MemoryRouter>,
  );
}

const cancellableOrder = {
  id: "ord_1",
  status: "pending_payment",
  payment_status: "pending_payment",
  order_no: "A001",
  customer_name: "คุณสมชาย",
  customer_phone: "0812345678",
  total_amount: 120,
  total_cost: 0,
  channel_fee: 0,
  gross_profit: 0,
  items: [],
};

describe("AdminOrderDetail cancellation (FE-10 canonical cancelOrder)", () => {
  beforeEach(() => {
    mockedGetOrder.mockReset();
    mockedListOrderPayments.mockReset();
    mockedListOrderItems.mockReset();
    mockedCancelOrder.mockReset();
    mockedUpdateOrderStatus.mockReset();
    mockedGetOrder.mockResolvedValue(cancellableOrder);
    mockedListOrderPayments.mockResolvedValue({ items: [], order_id: "ord_1", store_id: "s1" });
    mockedListOrderItems.mockResolvedValue({ items: [], order_id: "ord_1", store_id: "s1" });
    mockedCancelOrder.mockResolvedValue({ status: "cancelled", id: "ord_1" });
    mockedUpdateOrderStatus.mockResolvedValue({});
  });

  it("uses canonical cancelOrder, NOT PATCH status=cancelled", async () => {
    renderPage();

    // Wait for the cancel button to appear (order has loaded).
    const cancelButton = await screen.findByRole("button", { name: "ยกเลิกออเดอร์" });
    fireEvent.click(cancelButton);

    await screen.findByText("ยืนยันการยกเลิกออเดอร์");
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }));

    await waitFor(() => {
      expect(mockedCancelOrder).toHaveBeenCalledWith("ord_1");
    });
    // updateOrderStatus must NOT be called with "cancelled"
    expect(mockedUpdateOrderStatus).not.toHaveBeenCalledWith("ord_1", expect.objectContaining({ status: "cancelled" }));
  });

  it("does not submit cancellation until the dialog is confirmed", async () => {
    renderPage();

    const cancelButton = await screen.findByRole("button", { name: "ยกเลิกออเดอร์" });
    fireEvent.click(cancelButton);

    expect(await screen.findByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument();
    expect(mockedCancelOrder).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }));
    await waitFor(() => {
      expect(mockedCancelOrder).toHaveBeenCalledWith("ord_1");
    });
  });

  it("does not submit when the dialog is dismissed via กลับไปตรวจสอบ", async () => {
    renderPage();

    const cancelButton = await screen.findByRole("button", { name: "ยกเลิกออเดอร์" });
    fireEvent.click(cancelButton);

    await screen.findByText("ยืนยันการยกเลิกออเดอร์");
    fireEvent.click(screen.getByRole("button", { name: "กลับไปตรวจสอบ" }));

    await waitFor(() => {
      expect(screen.queryByTestId("cancel-dialog")).not.toBeInTheDocument();
    });
    expect(mockedCancelOrder).not.toHaveBeenCalled();
  });
});
