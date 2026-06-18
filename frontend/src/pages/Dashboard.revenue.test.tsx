import { describe, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const mockedGetDashboardSummary = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    getDashboardSummary: (...args: any[]) => mockedGetDashboardSummary(...args),
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
      total_sales_amount: 1200,
      total_sales_order_count: 12,
      paid_sales_amount: 900,
      paid_sales_order_count: 8,
      pending_sales_amount: 300,
      pending_sales_order_count: 4,
      excluded_cancelled_order_count: 1,
    },
  } as any;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage revenue panel", () => {
  beforeEach(() => {
    mockedGetDashboardSummary.mockReset();
    mockedGetDashboardSummary.mockResolvedValue(createDashboardSummary());
  });

  it("renders the revenue card and hides the legacy card", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ยอดขายสะสม")).toBeInTheDocument();
    expect(screen.queryByText("สถานะการดำเนินการ")).not.toBeInTheDocument();
  });

  it("shows custom date inputs without triggering API call when selecting custom preset", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "กำหนดเอง" }));

    expect(screen.getByLabelText("วันที่เริ่ม")).toBeInTheDocument();
    expect(screen.getByLabelText("วันที่สิ้นสุด")).toBeInTheDocument();
    expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1);
  });

  it("shows validation when applying custom range without both dates", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "กำหนดเอง" }));
    fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));

    expect(screen.getByText("กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด")).toBeInTheDocument();
    expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1);
  });

  it("calls API with custom range only after both dates exist", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "กำหนดเอง" }));
    fireEvent.change(screen.getByLabelText("วันที่เริ่ม"), { target: { value: "2024-01-01" } });
    fireEvent.change(screen.getByLabelText("วันที่สิ้นสุด"), { target: { value: "2024-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));

    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(2));
    expect(mockedGetDashboardSummary.mock.calls[1][0]).toEqual({
      revenueRange: "custom",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
  });

  it("maps backend custom validation error to inline message", async () => {
    mockedGetDashboardSummary.mockResolvedValueOnce(createDashboardSummary());
    mockedGetDashboardSummary.mockRejectedValueOnce(new Error("invalid_custom_range_order"));

    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "กำหนดเอง" }));
    fireEvent.change(screen.getByLabelText("วันที่เริ่ม"), { target: { value: "2024-02-01" } });
    fireEvent.change(screen.getByLabelText("วันที่สิ้นสุด"), { target: { value: "2024-02-10" } });
    fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));

    await waitFor(() => expect(screen.getByText("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด")).toBeInTheDocument());
    expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it("renders only the allowed presets and hides 'เดือนนี้'", async () => {
    renderDashboard();
    await waitFor(() => expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1));

    const presets = ["ทั้งหมด", "วันนี้", "7 วันที่ผ่านมา", "30 วันที่ผ่านมา", "กำหนดเอง"];
    presets.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "เดือนนี้" })).not.toBeInTheDocument();
  });
});
