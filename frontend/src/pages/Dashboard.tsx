import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import AppLayout from "@/components/AppLayout";
import DataTable, { type Column } from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import StatusBadge, { type BadgeTone } from "@/components/shared/StatusBadge";
import { type AppRole, useRoleGuard } from "@/lib/guards";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  storeAdminApi,
  type DashboardQueueStatus,
  type DashboardRecentOrder,
  type DashboardSummaryResponse,
  type DashboardRevenueFilterPayload,
  type DashboardRevenueRange,
  type DashboardRevenueKpi,
  type InventoryAlertsResponse,
  type ProcurementWasteSummary,
} from "@/services/storeAdminApi";

const DASHBOARD_ALLOWED_ROLES: AppRole[] = ["owner", "admin", "manager"];
const currencyFormatter = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const numberFormatter = new Intl.NumberFormat("th-TH");
const trendTickFormatter = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const compactNumberFormatter = new Intl.NumberFormat("th-TH", { notation: "compact", maximumFractionDigits: 1 });
const DEFAULT_TIMEZONE_DISPLAY = "Asia/Bangkok (UTC+7)";
const REVENUE_RANGE_PRESETS: { key: DashboardRevenueRange; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "today", label: "วันนี้" },
  { key: "last_7_days", label: "7 วันที่ผ่านมา" },
  { key: "last_30_days", label: "30 วันที่ผ่านมา" },
  { key: "custom", label: "กำหนดเอง" },
];
const REVENUE_RANGE_LABELS: Record<DashboardRevenueRange, string> = {
  all: "ทุกวัน",
  today: "วันนี้",
  last_7_days: "7 วันที่ผ่านมา",
  last_30_days: "30 วันที่ผ่านมา",
  this_month: "เดือนนี้",
  custom: "กำหนดเอง",
};

const CUSTOM_RANGE_ERROR_MESSAGES: Record<string, string> = {
  custom_range_required: "กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด",
  invalid_custom_range_order: "วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด",
};

type RevenueFilterState = {
  range: DashboardRevenueRange;
  startDate?: string | null;
  endDate?: string | null;
};

type CustomRangeDraft = {
  startDate: string;
  endDate: string;
};

const queueStatusDefinitions: { key: DashboardQueueStatus; label: string }[] = [
  { key: "pending_payment", label: "รอชำระ" },
  { key: "waiting_payment_review", label: "รอตรวจสลิป" },
  { key: "accepted", label: "ยืนยันออเดอร์แล้ว" },
  { key: "preparing", label: "กำลังชง" },
  { key: "ready", label: "พร้อมเสิร์ฟ" },
  { key: "ready_for_pickup", label: "พร้อมรับ" },
  { key: "completed", label: "เสร็จสิ้น" },
  { key: "cancelled", label: "ยกเลิก" },
];

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "รอชำระ",
  waiting_payment_review: "รอตรวจสลิป",
  accepted: "ยืนยันแล้ว",
  preparing: "กำลังชง",
  ready: "พร้อมเสิร์ฟ",
  ready_for_pickup: "พร้อมรับ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  paid: "ชำระแล้ว",
  pending_review: "รอตรวจ",
  unpaid: "ยังไม่ชำระ",
  rejected: "ปฏิเสธ",
};

type DashboardState = {
  data: DashboardSummaryResponse | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  lastUpdated: string | null;
};

type InventoryAlertsState = {
  data: InventoryAlertsResponse | null;
  loading: boolean;
  error: string | null;
};

