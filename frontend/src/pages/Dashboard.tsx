import { useEffect, useState, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import StatusBadge from "@/components/shared/StatusBadge";
import { dashboardReportService } from "@/features/store/dashboardReportService";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    dashboardReportService.getDashboard().then(setData);
  }, []);

  if (!data) return <AppLayout><LoadingState /></AppLayout>;

  const s = data.summary;

  return (
    <AppLayout>
      <div className="space-y-5">
        <h1 className="page-title">แดชบอร์ดผลประกอบการวันนี้</h1>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card label="Orders today" value={`${s.ordersToday}`} />
          <Card label="Sales today" value={`฿${s.salesToday.toFixed(2)}`} />
          <Card label="Cost today" value={`฿${s.costToday.toFixed(2)}`} />
          <Card label="Gross profit today" value={`฿${s.grossProfitToday.toFixed(2)}`} />
          <Card label="Avg profit/cup" value={`฿${s.avgProfitPerCup.toFixed(2)}`} />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <Card label="Best seller" value={s.bestSeller} />
          <Card label="Most profitable menu" value={s.mostProfitableMenu} />
          <Card label="Best channel" value={s.bestChannel} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Best-selling menu table">
            <DataTable columns={[{ key: "menuName", header: "Menu" }, { key: "qty", header: "Qty" }, { key: "sales", header: "Sales" }]} rows={data.byMenu} />
          </Section>
          <Section title="Profit by menu table">
            <DataTable columns={[{ key: "menuName", header: "Menu" }, { key: "profit", header: "Profit" }, { key: "sales", header: "Sales" }]} rows={data.byProfitMenu} />
          </Section>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Sales by channel / Profit by channel">
            <DataTable columns={[{ key: "channel", header: "Channel" }, { key: "orders", header: "Orders" }, { key: "sales", header: "Sales" }, { key: "profit", header: "Profit" }]} rows={data.byChannel} />
          </Section>
          <Section title="Low stock alert">
            <DataTable columns={[{ key: "name", header: "Ingredient" }, { key: "currentStock", header: "Current" }, { key: "lowStockThreshold", header: "Threshold" }, { key: "status", header: "Status", render: () => <StatusBadge label="LOW" tone="warning" /> }]} rows={data.lowStock} />
          </Section>
        </div>

        <Section title="Recent orders table">
          <DataTable columns={[{ key: "id", header: "Order" }, { key: "channelName", header: "Channel" }, { key: "totalAmount", header: "Sales" }, { key: "grossProfit", header: "Profit" }, { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} tone="info" /> }]} rows={data.recentOrders} />
        </Section>
      </div>
    </AppLayout>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="kpi-card"><p className="metric-label">{label}</p><p className="metric-value">{value}</p></div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="stat-card"><h2 className="section-title mb-3">{title}</h2>{children}</div>;
}
