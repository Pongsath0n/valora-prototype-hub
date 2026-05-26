import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import { dashboardReportService } from "@/features/store/dashboardReportService";

export default function ReportsPage() {
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState("ALL");
  const [menuId, setMenuId] = useState("ALL");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fromDefault = new Date();
    fromDefault.setDate(fromDefault.getDate() - 7);
    setFrom(fromDefault.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    dashboardReportService.getReport({ from, to, channel, menuId }).then(setData);
  }, [from, to, channel, menuId]);

  const totals = data?.totals;

  const exportCsv = () => {
    if (!data) return;
    const csv = dashboardReportService.exportReportCsv(data.orders);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valora-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="page-title">Reports</h1>
        <div className="stat-card grid md:grid-cols-5 gap-3">
          <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
          <select className="form-input" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="ALL">All channels</option>
            {data?.channels?.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select className="form-input" value={menuId} onChange={(e) => setMenuId(e.target.value)}>
            <option value="ALL">All menu</option>
            {data?.menus?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="bg-primary text-primary-foreground rounded px-3 py-2" onClick={exportCsv}>Export CSV</button>
        </div>

        {!data ? <LoadingState /> : (
          <>
            <div className="grid md:grid-cols-4 gap-3">
              <Card label="Total Sales" value={`฿${totals.totalSales.toFixed(2)}`} />
              <Card label="Total Cost" value={`฿${totals.totalCost.toFixed(2)}`} />
              <Card label="Gross Profit" value={`฿${totals.grossProfit.toFixed(2)}`} />
              <Card label="Gross Margin %" value={`${totals.grossMarginPercent.toFixed(2)}%`} />
            </div>
            <DataTable columns={[{ key: "id", header: "Order" }, { key: "createdAt", header: "Date" }, { key: "channelName", header: "Channel" }, { key: "totalAmount", header: "Sales" }, { key: "totalCost", header: "Cost" }, { key: "grossProfit", header: "Profit" }]} rows={data.orders} />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="kpi-card"><p className="metric-label">{label}</p><p className="metric-value">{value}</p></div>;
}
