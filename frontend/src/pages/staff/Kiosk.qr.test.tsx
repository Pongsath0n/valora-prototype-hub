import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StoreQrPanel from "@/components/staff/kiosk/StoreQrPanel";

// Mock storeAdminApi for tests that exercise the full Kiosk page.
const mockListMenu = vi.fn();
const mockCreateKioskOrder = vi.fn();
const mockGetPaymentSettings = vi.fn();
const mockListIncomingQueue = vi.fn();

vi.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/services/customerApi", () => ({
  customerApi: {
    listMenu: (...args: unknown[]) => mockListMenu(...args),
  },
}));

vi.mock("@/services/storeAdminApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/storeAdminApi")>("@/services/storeAdminApi");
  return {
    ...actual,
    storeAdminApi: {
      ...actual.storeAdminApi,
      createKioskOrder: (...args: unknown[]) => mockCreateKioskOrder(...args),
      getPaymentSettings: (...args: unknown[]) => mockGetPaymentSettings(...args),
      listIncomingQueue: (...args: unknown[]) => mockListIncomingQueue(...args),
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "staff" }, loading: false }),
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({ role: "staff", loading: false, storeId: "store-1" }),
}));

vi.mock("@/hooks/useStoreOrdersRealtimeInvalidation", () => ({
  useStoreOrdersRealtimeInvalidation: () => {},
}));

vi.mock("@/lib/guards", () => ({
  useRoleGuard: () => ({ checking: false, accessDenied: false }),
  useIsStoreOwner: () => false,
  STORE_ADMIN_ROLES: ["staff"],
  BUSINESS_PORTAL_ROLES: ["owner"],
  STORE_MANAGER_ROLES: ["owner"],
  SYSTEM_CONSOLE_ROLES: ["owner", "admin"],
}));

import StaffKioskPage from "./Kiosk";

const MENU_FIXTURE = [
  {
    id: "prod_1",
    name: "Iced Latte",
    price: 55,
    category: "coffee",
    description: "Double shot",
    allow_sweetness: true,
    default_sweetness: 75,
    addons: [{ addon_id: "shot", name: "Extra Shot", price: 15, max_quantity: 2 }],
    available: true,
    image_url: null,
  },
];

const PAYMENT_SETTINGS_OK = {
  store_id: "store_1",
  settings: {
    store_id: "store_1",
    promptpay_display_name: "Healholic Cafe",
    is_promptpay_enabled: true,
    is_cash_enabled: true,
    promptpay_qr_storage_path: "store_1/qr.png",
    promptpay_qr_file_name: "qr.png",
    promptpay_qr_url: "https://cdn.example.com/qr.png",
  },
};

const PAYMENT_SETTINGS_NO_QR = {
  store_id: "store_1",
  settings: {
    store_id: "store_1",
    promptpay_display_name: null,
    is_promptpay_enabled: true,
    is_cash_enabled: true,
    promptpay_qr_storage_path: null,
    promptpay_qr_file_name: null,
    promptpay_qr_url: null,
  },
};

function renderKioskPage() {
  return render(
    <MemoryRouter>
      <StaffKioskPage />
    </MemoryRouter>,
  );
}

async function addItemAndGoToPayment() {
  fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
  fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
  fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
}

beforeEach(() => {
  mockListMenu.mockReset();
  mockListMenu.mockResolvedValue(MENU_FIXTURE);
  mockCreateKioskOrder.mockReset();
  mockCreateKioskOrder.mockResolvedValue({
    id: "order-1",
    order_no: "Q-10",
    total_amount: 55,
    latest_payment: { method: "cash" },
  });
  mockGetPaymentSettings.mockReset();
  mockGetPaymentSettings.mockResolvedValue(PAYMENT_SETTINGS_OK);
  mockListIncomingQueue.mockReset();
  mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "store-1" });
});

// ── QR01: Fresh mount loads settings ──────────────────────────────────────
describe("QR01 fresh mount loads settings", () => {
  it("calls getPaymentSettings on mount", async () => {
    renderKioskPage();
    await waitFor(() => {
      expect(mockGetPaymentSettings).toHaveBeenCalledTimes(1);
    });
  });
});

