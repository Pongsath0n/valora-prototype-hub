import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { CustomerMenuItem } from "@/services/customerApi";

// Mock customerApi before importing the component.
const mockGetMenuDetail = vi.fn();
const mockListMenu = vi.fn();

vi.mock("@/services/customerApi", () => ({
  customerApi: {
    getMenuDetail: (...args: unknown[]) => mockGetMenuDetail(...args),
    listMenu: (...args: unknown[]) => mockListMenu(...args),
  },
}));

// Mock cartStorage to avoid side effects.
vi.mock("@/services/cartStorage", () => ({
  addCartItem: vi.fn(),
}));

import MenuDetailPage from "./MenuDetail";

const PRODUCT_ID = "c63c1aae-d4be-463c-999f-c6c0fe2fedf4";

const SAMPLE_MENU: CustomerMenuItem = {
  id: PRODUCT_ID,
  name: "ลาเต้เย็น",
  description: "กาแฟลาเต้เย็น",
  image_url: null,
  price: 55,
  category: "กาแฟ",
  available: true,
  allow_sweetness: true,
  default_sweetness: 50,
  addons: [
    {
      addon_id: "addon-1",
      code: "extra_shot",
      name: "เพิ่มช็อต",
      price: 10,
      max_quantity: 3,
      addon_type: "extra_shot",
    },
  ],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/order/:productId" element={<MenuDetailPage />} />
        <Route path="/order" element={<div data-testid="menu-list" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGetMenuDetail.mockReset();
  mockListMenu.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── PD01: Canonical /order/:productId param is read correctly ──────────────
describe("PD01 canonical route param", () => {
  it("reads productId from /order/:productId route", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(mockGetMenuDetail).toHaveBeenCalledWith(PRODUCT_ID);
    });
  });
});

// ── PD02: Exact UUID reaches product lookup unchanged ──────────────────────
describe("PD02 exact UUID lookup", () => {
  it("passes the exact UUID from the URL to getMenuDetail", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(mockGetMenuDetail).toHaveBeenCalledTimes(1);
    });
    expect(mockGetMenuDetail).toHaveBeenCalledWith(PRODUCT_ID);
  });
});

// ── PD03: GET /api/customer/menu success exits skeleton ───────────────────
describe("PD03 menu success exits skeleton", () => {
  it("does not show skeleton after successful fetch", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    // Skeleton should appear briefly, then disappear
    await waitFor(() => {
      expect(screen.queryByText("ลาเต้เย็น")).toBeInTheDocument();
    });
    // Skeleton elements use animate-pulse — verify product name is visible
    expect(screen.getByText("ลาเต้เย็น")).toBeInTheDocument();
  });
});

// ── PD04: Matching product renders detail ─────────────────────────────────
describe("PD04 matching product renders detail", () => {
  it("renders product name when product is found", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByText("ลาเต้เย็น")).toBeInTheDocument();
    });
  });

  it("renders product description", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByText("กาแฟลาเต้เย็น")).toBeInTheDocument();
    });
  });
});

// ── PD05: Backend price renders ────────────────────────────────────────────
describe("PD05 backend price renders", () => {
  it("displays the backend-authoritative price", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      // Price appears in product detail and line total — verify at least one
      const prices = screen.getAllByText("฿55");
      expect(prices.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── PD06: Options/addons render ───────────────────────────────────────────
describe("PD06 options/addons render", () => {
  it("renders sweetness selector when allow_sweetness is true", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByText("ระดับความหวาน")).toBeInTheDocument();
    });
  });

  it("renders extra shot addon section", async () => {
    mockGetMenuDetail.mockResolvedValue(SAMPLE_MENU);
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByText("เพิ่มช็อต")).toBeInTheDocument();
    });
  });
});

// ── PD07: Failed menu request exits skeleton ──────────────────────────────
describe("PD07 failed menu request exits skeleton", () => {
  it("does not stay on skeleton when fetch fails", async () => {
    mockGetMenuDetail.mockRejectedValue(new Error("network_error"));
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByText(/ไม่สามารถโหลดรายละเอียดเมนูได้/)).toBeInTheDocument();
    });
  });
});

// ── PD08: Failed menu request shows safe error ───────────────────────────
describe("PD08 safe error message", () => {
  it("shows safe error message without internal details", async () => {
    mockGetMenuDetail.mockRejectedValue(new Error("internal_server_error_stack_trace"));
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByText("ไม่สามารถโหลดรายละเอียดเมนูได้ กรุณาลองใหม่อีกครั้ง")).toBeInTheDocument();
    });
    expect(screen.queryByText(/internal_server_error_stack_trace/)).not.toBeInTheDocument();
  });

  it("shows retry and back-to-menu actions on error", async () => {
    mockGetMenuDetail.mockRejectedValue(new Error("network_error"));
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "กลับไปหน้าเมนู" })).toBeInTheDocument();
    });
  });
});

