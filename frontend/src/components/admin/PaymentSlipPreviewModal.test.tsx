import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  function renderModal(props?: Partial<Parameters<typeof PaymentSlipPreviewModal>[0]>) {
    return render(
      <PaymentSlipPreviewModal
        payment={payment}
        isOpen
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        rejectReason=""
        onRejectReasonChange={() => {}}
        {...props}
      />,
    );
  }

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

  it("renders close button when slip image is present", async () => {
    mockedGetPreview.mockResolvedValue({ payment_id: "pay_1", signed_url: "https://example.com/slip.jpg", expires_in: 60 });
    renderModal();

    await waitFor(() => expect(screen.getByAltText("หลักฐานการโอน")).toBeInTheDocument());
    expect(screen.getByLabelText("ปิด")).toBeInTheDocument();
  });

  it("renders slip image inside constrained preview area", async () => {
    mockedGetPreview.mockResolvedValue({ payment_id: "pay_1", signed_url: "https://example.com/slip.jpg", expires_in: 60 });
    renderModal();

    const img = await screen.findByAltText("หลักฐานการโอน");
    expect(img).toBeInTheDocument();
    expect(img.className).toContain("max-h-[55vh]");
    expect(img.className).toContain("object-contain");
  });

  it("renders approve and reject controls", async () => {
    mockedGetPreview.mockResolvedValue({ payment_id: "pay_1", signed_url: "https://example.com/slip.jpg", expires_in: 60 });
    renderModal();

    await waitFor(() => expect(screen.getByText("อนุมัติการชำระเงิน")).toBeInTheDocument());
    expect(screen.getByText("ปฏิเสธการชำระเงิน")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("เช่น ยอดไม่ตรง สลิปหมดอายุ")).toBeInTheDocument();
  });
});