export default function DashboardPage() {
  const { checking, accessDenied } = useRoleGuard(DASHBOARD_ALLOWED_ROLES);
  const [state, setState] = useState<DashboardState>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    lastUpdated: null,
  });
  const [selectedRevenueRange, setSelectedRevenueRange] = useState<DashboardRevenueRange>("all");
  const [appliedRevenueFilter, setAppliedRevenueFilter] = useState<RevenueFilterState>({ range: "all" });
  const [customDraft, setCustomDraft] = useState<CustomRangeDraft>({ startDate: "", endDate: "" });
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlertsState>({
    data: null,
    loading: true,
    error: null,
  });
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadSummary = useCallback(
    async (options?: { silent?: boolean; filters?: DashboardRevenueFilterPayload; onError?: (message: string) => void }) => {
      const silent = Boolean(options?.silent);
      setState((prev) => ({
        ...prev,
        error: null,
        ...(silent
          ? { refreshing: true }
          : {
              loading: true,
              data: prev.data,
            }),
      }));

      try {
        const res = await storeAdminApi.getDashboardSummary(options?.filters);
        if (!isMountedRef.current) return;
        setState({
          data: res,
          error: null,
          loading: false,
          refreshing: false,
          lastUpdated: new Date().toISOString(),
        });
        return true;
      } catch (err) {
        if (!isMountedRef.current) return;
        const message = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
        if (options?.onError) {
          options.onError(message);
          setState((prev) => ({
            ...prev,
            error: null,
            loading: silent ? prev.loading : false,
            refreshing: false,
          }));
          return false;
        }
        setState((prev) => ({
          ...prev,
          error: message,
          loading: silent ? prev.loading : false,
          refreshing: false,
          data: silent ? prev.data : null,
        }));
        return false;
      }
    },
    [],
  );

  const fetchDashboard = useCallback(
    async (
      filter: RevenueFilterState,
      options?: { silent?: boolean; onError?: (message: string) => void },
    ): Promise<boolean> => {
      const payload: DashboardRevenueFilterPayload = {
        revenueRange: filter.range,
        startDate: filter.startDate || undefined,
        endDate: filter.endDate || undefined,
      };
      const success = await loadSummary({ silent: options?.silent, filters: payload, onError: options?.onError });
      if (success) {
        setAppliedRevenueFilter(filter);
      }
      return success;
    },
    [loadSummary],
  );

  useEffect(() => {
    if (checking) return;
    if (accessDenied) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    void fetchDashboard({ range: "all" });
    void loadInventoryAlerts();
  }, [checking, accessDenied, fetchDashboard]);

  const loadInventoryAlerts = useCallback(async () => {
    setInventoryAlerts((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await storeAdminApi.getInventoryAlerts();
      if (!isMountedRef.current) return;
      setInventoryAlerts({ data: res, loading: false, error: null });
    } catch (err) {
      if (!isMountedRef.current) return;
      setInventoryAlerts({ data: null, loading: false, error: err instanceof Error ? err.message : "โหลดการแจ้งเตือนสต็อกไม่สำเร็จ" });
    }
  }, []);

  const handlePresetSelect = useCallback(
    (range: DashboardRevenueRange) => {
      setSelectedRevenueRange(range);
      setCustomRangeError(null);
      if (range === "custom") {
        setCustomDraft((prev) => {
          if (prev.startDate || prev.endDate) return prev;
          if (appliedRevenueFilter.range === "custom") {
            return {
              startDate: appliedRevenueFilter.startDate || "",
              endDate: appliedRevenueFilter.endDate || "",
            };
          }
          return prev;
        });
        return;
      }
      setCustomDraft({ startDate: "", endDate: "" });
      void fetchDashboard({ range });
    },
    [appliedRevenueFilter, fetchDashboard],
  );

  const handleCustomDraftChange = useCallback((draft: CustomRangeDraft) => {
    setCustomRangeError(null);
    setCustomDraft(draft);
  }, []);

  const handleApplyCustomRange = useCallback(() => {
    if (!customDraft.startDate || !customDraft.endDate) {
      setCustomRangeError("กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด");
      return;
    }
    if (customDraft.startDate > customDraft.endDate) {
      setCustomRangeError("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
      return;
    }
    setSelectedRevenueRange("custom");
    setCustomRangeError(null);
    void fetchDashboard(
      { range: "custom", startDate: customDraft.startDate, endDate: customDraft.endDate },
      {
        onError: (message) => {
          setCustomRangeError(CUSTOM_RANGE_ERROR_MESSAGES[message] || "ไม่สามารถใช้ช่วงวันที่นี้ได้");
        },
      },
    );
  }, [customDraft, fetchDashboard]);

  const handleClearCustomRange = useCallback(() => {
    setCustomDraft({ startDate: "", endDate: "" });
    setCustomRangeError(null);
    setSelectedRevenueRange("all");
    void fetchDashboard({ range: "all" });
  }, [fetchDashboard]);

  if (checking || state.loading) {
    return (
      <AppLayout>
        <LoadingState />
      </AppLayout>
    );
  }

  if (accessDenied) {
    return (
      <AppLayout>
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
          <h1 className="text-2xl font-semibold text-destructive">ไม่มีสิทธิ์เข้าถึงแดชบอร์ดนี้</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            บัญชีพนักงานสามารถจัดการออเดอร์ได้ใน /store-admin เท่านั้น หากต้องการรายงานสำหรับเจ้าของร้าน โปรดเข้าสู่ระบบด้วยสิทธิ์ Owner / Manager / Admin
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!state.data && state.error) {
    return (
      <AppLayout>
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
          <h1 className="text-xl font-semibold text-destructive">โหลดข้อมูลไม่สำเร็จ</h1>
          <p className="mt-2 text-sm text-muted-foreground">{state.error}</p>
          <p className="mt-3 text-sm text-muted-foreground">กรุณารีเฟรชหน้าหรือกลับไปที่ /store-admin หากปัญหายังคงอยู่</p>
        </div>
      </AppLayout>
    );
  }

  if (!state.data) {
    return (
      <AppLayout>
        <LoadingState />
      </AppLayout>
    );
  }

  const summary = state.data;
  const timezoneDisplay = summary.store_timezone_display || buildTimezoneDisplay(summary);
  const trendData = (summary.seven_day_trend ?? []).map((point) => ({ ...point }));
  const lastUpdatedLabel = state.lastUpdated ? dateTimeFormatter.format(new Date(state.lastUpdated)) : null;
  const financialCards = [
    {
      label: "ยอดขายที่ชำระแล้ววันนี้",
      value: formatCurrency(summary.confirmed_revenue_today),
      helper: "รวมเฉพาะออเดอร์ที่ยืนยันการชำระแล้ว",
    },
    {
      label: "ต้นทุนวันนี้",
      value: formatCurrency(summary.today_cost_amount),
      helper: "Snapshot ต้นทุนจากออเดอร์ที่ชำระแล้ว",
    },
    {
      label: "กำไรวันนี้",
      value: formatCurrency(summary.today_profit_amount),
      helper: "ยอดขายลบต้นทุนของออเดอร์ที่ชำระแล้ว",
    },
  ];
  const operationsCards = [
    {
      label: "ออเดอร์วันนี้ทั้งหมด",
      value: formatNumber(summary.today_orders_count),
      helper: "รวมทุกสถานะที่สร้างในวันนี้",
    },
    {
      label: "ออเดอร์กำลังดำเนินการ",
      value: formatNumber(summary.active_orders_count),
      helper: "ยังไม่เสร็จสิ้น / ไม่ถูกยกเลิก",
    },
    {
      label: "ออเดอร์สำเร็จวันนี้",
      value: formatNumber(summary.today_completed_orders_count),
      helper: "เปลี่ยนสถานะเป็นเสร็จสิ้นภายในวันนี้",
    },
    {
      label: "ออเดอร์ยกเลิกวันนี้",
      value: formatNumber(summary.today_cancelled_orders_count),
      helper: "ยกเลิกภายในวันนี้",
    },
  ];
  const trendChartConfig = {
    sales_amount: { label: "ยอดขาย", color: "hsl(142, 71%, 45%)" },
    cost_amount: { label: "ต้นทุน", color: "hsl(27, 96%, 61%)" },
    profit_amount: { label: "กำไร", color: "hsl(221, 83%, 53%)" },
    order_count: { label: "จำนวนออเดอร์", color: "hsl(260, 83%, 57%)" },
  } as const;

  // Healholic V1: Payment Slip Review is deferred — filter out the
  // waiting_payment_review queue from the dashboard display.
  const v1QueueStatuses = queueStatusDefinitions.filter(
    (q) => q.key !== "waiting_payment_review",
  );
  const queueRows = v1QueueStatuses.map(({ key, label }) => ({
    key,
    label,
    count: formatNumber(summary.queues?.[key] ?? 0),
  }));

  const recentColumns: Column<DashboardRecentOrder>[] = [
    { key: "order_no", header: "หมายเลขออเดอร์" },
    {
      key: "customer_name",
      header: "ลูกค้า",
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.customer_name || "-"}</p>
          <p className="text-xs text-muted-foreground">{row.customer_phone || "-"}</p>
        </div>
      ),
    },
    {
      key: "total_amount",
      header: "ยอดรวม",
      render: (row) => formatCurrency(row.total_amount ?? 0),
      className: "text-right",
    },
    {
      key: "status",
      header: "สถานะออเดอร์",
      render: (row) => <StatusBadge label={statusLabel(row.status)} tone={statusTone(row.status)} />,
    },
    {
      key: "payment_status",
      header: "สถานะชำระเงิน",
      render: (row) => <StatusBadge label={statusLabel(row.payment_status)} tone={paymentTone(row.payment_status)} />,
    },
    {
      key: "created_at",
      header: "เวลาที่สร้าง",
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">แดชบอร์ดธุรกิจ</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ข้อมูลจริงจากออเดอร์และการชำระเงินของร้าน • เขตเวลา: {timezoneDisplay}
            </p>
            {lastUpdatedLabel ? (
              <p className="mt-1 text-xs text-muted-foreground">
                ข้อมูลอัปเดตล่าสุด: {lastUpdatedLabel}
                {state.refreshing ? " • กำลังรีเฟรช..." : null}
              </p>
            ) : null}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fetchDashboard(appliedRevenueFilter, { silent: true })}
              disabled={state.refreshing}
              className="inline-flex items-center justify-center rounded-2xl border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {state.refreshing ? "กำลังรีเฟรช..." : "รีเฟรชข้อมูล"}
            </button>
          </div>
        </div>

        <Link
          to="/app/planning"
          className="block rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-md transition hover:border-primary/60"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Profit Planning</p>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">วางแผนกำไรของร้าน</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            ดูต้นทุนต่อเมนู ราคาขาย และกำไรต่อแก้ว เพื่อช่วยตัดสินใจก่อนปรับราคา ทำโปรโมชัน หรือเพิ่มเมนูใหม่
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
            <li>• ดูว่าแต่ละเมนูเหลือกำไรกี่บาท</li>
            <li>• ตรวจต้นทุนวัตถุดิบและบรรจุภัณฑ์ต่อแก้ว</li>
            <li>• ทดลองปรับราคาเพื่อดูผลต่อกำไร</li>
            <li>• ใช้ประกอบการตัดสินใจก่อนขายจริง</li>
          </ul>
          <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm">
            คำนวณกำไรต่อเมนู
          </div>
        </Link>

        {state.data && state.error ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            ไม่สามารถรีเฟรชข้อมูลล่าสุดได้: {state.error} • แสดงข้อมูลก่อนหน้าอยู่
          </div>
        ) : null}

        <section className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">การเงินวันนี้</h2>
              <p className="text-xs text-muted-foreground">เวลาร้าน: {timezoneDisplay}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {financialCards.map((card) => (
                <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">สถานะออเดอร์</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
              {operationsCards.map((card) => (
                <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
              ))}
            </div>
          </div>
        </section>

        {/* Healholic V1: Payment Slip Review panel removed — deferred feature.
            The backend still returns pending_payment_review_count/value; only
            the UI presentation is hidden. Re-enable by restoring the Panel. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ProcurementWastePanel data={summary.procurement_waste} loading={state.loading} />

          <RevenuePanel
            kpi={summary.dashboard_revenue_kpi}
            timezoneDisplay={timezoneDisplay}
            selectedRange={selectedRevenueRange}
            appliedFilter={appliedRevenueFilter}
            onPresetSelect={handlePresetSelect}
            customDraft={customDraft}
            onCustomDraftChange={handleCustomDraftChange}
            onApplyCustomRange={handleApplyCustomRange}
            onClearCustomRange={handleClearCustomRange}
            customRangeError={customRangeError}
            refreshing={state.refreshing}
          />
        </div>

        <Section title="เทรนด์ 7 วันที่ผ่านมา">
          {trendData.length ? (
            <ChartContainer config={trendChartConfig} className="min-h-[320px] w-full">
              <AreaChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
                <XAxis dataKey="date" tickFormatter={formatTrendTickLabel} tickMargin={8} />
                <YAxis
                  yAxisId="currency"
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  width={80}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  tickFormatter={(value) => formatNumber(value as number)}
                  width={60}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatTrendTickLabel(String(value))}
                      formatter={(value, name, item) => trendTooltipFormatter(value, name, item)}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} verticalAlign="top" />
                <Area
                  type="monotone"
                  dataKey="sales_amount"
                  yAxisId="currency"
                  stroke="var(--color-sales_amount)"
                  fill="var(--color-sales_amount)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cost_amount"
                  yAxisId="currency"
                  stroke="var(--color-cost_amount)"
                  fill="var(--color-cost_amount)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="profit_amount"
                  yAxisId="currency"
                  stroke="var(--color-profit_amount)"
                  fill="var(--color-profit_amount)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="order_count"
                  yAxisId="orders"
                  stroke="var(--color-order_count)"
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="rounded-xl border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
              ยังไม่มีข้อมูลเพียงพอสำหรับสร้างเทรนด์ 7 วัน
            </div>
          )}
        </Section>

        <InventoryAlertsCard alerts={inventoryAlerts} />

        <Section title="ออเดอร์ล่าสุด">
          <DataTable columns={recentColumns} rows={summary.recent_orders} />
        </Section>
      </div>
    </AppLayout>
  );
}

function InventoryAlertsCard({ alerts }: { alerts: InventoryAlertsState }) {
  const summary = alerts.data?.summary;
  const lowStockItems = alerts.data?.low_stock ?? [];
  const nearExpiryItems = alerts.data?.near_expiry ?? [];
  const expiredItems = alerts.data?.expired ?? [];
  const hasAlerts = (summary?.low_stock_count ?? 0) > 0 || (summary?.near_expiry_count ?? 0) > 0 || (summary?.expired_count ?? 0) > 0;

  const topItems = [
    ...expiredItems.slice(0, 3).map((item) => ({
      name: item.ingredient_name || "วัตถุดิบ",
      detail: `หมดอายุ ${item.days_overdue} วัน${item.lot_code ? ` • Lot ${item.lot_code}` : ""}`,
      tone: "danger" as const,
    })),
    ...nearExpiryItems.slice(0, 3).map((item) => ({
      name: item.ingredient_name || "วัตถุดิบ",
      detail: `ใกล้หมดอายุ ${item.days_until_expiry} วัน${item.lot_code ? ` • Lot ${item.lot_code}` : ""}`,
      tone: "warning" as const,
    })),
    ...lowStockItems.slice(0, 3).map((item) => ({
      name: item.ingredient_name || "วัตถุดิบ",
      detail: `เหลือ ${item.current_stock} ${item.unit || ""} (ต่ำกว่า ${item.low_stock_threshold})`,
      tone: "warning" as const,
    })),
  ].slice(0, 5);

  return (
    <div className="rounded-2xl border bg-card/70 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">การแจ้งเตือนสต็อก</h2>
        <Link to="/owner/cost-items" className="text-sm font-semibold text-primary hover:underline">
          จัดการวัตถุดิบ
        </Link>
      </div>
      {alerts.loading ? (
        <p className="mt-4 text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : alerts.error ? (
        <p className="mt-4 text-sm text-destructive">{alerts.error}</p>
      ) : !hasAlerts ? (
        <p className="mt-4 text-sm text-muted-foreground">ไม่มีการแจ้งเตือน สต็อกและวันหมดอายุปกติ</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700">ต่ำกว่ากำหนด</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{summary?.low_stock_count ?? 0}</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-medium text-orange-700">ใกล้หมดอายุ</p>
              <p className="mt-1 text-2xl font-bold text-orange-700">{summary?.near_expiry_count ?? 0}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">หมดอายุแล้ว</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{summary?.expired_count ?? 0}</p>
            </div>
          </div>
          {topItems.length > 0 ? (
            <ul className="space-y-2">
              {topItems.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className={item.tone === "danger" ? "text-red-600" : "text-amber-600"}>{item.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

type ChartTooltipItem = {
  dataKey?: string | number | symbol;
};

type ChartTooltipValue = number | string | (number | string)[];

function MetricCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card/70 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card/80 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

type ProcurementWastePanelProps = {
  data?: ProcurementWasteSummary;
  loading: boolean;
};

function ProcurementWastePanel({ data, loading }: ProcurementWastePanelProps) {
  if (loading && !data) {
    return (
      <Panel title="ต้นทุนจัดซื้อและความสูญเสีย">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel title="ต้นทุนจัดซื้อและความสูญเสีย">
        <p className="text-sm text-destructive">ไม่สามารถโหลดข้อมูลต้นทุนจัดซื้อได้</p>
      </Panel>
    );
  }

  return (
    <Panel title="ต้นทุนจัดซื้อและความสูญเสีย">
      <ul className="space-y-3">
        <li className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">มูลค่าซื้อเข้าสต็อก</p>
          <span className="text-lg font-semibold text-foreground">{currencyFormatter.format(data.purchase_total_cost)}</span>
        </li>
        <li className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">ชำระแล้ว</p>
          <span className="text-lg font-semibold text-foreground">{currencyFormatter.format(data.purchase_paid_cost)}</span>
        </li>
        <li className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">ค้างชำระ</p>
          <span className="text-lg font-semibold text-foreground">{currencyFormatter.format(data.purchase_unpaid_cost)}</span>
        </li>
        <li className="flex items-center justify-between border-t pt-3">
          <p className="text-sm font-medium text-foreground">ต้นทุนสูญเสีย</p>
          <span className="text-lg font-semibold text-foreground">{currencyFormatter.format(data.waste_total_cost)}</span>
        </li>
        <li className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">อัตราความสูญเสีย</p>
          <span className="text-lg font-semibold text-foreground">{data.waste_rate.toFixed(2)}%</span>
        </li>
      </ul>
    </Panel>
  );
}

type RevenuePanelProps = {
  kpi?: DashboardRevenueKpi;
  timezoneDisplay: string;
  selectedRange: DashboardRevenueRange;
  appliedFilter: RevenueFilterState;
  onPresetSelect: (range: DashboardRevenueRange) => void;
  customDraft: CustomRangeDraft;
  onCustomDraftChange: (draft: CustomRangeDraft) => void;
  onApplyCustomRange: () => void;
  onClearCustomRange: () => void;
  customRangeError: string | null;
  refreshing: boolean;
};

function RevenuePanel({
  kpi,
  timezoneDisplay,
  selectedRange,
  appliedFilter,
  onPresetSelect,
  customDraft,
  onCustomDraftChange,
  onApplyCustomRange,
  onClearCustomRange,
  customRangeError,
  refreshing,
}: RevenuePanelProps) {
  const appliedLabel =
    kpi?.range === "custom" && kpi?.start_date && kpi?.end_date
      ? `${kpi.start_date} ถึง ${kpi.end_date}`
      : kpi?.range_label || REVENUE_RANGE_LABELS[appliedFilter.range];
  const selectedLabel = appliedLabel || REVENUE_RANGE_LABELS[selectedRange];
  const updatedAt = kpi?.generated_at ? dateTimeFormatter.format(new Date(kpi.generated_at)) : null;
  const totalOrdersText = kpi ? `จาก ${formatNumber(kpi.total_sales_order_count)} ออเดอร์` : "-";
  const paidOrdersText = kpi ? `ยืนยันแล้ว ${formatNumber(kpi.paid_sales_order_count)} ออเดอร์` : "-";
  const pendingOrdersText = kpi ? `รอดำเนินการ ${formatNumber(kpi.pending_sales_order_count)} ออเดอร์` : "-";

  return (
    <div className="rounded-2xl border bg-card/70 p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">ยอดขายสะสม</h2>
          <p className="text-xs text-muted-foreground">ช่วงข้อมูล: {selectedLabel}</p>
          <p className="text-xs text-muted-foreground">เวลาร้าน: {timezoneDisplay}</p>
          {updatedAt ? <p className="text-[11px] text-muted-foreground">อัปเดตล่าสุด: {updatedAt}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {REVENUE_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => onPresetSelect(preset.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                preset.key === selectedRange
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/60"
              }`}
              disabled={preset.key === selectedRange && preset.key !== "custom" && refreshing}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {selectedRange === "custom" ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-border/80 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted-foreground">
              วันที่เริ่ม
              <input
                type="date"
                value={customDraft.startDate}
                onChange={(event) => onCustomDraftChange({ ...customDraft, startDate: event.target.value })}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              วันที่สิ้นสุด
              <input
                type="date"
                value={customDraft.endDate}
                onChange={(event) => onCustomDraftChange({ ...customDraft, endDate: event.target.value })}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          {customRangeError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
              {customRangeError}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApplyCustomRange}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm disabled:opacity-60"
              disabled={refreshing}
            >
              ใช้ตัวกรอง
            </button>
            <button
              type="button"
              onClick={onClearCustomRange}
              className="rounded-xl border border-input px-4 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-60"
              disabled={refreshing}
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <RevenueStatRow label="ยอดขายรวม" value={formatCurrency(kpi?.total_sales_amount)} helper={totalOrdersText} />
        <RevenueStatRow label="ยอดรับชำระแล้ว" value={formatCurrency(kpi?.paid_sales_amount)} helper={paidOrdersText} />
        <RevenueStatRow label="ยอดรอชำระ" value={formatCurrency(kpi?.pending_sales_amount)} helper={pendingOrdersText} />
      </div>

      <div className="mt-4 rounded-xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <p>ไม่รวมออเดอร์ที่ยกเลิก • ตัดออก {formatNumber(kpi?.excluded_cancelled_order_count ?? 0)} ออเดอร์</p>
        {refreshing ? <p className="mt-1 text-[11px] text-muted-foreground">กำลังโหลดข้อมูลล่าสุด...</p> : null}
      </div>
    </div>
  );
}

function RevenueStatRow({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-[12px] text-muted-foreground">{helper}</p>
        </div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function buildTimezoneDisplay(summary: DashboardSummaryResponse): string {
  const base = summary.store_timezone || "Asia/Bangkok";
  const offset = summary.store_timezone_offset || "UTC+7";
  const display = summary.store_timezone_display;
  if (display) {
    return display;
  }
  return `${base} (${offset || DEFAULT_TIMEZONE_DISPLAY})`;
}

function statusLabel(value?: string | null): string {
  if (!value) return "-";
  return STATUS_LABELS[value.toLowerCase()] ?? value;
}

function statusTone(value?: string | null): BadgeTone {
  const normalized = (value || "").toLowerCase();
  if (normalized === "completed" || normalized === "paid") return "success";
  if (normalized === "cancelled" || normalized === "rejected") return "danger";
  if (normalized === "pending_payment" || normalized === "waiting_payment_review" || normalized === "pending_review") return "warning";
  if (normalized === "accepted" || normalized === "preparing" || normalized === "ready" || normalized === "ready_for_pickup") return "info";
  return "neutral";
}

function paymentTone(value?: string | null): BadgeTone {
  const normalized = (value || "").toLowerCase();
  if (normalized === "paid") return "success";
  if (normalized === "rejected") return "danger";
  if (normalized === "pending_review" || normalized === "waiting_payment_review" || normalized === "pending") return "warning";
  return "neutral";
}

function formatCurrency(value?: number | null): string {
  return currencyFormatter.format(value ?? 0);
}

function formatCompactCurrency(value?: number | null): string {
  if (!value) return "฿0";
  return `฿${compactNumberFormatter.format(value)}`;
}

function formatNumber(value?: number | null): string {
  return numberFormatter.format(value ?? 0);
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function formatTrendTickLabel(value?: string): string {
  if (!value) return "-";
  const parsed = parseDateOnly(value);
  if (!parsed) return value;
  return trendTickFormatter.format(parsed);
}

function parseDateOnly(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function trendTooltipFormatter(value: ChartTooltipValue, name: string | number, item?: ChartTooltipItem) {
  const numericValue = Array.isArray(value) ? Number(value[0]) : Number(value);
  const key = String(item?.dataKey || name);
  const isOrderCount = key === "order_count";
  const displayValue = isOrderCount ? formatNumber(numericValue || 0) : formatCurrency(numericValue || 0);
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">{trendLabelForKey(key)}</span>
      <span className="font-semibold text-foreground">{displayValue}</span>
    </div>
  );
}

function trendLabelForKey(key: string): string {
  if (key === "sales_amount") return "ยอดขาย";
  if (key === "cost_amount") return "ต้นทุน";
  if (key === "profit_amount") return "กำไร";
  if (key === "order_count") return "จำนวนออเดอร์";
  return key;
}