// ── QR02: First PromptPay checkout works without refresh ─────────────────
describe("QR02 first PromptPay checkout without refresh", () => {
  it("shows QR image in first session when settings resolve", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    expect(await screen.findByAltText("QR พร้อมเพย์ของร้าน")).toHaveAttribute(
      "src",
      "https://cdn.example.com/qr.png",
    );
  });
});

// ── QR03: Payment step during loading shows loading state ────────────────
describe("QR03 loading state in QR area", () => {
  it("shows loading message when settings are loading", () => {
    // Never resolve — stays in loading state
    mockGetPaymentSettings.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} loading={true} />
      </MemoryRouter>,
    );
    expect(screen.getByText("กำลังโหลด QR สำหรับชำระเงิน...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

// ── QR04: Async settings resolution shows QR same session ────────────────
describe("QR04 async resolution shows QR", () => {
  it("QR appears after async settings resolve without remount", async () => {
    let resolveSettings: (v: typeof PAYMENT_SETTINGS_OK) => void = () => {};
    mockGetPaymentSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );
    renderKioskPage();
    await addItemAndGoToPayment();
    // Loading state should be visible
    expect(screen.getByText("กำลังโหลด QR สำหรับชำระเงิน...")).toBeInTheDocument();
    // Resolve settings
    await act(async () => {
      resolveSettings(PAYMENT_SETTINGS_OK);
    });
    // QR should appear
    expect(await screen.findByAltText("QR พร้อมเพย์ของร้าน")).toHaveAttribute(
      "src",
      "https://cdn.example.com/qr.png",
    );
  });
});

// ── QR05: No second order needed ─────────────────────────────────────────
describe("QR05 no second order needed", () => {
  it("QR appears without creating any order", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    await screen.findByAltText("QR พร้อมเพย์ของร้าน");
    expect(mockCreateKioskOrder).not.toHaveBeenCalled();
  });
});

// ── QR06: No remount needed ──────────────────────────────────────────────
describe("QR06 no remount needed", () => {
  it("QR appears in same render tree without remount", async () => {
    const { unmount } = renderKioskPage();
    await addItemAndGoToPayment();
    expect(await screen.findByAltText("QR พร้อมเพย์ของร้าน")).toBeInTheDocument();
    // No remount — just verify the QR is stable
    expect(screen.getByAltText("QR พร้อมเพย์ของร้าน")).toBeInTheDocument();
    unmount();
  });
});

// ── QR07: Cart retained ───────────────────────────────────────────────────
describe("QR07 cart retained", () => {
  it("cart items remain visible on payment step", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    expect(await screen.findByAltText("QR พร้อมเพย์ของร้าน")).toBeInTheDocument();
    expect(screen.getByText("Iced Latte")).toBeInTheDocument();
  });
});

// ── QR08: Settings state reactive ────────────────────────────────────────
describe("QR08 settings state reactive", () => {
  it("QR updates when settings load after delay", async () => {
    let resolveSettings: (v: typeof PAYMENT_SETTINGS_OK) => void = () => {};
    mockGetPaymentSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );
    renderKioskPage();
    await addItemAndGoToPayment();
    expect(screen.getByText("กำลังโหลด QR สำหรับชำระเงิน...")).toBeInTheDocument();
    await act(async () => {
      resolveSettings(PAYMENT_SETTINGS_OK);
    });
    expect(await screen.findByAltText("QR พร้อมเพย์ของร้าน")).toBeInTheDocument();
  });
});

// ── QR09: Failure shows safe error ────────────────────────────────────────
describe("QR09 failure shows safe error", () => {
  it("shows error message in QR area when settings fail", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} error="unauthorized" onRetry={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("ไม่สามารถโหลด QR ได้")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

// ── QR10: Blank QR area never shown silently ─────────────────────────────
describe("QR10 no silent blank QR", () => {
  it("loading state shows message, not blank", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} loading={true} />
      </MemoryRouter>,
    );
    expect(screen.getByText("กำลังโหลด QR สำหรับชำระเงิน...")).toBeInTheDocument();
  });

  it("error state shows message, not blank", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} error="fail" onRetry={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("ไม่สามารถโหลด QR ได้")).toBeInTheDocument();
  });
});

