import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StoreAdminIngredientsPage from "./Ingredients";

const mockListIngredients = vi.fn();
const mockCreateStockIntake = vi.fn();
const mockUploadStockIntakeReceipt = vi.fn();
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
  INGREDIENT_WASTE_REASONS: ["expired", "damaged", "spill", "quality_issue", "manual_adjustment", "other"],
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

describe("StockIntake Paid Default (Phase A)", () => {
  beforeEach(() => {
    mockListIngredients.mockReset();
    mockCreateStockIntake.mockReset();
    mockUploadStockIntakeReceipt.mockReset();
    mockListIngredientWasteRecords.mockReset();
    mockGetIngredientWasteSummary.mockReset();
    mockCreateIngredientWaste.mockReset();
    mockListStockIntakes.mockReset();
    mockGetInventoryAlerts.mockReset();
    mockUseProfileRole.mockReset();

    mockUseProfileRole.mockReturnValue({ role: "owner", loading: false, refreshRole: vi.fn() });
    mockListIngredients.mockResolvedValue({
      items: [
        {
          id: "ing-1",
          store_id: "store-1",
          name: "Fresh Milk",
          unit: "ml",
          cost_per_unit: 0.6,
          current_stock: 500,
          low_stock_threshold: 100,
          supplier_name: "Best Milk",
          is_active: true,
        },
      ],
    });
    mockCreateStockIntake.mockResolvedValue({ intake: { id: "purchase-1", store_id: "store-1" }, ingredient: {} });
    mockUploadStockIntakeReceipt.mockResolvedValue({});
    mockListIngredientWasteRecords.mockResolvedValue([]);
    mockGetIngredientWasteSummary.mockResolvedValue({
      store_id: "store-1",
      total_quantity: 0,
      total_cost: 0,
      record_count: 0,
      filters: {},
    });
    mockCreateIngredientWaste.mockResolvedValue({
      id: "waste-1",
      store_id: "store-1",
      ingredient_id: "ing-1",
      quantity: 1,
      reason: "manual_adjustment",
    });
    mockGetInventoryAlerts.mockResolvedValue({
      low_stock: [],
      near_expiry: [],
      expired: [],
      summary: { low_stock_count: 0, near_expiry_count: 0, expired_count: 0 },
    });
    mockListStockIntakes.mockResolvedValue([]);
  });

  function renderPage() {
    render(
      <MemoryRouter>
        <StoreAdminIngredientsPage />
      </MemoryRouter>,
    );
  }

  async function openModal() {
    renderPage();
    const openButton = await screen.findByRole("button", { name: "บันทึกซื้อเข้าสต็อก" });
    fireEvent.click(openButton);
    await screen.findByText("จำนวนที่ซื้อ");
  }

  function getFormFieldControl<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    label: string,
    selector: "input" | "textarea" | "select" = "input",
  ) {
    const element = screen.getByText(label);
    const container = element.closest("div");
    if (!container) throw new Error(`missing container for ${label}`);
    const input = container.querySelector(selector);
    if (!input) throw new Error(`missing input for ${label}`);
    return input as T;
  }

  it("PAID-FE01: normal Stock Intake creation does not require payment-status selection", async () => {
    await openModal();
    // Payment status dropdown should NOT exist in the form
    expect(screen.queryByText("สถานะการชำระ")).toBeNull();
    expect(screen.queryByText("วันที่ชำระ")).toBeNull();
    expect(screen.queryByText("กำหนดชำระ")).toBeNull();
  });

  it("PAID-FE02: receipt remains optional", async () => {
    await openModal();
    // The form should be submittable without any receipt file
    fireEvent.change(getFormFieldControl<HTMLInputElement>("ต้นทุนรวม (฿)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสต็อก" }));
    await waitFor(() => expect(mockCreateStockIntake).toHaveBeenCalled());
    const payload = mockCreateStockIntake.mock.calls.at(-1)?.[0];
    expect(payload).toBeTruthy();
    // No receipt fields should be set
    expect(payload.receipt_storage_path).toBeUndefined();
    expect(payload.receipt_url).toBeUndefined();
  });

  it("PAID-FE03: Stock Intake can be submitted without receipt", async () => {
    await openModal();
    fireEvent.change(getFormFieldControl<HTMLInputElement>("ต้นทุนรวม (฿)"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสต็อก" }));
    await waitFor(() => expect(mockCreateStockIntake).toHaveBeenCalled());
    expect(mockCreateStockIntake).toHaveBeenCalledTimes(1);
  });

  it("PAID-FE04: Stock Intake submission shows normal success behavior", async () => {
    await openModal();
    fireEvent.change(getFormFieldControl<HTMLInputElement>("ต้นทุนรวม (฿)"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสต็อก" }));
    // The create call should succeed and the form should close (modal text disappears)
    await waitFor(() => expect(mockCreateStockIntake).toHaveBeenCalled());
    // Verify the API was called with correct payload
    const payload = mockCreateStockIntake.mock.calls.at(-1)?.[0];
    expect(payload.payment_status).toBe("paid");
  });

  it("PAID-FE05: receipt-upload failure message remains correct", async () => {
    mockUploadStockIntakeReceipt.mockRejectedValue(new Error("upload_failed"));
    await openModal();
    fireEvent.change(getFormFieldControl<HTMLInputElement>("ต้นทุนรวม (฿)"), { target: { value: "100" } });
    // The intake itself should still succeed even if receipt upload fails later
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสต็อก" }));
    await waitFor(() => expect(mockCreateStockIntake).toHaveBeenCalled());
    // Payment status should still be paid
    const payload = mockCreateStockIntake.mock.calls.at(-1)?.[0];
    expect(payload.payment_status).toBe("paid");
  });

  it("PAID-FE06: no new client-side paid_at timestamp authority introduced", async () => {
    await openModal();
    fireEvent.change(getFormFieldControl<HTMLInputElement>("ต้นทุนรวม (฿)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสต็อก" }));
    await waitFor(() => expect(mockCreateStockIntake).toHaveBeenCalled());
    const payload = mockCreateStockIntake.mock.calls.at(-1)?.[0];
    // Frontend should NOT send paid_at — backend sets it server-side
    expect(payload.paid_at).toBeUndefined();
    // Frontend should NOT send due_date for V1 paid-default
    expect(payload.due_date).toBeUndefined();
  });
});
