import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import AppLayout from "./AppLayout";

vi.mock("@/components/LogoBrand", () => ({
  default: () => <div data-testid="logo-brand" />,
}));

const mockAuthState = { user: { id: "user_1" }, session: null, loading: false, signOut: vi.fn() };
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const mockRoleState = { role: "owner" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout>
        <div>content</div>
      </AppLayout>
    </MemoryRouter>,
  );
}

function allHrefs() {
  return screen.getAllByRole("link").map((a) => a.getAttribute("href"));
}

describe("AppLayout owner navigation (Healholic V1)", () => {
  it("shows the V1 owner scope: Dashboard, POS, Products, Ingredients, Recipes, Orders, Reports, Payment Settings", () => {
    mockRoleState.role = "owner";
    renderLayout();

    const hrefs = allHrefs();
    for (const expected of [
      "/owner/dashboard",
      "/staff/kiosk",
      "/staff/orders",
      "/owner/reports",
      "/owner/menus",
      "/owner/cost-items",
      "/owner/recipes",
      "/owner/payment-settings",
    ]) {
      expect(hrefs).toContain(expected);
    }
  });

  it("hides deferred V1 features (profit-planning, system console overview, channels, channel-pricing) from owner nav", () => {
    mockRoleState.role = "owner";
    renderLayout();

    const hrefs = allHrefs();
    for (const hidden of [
      "/owner/profit-planning",
      "/system",
      "/system/health",
      "/system/audit-logs",
      "/store-admin/channels",
      "/store-admin/channel-pricing",
      "/staff/customers",
    ]) {
      expect(hrefs).not.toContain(hidden);
    }
  });

  it("owner nav includes User/Role Management under store-management group", () => {
    mockRoleState.role = "owner";
    renderLayout();

    const hrefs = allHrefs();
    expect(hrefs).toContain("/system/users");
    expect(hrefs).toContain("/system/roles");
  });

  it("does not show legacy /app config routes, /admin links, or legacy POS routes", () => {
    mockRoleState.role = "owner";
    renderLayout();

    const hrefs = allHrefs();
    for (const forbidden of [
      "/app/pos",
      "/store-admin/pos",
      "/app/orders",
      "/app/menu",
      "/app/channels",
      "/app/channel-pricing",
      "/app/ingredients",
      "/app/recipes",
      "/store-admin/reports",
      "/admin",
    ]) {
      expect(hrefs).not.toContain(forbidden);
    }
  });

  it("does not render duplicate pill-style portal quick links", () => {
    mockRoleState.role = "owner";
    renderLayout();

    for (const pillLabel of [
      "Store Admin",
      "User Management",
      "Role Management",
      "Health Check",
      "Audit Logs",
      "Business",
    ]) {
      expect(screen.queryByText(pillLabel)).toBeNull();
    }
  });

  it("V1 nav does not expose the full System Console overview to owner", () => {
    mockRoleState.role = "owner";
    renderLayout();

    const hrefs = allHrefs();
    // Owner gets User/Role Management links but NOT the full System Console.
    expect(hrefs).not.toContain("/system");
    expect(hrefs).not.toContain("/system/health");
    expect(hrefs).not.toContain("/system/audit-logs");
  });
});
