import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import LoadingState from "@/components/shared/LoadingState";
import StatusBadge from "@/components/shared/StatusBadge";
import { ingredientService, type IngredientItem } from "@/features/store/catalogService";

const empty = { id: "", name: "", unit: "g", costPerUnit: "", currentStock: "", lowStockThreshold: "" };

export default function IngredientsStock() {
  const [rows, setRows] = useState<IngredientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(empty);

  async function refresh() { setLoading(true); try { setRows(await ingredientService.list()); } catch { setError("โหลดวัตถุดิบไม่สำเร็จ"); } finally { setLoading(false); } }
  useEffect(() => { refresh(); }, []);

  async function submit() {
    if (!form.name.trim()) return setError("กรุณากรอกชื่อวัตถุดิบ");
    await ingredientService.upsert({ id: form.id || undefined, name: form.name.trim(), unit: form.unit, costPerUnit: Number(form.costPerUnit), currentStock: Number(form.currentStock), lowStockThreshold: Number(form.lowStockThreshold) });
    setForm(empty); setError(""); refresh();
  }

  return <AppLayout><div className="space-y-4"><h1 className="page-title">วัตถุดิบและสต็อก</h1>
    <div className="stat-card grid md:grid-cols-3 gap-3">
      <FormField label="ชื่อ"><input className="form-input" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></FormField>
      <FormField label="หน่วย"><input className="form-input" value={form.unit} onChange={(e)=>setForm({...form,unit:e.target.value})}/></FormField>
      <FormField label="ต้นทุนต่อหน่วย"><input type="number" className="form-input" value={form.costPerUnit} onChange={(e)=>setForm({...form,costPerUnit:e.target.value})}/></FormField>
      <FormField label="สต็อกปัจจุบัน"><input type="number" className="form-input" value={form.currentStock} onChange={(e)=>setForm({...form,currentStock:e.target.value})}/></FormField>
      <FormField label="จุดเตือนต่ำ"><input type="number" className="form-input" value={form.lowStockThreshold} onChange={(e)=>setForm({...form,lowStockThreshold:e.target.value})}/></FormField>
      <div className="flex items-end"><button className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={submit}>{form.id?"บันทึก":"เพิ่มวัตถุดิบ"}</button></div>
      {error ? <p className="md:col-span-3 text-sm text-red-600">{error}</p> : null}
    </div>
    {loading ? <LoadingState /> : <DataTable columns={[{key:"name",header:"วัตถุดิบ",render:(r)=><button className="underline" onClick={()=>setForm({id:r.id,name:r.name,unit:r.unit,costPerUnit:String(r.costPerUnit),currentStock:String(r.currentStock),lowStockThreshold:String(r.lowStockThreshold)})}>{r.name}</button>},{key:"unit",header:"หน่วย"},{key:"costPerUnit",header:"ต้นทุน/หน่วย"},{key:"currentStock",header:"สต็อก"},{key:"low",header:"แจ้งเตือน",render:(r)=><StatusBadge label={r.currentStock <= r.lowStockThreshold ? "low" : "ok"} tone={r.currentStock <= r.lowStockThreshold ? "warning" : "success"}/>},{key:"status",header:"สถานะ",render:(r)=><button onClick={()=>ingredientService.setActive(r.id,!r.isActive).then(refresh)}>{r.isActive?"active":"inactive"}</button>}]} rows={rows} />}
  </div></AppLayout>;
}
