import { describe, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const mockedGetDashboardSummary = vi.fn();
const mockedGetInventoryAlerts = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    getDashboardSummary: (...args: unknown[]) => mockedGetDashboardSummary(...args),
    getInventoryAlerts: (...args: unknown[]) => mockedGetInventoryAlerts(...args),
  },
}));

vi.mock("@/lib/guards", () => ({
  useRoleGuard: () => ({ checking: false, accessDenied: false }),
}));

vi.mock("@/components/AppLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock("@/components/shared/DataTable", () => ({
  __esModule: true,
  default: () => <div data-testid="data-table" />,
}));

vi.mock("@/components/shared/StatusBadge", () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("@/components/shared/LoadingState", () => ({
  __esModule: true,
  default: () => <div>loading...</div>,
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartLegend: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartLegendContent: () => <div />,
  ChartTooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartTooltipContent: () => <div />,
}));

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import DashboardPage from "./Dashboard";

function createDashboardSummary() {
  const now = new Date().toISOString();
  return {
    store_id: "store_1",
    store_timezone: "Asia/Bangkok",
    store_timezone_offset: "UTC+7",
    today_orders_count: 0,
    confirmed_revenue_today: 0,
    pending_revenue_today: 0,
    pending_payment_review_count: 0,
    pending_payment_review_value: 0,
    today_cost_amount: 0,
    today_profit_amount: 0,
    today_completed_orders_count: 0,
    today_cancelled_orders_count: 0,
    paid_orders_count: 0,
    active_orders_count: 0,
    completed_orders_count: 0,
    queues: {},
    recent_orders: [],
    seven_day_trend: [],
    dashboard_revenue_kpi: {
      range: "all",
      range_label: "ทุกวัน",
      start_date: null,
      end_date: null,
      all_time: true,
      timezone: "Asia/Bangkok",
      generated_at: now,
      total_sales_amount: 0,
      total_sales_order_count: 0,
      paid_sales_amount: 0,
      paid_sales_order_count: 0,
      pending_sales_amount: 0,
      pending_sales_order_count: 0,
      excluded_cancelled_order_count: 0,
    },
  } as Record<string, unknown>;
}

function createInventoryAlerts(overrides?: Partial<Record<string, unknown>>) {
  return {
    low_stock: overrides?.low_stock ?? [],
    near_expiry: overrides?.near_expiry ?? [],
    expired: overrides?.expired ?? [],
    summary: overrides?.summary ?? {
      low_stock_count: 0,
      near_expiry_count: 0,
      expired_count: 0,
    },
  } as Record<string, unknown>;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage inventory alerts card", () => {
  beforeEach(() => {
    mockedGetDashboardSummary.mockReset();
    mockedGetInventoryAlerts.mockReset();
    mockedGetDashboardSummary.mockResolvedValue(createDashboardSummary());
    mockedGetInventoryAlerts.mockResolvedValue(createInventoryAlerts());
  });

  it("renders the inventory alerts card heading", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetInventoryAlerts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("การแจ้งเตือนสต็อก")).toBeInTheDocument();
  });

  it("shows no-alerts message when all counts are zero", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetInventoryAlerts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ไม่มีการแจ้งเตือน สต็อกและวันหมดอายุปกติ")).toBeInTheDocument();
  });

  it("shows counts when alerts exist", async () => {
    mockedGetInventoryAlerts.mockResolvedValue(
      createInventoryAlerts({
        low_stock: [
          { ingredient_id: "ing-1", ingredient_name: "Milk", current_stock: 1, low_stock_threshold: 5, unit: "ml", severity: "low_stock" },
        ],
        near_expiry: [
          { purchase_id: "pur-1", ingredient_id: "ing-1", ingredient_name: "Cream", lot_code: "LOT-A", expires_at: "2026-06-29T00:00:00Z", days_until_expiry: 1, severity: "near_expiry" },
        ],
        expired: [
          { purchase_id: "pur-2", ingredient_id: "ing-2", ingredient_name: "Old Milk", lot_code: "LOT-B", expires_at: "2026-06-25T00:00:00Z", days_overdue: 3, severity: "expired" },
        ],
        summary: { low_stock_count: 1, near_expiry_count: 1, expired_count: 1 },
      }),
    );

    renderDashboard();
    await waitFor(() => expect(mockedGetInventoryAlerts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ต่ำกว่ากำหนด")).toBeInTheDocument();
    expect(screen.getByText("ใกล้หมดอายุ")).toBeInTheDocument();
    expect(screen.getByText("หมดอายุแล้ว")).toBeInTheDocument();
  });

  it("shows link to ingredient management", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetInventoryAlerts).toHaveBeenCalledTimes(1));
    const link = await screen.findByText("จัดการวัตถุดิบ");
    expect(link.closest("a")).toHaveAttribute("href", "/owner/cost-items");
  });

  it("shows top items list with ingredient names", async () => {
    mockedGetInventoryAlerts.mockResolvedValue(
      createInventoryAlerts({
        low_stock: [
          { ingredient_id: "ing-1", ingredient_name: "Milk", current_stock: 1, low_stock_threshold: 5, unit: "ml", severity: "low_stock" },
        ],
        summary: { low_stock_count: 1, near_expiry_count: 0, expired_count: 0 },
      }),
    );

    renderDashboard();
    await waitFor(() => expect(mockedGetInventoryAlerts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Milk")).toBeInTheDocument();
  });

  it("shows error message when alerts fetch fails", async () => {
    mockedGetInventoryAlerts.mockRejectedValue(new Error("network error"));

    renderDashboard();
    await waitFor(() => expect(mockedGetInventoryAlerts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("network error")).toBeInTheDocument();
  });
});
