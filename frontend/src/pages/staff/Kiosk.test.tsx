import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AppRoutes } from "@/App";
import StaffKioskPage from "./Kiosk";

const mockListMenu = vi.fn();
const mockCreateKioskOrder = vi.fn();
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
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "staff" }, loading: false }),
}));

vi.mock("@/contexts/RoleContext", () => ({
  useProfileRole: () => ({ role: "staff", loading: false }),
}));

vi.mock("@/lib/guards", () => ({
  useRoleGuard: () => ({ checking: false, accessDenied: false }),
  STORE_ADMIN_ROLES: ["staff"],
  BUSINESS_PORTAL_ROLES: ["owner"],
  STORE_MANAGER_ROLES: ["owner"],
  SYSTEM_CONSOLE_ROLES: ["owner"],
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

function renderKioskPage() {
  return render(
    <MemoryRouter>
      <StaffKioskPage />
    </MemoryRouter>,
  );
}

describe("/staff/kiosk route", () => {
  beforeEach(() => {
    mockListMenu.mockResolvedValue(MENU_FIXTURE);
    mockCreateKioskOrder.mockResolvedValue(ORDER_RESPONSE);
    mockToast.mockReset();
  });

  it("renders via AppRoutes when navigating to /staff/kiosk", async () => {
    render(
      <MemoryRouter initialEntries={["/staff/kiosk"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
    expect(await screen.findByText("เลือกเมนูและปรับรายละเอียด")).toBeInTheDocument();
  });

  it("lets staff add menu items, toggle payment methods, and submit orders", async () => {
    renderKioskPage();

    await waitFor(() => expect(mockListMenu).toHaveBeenCalled());
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
    expect(screen.getByText("QR ร้านแบบไม่ระบุยอด")).toBeInTheDocument();
    expect(screen.getByText("ลูกค้าต้องกรอกยอดให้ตรงกับยอดที่แสดง")).toBeInTheDocument();
    expect(screen.getByText("พนักงานตรวจสลิปก่อนกดยืนยัน")).toBeInTheDocument();

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
    });

    expect(await screen.findByText("Q-10")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปคิวออเดอร์/ })).toHaveAttribute("href", "/staff/orders");
  });
});
