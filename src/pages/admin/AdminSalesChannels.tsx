import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";

const rows = [
  { name: "Pick-up", feeType: "none", feeValue: 0 },
  { name: "LINE OA", feeType: "fixed", feeValue: 5 },
  { name: "Grab", feeType: "percent", feeValue: 30 },
  { name: "LINE MAN", feeType: "percent", feeValue: 27 },
  { name: "Shopee Food", feeType: "percent", feeValue: 25 },
];

export default function AdminSalesChannelsPage() {
  return (
    <AdminLayout
      title="ตั้งค่าช่องทางขาย"
      subtitle="จัดการช่องทางขายของร้านและค่าธรรมเนียมต่อช่องทาง"
    >
      <DataTable
        columns={[
          { key: "name", header: "ช่องทาง" },
          { key: "feeType", header: "ประเภทค่าธรรมเนียม" },
          { key: "feeValue", header: "ค่า" },
        ]}
        rows={rows}
      />
    </AdminLayout>
  );
}
