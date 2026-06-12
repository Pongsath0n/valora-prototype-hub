import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { PortalSwitcher } from "./PortalSwitcher";

const mockRoleState = { role: "owner" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <PortalSwitcher variant="stack" />
    </MemoryRouter>,
  );
}

function allHrefs() {
  return screen.getAllByRole("link").map((a) => a.getAttribute("href"));
}

describe("PortalSwitcher role visibility", () => {
  it("owner sees Profit Planning, dashboard, reports, store admin, and system console", () => {
    mockRoleState.role = "owner";
    renderSwitcher();

    const hrefs = allHrefs();
    expect(hrefs).toContain("/app/planning");
    expect(hrefs).toContain("/app/dashboard");
    expect(hrefs).toContain("/app/reports");
    expect(hrefs).toContain("/store-admin");
    expect(hrefs).toContain("/system");
  });

  it("owner does not see a duplicate Storage Check entry", () => {
    mockRoleState.role = "owner";
    renderSwitcher();

    expect(screen.queryByText("Storage Check")).toBeNull();
    expect(allHrefs()).not.toContain("/system/health#storage");
  });

  it("staff sees only the Store Admin workspace", () => {
    mockRoleState.role = "staff";
    renderSwitcher();

    const hrefs = allHrefs();
    expect(hrefs).toEqual(["/store-admin"]);
    expect(hrefs).not.toContain("/app/planning");
    expect(hrefs).not.toContain("/app/dashboard");
    expect(hrefs).not.toContain("/app/reports");
    expect(hrefs.some((h) => h?.startsWith("/system"))).toBe(false);
  });
});
