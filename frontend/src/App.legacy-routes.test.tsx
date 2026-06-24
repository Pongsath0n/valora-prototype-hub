import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { AdminLegacyRedirect, ScenarioLegacyRedirect, isPosDeferred, shouldRedirectLegacyConfig } from "./App";
import { shouldShowDevCreateOrderForm } from "./pages/admin/AdminOrders";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "test-user" }, loading: false }),
}));
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({ role: "owner", loading: false }),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div>
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

describe("AdminLegacyRedirect", () => {
  it("preserves deep links when redirecting /admin paths", () => {
    render(
      <MemoryRouter initialEntries={["/admin/orders?status=pending#slips"]}>
        <Routes>
          <Route path="/admin/*" element={<AdminLegacyRedirect />} />
          <Route path="/store-admin/orders" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("/store-admin/orders?status=pending#slips")).toBeInTheDocument();
  });
});

describe("ScenarioLegacyRedirect", () => {
  it("redirects /app/scenario to the canonical /owner/profit-planning route", () => {
    render(
      <MemoryRouter initialEntries={["/app/scenario?case=price-up#results"]}>
        <Routes>
          <Route path="/app/scenario" element={<ScenarioLegacyRedirect />} />
          <Route path="/owner/profit-planning" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("/owner/profit-planning?case=price-up#results")).toBeInTheDocument();
  });

  it("does not create a redirect loop (planning route renders without further navigation)", () => {
    render(
      <MemoryRouter initialEntries={["/app/scenario"]}>
        <Routes>
          <Route path="/app/scenario" element={<ScenarioLegacyRedirect />} />
          <Route path="/owner/profit-planning" element={<div>planning-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("planning-page")).toBeInTheDocument();
  });
});

describe("POS deferral", () => {
  it("defers POS in production builds and keeps it in dev", () => {
    expect(isPosDeferred(false)).toBe(true); // production → redirect
    expect(isPosDeferred(true)).toBe(false); // dev → prototype reachable
  });
});

describe("Prototype/legacy route gating", () => {
  it("redirects legacy /app/* config prototypes to canonical /owner/* in production", () => {
    expect(shouldRedirectLegacyConfig(false)).toBe(true); // production → redirect
    expect(shouldRedirectLegacyConfig(true)).toBe(false); // dev → legacy reachable
  });

  it("shows the incomplete create-pickup-order form only in dev builds", () => {
    expect(shouldShowDevCreateOrderForm(false)).toBe(false); // production → hidden
    expect(shouldShowDevCreateOrderForm(true)).toBe(true); // dev → visible with warning
  });
});

describe("/system/storage legacy redirect", () => {
  it("redirects to /system/health#storage without a loop", () => {
    // Mirrors the static <Navigate> registered in App.tsx for /system/storage.
    render(
      <MemoryRouter initialEntries={["/system/storage"]}>
        <Routes>
          <Route path="/system/storage" element={<Navigate to="/system/health#storage" replace />} />
          <Route path="/system/health" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("/system/health#storage")).toBeInTheDocument();
  });
});
