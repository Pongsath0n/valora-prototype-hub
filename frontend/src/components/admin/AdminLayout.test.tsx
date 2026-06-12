import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import AdminLayout from "./AdminLayout";

vi.mock("@/components/LogoBrand", () => ({
  default: () => <div data-testid="logo-brand" />,
}));

const signOutMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

const mockRoleState = { role: "staff" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

function renderLayout() {
  return render(
    <MemoryRouter>
      <AdminLayout title="test" subtitle="" forceHidePlaceholderNav>
        <div>content</div>
      </AdminLayout>
    </MemoryRouter>,
  );
}

function allHrefs() {
  return screen.getAllByRole("link").map((a) => a.getAttribute("href"));
}

describe("AdminLayout navigation", () => {
  it("staff sees only operational links and stays inside store-admin", () => {
    mockRoleState.role = "staff";
    renderLayout();

    const staffBackLink = screen.getByRole("link", { name: "กลับไปแดชบอร์ดร้าน" });
    expect(staffBackLink).toHaveAttribute("href", "/store-admin");

    const hrefs = allHrefs();
    expect(hrefs).toContain("/store-admin");
    expect(hrefs).toContain("/store-admin/orders");
    expect(hrefs).toContain("/store-admin/customers");

    // No POS, planning, reports, config/cost, or system access for staff.
    expect(screen.queryByText("POS")).toBeNull();
    for (const forbidden of [
      "/store-admin/pos",
      "/app/pos",
      "/app/planning",
      "/app/dashboard",
      "/app/reports",
      "/store-admin/menus",
      "/store-admin/channels",
      "/store-admin/channel-pricing",
      "/store-admin/ingredients",
      "/store-admin/recipes",
      "/store-admin/reports",
      "/system",
    ]) {
      expect(hrefs).not.toContain(forbidden);
    }
  });

  it("manager sees config links, canonical reports route, and business back link — but no POS", () => {
    mockRoleState.role = "manager";
    renderLayout();

    const backLink = screen.getByRole("link", { name: "กลับไปหน้าร้าน" });
    expect(backLink).toHaveAttribute("href", "/app/dashboard");

    const hrefs = allHrefs();
    expect(hrefs).toContain("/store-admin/menus");
    expect(hrefs).toContain("/store-admin/ingredients");
    expect(hrefs).toContain("/store-admin/recipes");
    expect(hrefs).toContain("/app/reports");
    expect(hrefs).not.toContain("/store-admin/reports");
    expect(hrefs).not.toContain("/store-admin/pos");
    expect(screen.queryByText("POS")).toBeNull();
  });
});
