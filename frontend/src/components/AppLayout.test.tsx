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

describe("AppLayout owner navigation", () => {
  it("shows Profit Planning as a core nav category with the canonical route", () => {
    mockRoleState.role = "owner";
    renderLayout();

    expect(screen.getAllByText("การวางแผนกำไร").length).toBeGreaterThan(0);
    expect(allHrefs()).toContain("/owner/profit-planning");
  });

  it("does not show POS, legacy /app config routes, or /admin links", () => {
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
    expect(screen.queryByText("POS")).toBeNull();
  });

  it("uses canonical /owner/* and /staff/* routes and exposes the System Console to owners", () => {
    mockRoleState.role = "owner";
    renderLayout();

    const hrefs = allHrefs();
    for (const expected of [
      "/owner/dashboard",
      "/owner/reports",
      "/owner/menus",
      "/store-admin/channels",
      "/store-admin/channel-pricing",
      "/owner/cost-items",
      "/owner/recipes",
      "/staff/customers",
      "/staff/orders",
      "/system",
      "/system/users",
      "/system/roles",
      "/system/health",
      "/system/audit-logs",
    ]) {
      expect(hrefs).toContain(expected);
    }
  });

  it("does not render duplicate pill-style portal quick links", () => {
    mockRoleState.role = "owner";
    renderLayout();

    // Pill labels that used to be rendered by PortalSwitcher inside the sidebar
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

    // System routes appear exactly once (grouped nav only, no duplicate pills)
    const hrefs = allHrefs();
    for (const systemPath of ["/system", "/system/users", "/system/roles", "/system/audit-logs"]) {
      expect(hrefs.filter((h) => h === systemPath).length).toBe(1);
    }
    // Profit Planning still present
    expect(hrefs).toContain("/owner/profit-planning");
  });

  it("hides system console links from non-owner roles", () => {
    mockRoleState.role = "manager";
    renderLayout();

    const hrefs = allHrefs();
    expect(hrefs).not.toContain("/system");
    expect(hrefs).not.toContain("/system/users");
    expect(hrefs).toContain("/owner/profit-planning");
  });
});