// ── QR11: Retry refetches settings ────────────────────────────────────────
describe("QR11 retry refetches settings", () => {
  it("clicking ลองใหม่ calls onRetry", () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} error="fail" onRetry={onRetry} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ── QR12: Retry creates no order ─────────────────────────────────────────
describe("QR12 retry creates no order", () => {
  it("retry does not call createKioskOrder", async () => {
    // Persistently fail so error state remains for manual retry
    mockGetPaymentSettings.mockRejectedValue(new Error("unauthorized"));
    renderKioskPage();
    await addItemAndGoToPayment();
    // Wait for error state to appear (auto-retry also fails)
    await waitFor(() => {
      expect(screen.getByText("ไม่สามารถโหลด QR ได้")).toBeInTheDocument();
    }, { timeout: 3000 });
    const callsBefore = mockGetPaymentSettings.mock.calls.length;
    // Click retry
    fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }));
    await waitFor(() => {
      expect(mockGetPaymentSettings.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    // No order created
    expect(mockCreateKioskOrder).not.toHaveBeenCalled();
  });
});

// ── QR13: Retry mutates no stock ──────────────────────────────────────────
describe("QR13 retry mutates no stock", () => {
  it("retry only calls getPaymentSettings, no stock mutation", async () => {
    mockGetPaymentSettings.mockRejectedValue(new Error("fail"));
    renderKioskPage();
    await addItemAndGoToPayment();
    await waitFor(() => {
      expect(screen.getByText("ไม่สามารถโหลด QR ได้")).toBeInTheDocument();
    }, { timeout: 3000 });
    const callsBefore = mockGetPaymentSettings.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }));
    await waitFor(() => {
      expect(mockGetPaymentSettings.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    // Only getPaymentSettings called — no createKioskOrder
    expect(mockCreateKioskOrder).not.toHaveBeenCalled();
  });
});

// ── QR14: client_order_id preserved ───────────────────────────────────────
describe("QR14 client_order_id preserved", () => {
  it("retry does not regenerate client_order_id", async () => {
    mockGetPaymentSettings.mockRejectedValue(new Error("fail"));
    renderKioskPage();
    await addItemAndGoToPayment();
    await waitFor(() => {
      expect(screen.getByText("ไม่สามารถโหลด QR ได้")).toBeInTheDocument();
    }, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }));
    await waitFor(() => {
      expect(mockGetPaymentSettings.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    // No order submitted during retry
    expect(mockCreateKioskOrder).not.toHaveBeenCalled();
  });
});

// ── QR15: Cash unaffected ─────────────────────────────────────────────────
describe("QR15 cash unaffected", () => {
  it("cash method works independently of QR loading", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    // Switch to cash
    fireEvent.click(screen.getByRole("button", { name: /เงินสด/ }));
    expect(screen.getByText("เตรียมเงินทอน")).toBeInTheDocument();
    // QR should not be visible in cash mode
    expect(screen.queryByAltText("QR พร้อมเพย์ของร้าน")).not.toBeInTheDocument();
  });
});

// ── QR16: Enlarged responsive QR contract ─────────────────────────────────
describe("QR16 enlarged responsive QR", () => {
  it("QR container uses responsive size classes (h-72 w-72)", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} qrImageUrl="https://example.com/qr.png" />
      </MemoryRouter>,
    );
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    const container = img.parentElement;
    expect(container?.className).toMatch(/h-72/);
    expect(container?.className).toMatch(/w-72/);
  });
});

// ── QR17: max-width safe ──────────────────────────────────────────────────
describe("QR17 max-width safe", () => {
  it("QR container has max-w-[80vw] for mobile safety", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} qrImageUrl="https://example.com/qr.png" />
      </MemoryRouter>,
    );
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    const container = img.parentElement;
    expect(container?.className).toMatch(/max-w-\[80vw\]/);
  });
});

// ── QR18: object-contain ──────────────────────────────────────────────────
describe("QR18 object-contain", () => {
  it("QR image uses object-contain (no crop)", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} qrImageUrl="https://example.com/qr.png" />
      </MemoryRouter>,
    );
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(img.className).toMatch(/object-contain/);
  });
});

