import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";

const rows = [
  { menu: "Iced Latte", menuCost: 31.2, sellPrice: 75, gross: 43.8 },
  { menu: "Americano", menuCost: 18.5, sellPrice: 60, gross: 41.5 },
];

export default function RecipeCosting() {
  return <AppLayout><div className="space-y-4"><h1 className="page-title">คำนวณต้นทุนสูตร</h1><DataTable columns={[{key:"menu",header:"เมนู"},{key:"menuCost",header:"ต้นทุน"},{key:"sellPrice",header:"ราคาขาย"},{key:"gross",header:"กำไรขั้นต้น"}]} rows={rows} /></div></AppLayout>;
}
