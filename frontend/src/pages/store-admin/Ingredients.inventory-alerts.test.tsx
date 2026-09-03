import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import StoreAdminIngredientsPage from "./Ingredients";

const mockListIngredients = vi.fn();
const mockGetInventoryAlerts = vi.fn();
const mockCreateStockIntake = vi.fn();
const mockUploadStockIntakeReceipt = vi.fn();
const mockListIngredientWasteRecords = vi.fn();
const mockGetIngredientWasteSummary = vi.fn();
const mockCreateIngredientWaste = vi.fn();
const mockListStockIntakes = vi.fn();
const mockUseProfileRole = vi.fn();

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockUseProfileRole(),
}));

vi.mock("@/services/storeAdminApi", () => ({
  INGREDIENT_BASE_UNITS: ["g", "ml", "pcs", "set", "bottle"],
  INGREDIENT_COST_TYPES: ["ingredient", "packaging", "consumable", "addon", "utility", "other"],
  INGREDIENT_WASTE_REASONS: [
    "expired",
    "damaged",
    "spill",
    "quality_issue",
    "manual_adjustment",
    "other",
  ],
  DEFAULT_INGREDIENT_COST_TYPE: "ingredient",
  isIngredientCostType: (value: string) =>
    ["ingredient", "packaging", "consumable", "addon", "utility", "other"].includes(value),
  storeAdminApi: {
    listIngredients: (...args: unknown[]) => mockListIngredients(...args),
    createIngredient: vi.fn(),
    updateIngredient: vi.fn(),
    deleteIngredient: vi.fn(),
    createStockIntake: (...args: unknown[]) => mockCreateStockIntake(...args),
    uploadStockIntakeReceipt: (...args: unknown[]) => mockUploadStockIntakeReceipt(...args),
    listIngredientWasteRecords: (...args: unknown[]) => mockListIngredientWasteRecords(...args),
    getIngredientWasteSummary: (...args: unknown[]) => mockGetIngredientWasteSummary(...args),
    createIngredientWaste: (...args: unknown[]) => mockCreateIngredientWaste(...args),
    listStockIntakes: (...args: unknown[]) => mockListStockIntakes(...args),
    getInventoryAlerts: (...args: unknown[]) => mockGetInventoryAlerts(...args),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <StoreAdminIngredientsPage />
    </MemoryRouter>,
  );
}

function emptyAlerts() {
  return {
    low_stock: [],
    near_expiry: [],
    expired: [],
    summary: { low_stock_count: 0, near_expiry_count: 0, expired_count: 0 },
  };
}

describe("StoreAdminIngredientsPage stock status badges", () => {
  beforeEach(() => {
    mockListIngredients.mockReset();
    mockGetInventoryAlerts.mockReset();
    mockCreateStockIntake.mockReset();
    mockUploadStockIntakeReceipt.mockReset();
    mockListIngredientWasteRecords.mockReset();
    mockGetIngredientWasteSummary.mockReset();
    mockCreateIngredientWaste.mockReset();
    mockListStockIntakes.mockReset();
    mockUseProfileRole.mockReset();

    mockUseProfileRole.mockReturnValue({ role: "owner", loading: false, refreshRole: vi.fn() });
    mockListIngredients.mockResolvedValue({
      items: [
        { id: "ing-1", store_id: "store-1", name: "Fresh Milk", unit: "ml", cost_per_unit: 0.6, current_stock: 2, low_stock_threshold: 5, is_active: true },
        { id: "ing-2", store_id: "store-1", name: "Ice Cubes", unit: "pcs", cost_per_unit: 0.1, current_stock: 999, low_stock_threshold: 0, is_active: true },
        { id: "ing-3", store_id: "store-1", name: "Matcha Powder", unit: "g", cost_per_unit: 2, current_stock: 50, low_stock_threshold: 10, is_active: true },
      ],
    });
    mockCreateStockIntake.mockResolvedValue({ intake: { id: "p1" }, ingredient: {} });
    mockUploadStockIntakeReceipt.mockResolvedValue({});
    mockListIngredientWasteRecords.mockResolvedValue([]);
    mockGetIngredientWasteSummary.mockResolvedValue({ store_id: "store-1", total_quantity: 0, total_cost: 0, record_count: 0, filters: {} });
    mockCreateIngredientWaste.mockResolvedValue({ id: "w1" });
    mockListStockIntakes.mockResolvedValue([]);
    mockGetInventoryAlerts.mockResolvedValue(emptyAlerts());
  });

  it("renders ต่ำกว่ากำหนด badge for ingredient below threshold", async () => {
    renderPage();
    expect(await screen.findByText("ต่ำกว่ากำหนด")).toBeInTheDocument();
  });

  it("renders only one ต่ำกว่ากำหนด badge (ing-1 has threshold 5, stock 2)", async () => {
    renderPage();
    expect(await screen.findByText("ต่ำกว่ากำหนด")).toBeInTheDocument();
    const badges = screen.getAllByText("ต่ำกว่ากำหนด");
    expect(badges.length).toBe(1);
  });

  it("renders หมดอายุแล้ว badge when inventory alerts report expired lot", async () => {
    mockGetInventoryAlerts.mockResolvedValue({
      low_stock: [],
      near_expiry: [],
      expired: [
        { purchase_id: "pur-1", ingredient_id: "ing-1", ingredient_name: "Fresh Milk", lot_code: "LOT-X", expires_at: "2026-06-20T00:00:00Z", days_overdue: 8, severity: "expired" },
      ],
      summary: { low_stock_count: 0, near_expiry_count: 0, expired_count: 1 },
    });

    renderPage();
    expect(await screen.findByText("หมดอายุแล้ว")).toBeInTheDocument();
  });

  it("renders ใกล้หมดอายุ badge when inventory alerts report near-expiry lot", async () => {
    mockGetInventoryAlerts.mockResolvedValue({
      low_stock: [],
      near_expiry: [
        { purchase_id: "pur-2", ingredient_id: "ing-3", ingredient_name: "Matcha Powder", lot_code: "LOT-Y", expires_at: "2026-06-30T00:00:00Z", days_until_expiry: 2, severity: "near_expiry" },
      ],
      expired: [],
      summary: { low_stock_count: 0, near_expiry_count: 1, expired_count: 0 },
    });

    renderPage();
    expect(await screen.findByText("ใกล้หมดอายุ")).toBeInTheDocument();
  });

  it("renders สถานะสต็อก column header", async () => {
    renderPage();
    expect(await screen.findByText("สถานะสต็อก")).toBeInTheDocument();
  });

  it("fetches inventory alerts only for manager role", async () => {
    mockUseProfileRole.mockReturnValue({ role: "staff", loading: false, refreshRole: vi.fn() });
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(mockGetInventoryAlerts).not.toHaveBeenCalled();
  });
});
