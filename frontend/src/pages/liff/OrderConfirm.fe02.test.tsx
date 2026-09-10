import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderConfirmPage from "./OrderConfirm";

const mockCreateOrder = vi.fn();
const mockListMenu = vi.fn();

vi.mock("@/services/customerApi", () => ({
  customerApi: {
    createOrder: (...args: unknown[]) => mockCreateOrder(...args),
    listMenu: (...args: unknown[]) => mockListMenu(...args),
  },
}));

const mockClearCart = vi.fn();
const mockSetLastOrderMetadata = vi.fn();
const mockReadCart = vi.fn();
const mockReconcile = vi.fn();

vi.mock("@/services/cartStorage", () => ({
  clearCart: () => mockClearCart(),
  setLastOrderMetadata: (meta: unknown) => mockSetLastOrderMetadata(meta),
  readCart: () => mockReadCart(),
  reconcileCartWithProductIds: (ids: Set<string>) => mockReconcile(ids),
  getCartItemLineTotal: (item: { price: number; quantity: number }) => item.price * item.quantity,
  getCartItemUnitPrice: (item: { price: number }) => item.price,
  getCartItemKey: (item: { productId: string }, index?: number) => `${item.productId}-${index ?? 0}`,
}));

vi.mock("@/components/customer/OrderFlowNav", () => ({
  default: () => <div data-testid="order-flow-nav" />,
  ORDER_NAV_LABELS: { status: "ดูสถานะออเดอร์" },
}));

const CART_ITEM = {
  productId: "p1",
  name: "Latte",
  price: 75,
  quantity: 2,
};

const CREATED_ORDER = {
  order_id: "order-1",
  order_number: "ORD-1234",
  status: "pending_payment",
  payment_status: "unpaid",
  total_amount: 150,
  public_token: "tok-abc",
};

function renderConfirm() {
  return render(
    <MemoryRouter>
      <OrderConfirmPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCreateOrder.mockReset();
  mockListMenu.mockReset();
  mockClearCart.mockReset();
  mockSetLastOrderMetadata.mockReset();
  mockReadCart.mockReset();
  mockReconcile.mockReset();

  mockReadCart.mockReturnValue([CART_ITEM]);
  mockListMenu.mockResolvedValue([{ id: "p1" }]);
  mockReconcile.mockReturnValue({ items: [CART_ITEM], removedCount: 0 });
});

// ── CUST01: Customer name is required ──────────────────────────────────────
describe("CUST01 customer name required", () => {
  it("disables submit when name is empty", () => {
    renderConfirm();
    const submit = screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ });
    expect(submit).toBeDisabled();
  });

  it("enables submit when name is provided and PDPA accepted", async () => {
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ })).not.toBeDisabled();
    });
  });
});

// ── CUST02: Phone is not required/rendered ─────────────────────────────────
describe("CUST02 phone not required", () => {
  it("does not render a phone input field", () => {
    renderConfirm();
    expect(screen.queryByLabelText(/เบอร์โทร/)).toBeNull();
    expect(screen.queryByPlaceholderText("08xxxxxxxx")).toBeNull();
  });
});

// ── CUST03: pickup_time is not required/rendered ───────────────────────────
describe("CUST03 pickup_time not required", () => {
  it("does not render a pickup-time selector", () => {
    renderConfirm();
    expect(screen.queryByLabelText(/เวลารับสินค้า/)).toBeNull();
  });
});

// ── CUST04: Note is optional ───────────────────────────────────────────────
describe("CUST04 note optional", () => {
  it("renders an optional note field", () => {
    renderConfirm();
    expect(screen.getByLabelText(/หมายเหตุเพิ่มเติม/)).toBeInTheDocument();
  });

  it("allows submit without a note", async () => {
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ })).not.toBeDisabled();
    });
  });
});

// ── CUST05: Create payload omits phone when absent ────────────────────────
describe("CUST05 payload omits phone", () => {
  it("does not include customer.phone in the createOrder payload", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    const payload = mockCreateOrder.mock.calls[0][0];
    expect(payload.customer).toBeDefined();
    expect(payload.customer.phone).toBeUndefined();
  });
});

// ── CUST06: Create payload omits pickup_time ───────────────────────────────
describe("CUST06 payload omits pickup_time", () => {
  it("does not include pickup_time in the createOrder payload", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    const payload = mockCreateOrder.mock.calls[0][0];
    expect(payload.pickup_time).toBeUndefined();
  });
});

// ── CUST07: No trusted frontend calculations in payload ─────────────────────
describe("CUST07 no trusted frontend values", () => {
  it("does not send price/cost/total/_system/usage_breakdown/ingredient data", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    const payload = mockCreateOrder.mock.calls[0][0];
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain("price");
    expect(payloadStr).not.toContain("cost");
    expect(payloadStr).not.toContain("total_amount");
    expect(payloadStr).not.toContain("total_cost");
    expect(payloadStr).not.toContain("_system");
    expect(payloadStr).not.toContain("usage_breakdown");
    expect(payloadStr).not.toContain("ingredient");
  });
});

// ── CUST08: Valid order navigates to /order/success ────────────────────────
describe("CUST08 navigate to success", () => {
  it("calls navigate to /order/success after successful create", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    expect(mockClearCart).toHaveBeenCalledTimes(1);
    expect(mockSetLastOrderMetadata).toHaveBeenCalledWith({
      orderId: "order-1",
      orderNo: "ORD-1234",
      publicToken: "tok-abc",
    });
  });
});

