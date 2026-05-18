import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";

export default function OrderDetailPage() {
  return <AppLayout><div className="space-y-4"><h1 className="page-title">รายละเอียดออเดอร์</h1><div className="stat-card"><p className="text-sm">Order: ORD-1024</p><div className="mt-2"><StatusBadge label="preparing" tone="info"/></div><p className="text-sm mt-3 text-muted-foreground">เมนู: Iced Latte x2, Americano x1</p></div></div></AppLayout>;
}
