import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { useSalesReport } from "@/hooks/useSalesReport";
import type { Column } from "@/components/shared/DataTable";
import { storeAdminApi, type SalesReportItemRow, type SalesReportOrderRow } from "@/services/storeAdminApi";
import { saveBlobAsFile } from "@/lib/download";
import { useProfileRole } from "@/contexts/RoleContext";
import { Download } from "lucide-react";

const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });

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

  const orderColumns = useMemo<Column<SalesReportOrderRow>[]>(() => [
    { key: "order_no", header: "Order" },
    { key: "created_at", header: "วันที่" },
    { key: "channel_name", header: "ช่องทาง" },
    {
      key: "sales_amount",
      header: "ยอดขาย",
      render: (row) => currency.format(row.sales_amount ?? 0),
      className: "text-right",
    },
    {
      key: "gross_profit",
      header: "กำไร (฿)",
      render: (row) => currency.format(row.gross_profit ?? 0),
      className: "text-right",
    },
    { key: "payment_status", header: "สถานะชำระ" },
  ], []);

  const itemColumns = useMemo<Column<SalesReportItemRow>[]>(() => [
    { key: "product_name", header: "เมนู" },
    { key: "quantity", header: "จำนวน", className: "text-center" },
    {
      key: "sales_amount",
      header: "ยอดขาย",
      render: (row) => currency.format(row.sales_amount ?? 0),
      className: "text-right",
    },
    {
      key: "gross_profit",
      header: "กำไร (฿)",
      render: (row) => currency.format(row.gross_profit ?? 0),
      className: "text-right",
    },
  ], []);

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
            {data?.filters.channels.map((channel) => (
              <option key={channel.id} value={channel.id}>{channel.name}</option>
            ))}
          </select>
          <select
            className="form-input"
            value={filters.product_id || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, product_id: e.target.value }))}
          >
            <option value="">ทุกเมนู</option>
            {data?.filters.products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
          <div className="flex items-center justify-end">
            <span className="text-xs text-muted-foreground">
              เขตเวลา: {data?.range.timezone ?? "UTC"}
            </span>
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
              <SummaryCard label="ต้นทุน" value={currency.format(summary?.total_cost ?? 0)} />
              <SummaryCard label="กำไรขั้นต้น" value={currency.format(summary?.gross_profit ?? 0)} subLabel={`Margin ${(summary?.gross_margin_percent ?? 0).toFixed(1)}%`} />
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
                <p className="text-xs text-muted-foreground">Top {Math.min(10, data.order_items.length)} เมนูล่าสุด</p>
              </div>
              <DataTable columns={itemColumns} rows={data.order_items.slice(0, 10)} />
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

