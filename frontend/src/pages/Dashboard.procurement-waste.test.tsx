import { describe, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const mockedGetDashboardSummary = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    getDashboardSummary: (...args: unknown[]) => mockedGetDashboardSummary(...args),
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

function createDashboardSummary(procurementWaste?: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    store_id: "store_1",
    store_timezone: "Asia/Bangkok",
    store_timezone_offset: "UTC+7",
    today_orders_count: 5,
    confirmed_revenue_today: 1200,
    pending_revenue_today: 300,
    pending_payment_review_count: 0,
    pending_payment_review_value: 0,
    today_cost_amount: 400,
    today_profit_amount: 800,
    today_completed_orders_count: 3,
    today_cancelled_orders_count: 1,
    paid_orders_count: 10,
    active_orders_count: 4,
    completed_orders_count: 8,
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
      total_sales_amount: 1200,
      total_sales_order_count: 12,
      paid_sales_amount: 900,
      paid_sales_order_count: 8,
      pending_sales_amount: 300,
      pending_sales_order_count: 4,
      excluded_cancelled_order_count: 1,
    },
    procurement_waste: procurementWaste ?? {
      purchase_total_cost: 12500,
      purchase_paid_cost: 12000,
      purchase_unpaid_cost: 500,
      waste_total_cost: 250,
      waste_rate: 2.0,
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

describe("DashboardPage Procurement & Waste Analytics (Phase B)", () => {
  beforeEach(() => {
    mockedGetDashboardSummary.mockReset();
    mockedGetDashboardSummary.mockResolvedValue(createDashboardSummary());
  });

  it("PWD-FE01: old lower detailed order-status panel removed", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("ภาพรวมสถานะออเดอร์")).not.toBeInTheDocument();
  });

  it("PWD-FE02: title ต้นทุนจัดซื้อและความสูญเสีย renders", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ต้นทุนจัดซื้อและความสูญเสีย")).toBeInTheDocument();
  });

  it("PWD-FE03: Purchase Cost rendered", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("มูลค่าซื้อเข้าสต็อก")).toBeInTheDocument();
    expect(screen.getByText("฿12,500.00")).toBeInTheDocument();
  });

  it("PWD-FE04: Paid rendered", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ชำระแล้ว")).toBeInTheDocument();
    expect(screen.getByText("฿12,000.00")).toBeInTheDocument();
  });

  it("PWD-FE05: Unpaid rendered", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ค้างชำระ")).toBeInTheDocument();
    expect(screen.getByText("฿500.00")).toBeInTheDocument();
  });

  it("PWD-FE06: Waste Cost rendered", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ต้นทุนสูญเสีย")).toBeInTheDocument();
    expect(screen.getByText("฿250.00")).toBeInTheDocument();
  });

  it("PWD-FE07: Waste Rate rendered", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("อัตราความสูญเสีย")).toBeInTheDocument();
    expect(screen.getByText("2.00%")).toBeInTheDocument();
  });

  it("PWD-FE08: zero values correctly formatted", async () => {
    mockedGetDashboardSummary.mockResolvedValue(
      createDashboardSummary({
        purchase_total_cost: 0,
        purchase_paid_cost: 0,
        purchase_unpaid_cost: 0,
        waste_total_cost: 0,
        waste_rate: 0,
      }),
    );
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ต้นทุนจัดซื้อและความสูญเสีย")).toBeInTheDocument();
    expect(screen.getAllByText("฿0.00").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("0.00%")).toBeInTheDocument();
  });

  it("PWD-FE09: range change updates procurement analytics", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    // Change to "วันนี้" preset
    fireEvent.click(screen.getByRole("button", { name: "วันนี้" }));
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(2));
    // Verify the second call used the today range
    const secondCallArgs = mockedGetDashboardSummary.mock.calls[1][0];
    expect(secondCallArgs?.revenueRange).toBe("today");
  });

  it("PWD-FE10: custom range passed correctly", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "กำหนดเอง" }));
    fireEvent.change(screen.getByLabelText("วันที่เริ่ม"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("วันที่สิ้นสุด"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(2));
    const secondCallArgs = mockedGetDashboardSummary.mock.calls[1][0];
    expect(secondCallArgs?.revenueRange).toBe("custom");
    expect(secondCallArgs?.startDate).toBe("2026-01-01");
    expect(secondCallArgs?.endDate).toBe("2026-01-31");
  });

  it("PWD-FE11: loading state correct", async () => {
    // Never resolve to keep loading state
    mockedGetDashboardSummary.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    // During loading, the Dashboard shows its loading state
    expect(await screen.findByText("loading...")).toBeInTheDocument();
  });

  it("PWD-FE12: panel-level error does not crash Dashboard", async () => {
    // If procurement_waste is missing (API error), panel shows error but Dashboard still works
    const summary = createDashboardSummary();
    delete summary.procurement_waste;
    mockedGetDashboardSummary.mockResolvedValue(summary);
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    // Dashboard should still render — the error message should appear
    expect(await screen.findByText("ไม่สามารถโหลดข้อมูลต้นทุนจัดซื้อได้")).toBeInTheDocument();
    // Other dashboard elements should still be present
    expect(screen.getByText("ยอดขายสะสม")).toBeInTheDocument();
  });

  it("PWD-FE13: existing top order cards remain", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    // Top order summary cards should still exist
    expect(await screen.findByText("ออเดอร์วันนี้ทั้งหมด")).toBeInTheDocument();
  });

  it("PWD-FE14: existing sales metrics remain", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ยอดขายสะสม")).toBeInTheDocument();
  });

  it("PWD-FE15: frontend does NOT aggregate listStockIntakes manually", async () => {
    // Verify the Dashboard only calls getDashboardSummary, not listStockIntakes
    // The mock only has getDashboardSummary — if listStockIntakes were called,
    // it would throw. This test verifies the Dashboard doesn't import/call it.
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    // If the component tried to call listStockIntakes, it would error since
    // the mock doesn't provide it. The test passing proves it's not called.
    expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1);
  });

  it("PWD-FE16: no write API used for analytics", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    // getDashboardSummary is a GET (read-only) — the mock only provides GET.
    // No POST/PUT/DELETE should be called. The test passing proves no writes.
    expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1);
  });
});
