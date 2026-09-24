import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StaffKioskPage from "./Kiosk";

const mockListMenu = vi.fn();
const mockCreateKioskOrder = vi.fn();
const mockKioskPreflight = vi.fn();
const mockGetPaymentSettings = vi.fn();
const mockListIncomingQueue = vi.fn();
const mockToast = vi.fn();

vi.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
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
      kioskPreflight: (...args: unknown[]) => mockKioskPreflight(...args),
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

const MENU_FIXTURE = [
  {
    id: "prod_1",
    name: "Iced Latte",
    price: 55,
    category: "coffee",
    description: "Double shot",
    allow_sweetness: true,
    default_sweetness: 75,
    addons: [],
  },
];

const PAYMENT_SETTINGS_RESPONSE = {
  store_id: "store_1",
  settings: {
    store_id: "store_1",
    promptpay_display_name: "Valora Cafe",
    is_promptpay_enabled: true,
    is_cash_enabled: true,
    promptpay_qr_url: "https://cdn.example.com/qr.png",
  },
};

function renderKioskPage() {
  return render(
    <MemoryRouter>
      <StaffKioskPage />
    </MemoryRouter>,
  );
}

async function addIcedLatteToCart() {
  fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
  fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
}

function makeStructuredError(code: string, message: string) {
  const error = new Error(code) as Error & { detail?: unknown };
  error.detail = { code, message };
  return error;
}

// ── G3.4: Payment-entry guard (matrix D) ───────────────────────────────

describe("G3 Kiosk payment-entry preflight", () => {
  beforeEach(() => {
    mockListMenu.mockReset();
    mockListMenu.mockResolvedValue(MENU_FIXTURE);
    mockCreateKioskOrder.mockReset();
    mockKioskPreflight.mockReset();
    mockKioskPreflight.mockResolvedValue({ status: "ready" });
    mockGetPaymentSettings.mockReset();
    mockGetPaymentSettings.mockResolvedValue(PAYMENT_SETTINGS_RESPONSE);
    mockListIncomingQueue.mockReset();
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "store-1" });
    mockToast.mockReset();
  });

  it("D4: valid cart passes preflight and reaches the payment step", async () => {
    renderKioskPage();
    await addIcedLatteToCart();

    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    await screen.findByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" });
    expect(mockKioskPreflight).toHaveBeenCalledTimes(1);
    expect(mockKioskPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ product_id: "prod_1", quantity: 1 }),
        ]),
      }),
    );
  });

  it("D1: invalid cart is blocked at the menu step with a safe Thai message", async () => {
    mockKioskPreflight.mockRejectedValue(
      makeStructuredError(
        "invalid_inventory_configuration",
        "ไม่สามารถขายIced Latteได้ เนื่องจากข้อมูลสูตรไม่สมบูรณ์",
      ),
    );
    renderKioskPage();
    await addIcedLatteToCart();

    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // F3: staff-safe Thai message — no raw internal codes.
    expect(screen.getByText(/ไม่สามารถขายIced Latteได้/)).toBeInTheDocument();
    expect(screen.queryByText(/invalid_inventory_configuration/)).not.toBeInTheDocument();
    // D1: still on the menu step.
    expect(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" })).toBeInTheDocument();
  });

  it("D2/D3: PromptPay QR and cash confirmation are not rendered for an invalid cart", async () => {
    mockKioskPreflight.mockRejectedValue(
      makeStructuredError(
        "invalid_inventory_configuration",
        "ไม่สามารถขายIced Latteได้ เนื่องจากข้อมูลสูตรไม่สมบูรณ์",
      ),
    );
    renderKioskPage();
    await addIcedLatteToCart();

    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // D2: no PromptPay QR panel.
    expect(screen.queryByAltText("QR พร้อมเพย์ของร้าน")).not.toBeInTheDocument();
    // D3: no cash-payment confirmation button.
    expect(screen.queryByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" })).not.toBeInTheDocument();
  });

  it("D-stock: insufficient stock blocks payment entry with a safe message", async () => {
    mockKioskPreflight.mockRejectedValue(
      makeStructuredError("insufficient_stock", "วัตถุดิบไม่เพียงพอสำหรับออเดอร์นี้ กรุณาลดจำนวนสินค้า หรือตรวจสอบสต็อก"),
    );
    renderKioskPage();
    await addIcedLatteToCart();

    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    await waitFor(() => {
      expect(screen.getByText(/วัตถุดิบไม่เพียงพอ/)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" })).not.toBeInTheDocument();
  });

  it("cart can be recovered after a failed preflight (remove item, retry passes)", async () => {
    let rejectOnce = true;
    mockKioskPreflight.mockImplementation(() => {
      if (rejectOnce) {
        rejectOnce = false;
        return Promise.reject(
          makeStructuredError("invalid_inventory_configuration", "ไม่สามารถขายIced Latteได้ เนื่องจากข้อมูลสูตรไม่สมบูรณ์"),
        );
      }
      return Promise.resolve({ status: "ready" });
    });
    renderKioskPage();
    await addIcedLatteToCart();

    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Retry after the failure — the flow must be recoverable.
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    await screen.findByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" });
    expect(mockKioskPreflight).toHaveBeenCalledTimes(2);
  });

  it("final submit maps a structured invalid-configuration conflict to a Thai message", async () => {
    // Preflight passes, but the recipe is broken between preflight and
    // final submit — the FINAL guard still rejects with a safe message.
    mockCreateKioskOrder.mockRejectedValue(
      makeStructuredError("invalid_inventory_configuration", "ไม่สามารถขายIced Latteได้ เนื่องจากข้อมูลสูตรไม่สมบูรณ์"),
    );
    renderKioskPage();
    await addIcedLatteToCart();

    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    const confirmButton = await screen.findByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" });

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/ไม่สามารถขายIced Latteได้/)).toBeInTheDocument();
    });
    // F3: raw code must never be rendered.
    expect(screen.queryByText(/^invalid_inventory_configuration$/)).not.toBeInTheDocument();
  });
});
