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
const mockUseProfileRole = vi.fn();

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => mockUseProfileRole(),
}));

vi.mock("@/services/storeAdminApi", () => ({
  INGREDIENT_BASE_UNITS: ["g", "ml", "pcs", "set", "bottle"],
  INGREDIENT_WASTE_REASONS: [
    "expired_waste",
    "damaged_waste",
    "spill_waste",
    "quality_issue_waste",
    "manual_waste",
    "other_waste",
  ],
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
    mockUseProfileRole.mockReset();

    mockUseProfileRole.mockReturnValue({ role: "owner", loading: false, refreshRole: vi.fn() });
    mockListIngredients.mockResolvedValue({
      items: [
        {
          id: "ing-1",
          store_id: "store-1",
          name: "Espresso Beans",
          unit: "g",
          cost_per_unit: 0.6,
          current_stock: 500,
          low_stock_threshold: 100,
          supplier_name: "Best Beans",
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
      reason: "manual_waste",
    });
    mockListStockIntakes.mockResolvedValue([
      {
        id: "purchase-1",
        store_id: "store-1",
        ingredient_id: "ing-1",
        quantity: 5,
        normalized_quantity: 5,
        purchase_unit: "g",
        conversion_factor: 1,
        total_cost: 100,
        movement_type: "in",
        lot_code: "LOT-123",
        expires_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
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
    fireEvent.click(screen.getByLabelText("มีวันหมดอายุ"));
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

  it("maps waste reason labels to backend values", async () => {
    renderPage();
    await waitFor(() => expect(mockListIngredientWasteRecords).toHaveBeenCalled());
    const ingredientSelect = getFormFieldControl<HTMLSelectElement>("วัตถุดิบที่จะตัดสต็อก", "select");
    fireEvent.change(ingredientSelect, { target: { value: "ing-1" } });
    fireEvent.change(getFormFieldControl<HTMLInputElement>("จำนวน"), { target: { value: "3" } });
    const reasonSelect = getFormFieldControl<HTMLSelectElement>("เหตุผล", "select");
    fireEvent.change(reasonSelect, { target: { value: "spill_waste" satisfies IngredientWasteReason } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการทิ้ง" }));

    await waitFor(() => expect(mockCreateIngredientWaste).toHaveBeenCalled());
    const payload = mockCreateIngredientWaste.mock.calls.at(-1)?.[0];
    expect(payload.reason).toBe("spill_waste");
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
});
