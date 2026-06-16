import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CancelOrderDialog } from "./CancelOrderDialog";

// jsdom lacks a couple of APIs Radix touches when opening a dialog.
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
});

const order = {
  id: "ord_1",
  order_no: "A001",
  customer_name: "คุณสมชาย",
  status: "pending_payment",
  payment_status: "pending_payment",
  total_amount: 120,
};

describe("CancelOrderDialog", () => {
  it("renders nothing when closed", () => {
    render(<CancelOrderDialog open={false} order={order} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.queryByText("ยืนยันการยกเลิกออเดอร์")).not.toBeInTheDocument();
  });

  it("shows order context and both actions when open", () => {
    render(<CancelOrderDialog open order={order} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText("ยืนยันการยกเลิกออเดอร์")).toBeInTheDocument();
    // order number appears in the summary
    expect(screen.getAllByText("A001").length).toBeGreaterThan(0);
    expect(screen.getByText("คุณสมชาย")).toBeInTheDocument();
    expect(screen.getByText("฿120")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "กลับไปตรวจสอบ" })).toBeInTheDocument();
  });

  it("calls onConfirm only when the destructive action is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CancelOrderDialog open order={order} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกออเดอร์" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose (not onConfirm) when the secondary action is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CancelOrderDialog open order={order} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "กลับไปตรวจสอบ" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
