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

describe("AdminLayout navigation (Healholic V1)", () => {
  it("staff sees only POS (Kiosk) and Orders — the V1 staff scope", () => {
    mockRoleState.role = "staff";
    renderLayout();

    const staffBackLink = screen.getByRole("link", { name: "กลับไปแดชบอร์ดร้าน" });
    expect(staffBackLink).toHaveAttribute("href", "/staff");

    const hrefs = allHrefs();
    expect(hrefs).toContain("/staff/kiosk");
    expect(hrefs).toContain("/staff/orders");

    // V1 staff must NOT see customers, dashboard, management, or system links.
    // Note: the staff back link legitimately points to /staff, which is not a
    // nav item — it is the "back to dashboard" return link.
    for (const forbidden of [
      "/staff/customers",
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
      "/owner/payment-settings",
      "/store-admin/reports",
      "/system",
    ]) {
      expect(hrefs).not.toContain(forbidden);
    }
  });

  it("manager sees management links, canonical reports route, payment settings, and business back link", () => {
    mockRoleState.role = "manager";
    renderLayout();

    const backLink = screen.getByRole("link", { name: "กลับไปหน้าร้าน" });
    expect(backLink).toHaveAttribute("href", "/owner/dashboard");

    const hrefs = allHrefs();
    expect(hrefs).toContain("/staff/kiosk");
    expect(hrefs).toContain("/staff/orders");
    expect(hrefs).toContain("/owner/menus");
    expect(hrefs).toContain("/owner/cost-items");
    expect(hrefs).toContain("/owner/recipes");
    expect(hrefs).toContain("/owner/reports");
    expect(hrefs).toContain("/owner/payment-settings");
    // Deferred V1 features hidden from manager nav.
    expect(hrefs).not.toContain("/store-admin/channels");
    expect(hrefs).not.toContain("/store-admin/channel-pricing");
    expect(hrefs).not.toContain("/store-admin/reports");
    expect(hrefs).not.toContain("/store-admin/pos");
  });
});
