import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockListMenu = vi.fn();

vi.mock("@/services/customerApi", () => ({
  customerApi: {
    listMenu: (...args: unknown[]) => mockListMenu(...args),
  },
}));

const mockReadCart = vi.fn();

vi.mock("@/services/cartStorage", () => ({
  readCart: () => mockReadCart(),
  getCartItemLineTotal: (item: { price: number; quantity: number }) => item.price * item.quantity,
}));

import CustomerMenuPage from "./CustomerMenu";

const MENU_FIXTURE = [
  {
    id: "c63c1aae-d4be-463c-999f-c6c0fe2fedf4",
    name: "ลาเต้เย็น",
    description: "กาแฟลาเต้เย็น",
    image_url: "https://cdn.example.com/latte.png",
    price: 55,
    category: "กาแฟ",
    available: true,
    allow_sweetness: true,
    default_sweetness: 50,
    addons: [],
  },
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "มัทฉะลาเต้",
    description: "ชาเขียวมัทฉะ",
    image_url: null,
    price: 65,
    category: "มัทฉะ",
    available: true,
    allow_sweetness: true,
    default_sweetness: 50,
    addons: [],
  },
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={["/order"]}>
      <Routes>
        <Route path="/order" element={<CustomerMenuPage />} />
        <Route path="/order/:productId" element={<LocationProbe />} />
        <Route path="/order/cart" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockListMenu.mockReset();
  mockListMenu.mockResolvedValue(MENU_FIXTURE);
  mockReadCart.mockReset();
  mockReadCart.mockReturnValue([]);
});

// ── UX01: Canonical menu response renders ─────────────────────────────────
describe("UX01 canonical menu renders", () => {
  it("renders products from listMenu()", async () => {
    renderMenu();
    expect(await screen.findByText("ลาเต้เย็น")).toBeInTheDocument();
    expect(screen.getByText("มัทฉะลาเต้")).toBeInTheDocument();
    expect(mockListMenu).toHaveBeenCalled();
  });
});

// ── UX02: Mobile compact two-column grid contract ─────────────────────────
describe("UX02 two-column grid contract", () => {
  it("product grid uses grid-cols-2 for mobile", async () => {
    const { container } = renderMenu();
    await screen.findByText("ลาเต้เย็น");
    const grid = container.querySelector(".grid-cols-2");
    expect(grid).not.toBeNull();
    // Grid contains the product links
    expect(within(grid as HTMLElement).getByText("ลาเต้เย็น")).toBeInTheDocument();
  });
});

// ── UX03: Search filters by product name ──────────────────────────────────
describe("UX03 search filters by name", () => {
  it("filters products by name query", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    fireEvent.change(screen.getByLabelText("ค้นหาเมนู"), { target: { value: "มัทฉะ" } });
    expect(screen.getByText("มัทฉะลาเต้")).toBeInTheDocument();
    expect(screen.queryByText("ลาเต้เย็น")).not.toBeInTheDocument();
  });
});

// ── UX04: Search is case-insensitive ──────────────────────────────────────
describe("UX04 search case-insensitive", () => {
  it("matches regardless of case", async () => {
    mockListMenu.mockResolvedValue([
      { ...MENU_FIXTURE[0], name: "Iced Latte", category: "Coffee" },
      { ...MENU_FIXTURE[1], name: "Matcha", category: "Tea" },
    ]);
    renderMenu();
    await screen.findByText("Iced Latte");
    fireEvent.change(screen.getByLabelText("ค้นหาเมนู"), { target: { value: "MATCHA" } });
    expect(screen.getByText("Matcha")).toBeInTheDocument();
    expect(screen.queryByText("Iced Latte")).not.toBeInTheDocument();
  });
});

// ── UX05: Search trims whitespace ─────────────────────────────────────────
describe("UX05 search trims whitespace", () => {
  it("trims surrounding whitespace from query", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    fireEvent.change(screen.getByLabelText("ค้นหาเมนู"), { target: { value: "   มัทฉะ   " } });
    expect(screen.getByText("มัทฉะลาเต้")).toBeInTheDocument();
    expect(screen.queryByText("ลาเต้เย็น")).not.toBeInTheDocument();
  });
});

