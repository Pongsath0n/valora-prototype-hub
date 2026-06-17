import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StoreAdminIngredientsPage from "./Ingredients";

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const mockListIngredients = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  INGREDIENT_BASE_UNITS: ["g", "ml", "pcs", "set", "bottle"],
  storeAdminApi: {
    listIngredients: (...args: unknown[]) => mockListIngredients(...args),
    createIngredient: vi.fn(),
    updateIngredient: vi.fn(),
    deleteIngredient: vi.fn(),
    createStockIntake: vi.fn().mockResolvedValue({ intake: { id: "purchase-1", store_id: "store-1" }, ingredient: {} }),
    uploadStockIntakeReceipt: vi.fn().mockResolvedValue({}),
  },
}));

describe("StoreAdminIngredientsPage - stock intake modal", () => {
  beforeEach(() => {
    mockListIngredients.mockReset();
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

  it("renders canonical base unit selector with guidance", async () => {
    renderPage();
    await screen.findByText("ชื่อวัตถุดิบ");
    expect(screen.getByText("เลือกหน่วยฐานที่ใช้ในสูตร เช่น กาแฟใช้ g, นมหรือน้ำใช้ ml, แก้ว+ฝาใช้ set, หลอดหรือสติ๊กเกอร์ใช้ pcs")).toBeInTheDocument();
    const baseUnitField = screen.getByText("หน่วยฐานที่ใช้ในสูตร").closest("div");
    expect(baseUnitField).toBeTruthy();
    if (!baseUnitField) throw new Error("base unit field missing");
    const unitWithin = within(baseUnitField);
    ["กรัม (g)", "มิลลิลิตร (ml)", "ชิ้น (pcs)", "ชุด (set)", "ขวด (bottle)"].forEach((label) => {
      expect(unitWithin.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText("ต้นทุนตั้งต้นต่อหน่วย (ถ้ายังไม่มีรายการซื้อเข้า)")).toBeInTheDocument();
    expect(screen.getByText("หลังจากบันทึกซื้อเข้าสต็อก ระบบจะอัปเดตต้นทุนต่อหน่วยจากราคาซื้อจริงให้อัตโนมัติ")).toBeInTheDocument();
    expect(screen.getByText("สต็อกตั้งต้น")).toBeInTheDocument();
    expect(screen.getByText("หลังจากนี้ควรเพิ่มสต็อกผ่านปุ่มบันทึกซื้อเข้าสต็อก เพื่อให้ต้นทุนและจำนวนสต็อกถูกต้อง")).toBeInTheDocument();
  });

  it("hides legacy receipt URL fields and shows uploader", async () => {
    await openModal();
    expect(screen.queryByText("ลิงก์ใบเสร็จ")).toBeNull();
    expect(screen.queryByText("พาธไฟล์ใบเสร็จ")).toBeNull();
    expect(screen.getByText("แนบรูปใบเสร็จ / สลิปซื้อของ (ไม่บังคับ)")).toBeInTheDocument();
  });

  it("offers suggested purchase units and conversion preview", async () => {
    await openModal();
    const purchaseUnitField = screen.getByText("หน่วยที่ซื้อ").closest("div");
    const unitSelect = purchaseUnitField?.querySelector("select");
    expect(unitSelect).toBeTruthy();
    if (!unitSelect) throw new Error("purchase unit select not found");
    fireEvent.change(unitSelect, { target: { value: "kg" } });
    expect(screen.getByText("กิโลกรัม (kg)")).toBeInTheDocument();
    const quantityInput = screen.getByDisplayValue("1");
    fireEvent.change(quantityInput, { target: { value: "2" } });
    expect(screen.getByText(/1 kg/)).toBeInTheDocument();
  });
});
