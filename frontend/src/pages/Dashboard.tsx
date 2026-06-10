import { Link } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable, { type Column } from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import StatusBadge, { type BadgeTone } from "@/components/shared/StatusBadge";
import { type AppRole, useRoleGuard } from "@/lib/guards";
import {
  storeAdminApi,
  type DashboardQueueStatus,
  type DashboardRecentOrder,
  type DashboardSummaryResponse,
} from "@/services/storeAdminApi";

const DASHBOARD_ALLOWED_ROLES: AppRole[] = ["owner", "admin", "manager"];
const currencyFormatter = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const numberFormatter = new Intl.NumberFormat("th-TH");
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });

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
  const metricCards = [
    { label: "ยอดขายยืนยันแล้ววันนี้", value: formatCurrency(summary.confirmed_revenue_today) },
    { label: "ยอดรอตรวจสลิป", value: formatCurrency(summary.pending_revenue_today) },
    { label: "จำนวนออเดอร์วันนี้", value: formatNumber(summary.today_orders_count) },
    { label: "รายการรอตรวจสลิป", value: formatNumber(summary.pending_payment_review_count) },
    { label: "ออเดอร์ที่ชำระแล้ว", value: formatNumber(summary.paid_orders_count) },
  ];

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
            <p className="text-sm font-semibold text-primary/80">Store ID: {summary.store_id}</p>
            <h1 className="text-3xl font-bold tracking-tight">แดชบอร์ดผลประกอบการ</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ซิงก์จาก /store-admin orders & payments • เขตเวลา: {summary.store_timezone || "UTC"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CTAButton to="/store-admin/orders" variant="primary">
              ไปตรวจสลิปใน /store-admin
            </CTAButton>
            <CTAButton to="/store-admin/orders" variant="secondary">
              ไปจัดการออเดอร์
            </CTAButton>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metricCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>

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
              <p className="mt-1 text-sm text-amber-900/80">รายการที่ต้องตรวจสอบเพิ่มเติมใน Store Admin</p>
            </div>
          </Panel>

          <Panel title="สถานะการดำเนินการ">
            <div className="space-y-3">
              <ListStat label="ออเดอร์กำลังดำเนินการ" value={formatNumber(summary.active_orders_count)} />
              <ListStat label="ออเดอร์เสร็จสิ้น" value={formatNumber(summary.completed_orders_count)} />
              <ListStat label="ออเดอร์ชำระแล้ว" value={formatNumber(summary.paid_orders_count)} />
            </div>
          </Panel>
        </div>

        <Section title="ออเดอร์ล่าสุด">
          <DataTable columns={recentColumns} rows={summary.recent_orders} />
        </Section>
      </div>
    </AppLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
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
