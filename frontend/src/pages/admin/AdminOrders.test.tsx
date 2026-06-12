import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import AdminOrdersPage from "./AdminOrders";

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listOrders: vi.fn().mockResolvedValue({ items: [] }),
    listPayments: vi.fn().mockResolvedValue({ payment_queue: [] }),
  },
}));

describe("AdminOrdersPage filter tabs", () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <AdminOrdersPage />
      </MemoryRouter>,
    );
  }

  it("renders the main operational tabs", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "คิวออเดอร์" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "รอตรวจสลิป" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "กำลังเตรียม" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "พร้อมรับ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เสร็จสิ้น" })).toBeInTheDocument();
  });

  it("does not render legacy or terminal status tabs", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "พร้อมรับ (Legacy)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "พร้อมรับ (Ready)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ยกเลิกแล้ว" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ถูกปฏิเสธ" })).not.toBeInTheDocument();
  });
});