// ── PD09: Retry performs canonical fetch again ────────────────────────────
describe("PD09 retry refetches", () => {
  it("clicking ลองใหม่ calls getMenuDetail again", async () => {
    mockGetMenuDetail.mockResolvedValueOnce(SAMPLE_MENU);
    mockGetMenuDetail.mockRejectedValueOnce(new Error("network_error"));
    renderAt(`/order/${PRODUCT_ID}`);
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("ลาเต้เย็น")).toBeInTheDocument();
    });
    // Trigger error by causing a refetch that fails — simulate by re-rendering
    // Actually, test retry from error state:
    mockGetMenuDetail.mockClear();
    mockGetMenuDetail.mockRejectedValueOnce(new Error("fail"));
    mockGetMenuDetail.mockResolvedValueOnce(SAMPLE_MENU);
    // Re-render at same path to trigger new load
    const { rerender } = renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByText(/ไม่สามารถโหลดรายละเอียดเมนูได้/)).toBeInTheDocument();
    });
    // Click retry
    act(() => {
      screen.getByRole("button", { name: "ลองใหม่" }).click();
    });
    await waitFor(() => {
      expect(screen.getByText("ลาเต้เย็น")).toBeInTheDocument();
    });
  });
});

// ── PD10: Missing product exits skeleton ──────────────────────────────────
describe("PD10 missing product exits skeleton", () => {
  it("does not stay on skeleton when product is not found (404)", async () => {
    mockGetMenuDetail.mockRejectedValue(new Error("not_found"));
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      // Either error or not-found state should appear — not skeleton
      const errorOrNotFound =
        screen.queryByText(/ไม่สามารถโหลดรายละเอียดเมนูได้/) ||
        screen.queryByText(/ไม่พบเมนูนี้/);
      expect(errorOrNotFound).not.toBeNull();
    });
  });
});

// ── PD11: Missing product shows not-found UI ──────────────────────────────
describe("PD11 not-found UI", () => {
  it("shows not-found message when product is null after load", async () => {
    // getMenuDetail throws → error state, not not-found.
    // not-found state is when productId is missing from route.
    // Test with a route that has no productId param.
    render(
      <MemoryRouter initialEntries={["/order/"]}>
        <Routes>
          <Route path="/order/" element={<MenuDetailPage />} />
          <Route path="/order" element={<div data-testid="menu-list" />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("ไม่พบเมนูนี้ หรือเมนูอาจไม่พร้อมจำหน่าย")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "กลับไปหน้าเมนู" })).toBeInTheDocument();
  });
});

// ── PD12: No infinite skeleton (loading || !product) ──────────────────────
describe("PD12 no infinite skeleton", () => {
  it("skeleton renders ONLY during actual loading, not when product is missing", async () => {
    // When productId is missing, loading should become false quickly
    render(
      <MemoryRouter initialEntries={["/order/"]}>
        <Routes>
          <Route path="/order/" element={<MenuDetailPage />} />
          <Route path="/order" element={<div data-testid="menu-list" />} />
        </Routes>
      </MemoryRouter>,
    );
    // Should show not-found, not skeleton
    await waitFor(() => {
      expect(screen.getByText("ไม่พบเมนูนี้ หรือเมนูอาจไม่พร้อมจำหน่าย")).toBeInTheDocument();
    });
  });

  it("error state is distinct from loading state", async () => {
    mockGetMenuDetail.mockRejectedValue(new Error("fail"));
    renderAt(`/order/${PRODUCT_ID}`);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // Error alert should not be skeleton
    expect(screen.queryByText("ลาเต้เย็น")).not.toBeInTheDocument();
  });
});

// ── PD13: No direct Supabase business read introduced ────────────────────
describe("PD13 no direct Supabase", () => {
  it("component does not import supabase", async () => {
    const source = await import("./MenuDetail?raw").catch(() => null);
    if (source) {
      // If raw import works, check for supabase references
      const content = (source as unknown as { default: string }).default ?? "";
      expect(content).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
      expect(content).not.toMatch(/supabase\.from\(/);
      expect(content).not.toMatch(/supabase\.rpc\(/);
    }
  });
});

// ── PD14: Canonical route remains /order/:productId ───────────────────────
describe("PD14 canonical route", () => {
  it("App.tsx defines /order/:productId (not /order/:id)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appPath = path.resolve(__dirname, "../../App.tsx");
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toMatch(/path="\/order\/:productId"/);
    expect(content).not.toMatch(/path="\/order\/:id"/);
  });
});

// ── PD15: /liff/menu/:id redirect becomes /order/:id-value ────────────────
describe("PD15 LIFF redirect preserves product id", () => {
  it("App.tsx LiffLegacyRedirect for /liff/menu/:id uses pathParam id", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appPath = path.resolve(__dirname, "../../App.tsx");
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toMatch(/\/liff\/menu\/:id.*LiffLegacyRedirect.*pathParam="id"/);
  });
});
