import { Link } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
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
} from "@/services/storeAdminApi";

const DASHBOARD_ALLOWED_ROLES: AppRole[] = ["owner", "admin", "manager"];
const currencyFormatter = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const numberFormatter = new Intl.NumberFormat("th-TH");
const trendTickFormatter = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const compactNumberFormatter = new Intl.NumberFormat("th-TH", { notation: "compact", maximumFractionDigits: 1 });
const DEFAULT_TIMEZONE_DISPLAY = "Asia/Bangkok (UTC+7)";

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

export default function DashboardPage() {
  const { checking, accessDenied } = useRoleGuard(DASHBOARD_ALLOWED_ROLES);
  const [state, setState] = useState<{ data: DashboardSummaryResponse | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (checking) return;
    if (accessDenied) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    storeAdminApi
      .getDashboardSummary()
      .then((res) => {
        if (!cancelled) {
          setState({ data: res, error: null, loading: false });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ data: null, error: err.message || "โหลดข้อมูลไม่สำเร็จ", loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [checking, accessDenied]);

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

  if (state.error) {
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
      label: "รอตรวจสลิป",
      value: formatNumber(summary.pending_payment_review_count),
      helper: "จำนวนรายการที่อยู่ในคิวรอตรวจ",
    },
    {
      label: "มูลค่ารอตรวจสลิป",
      value: formatCurrency(summary.pending_payment_review_value),
      helper: "ยอดรวมออเดอร์ที่ยังไม่ได้ยืนยันสลิป",
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

  const queueRows = queueStatusDefinitions.map(({ key, label }) => ({
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
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CTAButton to="/app/planning" variant="primary">
              วางแผนกำไร
            </CTAButton>
            <CTAButton to="/store-admin/orders" variant="secondary">
              จัดการออเดอร์และตรวจสลิป
            </CTAButton>
          </div>
        </div>

        <Link
          to="/app/planning"
          className="block rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm transition hover:border-primary/60"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">หัวใจของ Valora</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">การวางแผนกำไร (Profit Planning)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            จำลองราคา ต้นทุน วันเปิดขาย และเป้ากำไร เพื่อหาจุดคุ้มทุนและยอดขายที่ต้องทำ — เริ่มวางแผนได้จากที่นี่
          </p>
        </Link>

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
            <h2 className="mb-2 text-base font-semibold text-foreground">สถานะออเดอร์ & การตรวจสลิป</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
              {operationsCards.map((card) => (
                <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="ภาพรวมสถานะออเดอร์">
            <ul className="space-y-3">
              {queueRows.map((row) => (
                <li key={row.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.label}</p>
                  </div>
                  <span className="text-lg font-semibold text-foreground">{row.count}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="คิวรอตรวจสลิป">
            <div className="rounded-2xl bg-amber-50 p-4 text-amber-900 shadow-inner">
              <p className="text-xs uppercase tracking-[0.3em]">Pending review</p>
              <p className="mt-2 text-4xl font-bold">{formatNumber(summary.pending_payment_review_count)}</p>
              <p className="text-sm text-amber-900/80">รายการที่ต้องตรวจสอบเพิ่มเติมใน Store Admin</p>
              <div className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-amber-900">
                <div className="flex items-center justify-between text-sm">
                  <span>มูลค่ารวม</span>
                  <span className="font-semibold">{formatCurrency(summary.pending_payment_review_value)}</span>
                </div>
                <div className="mt-1 text-xs text-amber-900/70">กดที่ปุ่มด้านล่างเพื่อตรวจสลิป</div>
              </div>
              <Link
                to="/store-admin/orders"
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-amber-900/20 bg-amber-900/10 px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-900/20"
              >
                เปิดหน้าตรวจสลิป
              </Link>
            </div>
          </Panel>

          <Panel title="สถานะการดำเนินการ">
            <div className="space-y-3">
              <ListStat label="ออเดอร์กำลังดำเนินการ (ทั้งหมด)" value={formatNumber(summary.active_orders_count)} />
              <ListStat label="ออเดอร์เสร็จสิ้น (ทั้งหมด)" value={formatNumber(summary.completed_orders_count)} />
              <ListStat label="ออเดอร์ที่ชำระแล้ว (ทั้งหมด)" value={formatNumber(summary.paid_orders_count)} />
            </div>
          </Panel>
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

        <Section title="ออเดอร์ล่าสุด">
          <DataTable columns={recentColumns} rows={summary.recent_orders} />
        </Section>
      </div>
    </AppLayout>
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

function CTAButton({ to, children, variant }: { to: string; children: ReactNode; variant: "primary" | "secondary" }) {
  const classes =
    variant === "primary"
      ? "bg-primary text-primary-foreground border border-primary"
      : "border border-input bg-transparent text-foreground";
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 ${classes}`}
    >
      {children}
    </Link>
  );
}

function ListStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
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
  return `${base} (${offset})` || DEFAULT_TIMEZONE_DISPLAY;
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
