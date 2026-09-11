import { describe, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

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

import StoreAdminIngredientsPage from "./Ingredients";

describe("General Waste Recording — Dropdown Migration (DD-WST)", () => {
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

  function getFormFieldInput<T extends HTMLInputElement | HTMLTextAreaElement>(
    label: string,
    selector: "input" | "textarea" = "input",
  ) {
    const element = screen.getByText(label);
    const container = element.closest("div");
    if (!container) throw new Error(`missing container for ${label}`);
    const input = container.querySelector(selector);
    if (!input) throw new Error(`missing input for ${label}`);
    return input as T;
  }

  it("DD-WST01: ingredient dropdown still contains all eligible items", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // Open the ingredient combobox using keyboard (Space/Enter opens Radix Select)
    const comboboxes = screen.getAllByRole("combobox");
    const ingredientCombo = comboboxes.find((cb) => cb.textContent?.includes("เลือกวัตถุดิบ")) ?? comboboxes[0];
    ingredientCombo.focus();
    fireEvent.keyDown(ingredientCombo, { key: "Enter", code: "Enter" });
    // All ingredients should be visible in the dropdown — use role=option to scope
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const optionTexts = options.map((opt) => opt.textContent);
      expect(optionTexts).toContain("Fresh Milk");
      expect(optionTexts).toContain("Sugar");
      expect(optionTexts).toContain("Coffee Beans");
    });
  });

  it("DD-WST02: reason values unchanged", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // The reason select should have the default "หมดอายุ" selected (first option)
    const comboboxes = screen.getAllByRole("combobox");
    const reasonCombo = comboboxes.find((cb) => cb.textContent?.includes("หมดอายุ"));
    expect(reasonCombo).toBeTruthy();
  });

  it("DD-WST03: purchase-reference values unchanged", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // The purchase reference select should show "ไม่ระบุ" as the placeholder
    // (no recent intakes are loaded, so the placeholder is shown)
    const purchaseLabel = screen.getByText("อ้างอิงรายการซื้อ (ถ้ามี)");
    const container = purchaseLabel.closest("div");
    expect(container).toBeTruthy();
    // The placeholder text should be rendered inside the trigger
    expect(container?.textContent).toContain("ไม่ระบุ");
  });

  it("DD-WST04: selected ingredient updates form correctly", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // Open ingredient dropdown and select "Fresh Milk"
    const comboboxes = screen.getAllByRole("combobox");
    const ingredientCombo = comboboxes.find((cb) => cb.textContent?.includes("เลือกวัตถุดิบ")) ?? comboboxes[0];
    ingredientCombo.focus();
    fireEvent.keyDown(ingredientCombo, { key: "Enter", code: "Enter" });
    const options = await screen.findAllByRole("option");
    const freshMilkOption = options.find((opt) => opt.textContent === "Fresh Milk");
    expect(freshMilkOption).toBeTruthy();
    if (freshMilkOption) fireEvent.click(freshMilkOption);
    // Stock should be displayed after selecting
    await waitFor(() => {
      expect(screen.getByText(/สต็อกคงเหลือ/)).toBeInTheDocument();
    });
  });

  it("DD-WST05: dropdown migration does not alter waste payload", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    // Select ingredient
    const comboboxes = screen.getAllByRole("combobox");
    const ingredientCombo = comboboxes.find((cb) => cb.textContent?.includes("เลือกวัตถุดิบ")) ?? comboboxes[0];
    ingredientCombo.focus();
    fireEvent.keyDown(ingredientCombo, { key: "Enter", code: "Enter" });
    const options = await screen.findAllByRole("option");
    const freshMilkOption = options.find((opt) => opt.textContent === "Fresh Milk");
    if (freshMilkOption) fireEvent.click(freshMilkOption);
    // Enter quantity
    const quantityInput = getFormFieldInput<HTMLInputElement>("จำนวน");
    fireEvent.change(quantityInput, { target: { value: "50" } });
    // Submit
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));
    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    const payload = mockCreateIngredientWaste.mock.calls.at(-1)?.[0];
    expect(payload.ingredient_id).toBe("ing-1");
    expect(payload.quantity).toBe(50);
    expect(payload.reason).toBe("expired"); // default reason
  });

  it("DD-WST06: no-expiry ingredient remains selectable", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    const comboboxes = screen.getAllByRole("combobox");
    const ingredientCombo = comboboxes.find((cb) => cb.textContent?.includes("เลือกวัตถุดิบ")) ?? comboboxes[0];
    ingredientCombo.focus();
    fireEvent.keyDown(ingredientCombo, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const optionTexts = options.map((opt) => opt.textContent);
      expect(optionTexts).toContain("Sugar");
    });
  });

  it("DD-WST07: non-expired ingredient remains selectable", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(await screen.findByText("บันทึกการทิ้งสต็อก")).toBeInTheDocument();
    const comboboxes = screen.getAllByRole("combobox");
    const ingredientCombo = comboboxes.find((cb) => cb.textContent?.includes("เลือกวัตถุดิบ")) ?? comboboxes[0];
    ingredientCombo.focus();
    fireEvent.keyDown(ingredientCombo, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const optionTexts = options.map((opt) => opt.textContent);
      expect(optionTexts).toContain("Fresh Milk");
    });
  });
});
