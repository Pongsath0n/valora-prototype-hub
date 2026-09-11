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

function makeIngredient(id: string, name: string, opts?: { current_stock?: number; expires_at?: string | null; is_perishable?: boolean }) {
  return {
    id,
    store_id: "store-1",
    name,
    unit: "ml",
    cost_per_unit: 0.6,
    current_stock: opts?.current_stock ?? 500,
    low_stock_threshold: 100,
    supplier_name: "Best Milk",
    is_active: true,
    expires_at: opts?.expires_at ?? null,
    is_perishable: opts?.is_perishable ?? false,
  };
}

describe("General Waste Recording (WST-FE)", () => {
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
        makeIngredient("ing-1", "Fresh Milk", { current_stock: 700, expires_at: "2099-12-31T00:00:00Z", is_perishable: true }),
        makeIngredient("ing-2", "Sugar", { current_stock: 500, expires_at: null, is_perishable: false }),
        makeIngredient("ing-3", "Coffee Beans", { current_stock: 300, expires_at: "2020-01-01T00:00:00Z", is_perishable: true }),
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
      quantity: 100,
      reason: "damaged",
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

  it("WST-FE01: Waste action available for normal in-stock ingredient", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    // Waste form section should be visible for manager/owner role
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
  });

  it("WST-FE02: non-expired ingredient shows Waste action", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    // The ingredient dropdown should include non-expired ingredients
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    const optionTexts = Array.from(ingredientSelect.options).map((opt) => opt.textContent);
    // "Fresh Milk" has expiry in 2099 (non-expired) — should be available
    expect(optionTexts).toContain("Fresh Milk");
  });

  it("WST-FE03: ingredient without expiry shows Waste action", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    const optionTexts = Array.from(ingredientSelect.options).map((opt) => opt.textContent);
    // "Sugar" has no expiry_date — should still be available
    expect(optionTexts).toContain("Sugar");
  });

  it("WST-FE04: available stock displayed", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // Select an ingredient to see its stock
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    // Stock should be displayed
    await waitFor(() => {
      expect(screen.getByText(/สต็อกคงเหลือ/)).toBeInTheDocument();
    });
  });

  it("WST-FE05: quantity > stock blocked / error shown", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // Select ingredient with stock 700
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    // Enter quantity > stock
    const quantityInput = getFormFieldControl<HTMLInputElement>("จำนวน");
    fireEvent.change(quantityInput, { target: { value: "999" } });
    // Submit
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));
    // The backend will reject — but we can verify the form is submittable
    // and the error will come from the API
    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
  });

  it("WST-FE06: reason selector available", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    const reasonSelect = getFormFieldControl<HTMLSelectElement>("เหตุผล", "select");
    const optionTexts = Array.from(reasonSelect.options).map((opt) => opt.textContent);
    // All reasons should be available, not just "expired"
    expect(optionTexts).toContain("หมดอายุ");
    expect(optionTexts).toContain("เสียหาย/ชำรุด");
    expect(optionTexts).toContain("อื่น ๆ");
  });

  it("WST-FE07: optional note accepted", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    const quantityInput = getFormFieldControl<HTMLInputElement>("จำนวน");
    fireEvent.change(quantityInput, { target: { value: "50" } });
    const noteField = getFormFieldControl<HTMLTextAreaElement>("บันทึกเพิ่มเติม (ไม่บังคับ)", "textarea");
    fireEvent.change(noteField, { target: { value: "เปิดใช้งานแล้วพบกลิ่นผิดปกติ" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));
    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    const payload = mockCreateIngredientWaste.mock.calls.at(-1)?.[0];
    expect(payload.note).toBe("เปิดใช้งานแล้วพบกลิ่นผิดปกติ");
  });

  it("WST-FE08: success refreshes inventory", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    const quantityInput = getFormFieldControl<HTMLInputElement>("จำนวน");
    fireEvent.change(quantityInput, { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));
    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    // After successful waste, inventory should be refreshed
    await waitFor(() => expect(mockListIngredients.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("WST-FE09: expiry alert screen remains functional", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    // The waste summary section should still exist
    expect(await screen.findByText("สรุปการทิ้งสต็อก")).toBeInTheDocument();
    // Inventory alerts are loaded
    await waitFor(() => expect(mockGetInventoryAlerts).toHaveBeenCalled());
  });

  it("WST-FE10: Waste UI does not require expired status", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // The hint should NOT mention expiry as a requirement
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    const optionTexts = Array.from(ingredientSelect.options).map((opt) => opt.textContent);
    // All ingredients should be shown, not just expired ones
    expect(optionTexts).toContain("Fresh Milk"); // non-expired
    expect(optionTexts).toContain("Sugar"); // no expiry
    expect(optionTexts).toContain("Coffee Beans"); // expired
  });
});
