import AppLayout from "@/components/AppLayout";
import FormField from "@/components/shared/FormField";

export default function POSManualOrder() {
  return <AppLayout><div className="space-y-4 max-w-xl"><h1 className="page-title">POS / รับออเดอร์หน้าร้าน</h1><div className="stat-card space-y-4"><FormField label="ชื่อลูกค้า"><input className="form-input" placeholder="ไม่ระบุได้"/></FormField><FormField label="ช่องทาง"><select className="form-input"><option>Pick-up</option><option>LINE OA</option><option>Manual / Other</option></select></FormField><button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm">เพิ่มสินค้า</button></div></div></AppLayout>;
}
