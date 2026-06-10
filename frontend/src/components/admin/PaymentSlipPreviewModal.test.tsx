import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PaymentSlipPreviewModal } from "./PaymentSlipPreviewModal";

const mockedGetPreview = vi.fn();
vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    getPaymentSlipPreview: (...args: any[]) => mockedGetPreview(...args),
  },
}));

describe("PaymentSlipPreviewModal", () => {
  const payment = {
    id: "pay_1",
    order_id: "ord_1",
    amount: 120,
    status: "pending",
    customer_name: "Test",
  } as any;

  it("closes via Escape and backdrop", async () => {
    mockedGetPreview.mockResolvedValue({ payment_id: "pay_1", signed_url: "https://example.com/slip.jpg", expires_in: 60 });
    const onClose = vi.fn();

    render(
      <PaymentSlipPreviewModal
        payment={payment}
        isOpen
        onClose={onClose}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        rejectReason=""
        onRejectReasonChange={() => {}}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByTestId("payment-slip-modal");
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
