import { useMemo, useState, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { useSalesReport } from "@/hooks/useSalesReport";
import type { Column } from "@/components/shared/DataTable";
import { storeAdminApi, type SalesReportOrderRow, type SalesReportProductRow } from "@/services/storeAdminApi";
import { saveBlobAsFile } from "@/lib/download";
import { useProfileRole } from "@/contexts/RoleContext";
import { Download, TrendingDown, TrendingUp, Trophy } from "lucide-react";

const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const quantityFormatter = new Intl.NumberFormat("th-TH");
const percentFormatter = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const BANGKOK_TZ = "Asia/Bangkok";
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: BANGKOK_TZ,
});
const dateFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: BANGKOK_TZ,
});

type MenuPerformanceRow = SalesReportProductRow & { margin_percent: number | null };

function formatBangkokDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

function formatBangkokDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

function useDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function ReportsPage() {
  const defaultRange = useDefaultRange();
  const [filters, setFilters] = useState({
    start_date: defaultRange.start,
    end_date: defaultRange.end,
    channel_id: "",
    product_id: "",
  });
  const { role } = useProfileRole();
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError } = useSalesReport(filters);
  const channelOptions = data?.filters?.channels ?? [];
  const productOptions = data?.filters?.products ?? [];

  const canSeeFinancials = role ? ["owner", "admin", "manager"].includes(role) : false;
  const normalizedProductFilter = (filters.product_id || "").trim();
  const menuPerformanceRows = useMemo<MenuPerformanceRow[]>(() => {
    const rows = data?.products ?? [];
    return rows
      .filter((row) => {
        if (!normalizedProductFilter) return true;
        return String(row.product_id ?? "") === normalizedProductFilter;
      })
      .map((row) => {
        const sales = row.sales_amount ?? 0;
        const profit = row.gross_profit ?? 0;
        return {
          ...row,
          margin_percent: sales > 0 ? (profit / sales) * 100 : null,
        };
      })
      .sort((a, b) => (b.sales_amount ?? 0) - (a.sales_amount ?? 0));
  }, [data?.products, normalizedProductFilter]);

  const topSelling = useMemo(() => menuPerformanceRows
    .slice()
    .sort((a, b) => {
      if ((b.quantity ?? 0) !== (a.quantity ?? 0)) {
        return (b.quantity ?? 0) - (a.quantity ?? 0);
      }
      return (b.sales_amount ?? 0) - (a.sales_amount ?? 0);
    })
    .slice(0, 5), [menuPerformanceRows]);

  const lowSelling = useMemo(() => menuPerformanceRows
    .slice()
    .sort((a, b) => {
      if ((a.quantity ?? 0) !== (b.quantity ?? 0)) {
        return (a.quantity ?? 0) - (b.quantity ?? 0);
      }
      return (a.sales_amount ?? 0) - (b.sales_amount ?? 0);
    })
    .slice(0, 5), [menuPerformanceRows]);

  const topProfit = useMemo(() => menuPerformanceRows
    .slice()
    .sort((a, b) => {
      if ((b.gross_profit ?? 0) !== (a.gross_profit ?? 0)) {
        return (b.gross_profit ?? 0) - (a.gross_profit ?? 0);
      }
      return (b.margin_percent ?? 0) - (a.margin_percent ?? 0);
    })
    .slice(0, 5), [menuPerformanceRows]);

  const filterSummary = useMemo(() => {
    const startText = formatBangkokDateOnly(filters.start_date) ?? "ไม่จำกัด";
    const endText = formatBangkokDateOnly(filters.end_date) ?? "ไม่จำกัด";
    const dateLabel = `${startText} – ${endText}`;

    const channelName = (() => {
      if (!filters.channel_id) return "ทุกช่องทาง";
      const option = channelOptions.find((channel) => channel.id === filters.channel_id);
      if (option) return option.name;
      const fallback = data?.orders.find((order) => order.channel_id === filters.channel_id)?.channel_name;
      return fallback || "ช่องทางไม่ระบุ";
    })();

    const productName = (() => {
      if (!normalizedProductFilter) return "ทุกเมนู";
      const option = productOptions.find((product) => product.id === normalizedProductFilter);
      if (option) return option.name;
      const fallback = menuPerformanceRows.find((row) => String(row.product_id ?? "") === normalizedProductFilter)?.product_name;
      return fallback || "เมนูไม่ระบุ";
    })();

    return { dateLabel, channelName, productName };
  }, [channelOptions, data?.orders, filters.channel_id, filters.end_date, filters.start_date, menuPerformanceRows, normalizedProductFilter, productOptions]);

  const orderColumns = useMemo<Column<SalesReportOrderRow>[]>(() => [
    { key: "order_no", header: "Order" },
    {
      key: "created_at",
      header: "วันที่ (Asia/Bangkok)",
      render: (row) => formatBangkokDateTime(row.created_at),
    },
    { key: "channel_name", header: "ช่องทาง" },
    {
      key: "sales_amount",
      header: "ยอดขาย",
      render: (row) => currency.format(row.sales_amount ?? 0),
      className: "text-right",
    },
    { key: "payment_status", header: "สถานะชำระ" },
  ].concat(canSeeFinancials ? [
    {
      key: "gross_profit",
      header: "กำไร (฿)",
      render: (row) => currency.format(row.gross_profit ?? 0),
      className: "text-right",
    },
  ] : []), [canSeeFinancials]);

  const menuColumns = useMemo<Column<MenuPerformanceRow>[]>(() => {
    const cols: Column<MenuPerformanceRow>[] = [
      { key: "product_name", header: "เมนู" },
      {
        key: "quantity",
        header: "จำนวนขาย",
        className: "text-center",
        render: (row) => quantityFormatter.format(row.quantity ?? 0),
      },
      {
        key: "sales_amount",
        header: "ยอดขาย",
        render: (row) => currency.format(row.sales_amount ?? 0),
        className: "text-right",
      },
    ];

    if (canSeeFinancials) {
      cols.push(
        {
          key: "cost_amount",
          header: "ต้นทุน",
          render: (row) => currency.format(row.cost_amount ?? 0),
          className: "text-right",
        },
        {
          key: "gross_profit",
          header: "กำไร",
          render: (row) => currency.format(row.gross_profit ?? 0),
          className: "text-right",
        },
        {
          key: "margin_percent",
          header: "Margin %",
          render: (row) => (row.margin_percent ?? null) !== null ? `${percentFormatter.format(row.margin_percent)}%` : "-",
          className: "text-right",
        },
      );
    }

    return cols;
  }, [canSeeFinancials]);

  const summary = data?.summary;

  const canExport = role && ["owner", "admin", "manager"].includes(role);

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const { blob, filename } = await storeAdminApi.exportSalesReportCsv(filters);
      saveBlobAsFile(blob, filename ?? "sales-report.csv");
    } catch (err: any) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">รายงานยอดขาย</h1>
            <p className="page-subtitle">ข้อมูลจริงจาก Store Admin Orders & Payments</p>
          </div>
          <div className="flex gap-2">
            {canExport ? (
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm font-medium inline-flex items-center gap-1"
                onClick={handleExport}
                disabled={exporting}
              >
                <Download className="w-4 h-4" />
                {exporting ? "กำลังส่งออก..." : "Export CSV"}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm font-medium"
              onClick={() => setFilters({ ...filters })}
            >
              รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        <div className="stat-card grid gap-3 md:grid-cols-5">
          <input
            type="date"
            className="form-input"
            value={filters.start_date}
            max={filters.end_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value }))}
          />
          <input
            type="date"
            className="form-input"
            value={filters.end_date}
            min={filters.start_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value }))}
          />
          <select
            className="form-input"
            value={filters.channel_id || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, channel_id: e.target.value }))}
          >
            <option value="">ทุกช่องทาง</option>
            {channelOptions.map((channel) => (
              <option key={channel.id} value={channel.id}>{channel.name}</option>
            ))}
          </select>
          <select
            className="form-input"
            value={filters.product_id || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, product_id: e.target.value }))}
          >
            <option value="">ทุกเมนู</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
          <div className="flex flex-col items-end justify-center gap-1 text-xs text-muted-foreground">
            <span>เขตเวลาแสดงผล: {BANGKOK_TZ}</span>
            <span>ข้อมูล backend: {data?.range.timezone ?? "ไม่ระบุ"}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/60 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">ตัวกรองทั้งหมดถูกใช้กับรายงานทุกส่วน</span>
          <div className="flex flex-wrap gap-2">
            <FilterPill label="วันที่" value={filterSummary.dateLabel} />
            <FilterPill label="ช่องทาง" value={filterSummary.channelName} />
            <FilterPill label="เมนู" value={filterSummary.productName} />
          </div>
        </div>

        {isLoading ? (
          <LoadingState label="กำลังโหลดรายงานจริงจาก backend..." />
        ) : isError ? (
          <EmptyState
            title="ไม่สามารถโหลดรายงานได้"
            description="ตรวจสอบการเชื่อมต่อ backend และลองอีกครั้ง"
          />
        ) : !data || data.orders.length === 0 ? (
          <EmptyState
            title="ยังไม่มีรายการที่ชำระเงินสำเร็จในช่วงวันที่นี้"
            description="เมื่อมีออเดอร์ที่ชำระเงินเรียบร้อย รายงานจะอัปเดตอัตโนมัติ"
          />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <SummaryCard label="ยอดขายยืนยันแล้ว" value={currency.format(summary?.total_sales_confirmed ?? 0)} />
              <SummaryCard label="รอการยืนยัน" value={currency.format(summary?.pending_revenue ?? 0)} />
              {canSeeFinancials ? (
                <SummaryCard label="ต้นทุน" value={currency.format(summary?.total_cost ?? 0)} />
              ) : null}
              {canSeeFinancials ? (
                <SummaryCard
                  label="กำไรขั้นต้น"
                  value={currency.format(summary?.gross_profit ?? 0)}
                  subLabel={`Margin ${(summary?.gross_margin_percent ?? 0).toFixed(1)}%`}
                />
              ) : null}
            </div>

            <section className="stat-card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="section-title mb-0">รายการออเดอร์</h2>
                <p className="text-xs text-muted-foreground">{summary?.order_count ?? 0} รายการ</p>
              </div>
              <DataTable columns={orderColumns} rows={data.orders} />
            </section>

            <section className="stat-card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="section-title mb-0">ยอดขายตามเมนู</h2>
                <p className="text-xs text-muted-foreground">คำนวณจาก snapshot order_items</p>
              </div>
              {menuPerformanceRows.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีข้อมูลเมนูในช่วงนี้"
                  description="อัปเดตตัวกรองวันที่/ช่องทาง/เมนูเพื่อดูข้อมูล"
                />
              ) : (
                <DataTable columns={menuColumns} rows={menuPerformanceRows} />
              )}
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <MenuLeaderboard
                title="Top Selling Menu"
                icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
                rows={topSelling}
                canSeeFinancials={canSeeFinancials}
                emptyLabel="ยังไม่มีข้อมูลยอดขาย"
              />
              <MenuLeaderboard
                title="Low Selling Menu"
                icon={<TrendingDown className="h-5 w-5 text-amber-500" />}
                rows={lowSelling}
                canSeeFinancials={canSeeFinancials}
                emptyLabel="ยังไม่มีข้อมูลเมนูที่มียอดต่ำ"
                note="แสดงเฉพาะเมนูที่มีรายการขายในช่วงเวลาที่เลือก"
              />
              <MenuLeaderboard
                title="Top Profit Menu"
                icon={<Trophy className="h-5 w-5 text-sky-500" />}
                rows={topProfit}
                canSeeFinancials={canSeeFinancials}
                emptyLabel="ยังไม่มีข้อมูลกำไร"
              />
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({ label, value, subLabel }: { label: string; value: string; subLabel?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {subLabel ? <p className="text-xs text-muted-foreground">{subLabel}</p> : null}
    </div>
  );
}

function FilterPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-foreground">
      <span className="uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function MenuLeaderboard({
  title,
  icon,
  rows,
  canSeeFinancials,
  emptyLabel,
  note,
}: {
  title: string;
  icon: ReactNode;
  rows: MenuPerformanceRow[];
  canSeeFinancials: boolean;
  emptyLabel: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-xl bg-muted/80 p-2">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li key={`${row.product_id ?? row.product_name ?? index}`} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                  {index + 1}
                </span>
                <div>
                  <p className="font-medium text-foreground">{row.product_name ?? "เมนูไม่ระบุ"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    จำนวน {quantityFormatter.format(row.quantity ?? 0)} • ยอดขาย {currency.format(row.sales_amount ?? 0)}
                  </p>
                </div>
              </div>
              {canSeeFinancials ? (
                <div className="text-right text-[11px] text-muted-foreground">
                  <p>กำไร {currency.format(row.gross_profit ?? 0)}</p>
                  <p>Margin {(row.margin_percent ?? null) !== null ? `${percentFormatter.format(row.margin_percent)}%` : "-"}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

