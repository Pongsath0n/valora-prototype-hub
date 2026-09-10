import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { PLATFORM_NAME, STORE_DISPLAY_NAME } from "@/config/brand";
import CustomerThemeLayout from "@/components/customer/CustomerThemeLayout";

// ── B01: CustomerThemeLayout does not display Brewway ──────────────────────

describe("B01 CustomerThemeLayout does not display Brewway", () => {
  it("renders the store display name, not Brewway", () => {
    render(
      <MemoryRouter>
        <CustomerThemeLayout>
          <div>content</div>
        </CustomerThemeLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText(STORE_DISPLAY_NAME)).toBeInTheDocument();
    expect(screen.queryByText("Brewway")).not.toBeInTheDocument();
  });
});

// ── B02: canonical store display is Healholic ──────────────────────────────

describe("B02 canonical store display is Healholic", () => {
  it("STORE_DISPLAY_NAME is Healholic", () => {
    expect(STORE_DISPLAY_NAME).toBe("Healholic");
  });

  it("CustomerThemeLayout displays Healholic", () => {
    render(
      <MemoryRouter>
        <CustomerThemeLayout>
          <div>content</div>
        </CustomerThemeLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText("Healholic")).toBeInTheDocument();
  });
});

// ── B03: Valora remains valid platform/system branding ─────────────────────

describe("B03 Valora remains valid platform branding", () => {
  it("PLATFORM_NAME is Valora", () => {
    expect(PLATFORM_NAME).toBe("Valora");
  });
});

// ── B04: active V1 customer pages contain no customer-visible Brewway ──────

describe("B04 active V1 customer pages have no customer-visible Brewway", () => {
  it("CustomerThemeLayout does not render Brewway text", () => {
    const { container } = render(
      <MemoryRouter>
        <CustomerThemeLayout>
          <div>content</div>
        </CustomerThemeLayout>
      </MemoryRouter>,
    );
    // Check the rendered text content does not include "Brewway" as visible text.
    // CSS class names (brewway-customer) are not customer-visible text.
    const textContent = container.textContent || "";
    expect(textContent).not.toContain("Brewway");
  });
});
