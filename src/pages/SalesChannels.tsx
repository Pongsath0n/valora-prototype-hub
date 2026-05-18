import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";

const rows = [
  { name: "Pick-up", feeType: "none", feeValue: 0 },
  { name: "LINE OA", feeType: "fixed", feeValue: 5 },
  { name: "Grab", feeType: "percent", feeValue: 30 },
];

export default function SalesChannels() {
  return <AppLayout><div className="space-y-4"><h1 className="page-title">ช่องทางการขาย</h1><DataTable columns={[{key:"name",header:"ช่องทาง"},{key:"feeType",header:"ประเภทค่าธรรมเนียม"},{key:"feeValue",header:"ค่า"}]} rows={rows} /></div></AppLayout>;
}
