import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StoreAdminIngredientsPage from "./Ingredients";
import type { IngredientWasteReason } from "@/services/storeAdminApi";

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

describe("StoreAdminIngredientsPage", () => {
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
        {
          id: "ing-2",
          store_id: "store-1",
          name: "Ice Cubes",
          unit: "pcs",
          cost_per_unit: 0.1,
          current_stock: 999,
          low_stock_threshold: 0,
          supplier_name: "Cold Co",
          is_active: true,
        },
        {
          id: "ing-3",
          store_id: "store-1",
          name: "Matcha Powder",
          unit: "g",
          cost_per_unit: 2,
          current_stock: 50,
          low_stock_threshold: 10,
          supplier_name: "Tea Farm",
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
    mockListStockIntakes.mockImplementation((params?: { ingredient_id?: string }) => {
      if (params?.ingredient_id) {
        return Promise.resolve([
          {
            id: `recent-${params.ingredient_id}`,
            store_id: "store-1",
            ingredient_id: params.ingredient_id,
            quantity: 5,
            normalized_quantity: 5,
            purchase_unit: "g",
            conversion_factor: 1,
            total_cost: 100,
            movement_type: "in",
            lot_code: "LOT-LOCAL",
            expires_at: "2026-01-01T00:00:00.000Z",
          },
        ]);
      }
      return Promise.resolve([
        {
          id: "purchase-1",
          store_id: "store-1",
          ingredient_id: "ing-1",
          quantity: 5,
          normalized_quantity: 5,
          purchase_unit: "ml",
          conversion_factor: 1,
          total_cost: 100,
          movement_type: "in",
          lot_code: "LOT-123",
          expires_at: "2026-01-01T00:00:00.000Z",
          is_perishable: true,
        },
        {
          id: "purchase-2",
          store_id: "store-1",
          ingredient_id: "ing-3",
          quantity: 2,
          normalized_quantity: 2,
          purchase_unit: "g",
          conversion_factor: 1,
          total_cost: 40,
          movement_type: "in",
          lot_code: "LOT-MATCHA",
          expires_at: null,
          is_perishable: true,
        },
      ]);
    });
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

  it("renders canonical base unit selector with guidance", async () => {
    renderPage();
    // Master ingredient fields now live in a dedicated modal opened from the toolbar.
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มวัตถุดิบ" }));
    await screen.findByText("ชื่อวัตถุดิบ");
    expect(
      screen.getByText("เลือกหน่วยฐานที่ใช้ในสูตร เช่น กาแฟใช้ g, นมหรือน้ำใช้ ml, แก้ว+ฝาใช้ set, หลอดหรือสติ๊กเกอร์ใช้ pcs"),
    ).toBeInTheDocument();
    const baseUnitField = screen.getByText("หน่วยฐานที่ใช้ในสูตร").closest("div");
    expect(baseUnitField).toBeTruthy();
    if (!baseUnitField) throw new Error("base unit field missing");
    const unitWithin = within(baseUnitField);
    ["กรัม (g)", "มิลลิลิตร (ml)", "ชิ้น (pcs)", "ชุด (set)", "ขวด (bottle)"].forEach((label) => {
      expect(unitWithin.getByText(label)).toBeInTheDocument();
    });
  });

  it("includes expiry payload when perishable fields are provided", async () => {
    await openModal();
    fireEvent.change(getFormFieldControl<HTMLInputElement>("ต้นทุนรวม (฿)"), { target: { value: "150" } });
    fireEvent.click(screen.getByLabelText("วัตถุดิบนี้มีวันหมดอายุ"));
    fireEvent.change(getFormFieldControl<HTMLInputElement>("รหัส Lot (ไม่บังคับ)"), { target: { value: "LOT-42" } });
    fireEvent.change(getFormFieldControl<HTMLInputElement>("วันหมดอายุ (ไม่บังคับ)"), { target: { value: "2026-05-01" } });
    const noteField = getFormFieldControl<HTMLTextAreaElement>("หมายเหตุเพิ่มเติม (เช่น วิธีเก็บ, กลิ่น, สี)", "textarea");
    fireEvent.change(noteField, { target: { value: "เก็บเย็น" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสต็อก" }));

    await waitFor(() => expect(mockCreateStockIntake).toHaveBeenCalled());
    const payload = mockCreateStockIntake.mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({
      is_perishable: true,
      lot_code: "LOT-42",
      expiry_note: "เก็บเย็น",
    });
    expect(payload.expires_at).toBe(new Date("2026-05-01T00:00:00").toISOString());
  });

  it("submits legacy stock intake without expiry metadata when unchecked", async () => {
    await openModal();
    fireEvent.change(getFormFieldControl<HTMLInputElement>("ต้นทุนรวม (฿)"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสต็อก" }));
    await waitFor(() => expect(mockCreateStockIntake).toHaveBeenCalled());
    const payload = mockCreateStockIntake.mock.calls.at(-1)?.[0];
    expect(payload.is_perishable).toBe(false);
    expect(payload).not.toHaveProperty("lot_code");
    expect(payload).not.toHaveProperty("expires_at");
  });

  it("hides waste UI for staff role", async () => {
    mockUseProfileRole.mockReturnValue({ role: "staff", loading: false, refreshRole: vi.fn() });
    renderPage();
    await waitFor(() => expect(mockListIngredients).toHaveBeenCalled());
    expect(screen.queryByText("สรุปการทิ้งสต็อก")).toBeNull();
    expect(mockListIngredientWasteRecords).not.toHaveBeenCalled();
  });

  it("shows all ingredients in waste dropdown by default", async () => {
    renderPage();
    await waitFor(() => expect(mockListStockIntakes).toHaveBeenCalled());
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    const optionLabels = Array.from(ingredientSelect.options).map((opt) => opt.textContent);
    // All ingredients should be shown — waste is not gated by expiry
    expect(optionLabels).toContain("Fresh Milk");
    expect(optionLabels).toContain("Matcha Powder");
    expect(optionLabels).toContain("Ice Cubes");
  });

  it("selecting a recommended lot sets ingredient and purchase references", async () => {
    renderPage();
    await screen.findByText("ล็อตที่แนะนำให้ตัด");
    const lotSelect = getFormFieldControl<HTMLSelectElement>("ล็อตที่แนะนำให้ตัด", "select");
    fireEvent.change(lotSelect, { target: { value: "purchase-1" } });
    const quantityInput = getFormFieldControl<HTMLInputElement>("จำนวน");
    fireEvent.change(quantityInput, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));

    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    const payload = mockCreateIngredientWaste.mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({ ingredient_id: "ing-1", purchase_id: "purchase-1" });
  });

  it("submits exact waste quantity entered for any ingredient", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredientWasteRecords).toHaveBeenCalled());
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-2" } });
    fireEvent.change(getFormFieldControl<HTMLInputElement>("จำนวน"), { target: { value: "500" } });
    const reasonSelect = getFormFieldControl<HTMLSelectElement>("เหตุผล", "select");
    fireEvent.change(reasonSelect, { target: { value: "quality_issue" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));

    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    const payload = mockCreateIngredientWaste.mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({ ingredient_id: "ing-2", quantity: 500, reason: "quality_issue" });
  });

  it("maps waste reason labels to backend values", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredientWasteRecords).toHaveBeenCalled());
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    fireEvent.change(getFormFieldControl<HTMLInputElement>("จำนวน"), { target: { value: "3" } });
    const reasonSelect = getFormFieldControl<HTMLSelectElement>("เหตุผล", "select");
    fireEvent.change(reasonSelect, { target: { value: "spill" satisfies IngredientWasteReason } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));

    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    const payload = mockCreateIngredientWaste.mock.calls.at(-1)?.[0];
    expect(payload.reason).toBe("spill");
    await screen.findByText("บันทึกการทิ้งสต็อกแล้ว");
  });

  it("shows friendly error when waste submission fails due to stock", async () => {
    mockCreateIngredientWaste.mockRejectedValueOnce(new Error("insufficient_stock_for_waste"));
    renderPage();
    await waitFor(() => expect(mockListIngredientWasteRecords).toHaveBeenCalled());
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    fireEvent.change(getFormFieldControl<HTMLInputElement>("จำนวน"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));

    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    expect(await screen.findByText("สต็อกไม่เพียงพอสำหรับจำนวนที่เลือก")).toBeInTheDocument();
  });

  it("shows friendly error when lot remaining is insufficient", async () => {
    mockCreateIngredientWaste.mockRejectedValueOnce(new Error("insufficient_lot_stock_for_waste"));
    renderPage();
    await waitFor(() => expect(mockListIngredientWasteRecords).toHaveBeenCalled());
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    fireEvent.change(getFormFieldControl<HTMLInputElement>("จำนวน"), { target: { value: "500" } });
    fireEvent.change(getFormFieldControl<HTMLSelectElement>("อ้างอิงรายการซื้อ (ถ้ามี)", "select"), { target: { value: "purchase-1" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));

    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    expect(await screen.findByText("ล็อตที่เลือกเหลือไม่พอสำหรับจำนวนนี้")).toBeInTheDocument();
    const payload = mockCreateIngredientWaste.mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({ ingredient_id: "ing-1", quantity: 500 });
  });
  it("shows friendly message when network fails during waste submission", async () => {
    mockCreateIngredientWaste.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderPage();
    await waitFor(() => expect(mockListIngredientWasteRecords).toHaveBeenCalled());
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    fireEvent.change(getFormFieldControl<HTMLInputElement>("จำนวน"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));

    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    expect(await screen.findByText("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่"))?.toBeInTheDocument();
  });
});
