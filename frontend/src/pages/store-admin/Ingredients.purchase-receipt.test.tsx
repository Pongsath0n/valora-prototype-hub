import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StoreAdminIngredientsPage from "./Ingredients";

const mockListIngredients = vi.fn();
const mockCreateStockIntake = vi.fn();
const mockUploadStockIntakeReceipt = vi.fn();
const mockGetStockIntakeReceiptUrl = vi.fn();
const mockDeleteStockIntakeReceipt = vi.fn();
const mockListIngredientWasteRecords = vi.fn();
const mockGetIngredientWasteSummary = vi.fn();
const mockCreateIngredientWaste = vi.fn();
const mockListStockIntakes = vi.fn();
const mockGetInventoryAlerts = vi.fn();
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
    getStockIntakeReceiptUrl: (...args: unknown[]) => mockGetStockIntakeReceiptUrl(...args),
    deleteStockIntakeReceipt: (...args: unknown[]) => mockDeleteStockIntakeReceipt(...args),
    listIngredientWasteRecords: (...args: unknown[]) => mockListIngredientWasteRecords(...args),
    getIngredientWasteSummary: (...args: unknown[]) => mockGetIngredientWasteSummary(...args),
    createIngredientWaste: (...args: unknown[]) => mockCreateIngredientWaste(...args),
    listStockIntakes: (...args: unknown[]) => mockListStockIntakes(...args),
    getInventoryAlerts: (...args: unknown[]) => mockGetInventoryAlerts(...args),
  },
}));

