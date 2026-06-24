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
    expect(staffBackLink).toHaveAttribute("href", "/staff");

    const hrefs = allHrefs();
    expect(hrefs).toContain("/staff");
    expect(hrefs).toContain("/staff/orders");
    expect(hrefs).toContain("/staff/customers");

    // No POS, planning, reports, config/cost, or system access for staff.
    expect(screen.queryByText("POS")).toBeNull();
    for (const forbidden of [
      "/store-admin/pos",
      "/app/pos",
      "/owner/profit-planning",
      "/owner/dashboard",
      "/owner/reports",
      "/owner/menus",
      "/store-admin/channels",
      "/store-admin/channel-pricing",
      "/owner/cost-items",
      "/owner/recipes",
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
    expect(backLink).toHaveAttribute("href", "/owner/dashboard");

    const hrefs = allHrefs();
    expect(hrefs).toContain("/owner/menus");
    expect(hrefs).toContain("/owner/cost-items");
    expect(hrefs).toContain("/owner/recipes");
    expect(hrefs).toContain("/owner/reports");
    expect(hrefs).not.toContain("/store-admin/reports");
    expect(hrefs).not.toContain("/store-admin/pos");
    expect(screen.queryByText("POS")).toBeNull();
  });
});
