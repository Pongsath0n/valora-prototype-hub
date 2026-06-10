import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { AdminLegacyRedirect } from "./App";

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