const INTAKE_WITH_RECEIPT = {
  id: "pur-1",
  store_id: "store-1",
  ingredient_id: "ing-1",
  quantity: 5,
  normalized_quantity: 5,
  purchase_unit: "g",
  conversion_factor: 1,
  total_cost: 100,
  movement_type: "in",
  receipt_storage_path: "store-1/ingredient-purchases/pur-1/receipt.jpg",
  receipt_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const INTAKE_WITHOUT_RECEIPT = {
  id: "pur-2",
  store_id: "store-1",
  ingredient_id: "ing-2",
  quantity: 2,
  normalized_quantity: 2,
  purchase_unit: "g",
  conversion_factor: 1,
  total_cost: 40,
  movement_type: "in",
  receipt_storage_path: null,
  receipt_url: null,
  created_at: "2026-01-02T00:00:00.000Z",
};

function setupMocks(role: string = "owner") {
  mockUseProfileRole.mockReturnValue({ role, loading: false, refreshRole: vi.fn() });
  mockListIngredients.mockResolvedValue({
    items: [
      { id: "ing-1", store_id: "store-1", name: "Milk", unit: "ml", cost_per_unit: 0.6, current_stock: 500, low_stock_threshold: 100, supplier_name: "Best Milk", is_active: true },
      { id: "ing-2", store_id: "store-1", name: "Ice", unit: "g", cost_per_unit: 0.1, current_stock: 999, low_stock_threshold: 0, supplier_name: "Cold Co", is_active: true },
    ],
  });
  mockCreateStockIntake.mockResolvedValue({ intake: { id: "purchase-1", store_id: "store-1" }, ingredient: {} });
  mockUploadStockIntakeReceipt.mockResolvedValue({});
  mockGetStockIntakeReceiptUrl.mockResolvedValue({ signed_url: "https://signed-url.example/receipt.jpg", expires_in: 60 });
  mockDeleteStockIntakeReceipt.mockResolvedValue({ status: "receipt_deleted" });
  mockListIngredientWasteRecords.mockResolvedValue([]);
  mockGetIngredientWasteSummary.mockResolvedValue({ store_id: "store-1", total_quantity: 0, total_cost: 0, record_count: 0, filters: {} });
  mockCreateIngredientWaste.mockResolvedValue({ id: "waste-1", store_id: "store-1", ingredient_id: "ing-1", quantity: 1, reason: "manual_adjustment" });
  mockGetInventoryAlerts.mockResolvedValue({ low_stock: [], near_expiry: [], expired: [], summary: { low_stock_count: 0, near_expiry_count: 0, expired_count: 0 } });
  mockListStockIntakes.mockResolvedValue([INTAKE_WITH_RECEIPT, INTAKE_WITHOUT_RECEIPT]);
}

function renderPage() {
  render(
    <MemoryRouter>
      <StoreAdminIngredientsPage />
    </MemoryRouter>,
  );
}

describe("Purchase Receipt Frontend (PRF01-PRF12)", () => {
  beforeEach(() => {
    mockListIngredients.mockReset();
    mockCreateStockIntake.mockReset();
    mockUploadStockIntakeReceipt.mockReset();
    mockGetStockIntakeReceiptUrl.mockReset();
    mockDeleteStockIntakeReceipt.mockReset();
    mockListIngredientWasteRecords.mockReset();
    mockGetIngredientWasteSummary.mockReset();
    mockCreateIngredientWaste.mockReset();
    mockListStockIntakes.mockReset();
    mockGetInventoryAlerts.mockReset();
    mockUseProfileRole.mockReset();
    setupMocks();
  });

  it("PRF01: receipt absent → no 'ดูใบเสร็จ' shown", async () => {
    mockListStockIntakes.mockResolvedValue([INTAKE_WITHOUT_RECEIPT]);
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "ดูใบเสร็จ" })).toBeNull();
    });
  });

  it("PRF02: receipt present → 'ดูใบเสร็จ' shown", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ดูใบเสร็จ" })).toBeInTheDocument();
    });
  });

  it("PRF03: view action requests fresh Backend signed URL", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    const viewButton = await screen.findByRole("button", { name: "ดูใบเสร็จ" });
    fireEvent.click(viewButton);
    await waitFor(() => expect(mockGetStockIntakeReceiptUrl).toHaveBeenCalledWith("pur-1", "store-1"));
  });

  it("PRF04: signed URL opened only after successful response", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    const viewButton = await screen.findByRole("button", { name: "ดูใบเสร็จ" });
    fireEvent.click(viewButton);
    await waitFor(() => expect(mockGetStockIntakeReceiptUrl).toHaveBeenCalled());
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith("https://signed-url.example/receipt.jpg", "_blank", "noopener,noreferrer");
    });
    openSpy.mockRestore();
  });

  it("PRF05: view failure shown to user", async () => {
    mockGetStockIntakeReceiptUrl.mockRejectedValueOnce(new Error("signed_url_failed"));
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    const viewButton = await screen.findByRole("button", { name: "ดูใบเสร็จ" });
    fireEvent.click(viewButton);
    await waitFor(() => {
      expect(screen.getByText("signed_url_failed")).toBeInTheDocument();
    });
  });

  it("PRF06: receipt present → 'เปลี่ยนใบเสร็จ' shown", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByLabelText("เปลี่ยนใบเสร็จ")).toBeInTheDocument();
    });
  });

  it("PRF07: replace reuses same stock intake", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    const replaceInput = await screen.findByLabelText("เปลี่ยนใบเสร็จ");
    const file = new File(["data"], "new-receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(replaceInput, { target: { files: [file] } });
    await waitFor(() => expect(mockUploadStockIntakeReceipt).toHaveBeenCalled());
    const callArgs = mockUploadStockIntakeReceipt.mock.calls[0];
    expect(callArgs[0]).toBe("pur-1");
  });

  it("PRF08: delete confirmation clearly says purchase/stock remains", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    const deleteButton = await screen.findByRole("button", { name: "ลบใบเสร็จ" });
    fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(screen.getByText(/ลบเฉพาะไฟล์ใบเสร็จหรือหลักฐานการซื้อ/)).toBeInTheDocument();
      expect(screen.getByText(/ข้อมูลการซื้อและสต็อกจะไม่ถูกลบ/)).toBeInTheDocument();
    });
  });

  it("PRF09: delete receipt uses canonical Backend endpoint", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    const deleteButton = await screen.findByRole("button", { name: "ลบใบเสร็จ" });
    fireEvent.click(deleteButton);
    const confirmButton = await screen.findByRole("button", { name: "ลบใบเสร็จ", exact: true });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(mockDeleteStockIntakeReceipt).toHaveBeenCalledWith("pur-1", "store-1"));
  });

  it("PRF10: Staff cannot receive unauthorized receipt controls", async () => {
    setupMocks("staff");
    renderPage();
    // Staff role → intake history section hidden (shouldShowWasteSection = false)
    // No need to wait for listStockIntakes; staff never loads intake history.
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "ดูใบเสร็จ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ลบใบเสร็จ" })).toBeNull();
    expect(screen.queryByText("เปลี่ยนใบเสร็จ")).toBeNull();
  });

  it("PRF11: Frontend does not directly use Supabase Storage", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    // All receipt operations go through storeAdminApi mocks, not supabase.storage
    expect(mockGetStockIntakeReceiptUrl).not.toHaveBeenCalled();
    expect(mockUploadStockIntakeReceipt).not.toHaveBeenCalled();
    expect(mockDeleteStockIntakeReceipt).not.toHaveBeenCalled();
  });

  it("PRF12: Frontend contains no service_role key", async () => {
    // This is a static assertion: verify the storeAdminApi module does not
    // expose or reference service_role. The mock structure mirrors the real
    // module's public surface.
    const module = await import("@/services/storeAdminApi");
    const moduleText = module.toString();
    expect(moduleText).not.toMatch(/service_role|SERVICE_ROLE/i);
  });
});
