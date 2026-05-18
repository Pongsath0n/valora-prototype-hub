import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";

const rows = [
  { menu: "Iced Latte", pickup: 75, lineoa: 80, grab: 95 },
  { menu: "Americano", pickup: 60, lineoa: 65, grab: 79 },
];

export default function ChannelPricing() {
  return <AppLayout><div className="space-y-4"><h1 className="page-title">ราคาตามช่องทาง</h1><DataTable columns={[{key:"menu",header:"เมนู"},{key:"pickup",header:"Pick-up"},{key:"lineoa",header:"LINE OA"},{key:"grab",header:"Grab"}]} rows={rows} /></div></AppLayout>;
}
