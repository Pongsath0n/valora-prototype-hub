import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import SystemLayout from "./SystemLayout";

vi.mock("@/components/LogoBrand", () => ({
  default: () => <div data-testid="logo-brand" />,
}));

const signOutMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

const mockRoleState = { role: "admin" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

describe("SystemLayout", () => {
  it("links to the business dashboard via Business View section", () => {
    render(
      <MemoryRouter>
        <SystemLayout title="system" subtitle="">
          <div>content</div>
        </SystemLayout>
      </MemoryRouter>,
    );

    const backLink = screen.getByRole("link", { name: "แดชบอร์ดธุรกิจ" });
    expect(backLink).toHaveAttribute("href", "/owner/dashboard");
  });

  it("does not show a duplicate Storage Check nav entry", () => {
    render(
      <MemoryRouter>
        <SystemLayout title="system" subtitle="">
          <div>content</div>
        </SystemLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Storage Check")).toBeNull();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/system/health#storage");
    expect(hrefs).toContain("/system/health");
  });

  it("shows all System Console nav items", () => {
    render(
      <MemoryRouter>
        <SystemLayout title="system" subtitle="">
          <div>content</div>
        </SystemLayout>
      </MemoryRouter>,
    );

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/system");
    expect(hrefs).toContain("/system/users");
    expect(hrefs).toContain("/system/roles");
    expect(hrefs).toContain("/system/health");
    expect(hrefs).toContain("/system/audit-logs");
    expect(hrefs).toContain("/owner/dashboard");
  });
});