// ── UX06: Categories derive from backend products ─────────────────────────
describe("UX06 categories from backend", () => {
  it("renders category chips derived from products", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    expect(screen.getByRole("button", { name: "กาแฟ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "มัทฉะ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ทั้งหมด" })).toBeInTheDocument();
  });
});

// ── UX07: "ทั้งหมด" resets category filter ────────────────────────────────
describe("UX07 all-category reset", () => {
  it("selecting ทั้งหมด shows all products", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    fireEvent.click(screen.getByRole("button", { name: "กาแฟ" }));
    expect(screen.queryByText("มัทฉะลาเต้")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ทั้งหมด" }));
    expect(screen.getByText("ลาเต้เย็น")).toBeInTheDocument();
    expect(screen.getByText("มัทฉะลาเต้")).toBeInTheDocument();
  });
});

// ── UX08: Category filter works ───────────────────────────────────────────
describe("UX08 category filter", () => {
  it("filters products by selected category", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    fireEvent.click(screen.getByRole("button", { name: "มัทฉะ" }));
    expect(screen.getByText("มัทฉะลาเต้")).toBeInTheDocument();
    expect(screen.queryByText("ลาเต้เย็น")).not.toBeInTheDocument();
  });

  it("conveys selected state beyond color via aria-pressed", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    const chip = screen.getByRole("button", { name: "มัทฉะ" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});

// ── UX09: Search + category combine ───────────────────────────────────────
describe("UX09 search + category combine", () => {
  it("applies both filters together", async () => {
    mockListMenu.mockResolvedValue([
      { ...MENU_FIXTURE[0], name: "ลาเต้ร้อน", description: "", category: "กาแฟ" },
      { ...MENU_FIXTURE[1], id: "x2", name: "ลาเต้เย็น", description: "", category: "กาแฟ" },
      { ...MENU_FIXTURE[1], id: "x3", name: "มัทฉะเย็น", description: "", category: "มัทฉะ" },
    ]);
    renderMenu();
    await screen.findByText("ลาเต้ร้อน");
    fireEvent.click(screen.getByRole("button", { name: "กาแฟ" }));
    fireEvent.change(screen.getByLabelText("ค้นหาเมนู"), { target: { value: "เย็น" } });
    // Only กาแฟ + contains "เย็น"
    expect(screen.getByText("ลาเต้เย็น")).toBeInTheDocument();
    expect(screen.queryByText("ลาเต้ร้อน")).not.toBeInTheDocument();
    expect(screen.queryByText("มัทฉะเย็น")).not.toBeInTheDocument();
  });
});

// ── UX10: Search-no-result state ──────────────────────────────────────────
describe("UX10 search no result", () => {
  it("shows no-result message when filters match nothing", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    fireEvent.change(screen.getByLabelText("ค้นหาเมนู"), { target: { value: "zzzznotfound" } });
    expect(screen.getByText("ไม่พบเมนูที่ตรงกับการค้นหา")).toBeInTheDocument();
  });
});

// ── UX11: API-empty menu state is distinct ────────────────────────────────
describe("UX11 empty menu distinct", () => {
  it("shows empty-menu message when API returns zero products", async () => {
    mockListMenu.mockResolvedValue([]);
    renderMenu();
    expect(await screen.findByText("ยังไม่มีเมนูที่พร้อมขาย")).toBeInTheDocument();
    // Distinct from the no-result message
    expect(screen.queryByText("ไม่พบเมนูที่ตรงกับการค้นหา")).not.toBeInTheDocument();
  });
});

// ── UX12: Product card renders canonical name ─────────────────────────────
describe("UX12 card name", () => {
  it("renders product name on card", async () => {
    renderMenu();
    expect(await screen.findByText("ลาเต้เย็น")).toBeInTheDocument();
  });
});

// ── UX13: Product card renders backend price ──────────────────────────────
describe("UX13 card price", () => {
  it("renders backend-authoritative price", async () => {
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    expect(screen.getByText("฿55")).toBeInTheDocument();
    expect(screen.getByText("฿65")).toBeInTheDocument();
  });
});

// ── UX14: Missing image renders compact placeholder ───────────────────────
describe("UX14 missing image placeholder", () => {
  it("renders placeholder when image_url is null (no broken img)", async () => {
    renderMenu();
    await screen.findByText("มัทฉะลาเต้");
    // The matcha item has null image — its card should not contain an <img> with matcha alt
    expect(screen.queryByAltText("มัทฉะลาเต้")).not.toBeInTheDocument();
    // Placeholder shows Healholic brand text (at least one instance)
    expect(screen.getAllByText("Healholic").length).toBeGreaterThanOrEqual(1);
  });
});

// ── UX15: Selecting product navigates to /order/:productId ────────────────
describe("UX15 product navigation", () => {
  it("product link points to /order/:productId", async () => {
    renderMenu();
    const link = await screen.findByText("ลาเต้เย็น");
    const anchor = link.closest("a");
    expect(anchor).toHaveAttribute("href", "/order/c63c1aae-d4be-463c-999f-c6c0fe2fedf4");
  });
});

// ── UX16: Exact UUID preserved ────────────────────────────────────────────
describe("UX16 exact UUID preserved", () => {
  it("navigates with the exact UUID unchanged", async () => {
    renderMenu();
    const link = await screen.findByText("ลาเต้เย็น");
    fireEvent.click(link.closest("a")!);
    await waitFor(() => {
      expect(screen.getByTestId("location-probe").textContent).toBe(
        "/order/c63c1aae-d4be-463c-999f-c6c0fe2fedf4",
      );
    });
  });
});

// ── UX22: Cart >0 displays sticky cart CTA ────────────────────────────────
describe("UX22 sticky cart CTA", () => {
  it("shows sticky cart CTA when cart has items", async () => {
    mockReadCart.mockReturnValue([{ productId: "p1", name: "Latte", price: 55, quantity: 2 }]);
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    expect(screen.getByLabelText(/ดูตะกร้า/)).toBeInTheDocument();
    expect(screen.getByText(/2 รายการ/)).toBeInTheDocument();
  });
});

// ── UX23: Sticky cart uses existing cart state ────────────────────────────
describe("UX23 sticky cart reads cart state", () => {
  it("reads cart quantity and total from cartStorage", async () => {
    mockReadCart.mockReturnValue([
      { productId: "p1", name: "Latte", price: 50, quantity: 2 },
      { productId: "p2", name: "Tea", price: 25, quantity: 1 },
    ]);
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    // 3 items total, 50*2 + 25*1 = 125
    expect(screen.getByText(/3 รายการ/)).toBeInTheDocument();
    expect(screen.getByText(/฿125/)).toBeInTheDocument();
  });
});

// ── UX24: Sticky cart navigates to /order/cart ────────────────────────────
describe("UX24 sticky cart navigation", () => {
  it("sticky cart CTA links to /order/cart", async () => {
    mockReadCart.mockReturnValue([{ productId: "p1", name: "Latte", price: 55, quantity: 1 }]);
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    const cta = screen.getByLabelText(/ดูตะกร้า/);
    expect(cta).toHaveAttribute("href", "/order/cart");
  });
});

// ── UX25: Empty cart does not show false checkout CTA ─────────────────────
describe("UX25 empty cart no false CTA", () => {
  it("hides sticky cart CTA when cart is empty", async () => {
    mockReadCart.mockReturnValue([]);
    renderMenu();
    await screen.findByText("ลาเต้เย็น");
    expect(screen.queryByLabelText(/ดูตะกร้า/)).not.toBeInTheDocument();
  });
});

// ── UX26: Menu API failure shows safe retry ───────────────────────────────
describe("UX26 API failure safe retry", () => {
  it("shows safe error and retry button on fetch failure", async () => {
    mockListMenu.mockRejectedValue(new Error("internal_db_error_stack"));
    renderMenu();
    expect(await screen.findByText("ไม่สามารถโหลดเมนูได้ กรุณาลองใหม่อีกครั้ง")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeInTheDocument();
    // Internal details not exposed
    expect(screen.queryByText(/internal_db_error_stack/)).not.toBeInTheDocument();
  });
});

// ── UX27: Retry requests canonical menu again ─────────────────────────────
describe("UX27 retry refetches", () => {
  it("clicking ลองใหม่ calls listMenu again", async () => {
    mockListMenu.mockRejectedValueOnce(new Error("fail"));
    mockListMenu.mockResolvedValueOnce(MENU_FIXTURE);
    renderMenu();
    await screen.findByText("ไม่สามารถโหลดเมนูได้ กรุณาลองใหม่อีกครั้ง");
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("ลาเต้เย็น")).toBeInTheDocument();
    expect(mockListMenu.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
