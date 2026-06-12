import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import AdminDashboardPage from "./AdminDashboard";

vi.mock("@/components/LogoBrand", () => ({
  default: () => <div data-testid="logo-brand" />,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

const mockRoleState = { role: "staff" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

describe("Store Admin dashboard cards", () => {
  it("staff sees only daily-operation cards (orders, customers) — no POS or management cards", () => {
    mockRoleState.role = "staff";
    renderPage();

    expect(screen.getAllByText("ออเดอร์").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ลูกค้า").length).toBeGreaterThan(0);

    expect(screen.queryByText("POS")).toBeNull();
    expect(screen.queryByText("การจัดการร้าน (ผู้จัดการขึ้นไป)")).toBeNull();
    expect(screen.queryByText("ราคาตามช่องทาง")).toBeNull();
  });

  it("owner sees management cards but no POS card", () => {
    mockRoleState.role = "owner";
    renderPage();

    expect(screen.getByText("การจัดการร้าน (ผู้จัดการขึ้นไป)")).toBeInTheDocument();
    expect(screen.queryByText("POS")).toBeNull();
  });
});
