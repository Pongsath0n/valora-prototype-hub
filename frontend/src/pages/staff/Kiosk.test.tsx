import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AppRoutes } from "@/App";
import StaffKioskPage from "./Kiosk";

const mockListMenu = vi.fn();
const mockCreateKioskOrder = vi.fn();
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
    addons: [
      {
        addon_id: "shot",
        name: "Extra Shot",
        price: 15,
        max_quantity: 2,
      },
    ],
  },
];

const ORDER_RESPONSE = {
  id: "order-1",
  order_no: "Q-10",
  total_amount: 70,
  latest_payment: { method: "cash" },
};

const PAYMENT_SETTINGS_RESPONSE = {
  store_id: "store_1",
  settings: {
    store_id: "store_1",
    promptpay_display_name: "Valora Cafe",
    is_promptpay_enabled: true,
    is_cash_enabled: true,
    promptpay_qr_storage_path: "store_1/qr.png",
    promptpay_qr_file_name: "qr.png",
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

describe("/staff/kiosk route", () => {
  beforeEach(() => {
    mockListMenu.mockReset();
    mockListMenu.mockResolvedValue(MENU_FIXTURE);
    mockCreateKioskOrder.mockReset();
    mockCreateKioskOrder.mockResolvedValue(ORDER_RESPONSE);
    mockGetPaymentSettings.mockReset();
    mockGetPaymentSettings.mockResolvedValue(PAYMENT_SETTINGS_RESPONSE);
    mockListIncomingQueue.mockReset();
    mockListIncomingQueue.mockResolvedValue({ orders: [], store_id: "store-1" });
    mockToast.mockReset();
  });

  it("renders via AppRoutes when navigating to /staff/kiosk", async () => {
    render(
      <MemoryRouter initialEntries={["/staff/kiosk"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    await waitFor(() => expect(mockGetPaymentSettings).toHaveBeenCalled());
    expect(await screen.findByText("เลือกเมนูและปรับรายละเอียด")).toBeInTheDocument();
  });

  it("shows QR image and display name when payment settings provide them", async () => {
    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    await waitFor(() => expect(mockGetPaymentSettings).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "50%" }));
    fireEvent.click(within(dialog).getByLabelText("เพิ่ม Extra Shot"));
    fireEvent.change(within(dialog).getByPlaceholderText("โน้ตสำหรับแก้วนี้ (เช่น ใส่น้ำแข็งน้อย)"), {
      target: { value: "ใส่น้ำแข็งน้อย" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "เพิ่มลงรายการ" }));

    await waitFor(() => {
      expect(screen.getAllByText("Iced Latte").length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByPlaceholderText("โน้ตสำหรับออเดอร์ (ตัวอย่าง: ใส่ชื่อลูกค้าบนแก้ว)"), {
      target: { value: "pickup soon" },
    });
    fireEvent.change(screen.getByPlaceholderText("ชื่อลูกค้า (ถ้ามี)"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByPlaceholderText("เบอร์โทร"), { target: { value: "0812345678" } });

    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    expect(await screen.findByAltText("QR พร้อมเพย์ของร้าน")).toHaveAttribute("src", "https://cdn.example.com/qr.png");
    expect(screen.getByText("Valora Cafe")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /เงินสด/ }));
    expect(screen.getByText("เตรียมเงินทอน")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    await waitFor(() => expect(mockCreateKioskOrder).toHaveBeenCalled());
    expect(mockCreateKioskOrder).toHaveBeenCalledWith({
      items: [
        {
          product_id: "prod_1",
          quantity: 1,
          options: {
            sweetness: 50,
            addons: [{ addon_id: "shot", quantity: 1 }],
            note: "ใส่น้ำแข็งน้อย",
          },
        },
      ],
      payment_method: "cash",
      note: "pickup soon",
      customer: { name: "Alice", phone: "0812345678" },
      client_order_id: expect.any(String),
    });

    expect(await screen.findByText("Q-10")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปคิวออเดอร์/ })).toHaveAttribute("href", "/staff/orders");
  });

  it("falls back to placeholder when PromptPay QR URL is missing", async () => {
    mockGetPaymentSettings.mockResolvedValueOnce({
      ...PAYMENT_SETTINGS_RESPONSE,
      settings: {
        ...PAYMENT_SETTINGS_RESPONSE.settings,
        promptpay_qr_url: null,
        promptpay_display_name: null,
      },
    });

    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    await waitFor(() => expect(mockGetPaymentSettings).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    expect(screen.queryByAltText("QR พร้อมเพย์ของร้าน")).not.toBeInTheDocument();
    expect(screen.getByText("QR ร้านแบบไม่ระบุยอด")).toBeInTheDocument();
  });

  it("hides PromptPay when disabled and auto-switches to cash", async () => {
    mockGetPaymentSettings.mockResolvedValueOnce({
      ...PAYMENT_SETTINGS_RESPONSE,
      settings: {
        ...PAYMENT_SETTINGS_RESPONSE.settings,
        is_promptpay_enabled: false,
        promptpay_qr_url: "https://cdn.example.com/qr.png",
      },
    });

    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    await waitFor(() => expect(mockGetPaymentSettings).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    expect(screen.queryByRole("button", { name: /PromptPay/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /เงินสด/ })).toBeInTheDocument();
    expect(screen.getByText("เตรียมเงินทอน")).toBeInTheDocument();
  });

  it("hides cash when disabled and keeps PromptPay active", async () => {
    mockGetPaymentSettings.mockResolvedValueOnce({
      ...PAYMENT_SETTINGS_RESPONSE,
      settings: {
        ...PAYMENT_SETTINGS_RESPONSE.settings,
        is_cash_enabled: false,
      },
    });

    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    await waitFor(() => expect(mockGetPaymentSettings).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    expect(screen.queryByRole("button", { name: /เงินสด/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PromptPay/ })).toBeInTheDocument();
    expect(screen.getByText("QR ร้านแบบไม่ระบุยอด")).toBeInTheDocument();
  });

  it("blocks submission when no payment methods are available", async () => {
    mockGetPaymentSettings.mockResolvedValueOnce({
      ...PAYMENT_SETTINGS_RESPONSE,
      settings: {
        ...PAYMENT_SETTINGS_RESPONSE.settings,
        is_promptpay_enabled: false,
        is_cash_enabled: false,
      },
    });

    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    await waitFor(() => expect(mockGetPaymentSettings).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    const confirmButton = screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByText(/ยังไม่ได้เปิดช่องทางรับชำระเงิน/)).toBeInTheDocument();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(mockCreateKioskOrder).not.toHaveBeenCalled());
  });

  it("recovers when payment settings initially fail and retry succeeds", async () => {
    // First call (mount) fails, auto-retry (entering payment step) also fails,
    // then manual retry succeeds. This validates both the auto-retry lifecycle
    // and the manual recovery path.
    mockGetPaymentSettings.mockReset();
    mockGetPaymentSettings.mockRejectedValueOnce(new Error("network_down"));
    mockGetPaymentSettings.mockRejectedValueOnce(new Error("network_down"));
    mockGetPaymentSettings.mockResolvedValueOnce(PAYMENT_SETTINGS_RESPONSE);
    mockGetPaymentSettings.mockResolvedValue(PAYMENT_SETTINGS_RESPONSE);

    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));

    expect(await screen.findByText("network_down")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" });
    expect(confirmButton).toBeDisabled();
    const retryButton = screen.getByRole("button", { name: "ลองโหลดอีกครั้ง" });

    fireEvent.click(retryButton);

    await waitFor(() => expect(mockGetPaymentSettings.mock.calls.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(screen.getByRole("button", { name: /PromptPay/ })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    await waitFor(() => expect(mockCreateKioskOrder).toHaveBeenCalled());
    const payload = mockCreateKioskOrder.mock.calls.at(-1)?.[0];
    expect(payload).toBeDefined();
    expect(payload).toMatchObject({
      items: [
        {
          product_id: "prod_1",
          quantity: 1,
          options: { sweetness: 75 },
        },
      ],
      payment_method: "promptpay",
    });

    const forbiddenKeys = [
      "promptpay_qr_url",
      "promptpay_qr_storage_path",
      "total_cost",
      "gross_profit",
      "margin",
      "channel_fee",
      "channel_fee_total",
    ];
    forbiddenKeys.forEach((key) => {
      expect(payload).not.toHaveProperty(key);
      payload.items.forEach((item: Record<string, unknown>) => {
        expect(item).not.toHaveProperty(key);
      });
    });
  });

  // ── FIX-B: Transaction idempotency tests ─────────────────────────────

  it("generates client_order_id UUID once per checkout", async () => {
    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    await waitFor(() => expect(mockCreateKioskOrder).toHaveBeenCalled());
    const payload1 = mockCreateKioskOrder.mock.calls[0]?.[0];
    expect(payload1.client_order_id).toBeDefined();
    expect(typeof payload1.client_order_id).toBe("string");
    // UUID format check (36 chars with dashes)
    expect(payload1.client_order_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("retains same client_order_id across retry after error", async () => {
    // First call fails with a generic error, second call should reuse the same UUID
    mockCreateKioskOrder.mockRejectedValueOnce(new Error("network_error"));

    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    await waitFor(() => expect(mockCreateKioskOrder).toHaveBeenCalledTimes(1));
    const payload1 = mockCreateKioskOrder.mock.calls[0]?.[0];
    const firstUuid = payload1.client_order_id;
    expect(firstUuid).toBeDefined();

    // Wait for error to show, then retry (click confirm again)
    await waitFor(() => expect(screen.getByText("network_error")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    await waitFor(() => expect(mockCreateKioskOrder).toHaveBeenCalledTimes(2));
    const payload2 = mockCreateKioskOrder.mock.calls[1]?.[0];
    // FIX-B: same UUID must be retained across retries
    expect(payload2.client_order_id).toBe(firstUuid);
  });

  it("generates new UUID after successful sale", async () => {
    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    await waitFor(() => expect(mockCreateKioskOrder).toHaveBeenCalled());
    const firstUuid = mockCreateKioskOrder.mock.calls[0]?.[0].client_order_id;
    expect(firstUuid).toBeDefined();

    // Wait for success, then start a new order
    await waitFor(() => expect(screen.getByText("Q-10")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /เริ่มรายการใหม่|ออเดอร์ใหม่|สร้างออเดอร์ใหม่/ }));

    // Add another item and submit
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    await waitFor(() => expect(mockCreateKioskOrder).toHaveBeenCalledTimes(2));
    const secondUuid = mockCreateKioskOrder.mock.calls[1]?.[0].client_order_id;
    // FIX-B: new UUID after successful sale
    expect(secondUuid).toBeDefined();
    expect(secondUuid).not.toBe(firstUuid);
  });

  // ── FIX-D: Partial-commit safety tests ───────────────────────────────

  it("shows DO NOT RESUBMIT warning on stock sync failure", async () => {
    // Simulate a structured partial-commit error (503 with order context)
    const stockError = new Error("kiosk_order_stock_sync_failed") as Error & { detail?: { code?: string; order_id?: string; order_no?: string } };
    stockError.detail = {
      code: "kiosk_order_stock_sync_failed",
      order_id: "order-abc",
      order_no: "ORD-500",
      payment_status: "paid",
      stock_consumed: false,
      retryable: true,
      action: "do_not_resubmit",
    };
    mockCreateKioskOrder.mockRejectedValueOnce(stockError);

    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/เพิ่ม Iced Latte/i));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "ไปขั้นตอนการชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" }));

    // FIX-D: must show blocking warning, not generic "try again"
    await waitFor(() => expect(screen.getByText("ห้ามสร้างรายการขายซ้ำ")).toBeInTheDocument());
    // The Alert contains the order number
    expect(screen.getByText(/ORD-500/)).toBeInTheDocument();
    // The submitError also shows the warning text
    expect(screen.getAllByText(/บันทึกการขายและการชำระเงินแล้ว/).length).toBeGreaterThan(0);

    // FIX-D: confirm button must be disabled
    const confirmButton = screen.getByRole("button", { name: "ยืนยันว่าได้รับชำระแล้ว" });
    expect(confirmButton).toBeDisabled();

    // FIX-D: clicking confirm must NOT trigger another submission
    fireEvent.click(confirmButton);
    expect(mockCreateKioskOrder).toHaveBeenCalledTimes(1);
  });
});
