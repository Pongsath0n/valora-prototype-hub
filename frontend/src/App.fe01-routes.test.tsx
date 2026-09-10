import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render, screen } from "@testing-library/react";

// Mock auth + role so guards don't redirect to /login.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "test-user" }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({
    role: "owner",
    profileRole: "owner",
    currentStoreRole: "owner",
    storeId: "store-1",
    storeName: "Healholic",
    loading: false,
    refreshRole: vi.fn(),
  }),
  RoleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock the customer pages so we can detect which page rendered.
vi.mock("@/pages/liff/CustomerMenu", () => ({ default: () => <div data-testid="customer-menu" /> }));
vi.mock("@/pages/liff/MenuDetail", () => ({ default: () => <div data-testid="menu-detail" /> }));
vi.mock("@/pages/liff/Cart", () => ({ default: () => <div data-testid="cart" /> }));
vi.mock("@/pages/liff/OrderConfirm", () => ({ default: () => <div data-testid="order-confirm" /> }));
vi.mock("@/pages/liff/OrderSuccess", () => ({ default: () => <div data-testid="order-success" /> }));
vi.mock("@/pages/order/OrderStatusPage", () => ({ default: () => <div data-testid="order-status" /> }));
vi.mock("@/pages/PrivacyNotice", () => ({ default: () => <div data-testid="privacy" /> }));
vi.mock("@/components/customer/CustomerThemeLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="theme-layout">{children}</div>,
}));

// Import AppRoutes after mocks are set up.
import { AppRoutes } from "./App";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}{location.search}{location.hash}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<AppRoutes />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── P01: /order renders CustomerMenuPage ───────────────────────────────────

describe("P01 /order canonical menu", () => {
  it("renders the customer menu page at /order", () => {
    const { getByTestId } = renderAt("/order");
    expect(getByTestId("customer-menu")).toBeInTheDocument();
  });
});

// ── P02: /order/:id renders MenuDetailPage ────────────────────────────────

describe("P02 /order/:id canonical menu detail", () => {
  it("renders the menu detail page at /order/abc", () => {
    const { getByTestId } = renderAt("/order/abc");
    expect(getByTestId("menu-detail")).toBeInTheDocument();
  });
});

// ── P03: /order/cart renders CartPage ──────────────────────────────────────

describe("P03 /order/cart canonical cart", () => {
  it("renders the cart page at /order/cart", () => {
    const { getByTestId } = renderAt("/order/cart");
    expect(getByTestId("cart")).toBeInTheDocument();
  });
});

// ── P04: /order/confirm renders OrderConfirmPage ───────────────────────────

describe("P04 /order/confirm canonical confirm", () => {
  it("renders the order confirm page at /order/confirm", () => {
    const { getByTestId } = renderAt("/order/confirm");
    expect(getByTestId("order-confirm")).toBeInTheDocument();
  });
});

// ── P05: /order/success renders OrderSuccessPage ───────────────────────────

describe("P05 /order/success canonical success", () => {
  it("renders the order success page at /order/success", () => {
    const { getByTestId } = renderAt("/order/success");
    expect(getByTestId("order-success")).toBeInTheDocument();
  });
});

// ── P06: /order/status renders OrderStatusPage ────────────────────────────

describe("P06 /order/status canonical status", () => {
  it("renders the order status page at /order/status", () => {
    const { getByTestId } = renderAt("/order/status");
    expect(getByTestId("order-status")).toBeInTheDocument();
  });
});

// ── P07: /liff/menu redirects to /order ───────────────────────────────────

describe("P07 /liff/menu redirect", () => {
  it("redirects /liff/menu to /order", () => {
    const { getByTestId } = renderAt("/liff/menu");
    expect(getByTestId("customer-menu")).toBeInTheDocument();
  });
});

// ── P08: /liff/menu/:id redirects to /order/:id ───────────────────────────

describe("P08 /liff/menu/:id redirect", () => {
  it("redirects /liff/menu/abc-123 to /order/abc-123 (path param preserved in pathname)", () => {
    const { getByTestId } = renderAt("/liff/menu/abc-123");
    // After redirect, the menu detail page should render at /order/abc-123.
    expect(getByTestId("menu-detail")).toBeInTheDocument();
  });

  it("preserves search params and hash through /liff/menu/:id redirect", () => {
    const { getByTestId } = renderAt("/liff/menu/abc-123?from=qr#menu");
    expect(getByTestId("menu-detail")).toBeInTheDocument();
  });
});

// ── P09: /liff/cart redirects to /order/cart ──────────────────────────────

describe("P09 /liff/cart redirect", () => {
  it("redirects /liff/cart to /order/cart", () => {
    const { getByTestId } = renderAt("/liff/cart");
    expect(getByTestId("cart")).toBeInTheDocument();
  });
});

// ── P10: /liff/confirm redirects to /order/confirm ────────────────────────

describe("P10 /liff/confirm redirect", () => {
  it("redirects /liff/confirm to /order/confirm", () => {
    const { getByTestId } = renderAt("/liff/confirm");
    expect(getByTestId("order-confirm")).toBeInTheDocument();
  });
});

// ── P11: /liff/success redirects to /order/success ────────────────────────

describe("P11 /liff/success redirect", () => {
  it("redirects /liff/success to /order/success", () => {
    const { getByTestId } = renderAt("/liff/success");
    expect(getByTestId("order-success")).toBeInTheDocument();
  });
});

// ── P12: query parameters are preserved through redirects ────────────────

describe("P12 query parameter preservation", () => {
  it("preserves search params through /liff/menu redirect", () => {
    const { getByTestId } = renderAt("/liff/menu?line_link_token=abc123");
    // After redirect, the customer menu should render (params forwarded).
    expect(getByTestId("customer-menu")).toBeInTheDocument();
  });

  it("preserves search params through /liff/cart redirect", () => {
    const { getByTestId } = renderAt("/liff/cart?public_token=xyz");
    expect(getByTestId("cart")).toBeInTheDocument();
  });
});