// ── CUST09: Cart clears only after successful create ───────────────────────
describe("CUST09 cart clear on success", () => {
  it("clears cart after successful createOrder", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockClearCart).toHaveBeenCalledTimes(1));
  });
});

// ── CUST10: Cart remains on API failure ────────────────────────────────────
describe("CUST10 cart retained on failure", () => {
  it("does not clear cart when createOrder fails", async () => {
    mockCreateOrder.mockRejectedValue(new Error("order_no_generation_exhausted"));
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    expect(mockClearCart).not.toHaveBeenCalled();
  });
});

// ── CUST11: Double submit prevented ────────────────────────────────────────
describe("CUST11 double submit prevention", () => {
  it("disables submit while request is in flight", async () => {
    let resolveCreate: (value: unknown) => void = () => undefined;
    mockCreateOrder.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    const submitBtn = screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /กำลังส่งคำสั่งซื้อ/ })).toBeDisabled();
    });

    resolveCreate(CREATED_ORDER);
    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
  });

  it("does not call createOrder twice on rapid double click", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    const submitBtn = screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ });
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
  });
});

// ── CUST21: order_no_generation_exhausted safely handled ───────────────────
describe("CUST21 order_no_generation_exhausted", () => {
  it("shows a safe message for order_no_generation_exhausted", async () => {
    mockCreateOrder.mockRejectedValue(new Error("order_no_generation_exhausted"));
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถสร้างคำสั่งซื้อได้ในขณะนี้/)).toBeInTheDocument(),
    );
  });
});

// ── CUST22: order_number_generation_failed safely handled ─────────────────
describe("CUST22 order_number_generation_failed", () => {
  it("shows a safe message for order_number_generation_failed", async () => {
    mockCreateOrder.mockRejectedValue(new Error("order_number_generation_failed"));
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() =>
      expect(screen.getByText(/ไม่สามารถสร้างคำสั่งซื้อได้ในขณะนี้/)).toBeInTheDocument(),
    );
  });
});

// ── CUST23: addon_not_available safely handled ─────────────────────────────
describe("CUST23 addon_not_available", () => {
  it("shows a safe message for addon_not_available", async () => {
    mockCreateOrder.mockRejectedValue(new Error("addon_not_available"));
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() =>
      expect(screen.getByText(/ตัวเลือกเพิ่มเติมที่เลือกไม่พร้อมให้บริการ/)).toBeInTheDocument(),
    );
  });
});

// ── CUST24: invalid_recipe_configuration safely handled ───────────────────
describe("CUST24 invalid_recipe_configuration", () => {
  it("shows a safe message for invalid_recipe_configuration", async () => {
    mockCreateOrder.mockRejectedValue(new Error("invalid_recipe_configuration"));
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() =>
      expect(screen.getByText(/รายการที่เลือกไม่พร้อมให้บริการในขณะนี้/)).toBeInTheDocument(),
    );
  });
});

// ── CUST27: Failed create does not navigate to success ─────────────────────
describe("CUST27 failed create stays on page", () => {
  it("does not clear cart or navigate on failure", async () => {
    mockCreateOrder.mockRejectedValue(new Error("network"));
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    expect(mockClearCart).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "ยืนยันคำสั่งซื้อ" })).toBeInTheDocument();
  });
});

// ── CUST28: Failed create does not clear entered name/note ─────────────────
describe("CUST28 failed create retains input", () => {
  it("keeps the customer name and note after a failure", async () => {
    mockCreateOrder.mockRejectedValue(new Error("network"));
    renderConfirm();
    const nameInput = screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/) as HTMLInputElement;
    const noteInput = screen.getByLabelText(/หมายเหตุเพิ่มเติม/) as HTMLTextAreaElement;
    fireEvent.change(nameInput, { target: { value: "สมชาย" } });
    fireEvent.change(noteInput, { target: { value: "ไม่ใส่ผักชี" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    expect(nameInput.value).toBe("สมชาย");
    expect(noteInput.value).toBe("ไม่ใส่ผักชี");
  });
});

// ── CUST31: createOrder payload does NOT include customer.line_user_id ───
describe("CUST31 no line_user_id in payload", () => {
  it("does not include customer.line_user_id in the createOrder payload", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    const payload = mockCreateOrder.mock.calls[0][0];
    expect(payload.customer.line_user_id).toBeUndefined();
  });
});

// ── CUST32: createOrder payload does NOT include line_link_token ──────────
describe("CUST32 no line_link_token in payload", () => {
  it("does not include line_link_token in the createOrder payload", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    const payload = mockCreateOrder.mock.calls[0][0];
    expect(payload.line_link_token).toBeUndefined();
  });
});

// ── CUST33: canonical payload contains only allowed customer identity ───
describe("CUST33 only customer.name in customer identity", () => {
  it("customer object contains only name (no phone, line_user_id, email)", async () => {
    mockCreateOrder.mockResolvedValue(CREATED_ORDER);
    renderConfirm();
    fireEvent.change(screen.getByLabelText(/ชื่อสำหรับการสั่งซื้อ/), {
      target: { value: "สมชาย" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันคำสั่งซื้อ/ }));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1));
    const payload = mockCreateOrder.mock.calls[0][0];
    expect(Object.keys(payload.customer).sort()).toEqual(["name"]);
    expect(payload.customer.name).toBe("สมชาย");
  });
});
