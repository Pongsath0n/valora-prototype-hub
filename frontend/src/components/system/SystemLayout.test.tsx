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

describe("SystemLayout", () => {
  it("links back to store admin workspace", () => {
    render(
      <MemoryRouter>
        <SystemLayout title="system" subtitle="">
          <div>content</div>
        </SystemLayout>
      </MemoryRouter>,
    );

    const backLink = screen.getByRole("link", { name: "กลับไป Store Admin" });
    expect(backLink).toHaveAttribute("href", "/store-admin");
  });
});
