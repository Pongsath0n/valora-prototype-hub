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

const mockRoleState = { role: "staff", loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

describe("AdminLayout navigation", () => {
  it("keeps staff users inside store-admin routes and hides placeholders in prod/test", () => {
    render(
      <MemoryRouter>
        <AdminLayout title="test" subtitle="" forceHidePlaceholderNav>
          <div>content</div>
        </AdminLayout>
      </MemoryRouter>,
    );

    const staffBackLink = screen.getByRole("link", { name: "กลับไปแดชบอร์ดร้าน" });
    expect(staffBackLink).toHaveAttribute("href", "/store-admin");
    expect(screen.queryByText("POS")).toBeNull();
  });
});
