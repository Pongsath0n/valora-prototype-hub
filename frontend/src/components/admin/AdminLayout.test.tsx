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
      <AdminLayout title="test" subtitle="">
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

    // Staff back link sends them to their primary workspace (POS).
    const staffBackLink = screen.getByRole("link", { name: "กลับไป POS" });
    expect(staffBackLink).toHaveAttribute("href", "/staff/kiosk");

    const hrefs = allHrefs();
    expect(hrefs).toContain("/staff/kiosk");
    expect(hrefs).toContain("/staff/orders");

    // V1 staff must NOT see customers, dashboard, management, or system links.
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
      "/app/settings",
    ]) {
      expect(hrefs).not.toContain(forbidden);
    }
  });

  it("manager sees full owner navigation with management links, reports, and payment settings", () => {
    mockRoleState.role = "manager";
    renderLayout();

    const hrefs = allHrefs();
    // Owner nav items
    expect(hrefs).toContain("/owner/dashboard");
    expect(hrefs).toContain("/staff/kiosk");
    expect(hrefs).toContain("/staff/orders");
    expect(hrefs).toContain("/owner/menus");
    expect(hrefs).toContain("/owner/cost-items");
    expect(hrefs).toContain("/owner/recipes");
    expect(hrefs).toContain("/owner/reports");
    expect(hrefs).toContain("/owner/payment-settings");
    // Healholic V1: legacy /app/settings is removed from production nav.
    expect(hrefs).not.toContain("/app/settings");
    // User/Role Management are now in the store-management group.
    expect(hrefs).toContain("/system/users");
    expect(hrefs).toContain("/system/roles");
    // Deferred V1 features hidden from manager nav.
    expect(hrefs).not.toContain("/store-admin/channels");
    expect(hrefs).not.toContain("/store-admin/channel-pricing");
    expect(hrefs).not.toContain("/store-admin/reports");
    expect(hrefs).not.toContain("/store-admin/pos");
  });

  it("owner sees same navigation as manager", () => {
    mockRoleState.role = "owner";
    renderLayout();

    const hrefs = allHrefs();
    expect(hrefs).toContain("/owner/dashboard");
    expect(hrefs).toContain("/staff/kiosk");
    expect(hrefs).toContain("/owner/menus");
    expect(hrefs).toContain("/owner/cost-items");
    expect(hrefs).toContain("/owner/recipes");
    expect(hrefs).toContain("/owner/reports");
    expect(hrefs).toContain("/owner/payment-settings");
  });

  it("admin sees System Console link + business view nav, no staff back link", () => {
    mockRoleState.role = "admin";
    renderLayout();

    const hrefs = allHrefs();
    // System Console link present
    expect(hrefs).toContain("/system");
    // Business view nav present
    expect(hrefs).toContain("/owner/dashboard");
    expect(hrefs).toContain("/staff/kiosk");
    expect(hrefs).toContain("/owner/menus");
    expect(hrefs).toContain("/owner/cost-items");
    expect(hrefs).toContain("/owner/recipes");
    expect(hrefs).toContain("/owner/reports");
    expect(hrefs).toContain("/owner/payment-settings");
    // Admin must NOT see prototype /app/settings (utility nav hidden for admin)
    expect(hrefs).not.toContain("/app/settings");
    // Admin must NOT see the staff back link label
    expect(screen.queryByRole("link", { name: "กลับไป POS" })).toBeNull();
  });
});