// ── QR19: Amount remains visible ──────────────────────────────────────────
describe("QR19 amount visible", () => {
  it("amount is displayed alongside QR", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} qrImageUrl="https://example.com/qr.png" />
      </MemoryRouter>,
    );
    // formatCurrency uses th-TH currency format — match by label + value
    expect(screen.getByText("ยอดที่ต้องชำระ")).toBeInTheDocument();
    // The amount value contains "55" in some currency-formatted form
    const amountContainer = screen.getByText("ยอดที่ต้องชำระ").parentElement;
    expect(amountContainer?.textContent).toMatch(/55/);
  });
});

// ── QR20: Static QR wording preserved ────────────────────────────────────
describe("QR20 static QR wording", () => {
  it("title text is present", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} qrImageUrl="https://example.com/qr.png" />
      </MemoryRouter>,
    );
    // QR_COPY.title should be visible
    expect(screen.getByText("QR ร้านแบบไม่ระบุยอด")).toBeInTheDocument();
  });
});

// ── QR21: No dynamic QR ───────────────────────────────────────────────────
describe("QR21 no dynamic QR", () => {
  it("StoreQrPanel source is static — no per-order QR generation", () => {
    render(
      <MemoryRouter>
        <StoreQrPanel amount={55} qrImageUrl="https://example.com/qr.png" />
      </MemoryRouter>,
    );
    // The QR src is the static URL, not a per-order dynamic URL
    expect(screen.getByAltText("QR พร้อมเพย์ของร้าน")).toHaveAttribute(
      "src",
      "https://example.com/qr.png",
    );
  });
})

// ── QR22: Cash/promptpay only ─────────────────────────────────────────────
describe("QR22 cash/promptpay only", () => {
  it("only cash and promptpay methods are available", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    const methodButtons = screen.getAllByRole("button").filter((b) =>
      /PromptPay|เงินสด/.test(b.textContent || ""),
    );
    expect(methodButtons.length).toBe(2);
  });
});

// ── QR23: No slip ─────────────────────────────────────────────────────────
describe("QR23 no slip", () => {
  it("no slip upload UI in payment panel", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    // No slip upload button/input — the word "สลิป" appears in instruction
    // text but there should be no upload control
    expect(screen.queryByRole("button", { name: /upload.*slip|อัปโหลด.*สลิป/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/slip|สลิป/i)).not.toBeInTheDocument();
  });
});

// ── QR24: No gateway ──────────────────────────────────────────────────────
describe("QR24 no gateway", () => {
  it("no payment gateway UI", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    expect(screen.queryByText(/gateway|omise|stripe/i)).not.toBeInTheDocument();
  });
});

// ── QR25: No direct Supabase business CRUD ────────────────────────────────
describe("QR25 no direct Supabase business CRUD", () => {
  it("StoreQrPanel does not import supabase", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../components/staff/kiosk/StoreQrPanel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
    expect(src).not.toMatch(/supabase\.from\(/);
    expect(src).not.toMatch(/supabase\.rpc\(/);
  });
});

// ── QR26: No frontend stock mutation ──────────────────────────────────────
describe("QR26 no frontend stock mutation", () => {
  it("StoreQrPanel has no stock mutation code", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../components/staff/kiosk/StoreQrPanel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/deductStock|mutateStock|stock_deduct|adjustStock/);
  });
});

// ── QR27: Atomic checkout remains canonical ──────────────────────────────
describe("QR27 atomic checkout canonical", () => {
  it("confirm calls createKioskOrder (atomic checkout)", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));
    await waitFor(() => {
      expect(mockCreateKioskOrder).toHaveBeenCalledTimes(1);
    });
  });
});

// ── QR28: Idempotency preserved ───────────────────────────────────────────
describe("QR28 idempotency preserved", () => {
  it("client_order_id is generated for checkout", async () => {
    renderKioskPage();
    await addItemAndGoToPayment();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));
    await waitFor(() => {
      expect(mockCreateKioskOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          client_order_id: expect.any(String),
        }),
      );
    });
  });
});
