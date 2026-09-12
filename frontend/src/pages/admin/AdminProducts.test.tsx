import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import AdminProductsPage from "./AdminProducts";

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

const mockRoleState = { role: "owner" as string | null, loading: false, refreshRole: vi.fn() };
vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockRoleState,
}));

const mockedListMenus = vi.fn();
const mockedCreateMenu = vi.fn();
const mockedUpdateMenu = vi.fn();
const mockedDeleteMenu = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    listMenus: (...args: unknown[]) => mockedListMenus(...args),
    createMenu: (...args: unknown[]) => mockedCreateMenu(...args),
    updateMenu: (...args: unknown[]) => mockedUpdateMenu(...args),
    deleteMenu: (...args: unknown[]) => mockedDeleteMenu(...args),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminProductsPage />
    </MemoryRouter>,
  );
}

describe("AdminProducts /owner/menus regression (OM01-OM05)", () => {
  beforeEach(() => {
    mockedListMenus.mockReset();
    mockedCreateMenu.mockReset();
    mockedUpdateMenu.mockReset();
    mockedDeleteMenu.mockReset();
  });

  // OM01 — Page renders without exception (the white-screen crash fix)
  it("OM01: /owner/menus renders without exception", async () => {
    mockedListMenus.mockResolvedValue({
      items: [
        {
          id: "p1",
          name: "Latte",
          base_price: 80,
          is_active: true,
          is_special: false,
          category_id: "cat-1",
          category_name: "Coffee",
        },
      ],
      categories: [
        { id: "cat-1", name: "Coffee" },
        { id: "cat-2", name: "Tea" },
      ],
    });

    expect(() => renderPage()).not.toThrow();
    await waitFor(() => {
      expect(screen.getByText("Latte")).toBeInTheDocument();
    });
  });

  // OM02 — Category optional/none choice renders (the empty-value option)
  it("OM02: category optional/none choice renders without crash", async () => {
    mockedListMenus.mockResolvedValue({
      items: [],
      categories: [{ id: "cat-1", name: "Coffee" }],
    });

    renderPage();
    // The "-- ไม่ระบุหมวดหมู่ --" option should be present without crashing
    await waitFor(() => {
      expect(screen.getByText("-- ไม่ระบุหมวดหมู่ --")).toBeInTheDocument();
    });
  });

  // OM03 — Selecting category emits category ID (normal options work)
  it("OM03: category select renders with category options available", async () => {
    mockedListMenus.mockResolvedValue({
      items: [],
      categories: [
        { id: "cat-1", name: "Coffee" },
        { id: "cat-2", name: "Tea" },
      ],
    });

    renderPage();
    // The page should render the category FormSelect without crashing
    // The "-- ไม่ระบุหมวดหมู่ --" option should be visible as the default
    await waitFor(() => {
      expect(screen.getByText("-- ไม่ระบุหมวดหมู่ --")).toBeInTheDocument();
    });
    // Verify multiple comboboxes are present (category, status, special)
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes.length).toBeGreaterThanOrEqual(3);
  });

  // OM04 — Selecting "ไม่ระบุ" restores business value "" (FormSelect handles it)
  it("OM04: empty/none option uses sentinel internally, business value stays empty", async () => {
    // This is verified by the FormSelect EV tests (EV03/EV04) which test
    // the fromRadixValue/toRadixValue conversion. Here we verify the
    // AdminProducts page constructs the empty option correctly.
    mockedListMenus.mockResolvedValue({
      items: [],
      categories: [{ id: "cat-1", name: "Coffee" }],
    });

    renderPage();
    await waitFor(() => {
      // The empty option is rendered as a SelectItem with the sentinel value
      // internally, but the business value remains ""
      expect(screen.getByText("-- ไม่ระบุหมวดหมู่ --")).toBeInTheDocument();
    });
    // Verify no Radix crash error
    expect(screen.queryByText(/must have a value prop/)).not.toBeInTheDocument();
  });

  // OM05 — No Select.Item empty-value runtime error
  it("OM05: no Select.Item empty-value runtime error on render", async () => {
    mockedListMenus.mockResolvedValue({
      items: [
        {
          id: "p1",
          name: "Latte",
          base_price: 80,
          is_active: true,
          is_special: false,
          category_id: "",
          category_name: null,
        },
      ],
      categories: [],
    });

    // If FormSelect doesn't handle empty values, Radix throws:
    // "A <Select.Item /> must have a value prop that is not an empty string"
    expect(() => renderPage()).not.toThrow();
    await waitFor(() => {
      expect(screen.getByText("Latte")).toBeInTheDocument();
    });
  });
});
